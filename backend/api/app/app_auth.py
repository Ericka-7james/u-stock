from __future__ import annotations

import re
from typing import Optional

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
    # Supabase auth commonly returns something like:
    # "User already registered", "already registered", etc.
    return (
        "already registered" in msg
        or "user already exists" in msg
        or "duplicate" in msg
        or "email already" in msg
    )


def _pg_unique_violation(err: Exception) -> bool:
    # Postgrest / Supabase python libs often embed "23505" in the error string
    return "23505" in str(err)


def _extract_auth_error_code_message(res) -> tuple[Optional[str], Optional[str]]:
    """
    Supabase python client behavior can vary:
    - sometimes raises Exception
    - sometimes returns an object with .error populated
    Try to normalize that into (code, message).
    """
    err = getattr(res, "error", None)
    if not err:
        return None, None

    # err might be dict-like, string-like, or an object
    if isinstance(err, dict):
        code = err.get("code") or err.get("error_code") or err.get("status") or None
        msg = err.get("message") or err.get("msg") or err.get("error_description") or None
        return (str(code) if code else None, str(msg) if msg else None)

    msg = str(err)
    return None, msg


def get_auth_router() -> APIRouter:
    router = APIRouter()

    @router.post("/auth/signup", response_model=AuthResponse)
    async def signup(body: SignupBody, response: Response):
        # 1) Normalize inputs
        email = _normalize_email(body.email)
        username = (body.username or "").strip()
        avatar = body.avatar or "📈"

        # phone is optional; your frontend might send it
        phone = _normalize_phone(getattr(body, "phone", None))

        # 2) Validate password (use normalized email)
        validate_password(body.password, email, username)

        # 3) Pre-check phone uniqueness (prevents orphan auth users)
        #    Requires phone column + unique index you added.
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

        # 4) Create auth user
        sb = get_supabase_anon()
        try:
            res = sb.auth.sign_up({"email": email, "password": body.password})
        except Exception as e:
            # If email already exists in auth, Supabase often throws
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

        # Some client versions return .error instead of throwing
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

        # 5) Set cookies if session exists (depends on email confirmation settings)
        session = getattr(res, "session", None)
        if session:
            set_auth_cookies(
                response,
                getattr(session, "access_token", None),
                getattr(session, "refresh_token", None),
            )

        # 6) Upsert profile row (server-side service role so it always works)
        #    NOTE: requires profiles.email + profiles.phone columns.
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
            # If email/phone violates your unique indexes, surface it cleanly
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

        # normalize email to match signup behavior
        email = _normalize_email(body.email)

        try:
            res = sb.auth.sign_in_with_password({"email": email, "password": body.password})
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid email/password")

        if not getattr(res, "user", None) or not getattr(res, "session", None):
            raise HTTPException(status_code=401, detail="Invalid email/password or email not confirmed")

        set_auth_cookies(
            response,
            getattr(res.session, "access_token", None),
            getattr(res.session, "refresh_token", None),
        )

        avatar = None
        try:
            avatar = (res.user.user_metadata or {}).get("avatar")
        except Exception:
            avatar = None

        return AuthResponse(user=UserOut(id=res.user.id, email=res.user.email, avatar=avatar), ok=True)

    @router.post("/auth/logout")
    async def logout(response: Response):
        clear_auth_cookies(response)
        return {"ok": True}

    @router.get("/auth/me")
    async def me(request: Request, response: Response):
        u = require_user(request, response)
        return {"user_id": u["id"], "email": u["email"]}

    return router
