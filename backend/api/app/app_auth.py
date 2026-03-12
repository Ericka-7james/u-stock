from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request, Response

from api.core.http.cookies import clear_auth_cookies, set_auth_cookies
from api.db import get_supabase_anon, get_supabase_service
from api.deps import require_user
from api.schemas.auth import AuthResponse, LoginBody, SignupBody, UserOut, validate_password


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _normalize_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D+", "", str(phone))
    return digits or None


def _looks_like_existing_user_error(err: Exception) -> bool:
    msg = str(err).lower()
    return (
        "already registered" in msg
        or "user already exists" in msg
        or "duplicate" in msg
        or "email already" in msg
    )


def _pg_unique_violation(err: Exception) -> bool:
    return "23505" in str(err)


def _extract_auth_error_code_message(res) -> tuple[Optional[str], Optional[str]]:
    """
    Supabase python client behavior can vary:
    - sometimes raises Exception
    - sometimes returns an object with .error populated
    Normalize that into (code, message).
    """
    err = getattr(res, "error", None)
    if not err:
        return None, None

    if isinstance(err, dict):
        code = err.get("code") or err.get("error_code") or err.get("status") or None
        msg = err.get("message") or err.get("msg") or err.get("error_description") or None
        return (str(code) if code else None, str(msg) if msg else None)

    return None, str(err)


def _safe_user_metadata(user: Any) -> dict[str, Any]:
    try:
        raw = getattr(user, "user_metadata", None) or {}
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def _default_username_from_email(email: Optional[str]) -> str:
    local = (email or "").split("@")[0].strip().lower()
    cleaned = re.sub(r"[^a-z0-9_.-]+", "_", local).strip("._-")
    return cleaned or "user"


def _ensure_profile_exists(
    *,
    user_id: str,
    email: Optional[str],
    user_metadata: Optional[dict[str, Any]] = None,
) -> None:
    """
    Ensure a minimal profiles row exists for the authenticated user.

    Why here:
    - fixes deleted/missing profiles rows after successful auth
    - works for both login and session refresh
    - keeps integrity on the server, not in the UI
    """
    sb_service = get_supabase_service()
    normalized_email = _normalize_email(email or "")
    metadata = user_metadata or {}

    username = (metadata.get("username") or "").strip() or _default_username_from_email(
        normalized_email
    )
    avatar = (metadata.get("avatar") or "").strip() or "📈"
    phone = _normalize_phone(
        metadata.get("phone") or metadata.get("phone_number") or metadata.get("mobile")
    )

    try:
        existing = (
            sb_service.table("profiles")
            .select("id")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if getattr(existing, "data", None):
            return
    except Exception:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "PROFILE_LOOKUP_FAILED",
                "message": "Could not verify account profile.",
            },
        )

    payload = {
        "id": user_id,
        "username": username,
        "avatar": avatar,
        "email": normalized_email or None,
        "phone": phone,
    }

    try:
        sb_service.table("profiles").insert(payload).execute()
        return
    except Exception as e:
        # Race-safe retry: if another request created it after our first check,
        # do not fail the auth flow.
        try:
            retry_existing = (
                sb_service.table("profiles")
                .select("id")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
            if getattr(retry_existing, "data", None):
                return
        except Exception:
            pass

        if _pg_unique_violation(e):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "PROFILE_RECOVERY_CONFLICT",
                    "message": "Authenticated successfully, but profile recovery hit a data conflict.",
                },
            )

        raise HTTPException(
            status_code=500,
            detail={
                "code": "PROFILE_RECOVERY_FAILED",
                "message": "Authenticated successfully, but profile recovery failed.",
            },
        )


