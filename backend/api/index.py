# backend/api/index.py
from __future__ import annotations

import os
import sys
import re
import time
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr

# -------------------------
# Path + env bootstrapping (do this FIRST)
# -------------------------
THIS_FILE = Path(__file__).resolve()
API_DIR = THIS_FILE.parent           # backend/api
BACKEND_DIR = API_DIR.parent         # backend

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env.local", override=True)
load_dotenv(BACKEND_DIR / ".env", override=False)

ENV = os.getenv("ENV", "local").strip().lower()

# Only strict in staging/prod; local can be non-strict to avoid reload misery
STRICT_SETTINGS = ENV in ("staging", "prod", "production")

from api.settings import Settings
settings = Settings(strict=STRICT_SETTINGS)

import resend
from api.db import get_supabase_anon
from api.deps import require_user

from api.alpaca_data import router as alpaca_router
from api.alpaca_trading import router as alpaca_trading_router
from api.cron import router as cron_router

from api.routes.market_us import router as market_us_router
from api.routes.macro import router as macro_router
from api.routes.fundamentals import router as fundamentals_router
from api.routes.calendar import router as calendar_router
from api.routes.fx import router as fx_router
from api.routes.opportunities import router as opportunities_router
from api.routes.auth_bot_runner import router as auth_bot_runner_router
from api.routes.integrations_alpaca import router as integrations_alpaca_router

# Health router: standardize it to export `router` in backend/api/routes/health.py
try:
    from api.routes.health import router as health_router
except Exception:
    health_router = None


API_PREFIX = "/api"

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "USTOCK_CORS_ORIGINS",
        "http://localhost:5173,https://u-stock.vercel.app",
    ).split(",")
    if o.strip()
]

COOKIE_NAME = os.getenv("USTOCK_COOKIE_NAME", "access_token").strip()
REFRESH_COOKIE_NAME = os.getenv("USTOCK_REFRESH_COOKIE_NAME", "refresh_token").strip()
COOKIE_SECURE = os.getenv("USTOCK_COOKIE_SECURE", "false").strip().lower() in ("1", "true", "yes")
COOKIE_SAMESITE = os.getenv("USTOCK_COOKIE_SAMESITE", "lax").strip().lower()
COOKIE_MAX_AGE = int(os.getenv("USTOCK_COOKIE_MAX_AGE", "604800"))

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
FEEDBACK_TO_EMAIL = os.getenv("FEEDBACK_TO_EMAIL", "").strip()

TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "").strip()
TURNSTILE_ENABLED = os.getenv("TURNSTILE_ENABLED", "true").strip().lower() in ("1", "true", "yes")

FEEDBACK_RL_WINDOW_SEC = int(os.getenv("FEEDBACK_RL_WINDOW_SEC", "60"))
FEEDBACK_RL_MAX = int(os.getenv("FEEDBACK_RL_MAX", "5"))
_feedback_rl: dict[str, list[float]] = {}

FEEDBACK_FROM = os.getenv("FEEDBACK_FROM", "Lucent Financial <onboarding@resend.dev>").strip()

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
    turnstile_token: str
    honeypot: Optional[str] = ""


PASSWORD_MIN_LEN = 12


# -------------------------
# Helpers
# -------------------------
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
    r = requests.post(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        data={"secret": TURNSTILE_SECRET_KEY, "response": token, "remoteip": ip},
        timeout=4,
    )
    try:
        data = r.json()
    except Exception:
        data = {}

    if not data.get("success"):
        codes = data.get("error-codes") or data.get("error_codes") or []
        raise HTTPException(status_code=400, detail=f"Captcha verification failed: {codes}")


def _escape_html(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Server error", "error": repr(exc)})


# -------------------------
# Basic endpoints
# -------------------------
@app.get("/")
def root():
    return {"name": "u-stock-auth-backend", "status": "running", "env": ENV, "strict_settings": STRICT_SETTINGS}


@app.get("/health")
def health_root():
    return {"status": "ok", "env": ENV}


# -------------------------
# Auth routes
# -------------------------
@api.post("/auth/signup", response_model=AuthResponse)
def signup(body: SignupBody, response: Response):
    validate_password(body.password, body.email, body.username)
    sb = get_supabase_anon()
    res = sb.auth.sign_up({"email": body.email, "password": body.password})

    if not res or not getattr(res, "user", None):
        raise HTTPException(status_code=400, detail="Signup failed")

    session = getattr(res, "session", None)
    if session:
        set_auth_cookies(response, getattr(session, "access_token", None), getattr(session, "refresh_token", None))

    return AuthResponse(user=UserOut(id=res.user.id, email=res.user.email, avatar=body.avatar or "📈"), ok=True)


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
# Routers
# -------------------------
app.include_router(cron_router, prefix="/api")
app.include_router(alpaca_router, prefix="/api")
app.include_router(alpaca_trading_router, prefix="/api")

app.include_router(market_us_router)
app.include_router(macro_router)
app.include_router(fundamentals_router)
app.include_router(calendar_router)
app.include_router(fx_router)
app.include_router(opportunities_router)

if health_router is not None:
    app.include_router(health_router)

app.include_router(auth_bot_runner_router, prefix="/api")
app.include_router(integrations_alpaca_router, prefix="/api")

app.include_router(api)
