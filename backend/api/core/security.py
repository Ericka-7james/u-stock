# api/core/security.py
import os
from typing import Any, Dict, Tuple

from fastapi import HTTPException, Request, Response
from supabase import Client, create_client
from cryptography.fernet import Fernet
from pathlib import Path
from dotenv import load_dotenv

# -------------------------
# Load env (same logic as your index.py)
# -------------------------
THIS_DIR = Path(__file__).resolve().parents[1]      # .../api
PROJECT_ROOT = THIS_DIR.parent                      # .../u-stock

# NOTE: override=False means "first one wins"
for env_path in [
    PROJECT_ROOT / ".env",
    PROJECT_ROOT / ".env.local",
    THIS_DIR / ".env",
    THIS_DIR / ".env.local",
]:
    if env_path.exists():
        load_dotenv(env_path, override=False)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()

# ✅ Support both names (your repo uses both)
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "").strip()

# ✅ Canonical "service key" (prefer SERVICE_ROLE_KEY)
SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY

INTEGRATIONS_ENC_KEY = os.getenv("INTEGRATIONS_ENC_KEY", "").strip()

COOKIE_NAME = os.getenv("USTOCK_COOKIE_NAME", "access_token").strip()
REFRESH_COOKIE_NAME = os.getenv("USTOCK_REFRESH_COOKIE_NAME", "refresh_token").strip()

ENV = os.getenv("ENV", "development").strip().lower()
COOKIE_SECURE = ENV == "production"
COOKIE_SAMESITE = "none" if ENV == "production" else "lax"
COOKIE_MAX_AGE = int(os.getenv("USTOCK_COOKIE_MAX_AGE", "604800"))


def _raise_supabase_env_missing(which: str) -> None:
    raise HTTPException(
        status_code=500,
        detail={
            "code": "SUPABASE_MISCONFIGURED",
            "message": f"{which} is missing in environment variables.",
            "hint": "Check your backend/.env (or root .env) and restart the backend.",
        },
    )


def _wrap_supabase_exception(e: Exception, which: str) -> HTTPException:
    msg = str(e) or repr(e)
    lower = msg.lower()

    if "invalid api key" in lower:
        return HTTPException(
            status_code=500,
            detail={
                "code": "SUPABASE_INVALID_KEY",
                "message": f"Supabase rejected {which}.",
                "hint": f"Verify SUPABASE_URL matches the project for your {which}, and paste the correct key into .env. Then restart the backend.",
                "provider": "supabase",
                "which": which,
            },
        )

    return HTTPException(
        status_code=500,
        detail={
            "code": "SUPABASE_ERROR",
            "message": f"Supabase client error ({which}).",
            "hint": "Check backend logs for more detail.",
            "provider": "supabase",
            "which": which,
            "raw": msg[:300],
        },
    )


def get_supabase_anon() -> Client:
    if not SUPABASE_URL:
        _raise_supabase_env_missing("SUPABASE_URL")
    if not SUPABASE_ANON_KEY:
        _raise_supabase_env_missing("SUPABASE_ANON_KEY")
    try:
        return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    except Exception as e:
        raise _wrap_supabase_exception(e, "SUPABASE_ANON_KEY")


def get_supabase_service() -> Client:
    if not SUPABASE_URL:
        _raise_supabase_env_missing("SUPABASE_URL")

    # ✅ Accept either env var
    if not SERVICE_KEY:
        _raise_supabase_env_missing("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)")

    try:
        return create_client(SUPABASE_URL, SERVICE_KEY)
    except Exception as e:
        # Tell you the canonical name we tried to use
        which = "SUPABASE_SERVICE_ROLE_KEY" if SUPABASE_SERVICE_ROLE_KEY else "SUPABASE_SECRET_KEY"
        raise _wrap_supabase_exception(e, which)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str | None = None) -> None:
    if access_token:
        response.set_cookie(
            key=COOKIE_NAME,
            value=access_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=COOKIE_MAX_AGE,
            path="/",
        )
    if refresh_token:
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=refresh_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=COOKIE_MAX_AGE,
            path="/",
        )


def _extract_user_id_and_email(res: Any) -> Tuple[str | None, str | None]:
    user = getattr(res, "user", None) if res is not None else None
    if user is None and isinstance(res, dict):
        user = res.get("user")

    uid = getattr(user, "id", None) if user is not None else None
    email = getattr(user, "email", None) if user is not None else None

    if isinstance(user, dict):
        uid = uid or user.get("id")
        email = email or user.get("email")

    return uid, email


def require_user(request: Request, response: Response) -> Dict[str, str]:
    sb = get_supabase_anon()
    access = request.cookies.get(COOKIE_NAME)
    refresh = request.cookies.get(REFRESH_COOKIE_NAME)

    if access:
        try:
            res = sb.auth.get_user(access)
            uid, email = _extract_user_id_and_email(res)
            if uid:
                return {"id": uid, "email": email or ""}
        except Exception:
            pass

    if refresh:
        try:
            refreshed = None
            try:
                refreshed = sb.auth.refresh_session(refresh)
            except Exception as e1:
                try:
                    refreshed = sb.auth.refresh_session({"refresh_token": refresh})
                except Exception as e2:
                    raise HTTPException(
                        status_code=401,
                        detail={
                            "code": "INVALID_SESSION",
                            "message": "Invalid session: refresh failed",
                            "hint": "Sign in again.",
                            "debug": {"string": repr(e1), "dict": repr(e2)},
                        },
                    )

            uid, email = _extract_user_id_and_email(refreshed)

            session = None
            if isinstance(refreshed, dict):
                session = refreshed.get("session") or refreshed.get("data", {}).get("session")
            else:
                session = getattr(refreshed, "session", None) or getattr(getattr(refreshed, "data", None), "session", None)

            if session:
                if isinstance(session, dict):
                    new_access = session.get("access_token")
                    new_refresh = session.get("refresh_token")
                else:
                    new_access = getattr(session, "access_token", None)
                    new_refresh = getattr(session, "refresh_token", None)

                if new_access:
                    set_auth_cookies(response, new_access, new_refresh)

            if uid:
                return {"id": uid, "email": email or ""}

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=401,
                detail={"code": "INVALID_SESSION", "message": f"Invalid session: {repr(e)}", "hint": "Sign in again."},
            )

    raise HTTPException(status_code=401, detail={"code": "NOT_AUTHENTICATED", "message": "Not authenticated"})


def _fernet() -> Fernet:
    if not INTEGRATIONS_ENC_KEY:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "INTEGRATIONS_ENC_KEY_MISSING",
                "message": "INTEGRATIONS_ENC_KEY is missing",
                "hint": "Set INTEGRATIONS_ENC_KEY in backend env and restart.",
            },
        )
    return Fernet(INTEGRATIONS_ENC_KEY.encode("utf-8"))


def decrypt_secret(token: str | None) -> str | None:
    if not token:
        return None
    f = _fernet()
    return f.decrypt(token.encode("utf-8")).decode("utf-8")
