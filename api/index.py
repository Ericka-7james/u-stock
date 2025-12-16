# api/index.py
import os
import re
import time
from pathlib import Path
from datetime import timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from supabase import Client, create_client

import resend

# -------------------------
# Load env (support both root .env and api/.env)
# -------------------------
THIS_DIR = Path(__file__).resolve().parent          # .../api
PROJECT_ROOT = THIS_DIR.parent                      # .../u-stock

for env_path in [
    PROJECT_ROOT / ".env",
    PROJECT_ROOT / ".env.local",
    THIS_DIR / ".env",
    THIS_DIR / ".env.local",
]:
    if env_path.exists():
        load_dotenv(env_path, override=False)

# ---- Settings ----
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "USTOCK_CORS_ORIGINS",
        "http://localhost:5173,https://u-stock.vercel.app",
    ).split(",")
    if o.strip()
]

ENV = os.getenv("ENV", "development").strip().lower()
API_PREFIX = "/api"

COOKIE_NAME = os.getenv("USTOCK_COOKIE_NAME", "access_token").strip()
REFRESH_COOKIE_NAME = os.getenv("USTOCK_REFRESH_COOKIE_NAME", "refresh_token").strip()

COOKIE_SECURE = ENV == "production"
COOKIE_SAMESITE = "none" if ENV == "production" else "lax"
COOKIE_MAX_AGE = int(os.getenv("USTOCK_COOKIE_MAX_AGE", "604800"))  # 7 days

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
FEEDBACK_TO_EMAIL = os.getenv("FEEDBACK_TO_EMAIL", "").strip()

TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "").strip()
TURNSTILE_ENABLED = os.getenv("TURNSTILE_ENABLED", "true").strip().lower() in ("1", "true", "yes")

# --- simple in-memory feedback rate limit (dev ok; for prod use Redis/Upstash) ---
FEEDBACK_RL_WINDOW_SEC = int(os.getenv("FEEDBACK_RL_WINDOW_SEC", "60"))
FEEDBACK_RL_MAX = int(os.getenv("FEEDBACK_RL_MAX", "5"))
_feedback_rl: dict[str, list[float]] = {}

app = FastAPI(title="u-stock-auth-backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["set-cookie"],
)

api = APIRouter(prefix=API_PREFIX)

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


