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
from cryptography.fernet import Fernet

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
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
INTEGRATIONS_ENC_KEY = os.getenv("INTEGRATIONS_ENC_KEY", "").strip()

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

FEEDBACK_FROM = os.getenv("FEEDBACK_FROM", "Lucent Financial <onboarding@resend.dev>").strip()
PUBLIC_LOGO_URL = os.getenv("PUBLIC_LOGO_URL", "").strip()

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


def _escape_html(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )
def get_supabase_service() -> Client:
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_SERVICE_ROLE_KEY is missing")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def _fernet() -> Fernet:
    if not INTEGRATIONS_ENC_KEY:
        raise HTTPException(status_code=500, detail="INTEGRATIONS_ENC_KEY is missing")
    return Fernet(INTEGRATIONS_ENC_KEY.encode() if isinstance(INTEGRATIONS_ENC_KEY, str) else INTEGRATIONS_ENC_KEY)

def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    f = _fernet()
    return f.encrypt(value.encode("utf-8")).decode("utf-8")

def decrypt_secret(token: str | None) -> str | None:
    if not token:
        return None
    f = _fernet()
    return f.decrypt(token.encode("utf-8")).decode("utf-8")

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
        return {"ok": True, "email_sent": False, "thanks_sent": False}

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

    # 1) Insert into Supabase
    try:
        sb = get_supabase_anon()
        sb.table("feedback").insert(row, returning="minimal").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feedback insert failed: {repr(e)}")

    # 2) Email notify (admin)
    email_sent = False
    email_error = None

    # 3) Thank-you email (user)
    thanks_sent = False
    thanks_error = None

    if RESEND_API_KEY and FEEDBACK_TO_EMAIL:
        try:
            safe_type = _escape_html(payload.feedback_type)
            safe_name = _escape_html(payload.name or "Anonymous")
            safe_email = _escape_html(payload.email or "Not provided")
            safe_msg = _escape_html(payload.message or "")

            logo_html = ""
            if PUBLIC_LOGO_URL:
                logo_html = f"""
                  <div style="text-align:center;padding-bottom:18px;">
                    <img src="{PUBLIC_LOGO_URL}" alt="Lucent Financial" width="140" style="display:block;margin:0 auto;" />
                  </div>
                """

            admin_html = f"""
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f7f7f7;font-family:Inter,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;">
            <tr><td>{logo_html}</td></tr>
            <tr>
              <td>
                <h2 style="margin:0 0 16px 0;color:#111827;">New Feedback Received</h2>
                <p style="margin:8px 0;"><strong>Type:</strong> {safe_type}</p>
                <p style="margin:8px 0;"><strong>Name:</strong> {safe_name}</p>
                <p style="margin:8px 0;"><strong>Email:</strong> {safe_email}</p>
                <p style="margin:8px 0;"><strong>IP:</strong> {_escape_html(ip)}</p>

                <hr style="margin:22px 0;border:none;border-top:1px solid #e5e7eb;" />

                <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:14px;border-radius:10px;white-space:pre-wrap;color:#111827;">
                  {safe_msg}
                </div>

                <div style="padding-top:22px;color:#6b7280;font-size:12px;">
                  Lucent Financial · Feedback System
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
            """

            resend.Emails.send(
                {
                    "from": FEEDBACK_FROM,
                    "to": [FEEDBACK_TO_EMAIL],
                    "subject": f"📬 New Feedback ({payload.feedback_type})",
                    "html": admin_html,
                    # lets you click Reply in Gmail and respond to the user
                    "reply_to": payload.email or None,
                }
            )
            email_sent = True
        except Exception as e:
            email_error = repr(e)

        # Send thank-you email to user (only if user provided email)
        if payload.email:
            try:
                thanks_html = f"""
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f7f7f7;font-family:Inter,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;">
            <tr><td>{logo_html}</td></tr>
            <tr>
              <td>
                <h2 style="margin:0 0 12px 0;color:#111827;">Thanks for your feedback!</h2>
                <p style="margin:0 0 12px 0;color:#374151;line-height:1.5;">
                  We received your message and appreciate you helping improve Lucent Financial.
                </p>
                <p style="margin:0 0 18px 0;color:#6b7280;font-size:13px;">
                  If you included a contact email, we may follow up for details.
                </p>

                <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:14px;border-radius:10px;white-space:pre-wrap;color:#111827;">
                  <strong>Your message:</strong><br/><br/>{safe_msg}
                </div>

                <div style="padding-top:22px;color:#6b7280;font-size:12px;">
                  — Lucent Financial Team
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
                """

                resend.Emails.send(
                    {
                        "from": FEEDBACK_FROM,
                        "to": [payload.email],
                        "subject": "✅ Thanks — we got your message",
                        "html": thanks_html,
                    }
                )
                thanks_sent = True
            except Exception as e:
                thanks_error = repr(e)

    return {
        "ok": True,
        "email_sent": email_sent,
        "email_error": email_error,
        "thanks_sent": thanks_sent,
        "thanks_error": thanks_error,
    }