def get_auth_router() -> APIRouter:
    router = APIRouter()

    @router.post("/auth/signup", response_model=AuthResponse)
    async def signup(body: SignupBody, response: Response):
        email = _normalize_email(body.email)
        username = (body.username or "").strip()
        avatar = body.avatar or "📈"
        phone = _normalize_phone(getattr(body, "phone", None))

        validate_password(body.password, email, username)

        if phone:
            sb_service = get_supabase_service()
            try:
                existing = (
                    sb_service.table("profiles")
                    .select("id")
                    .eq("phone", phone)
                    .limit(1)
                    .execute()
                )
            except Exception:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "code": "DB_CHECK_FAILED",
                        "message": "Could not validate phone number.",
                    },
                )

            if getattr(existing, "data", None):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "PHONE_TAKEN",
                        "message": "That phone number is already in use.",
                    },
                )

        sb = get_supabase_anon()
        try:
            res = sb.auth.sign_up({"email": email, "password": body.password})
        except Exception as e:
            if _looks_like_existing_user_error(e):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "EMAIL_TAKEN",
                        "message": "That email is already registered.",
                    },
                )
            raise HTTPException(
                status_code=400,
                detail={"code": "SIGNUP_FAILED", "message": "Signup failed"},
            )

        code, msg = _extract_auth_error_code_message(res)
        if msg:
            if _looks_like_existing_user_error(Exception(msg)):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "EMAIL_TAKEN",
                        "message": "That email is already registered.",
                    },
                )
            raise HTTPException(
                status_code=400,
                detail={"code": code or "SIGNUP_FAILED", "message": msg},
            )

        if not res or not getattr(res, "user", None):
            raise HTTPException(
                status_code=400,
                detail={"code": "SIGNUP_FAILED", "message": "Signup failed"},
            )

        session = getattr(res, "session", None)
        if session:
            set_auth_cookies(
                response,
                getattr(session, "access_token", None),
                getattr(session, "refresh_token", None),
            )

        sb_service = get_supabase_service()
        try:
            sb_service.table("profiles").upsert(
                {
                    "id": res.user.id,
                    "username": username,
                    "avatar": avatar,
                    "email": email,
                    "phone": phone,
                },
                on_conflict="id",
            ).execute()
        except Exception as e:
            if _pg_unique_violation(e):
                msg2 = str(e).lower()
                if "profiles_email_unique" in msg2 or "email" in msg2:
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "EMAIL_TAKEN",
                            "message": "That email is already registered.",
                        },
                    )
                if "profiles_phone_unique" in msg2 or "phone" in msg2:
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "PHONE_TAKEN",
                            "message": "That phone number is already in use.",
                        },
                    )
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "DUPLICATE",
                        "message": "Email or phone is already in use.",
                    },
                )

            raise HTTPException(
                status_code=500,
                detail={
                    "code": "PROFILE_UPSERT_FAILED",
                    "message": "Account created, but profile setup failed.",
                },
            )

        return AuthResponse(
            user=UserOut(id=res.user.id, email=res.user.email, avatar=avatar),
            ok=True,
        )

    @router.post("/auth/login", response_model=AuthResponse)
    async def login(body: LoginBody, response: Response):
        sb = get_supabase_anon()
        email = _normalize_email(body.email)

        try:
            res = sb.auth.sign_in_with_password({"email": email, "password": body.password})
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid email/password")

        if not getattr(res, "user", None) or not getattr(res, "session", None):
            raise HTTPException(
                status_code=401,
                detail="Invalid email/password or email not confirmed",
            )

        user_metadata = _safe_user_metadata(res.user)

        # Critical recovery step:
        # if the user can authenticate but their profiles row was deleted,
        # recreate the minimal row before the rest of the app uses FK-backed tables.
        _ensure_profile_exists(
            user_id=res.user.id,
            email=res.user.email or email,
            user_metadata=user_metadata,
        )

        set_auth_cookies(
            response,
            getattr(res.session, "access_token", None),
            getattr(res.session, "refresh_token", None),
        )

        avatar = user_metadata.get("avatar")

        return AuthResponse(
            user=UserOut(id=res.user.id, email=res.user.email, avatar=avatar),
            ok=True,
        )

    @router.post("/auth/logout")
    async def logout(response: Response):
        clear_auth_cookies(response)
        return {"ok": True}

    @router.get("/auth/me")
    async def me(request: Request, response: Response):
        u = require_user(request, response)

        # Also enforce this during session bootstrap / refresh so users who
        # already have cookies are repaired without having to sign in again.
        _ensure_profile_exists(
            user_id=u["id"],
            email=u.get("email"),
            user_metadata={},
        )

        return {"user_id": u["id"], "email": u["email"]}

    return router