# -------------------------
# Models
# -------------------------
class SignupBody(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None
    avatar: Optional[str] = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    avatar: Optional[str] = None


class AuthResponse(BaseModel):
    user: UserOut
    ok: bool = True


class FeedbackIn(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    feedback_type: str
    message: str

    # anti-abuse
    turnstile_token: str
    honeypot: Optional[str] = ""


# -------------------------
# Helpers
# -------------------------
PASSWORD_MIN_LEN = 12


def validate_password(password: str, email: str, username: str | None = None) -> None:
    if len(password) < PASSWORD_MIN_LEN:
        raise HTTPException(status_code=400, detail=f"Password must be at least {PASSWORD_MIN_LEN} characters.")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 lowercase letter.")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 number.")
    if not re.search(r"[^\w\s]", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 special character.")

    email_local = email.split("@")[0].lower()
    if email_local and email_local in password.lower():
        raise HTTPException(status_code=400, detail="Password must not contain your email.")
    if username and username.lower() in password.lower():
        raise HTTPException(status_code=400, detail="Password must not contain your username.")


def get_supabase_anon() -> Client:
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_ANON_KEY is missing")
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


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


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/", samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE)
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/", samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE)


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
    """
    Returns {"id": ..., "email": ...} or raises 401.
    Also refreshes cookies if refresh_token exists & access expired.
    """
    sb = get_supabase_anon()
    access = request.cookies.get(COOKIE_NAME)
    refresh = request.cookies.get(REFRESH_COOKIE_NAME)

    # 1) Try access token
    if access:
        try:
            res = sb.auth.get_user(access)
            uid, email = _extract_user_id_and_email(res)
            if uid:
                return {"id": uid, "email": email or ""}
        except Exception:
            pass

    # 2) Refresh token -> mint new session
    if refresh:
        try:
            try:
                refreshed = sb.auth.refresh_session(refresh)
            except Exception:
                refreshed = sb.auth.refresh_session({"refresh_token": refresh})

            uid, email = _extract_user_id_and_email(refreshed)

            session = getattr(refreshed, "session", None)
            if session:
                new_access = getattr(session, "access_token", None)
                new_refresh = getattr(session, "refresh_token", None)
                if new_access:
                    set_auth_cookies(response, new_access, new_refresh)

            if uid:
                return {"id": uid, "email": email or ""}
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid session: {repr(e)}")

    raise HTTPException(status_code=401, detail="Not authenticated")


def _get_client_ip(request: Request) -> str:
    xfwd = request.headers.get("x-forwarded-for")
    if xfwd:
        return xfwd.split(",")[0].strip()
    xreal = request.headers.get("x-real-ip")
    if xreal:
        return xreal.strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _rate_limit_feedback(ip: str) -> None:
    now = time.time()
    window_start = now - FEEDBACK_RL_WINDOW_SEC
    hits = _feedback_rl.get(ip, [])
    hits = [t for t in hits if t >= window_start]
    if len(hits) >= FEEDBACK_RL_MAX:
        raise HTTPException(status_code=429, detail="Too many feedback requests. Try again soon.")
    hits.append(now)
    _feedback_rl[ip] = hits


def _verify_turnstile(token: str, request: Request) -> None:
    if not TURNSTILE_ENABLED:
        return

    if not TURNSTILE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="TURNSTILE_SECRET_KEY is missing")

    ip = _get_client_ip(request)

    try:
        r = requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": TURNSTILE_SECRET_KEY, "response": token, "remoteip": ip},
            timeout=4,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Captcha verify request failed: {repr(e)}")

    try:
        data = r.json()
    except Exception:
        data = {}

    if not data.get("success"):
        codes = data.get("error-codes") or data.get("error_codes") or []
        raise HTTPException(status_code=400, detail=f"Captcha verification failed: {codes}")


# -------------------------
# Error handler (so you see useful errors)
# -------------------------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Server error", "error": repr(exc)})


# -------------------------
# Health / debug
# -------------------------
@app.get("/")
def root():
    return {"name": "u-stock-auth-backend", "status": "running", "env": ENV}


@app.get("/health")
def health():
    return {"status": "ok", "supabase_url_set": bool(SUPABASE_URL), "env": ENV}


@api.get("/debug/env")
def debug_env():
    return {
        "ENV": ENV,
        "CORS_ORIGINS": CORS_ORIGINS,
        "COOKIE_SECURE": COOKIE_SECURE,
        "COOKIE_SAMESITE": COOKIE_SAMESITE,
        "COOKIE_NAME": COOKIE_NAME,
        "SUPABASE_URL_set": bool(SUPABASE_URL),
        "SUPABASE_ANON_KEY_set": bool(SUPABASE_ANON_KEY),
        "TURNSTILE_ENABLED": TURNSTILE_ENABLED,
        "TURNSTILE_SECRET_KEY_set": bool(TURNSTILE_SECRET_KEY),
    }


# -------------------------
# Auth endpoints
# -------------------------
@api.post("/auth/signup", response_model=AuthResponse)
def signup(body: SignupBody, response: Response):
    validate_password(body.password, body.email, body.username)
    sb = get_supabase_anon()

    try:
        res = sb.auth.sign_up({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Supabase signup error: {repr(e)}")

    if not res or not getattr(res, "user", None):
        raise HTTPException(status_code=400, detail="Signup failed")

    session = getattr(res, "session", None)
    if session:
        set_auth_cookies(response, getattr(session, "access_token", None), getattr(session, "refresh_token", None))

    return AuthResponse(
        user=UserOut(id=res.user.id, email=res.user.email, avatar=body.avatar or "📈"),
        ok=True,
    )


@api.post("/auth/login", response_model=AuthResponse)
def login(body: LoginBody, response: Response):
    sb = get_supabase_anon()

    try:
        res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Supabase login error: {repr(e)}")

    if not getattr(res, "user", None) or not getattr(res, "session", None):
        raise HTTPException(status_code=401, detail="Invalid email/password or email not confirmed")

    set_auth_cookies(response, getattr(res.session, "access_token", None), getattr(res.session, "refresh_token", None))

    return AuthResponse(
        user=UserOut(id=res.user.id, email=res.user.email, avatar=(res.user.user_metadata or {}).get("avatar")),
        ok=True,
    )


@api.post("/auth/logout")
def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
def me(request: Request, response: Response):
    u = require_user(request, response)
    return {"user_id": u["id"], "email": u["email"]}


# -------------------------
# Feedback
# -------------------------
@api.post("/feedback")
def submit_feedback(payload: FeedbackIn, request: Request):
    # bots fill hidden fields
    if payload.honeypot and payload.honeypot.strip():
        return {"ok": True}

    ip = _get_client_ip(request)
    _rate_limit_feedback(ip)

    if TURNSTILE_ENABLED:
        if not payload.turnstile_token:
            raise HTTPException(status_code=400, detail="Missing captcha token.")
        _verify_turnstile(payload.turnstile_token, request)

    row = {
        "name": payload.name,
        "email": payload.email,
        "feedback_type": payload.feedback_type,
        "message": payload.message,
    }

    try:
        sb = get_supabase_anon()
        sb.table("feedback").insert(row, returning="minimal").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feedback insert failed: {repr(e)}")

    # Email notify (optional)
    email_sent = False
    email_error = None
    if RESEND_API_KEY and FEEDBACK_TO_EMAIL:
        try:
            resend.Emails.send(
                {
                    "from": "U-Stock Feedback <onboarding@resend.dev>",
                    "to": FEEDBACK_TO_EMAIL,
                    "subject": f"📬 New Feedback ({payload.feedback_type})",
                    "html": f"""
                      <h2>New Feedback</h2>
                      <p><b>Type:</b> {payload.feedback_type}</p>
                      <p><b>Name:</b> {payload.name or "Anonymous"}</p>
                      <p><b>Email:</b> {payload.email or "Not provided"}</p>
                      <p><b>IP:</b> {ip}</p>
                      <hr />
                      <pre style="white-space:pre-wrap;font-family:system-ui;">{payload.message}</pre>
                    """,
                }
            )
            email_sent = True
        except Exception as e:
            email_error = repr(e)

    return {"ok": True, "email_sent": email_sent, "email_error": email_error}


# IMPORTANT: mount router
app.include_router(api)