# -------------------------
# Integrations (Supabase table)
# -------------------------

KNOWN_PROVIDERS = [
    {"key": "alpaca", "name": "Alpaca"},
    {"key": "polygon", "name": "Polygon.io"},
    {"key": "tradingview", "name": "TradingView"},
]

class IntegrationOut(BaseModel):
    provider: str
    status: str  # "connected" | "not_connected"
    updated_at: Optional[str] = None

class IntegrationsResponse(BaseModel):
    apps: List[IntegrationOut]
    missing: List[str]
    message: str
    ok: bool = True

class AlpacaKeysIn(BaseModel):
    api_key: str
    api_secret: str
    mode: str = "paper"  # "paper" | "live"

class PolygonKeysIn(BaseModel):
    api_key: str

def _provider_name(key: str) -> str:
    for p in KNOWN_PROVIDERS:
        if p["key"] == key:
            return p["name"]
    return key

def _missing_message(missing: List[str]) -> str:
    if len(missing) == 0:
        return ""
    if len(missing) == 1:
        return f"{_provider_name(missing[0])} is not connected. Connect it to enable this app."
    return "Some apps aren’t connected yet. Connect one or more providers to continue."

@api.get("/integrations", response_model=IntegrationsResponse)
def list_integrations(request: Request, response: Response):
    u = require_user(request, response)
    user_id = u["id"]

    sb = get_supabase_service()
    try:
        rows = (
            sb.table("integrations")
            .select("provider,status,updated_at")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load integrations: {repr(e)}")

    data = rows.data or []
    db_status = {str(r["provider"]).lower(): r for r in data if r.get("provider")}

    apps: List[IntegrationOut] = []
    missing: List[str] = []

    for p in KNOWN_PROVIDERS:
        key = p["key"]
        rec = db_status.get(key)

        if rec and str(rec.get("status", "")).lower() == "connected":
            apps.append(
                IntegrationOut(
                    provider=key,
                    status="connected",
                    updated_at=str(rec.get("updated_at")) if rec.get("updated_at") else None,
                )
            )
        else:
            apps.append(IntegrationOut(provider=key, status="not_connected", updated_at=None))
            missing.append(key)

    msg = _missing_message(missing)
    return IntegrationsResponse(apps=apps, missing=missing, message=msg, ok=True)

@api.post("/integrations/alpaca/keys")
def save_alpaca_keys(payload: AlpacaKeysIn, request: Request, response: Response):
    u = require_user(request, response)
    user_id = u["id"]

    if not payload.api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required.")
    if not payload.api_secret.strip():
        raise HTTPException(status_code=400, detail="API secret is required for Alpaca.")
    if payload.mode not in ("paper", "live"):
        raise HTTPException(status_code=400, detail="Mode must be 'paper' or 'live'.")

    sb = get_supabase_service()
    row = {
        "user_id": user_id,
        "provider": "alpaca",
        "status": "connected",
        "api_key_enc": encrypt_secret(payload.api_key.strip()),
        "api_secret_enc": encrypt_secret(payload.api_secret.strip()),
        "mode": payload.mode,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    try:
        sb.table("integrations").upsert(row, on_conflict="user_id,provider").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save Alpaca keys: {repr(e)}")

    return {"ok": True, "provider": "alpaca", "status": "connected"}

@api.post("/integrations/polygon/keys")
def save_polygon_keys(payload: PolygonKeysIn, request: Request, response: Response):
    u = require_user(request, response)
    user_id = u["id"]

    if not payload.api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required.")

    sb = get_supabase_service()
    row = {
        "user_id": user_id,
        "provider": "polygon",
        "status": "connected",
        "api_key_enc": encrypt_secret(payload.api_key.strip()),
        "api_secret_enc": None,
        "mode": None,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    try:
        sb.table("integrations").upsert(row, on_conflict="user_id,provider").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save Polygon key: {repr(e)}")

    return {"ok": True, "provider": "polygon", "status": "connected"}


# 👈 IMPORTANT: without this, /api/auth/me (and all /api routes) will 404
app.include_router(api)
