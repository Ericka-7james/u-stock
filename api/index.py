# api/index.py
import os
import re
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase import Client, create_client

# Load repo-root .env for local dev; in Vercel this is harmless.
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

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

# Cookie config
COOKIE_NAME = os.getenv("USTOCK_COOKIE_NAME", "access_token").strip()

# Dev: Secure=False + SameSite=Lax (works on localhost)
# Prod (cross-site cookie): SameSite=None + Secure=True required
COOKIE_SECURE = ENV == "production"
COOKIE_SAMESITE = "none" if ENV == "production" else "lax"
COOKIE_MAX_AGE = int(os.getenv("USTOCK_COOKIE_MAX_AGE", "604800"))  # 7 days in seconds

app = FastAPI(title="u-stock-auth-backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,  # REQUIRED for cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Supabase client ----------
def get_supabase() -> Client:
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_ANON_KEY is missing")
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


# ---------- Cookie helpers ----------
def set_auth_cookie(response: Response, access_token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,  # "lax" (dev) or "none" (prod cross-site)
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def require_user_id(request: Request) -> str:
    """
    Cookie-auth guard.
    Validates the Supabase access_token stored in HttpOnly cookie by calling Supabase.
    Returns the Supabase user id (uuid string).
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sb = get_supabase()
    try:
        res = sb.auth.get_user(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid session: {repr(e)}")

    # supabase-py versions differ slightly; handle both object + dict responses
    user = getattr(res, "user", None) if res is not None else None
    if user is None and isinstance(res, dict):
        user = res.get("user")

    user_id = getattr(user, "id", None) if user is not None else None
    if not user_id and isinstance(user, dict):
        user_id = user.get("id")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")

    return user_id


# ---------- Health / debug ----------
@app.get("/")
def root():
    return {"name": "u-stock-auth-backend", "status": "running", "env": ENV}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "supabase_url_set": bool(SUPABASE_URL),
        "env": ENV,
    }


@app.get("/debug/env")
def debug_env():
    # keep for now; remove later
    return {
        "SUPABASE_URL_set": bool(SUPABASE_URL),
        "SUPABASE_ANON_KEY_set": bool(SUPABASE_ANON_KEY),
        "CORS_ORIGINS": CORS_ORIGINS,
        "ENV": ENV,
        "COOKIE_SECURE": COOKIE_SECURE,
        "COOKIE_SAMESITE": COOKIE_SAMESITE,
        "COOKIE_NAME": COOKIE_NAME,
    }


# ---------- Password rules ----------
PASSWORD_MIN_LEN = 12


def validate_password(password: str, email: str, username: str | None = None) -> None:
    if len(password) < PASSWORD_MIN_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {PASSWORD_MIN_LEN} characters.",
        )

    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must include at least 1 uppercase letter.",
        )
    if not re.search(r"[a-z]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must include at least 1 lowercase letter.",
        )
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must include at least 1 number.")
    if not re.search(r"[^\w\s]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must include at least 1 special character.",
        )

    email_local = email.split("@")[0].lower()
    if email_local and email_local in password.lower():
        raise HTTPException(status_code=400, detail="Password must not contain your email.")

    if username and username.lower() in password.lower():
        raise HTTPException(status_code=400, detail="Password must not contain your username.")


# ---------- Schemas ----------
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


# ---------- Auth endpoints (COOKIE VERSION) ----------
@app.post("/auth/signup", response_model=AuthResponse)
def signup(body: SignupBody, response: Response):
    validate_password(body.password, body.email, body.username)
    sb = get_supabase()

    try:
        res = sb.auth.sign_up({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Supabase signup error: {repr(e)}")

    if not res or not res.user:
        raise HTTPException(status_code=400, detail=f"Signup failed. Raw response: {res}")

    # If Supabase returns a session immediately, set cookie.
    # If email confirmation is required, res.session may be None.
    if getattr(res, "session", None) and res.session and getattr(res.session, "access_token", None):
        set_auth_cookie(response, res.session.access_token)

    return AuthResponse(
        user=UserOut(id=res.user.id, email=res.user.email, avatar=body.avatar or "📈"),
        ok=True,
    )


@app.post("/auth/login", response_model=AuthResponse)
def login(body: LoginBody, response: Response):
    sb = get_supabase()

    try:
        res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Supabase login error: {repr(e)}")

    if not res.user or not res.session:
        raise HTTPException(status_code=401, detail="Invalid email/password or email not confirmed")

    # ✅ Store JWT in HttpOnly cookie (frontend never sees it)
    set_auth_cookie(response, res.session.access_token)

    return AuthResponse(
        user=UserOut(
            id=res.user.id,
            email=res.user.email,
            avatar=(res.user.user_metadata or {}).get("avatar"),
        ),
        ok=True,
    )


@app.post("/auth/logout")
def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@app.get("/auth/me")
def me(user_id: str = Depends(require_user_id)):
    return {"user_id": user_id}


# ---------- Integrations (Protected) ----------
@app.get("/integrations")
def list_integrations(user_id: str = Depends(require_user_id)):
    # Stub response for now (no DB yet).
    # Later: read from Supabase table `public.integrations` per user_id.
    return {
        "user_id": user_id,
        "apps": [
            {"provider": "alpaca", "status": "not_connected"},
            {"provider": "polygon", "status": "not_connected"},
            {"provider": "tradingview", "status": "not_connected"},
        ],
    }


@app.post("/integrations/{provider}/connect")
def connect_provider(provider: str, user_id: str = Depends(require_user_id)):
    # TODO: implement OAuth or API-key saving flow per provider.
    # For now: just return a stub.
    return {"ok": True, "provider": provider, "user_id": user_id}


@app.post("/integrations/{provider}/disconnect")
def disconnect_provider(provider: str, user_id: str = Depends(require_user_id)):
    # TODO: delete stored tokens/keys for provider for this user.
    return {"ok": True, "provider": provider, "user_id": user_id}
