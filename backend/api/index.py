# api/index.py
from __future__ import annotations

import os
import sys
import re
import time
from pathlib import Path
from typing import Any, List, Optional, Dict
from fastapi import Query

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr

from api.db import get_supabase_anon, get_supabase_service
from api.crypto_utils import encrypt_secret, decrypt_secret

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

from api.deps import require_user

import resend


THIS_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = THIS_DIR.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

PROJECT_ROOT = BACKEND_ROOT.parent

for env_path in [
    PROJECT_ROOT / ".env",
    PROJECT_ROOT / ".env.local",
    BACKEND_ROOT / ".env",
    BACKEND_ROOT / ".env.local",
    THIS_DIR / ".env",
    THIS_DIR / ".env.local",
]:
    if env_path.exists():
        load_dotenv(env_path, override=False)

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
COOKIE_MAX_AGE = int(os.getenv("USTOCK_COOKIE_MAX_AGE", "604800"))

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
FEEDBACK_TO_EMAIL = os.getenv("FEEDBACK_TO_EMAIL", "").strip()

TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "").strip()
TURNSTILE_ENABLED = os.getenv("TURNSTILE_ENABLED", "true").strip().lower() in ("1", "true", "yes")

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


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Server error", "error": repr(exc)})


@app.get("/")
def root():
    return {"name": "u-stock-auth-backend", "status": "running", "env": ENV}


@app.get("/health")
def health():
    return {"status": "ok", "env": ENV}


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
# Feedback (unchanged)
# -------------------------
@api.post("/feedback")
def submit_feedback(payload: FeedbackIn, request: Request):
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

    try:
        sb = get_supabase_anon()
        sb.table("feedback").insert(row, returning="minimal").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feedback insert failed: {repr(e)}")

    # (email logic left as-is)
    email_sent = False
    email_error = None
    thanks_sent = False
    thanks_error = None

    if RESEND_API_KEY and FEEDBACK_TO_EMAIL:
        logo_html = ""
        if PUBLIC_LOGO_URL:
            logo_html = f"""
              <div style="text-align:center;padding-bottom:18px;">
                <img src="{PUBLIC_LOGO_URL}" alt="Lucent Financial" width="140" style="display:block;margin:0 auto;" />
              </div>
            """

        try:
            safe_type = _escape_html(payload.feedback_type)
            safe_name = _escape_html(payload.name or "Anonymous")
            safe_email = _escape_html(payload.email or "Not provided")
            safe_msg = _escape_html(payload.message or "")

            admin_html = f"""<!DOCTYPE html><html><body>
            <h2>New Feedback</h2>
            <p><b>Type:</b> {safe_type}</p>
            <p><b>Name:</b> {safe_name}</p>
            <p><b>Email:</b> {safe_email}</p>
            <pre>{safe_msg}</pre>
            </body></html>"""

            resend.Emails.send(
                {
                    "from": FEEDBACK_FROM,
                    "to": [FEEDBACK_TO_EMAIL],
                    "subject": f"📬 New Feedback ({payload.feedback_type})",
                    "html": admin_html,
                    "reply_to": payload.email or None,
                }
            )
            email_sent = True
        except Exception as e:
            email_error = repr(e)

        if payload.email:
            try:
                thanks_html = f"""<!DOCTYPE html><html><body>
                <h2>Thanks!</h2><p>We got your message.</p>
                </body></html>"""
                resend.Emails.send(
                    {"from": FEEDBACK_FROM, "to": [payload.email], "subject": "✅ Thanks — we got your message", "html": thanks_html}
                )
                thanks_sent = True
            except Exception as e:
                thanks_error = repr(e)

    return {"ok": True, "email_sent": email_sent, "email_error": email_error, "thanks_sent": thanks_sent, "thanks_error": thanks_error}


# -------------------------
# Integrations (unchanged)
# -------------------------
KNOWN_PROVIDERS = [
    {"key": "alpaca", "name": "Alpaca"},
    {"key": "polygon", "name": "Polygon.io"},
    {"key": "tradingview", "name": "TradingView"},
]


class IntegrationOut(BaseModel):
    provider: str
    status: str
    updated_at: Optional[str] = None


class IntegrationsResponse(BaseModel):
    apps: List[IntegrationOut]
    missing: List[str]
    message: str
    ok: bool = True


class AlpacaKeysIn(BaseModel):
    api_key: str
    api_secret: str
    mode: str = "paper"


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
        rows = sb.table("integrations").select("provider,status,updated_at").eq("user_id", user_id).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "INTEGRATIONS_LOAD_FAILED",
                "message": "Could not load your connected apps.",
                "user_action": "Refresh the page. If it keeps happening, sign out and sign back in.",
                "source": "integrations",
                "debug": repr(e),  # optional (nice during dev)
            },
        )

    data = rows.data or []
    db_status = {str(r["provider"]).lower(): r for r in data if r.get("provider")}

    apps: List[IntegrationOut] = []
    missing: List[str] = []

    for p in KNOWN_PROVIDERS:
        key = p["key"]
        rec = db_status.get(key)
        if rec and str(rec.get("status", "")).lower() == "connected":
            apps.append(IntegrationOut(provider=key, status="connected", updated_at=str(rec.get("updated_at")) if rec.get("updated_at") else None))
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
        "updated_at": _now_iso(),
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
        "updated_at": _now_iso(),
    }

    try:
        sb.table("integrations").upsert(row, on_conflict="user_id,provider").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save Polygon key: {repr(e)}")

    return {"ok": True, "provider": "polygon", "status": "connected"}


# -------------------------
# Bots (Supabase-backed)
# -------------------------
SUPPORTED_BOTS = {
    "orb": "ORB (Opening Range Breakout)",
    "ema_vwap": "EMA Trend (9/21 + VWAP filter)",
}

class BotActionIn(BaseModel):
    bot_id: str


def _require_alpaca_connected(user_id: str) -> None:
    sb = get_supabase_service()
    try:
        rows = sb.table("integrations").select("status").eq("user_id", user_id).eq("provider", "alpaca").limit(1).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check Alpaca integration: {repr(e)}")

    rec = (rows.data or [None])[0]
    status = str((rec or {}).get("status", "not_connected")).lower()
    if status != "connected":
        raise HTTPException(status_code=400, detail="Alpaca is not connected. Connect Alpaca first.")


def _default_orb_config() -> Dict[str, Any]:
    # Default config is NOT "hardcoding strategy forever" — it's a fallback.
    # You can change config in Supabase later without changing code.
    return {
        "enabled": False,
        "symbols_mode": "static",         # static | watchlist | top_n
        "symbols": ["SPY"],               # used when symbols_mode=static
        "top_n": 5,                       # used when symbols_mode=top_n (future)
        "range_minutes": 5,               # 3/5/10/15
        "entry_buffer_cents": 2,          # avoids wick triggers
        "confirm_close": True,            # require 1m close beyond range
        "allow_shorts": False,
        "risk_per_trade_pct": 0.005,      # 0.5% of equity
        "rr_take_profit": 1.5,            # take profit at 1.5R (base)
        "partial_tp": True,               # take partial at 1R
        "max_trades_per_symbol": 1,
        "max_total_trades": 3,
        "cooldown_minutes": 10,
        "max_daily_loss_usd": 50,         # kill switch
        "trade_end_time_et": "11:00",     # stop entering after this time
        "filters": {
            "vwap": True,
            "min_or_range_pct": 0.001,    # skip too small range
            "max_or_range_pct": 0.02      # skip too large range
        },
        "auto_pause_on_strategy_error": True
    }

def _default_config(bot_id: str) -> Dict[str, Any]:
    if bot_id == "orb":
        return _default_orb_config()
    return {"enabled": False}


def _ensure_bot_rows(user_id: str) -> None:
    sb = get_supabase_service()

    for bot_id in SUPPORTED_BOTS.keys():
        # bot_configs
        cfg = _default_config(bot_id)
        try:
            sb.table("bot_configs").upsert(
                {
                    "user_id": user_id,
                    "bot_id": bot_id,
                    "config": cfg,
                    "enabled": bool(cfg.get("enabled", False)),
                    "updated_at": _now_iso(),
                },
                on_conflict="user_id,bot_id",
            ).execute()
        except Exception:
            # if row exists, upsert still ok; ignore if schema differs
            pass

        # desired state
        try:
            sb.table("bot_desired_state").upsert(
                {"user_id": user_id, "bot_id": bot_id, "desired_state": "paused", "updated_at": _now_iso()},
                on_conflict="user_id,bot_id",
            ).execute()
        except Exception:
            pass

        # runtime state
        try:
            sb.table("bot_runtime_state").upsert(
                {
                    "user_id": user_id,
                    "bot_id": bot_id,
                    "runtime_state": "idle",
                    "updated_at": _now_iso(),
                },
                on_conflict="user_id,bot_id",
            ).execute()
        except Exception:
            pass


@api.get("/bots/status")
def bots_status(request: Request, response: Response):
    u = require_user(request, response)
    user_id = u["id"]
    _ensure_bot_rows(user_id)

    sb = get_supabase_service()

    desired = sb.table("bot_desired_state").select("bot_id,desired_state,updated_at").eq("user_id", user_id).execute().data or []
    runtime = sb.table("bot_runtime_state").select(
        "bot_id,runtime_state,last_heartbeat,last_error_type,last_error_message,updated_at"
    ).eq("user_id", user_id).execute().data or []

    desired_map = {r["bot_id"]: r for r in desired if r.get("bot_id")}
    runtime_map = {r["bot_id"]: r for r in runtime if r.get("bot_id")}

    # stale detection: if runner hasn't heartbeat in 30s while desired running => show stale
    STALE_SEC = 30

    statuses: Dict[str, Dict[str, Any]] = {}
    now = time.time()

    for bot_id in SUPPORTED_BOTS.keys():
        d = desired_map.get(bot_id, {})
        rt = runtime_map.get(bot_id, {})

        desired_state = (d.get("desired_state") or "paused").lower()
        runtime_state = (rt.get("runtime_state") or "idle").lower()

        hb = rt.get("last_heartbeat")
        stale = False
        if hb and isinstance(hb, str):
            # parse minimal: YYYY-MM-DDTHH:MM:SSZ
            try:
                hb_ts = time.strptime(hb.replace("Z", ""), "%Y-%m-%dT%H:%M:%S")
                hb_epoch = time.mktime(hb_ts)
                if desired_state == "running" and (now - hb_epoch) > STALE_SEC:
                    stale = True
            except Exception:
                pass

        if stale:
            runtime_state = "stale"

        msg = ""
        if runtime_state == "error":
            et = rt.get("last_error_type") or "strategy"
            em = rt.get("last_error_message") or "Unknown error"
            msg = f"{et}: {em}"
        elif runtime_state == "stale":
            msg = "Runner heartbeat missing (possible reboot/crash). Will resume when runner restarts."
        elif desired_state == "paused" and runtime_state in ("idle", "paused"):
            msg = ""

        # frontend expects: { state, message, updated_at }
        # We'll expose runtime_state if running, else reflect desired if paused.
        state_for_ui = runtime_state if runtime_state in ("running", "error", "stale") else ("paused" if desired_state == "paused" else "idle")

        statuses[bot_id] = {
            "state": state_for_ui,
            "message": msg,
            "updated_at": rt.get("updated_at") or d.get("updated_at") or _now_iso(),
        }

    return {"ok": True, "statuses": statuses}


@api.post("/bots/start")
def bots_start(payload: BotActionIn, request: Request, response: Response):
    u = require_user(request, response)
    user_id = u["id"]

    bot_id = (payload.bot_id or "").strip()
    if bot_id not in SUPPORTED_BOTS:
        raise HTTPException(status_code=400, detail=f"Unknown bot_id '{bot_id}'")

    _require_alpaca_connected(user_id)

    sb = get_supabase_service()

    # 1) Ensure bot_configs row exists and ENABLE it (so user doesn't have to do it manually)
    sb.table("bot_configs").upsert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "enabled": True,
            "updated_at": _now_iso(),
        },
        on_conflict="user_id,bot_id",
    ).execute()

    # 2) desired_state = running
    sb.table("bot_desired_state").upsert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "desired_state": "running",
            "updated_at": _now_iso(),
        },
        on_conflict="user_id,bot_id",
    ).execute()

    # 3) (Optional) runtime immediately reflects the intent; runner will update heartbeat later
    sb.table("bot_runtime_state").upsert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "runtime_state": "running",
            "updated_at": _now_iso(),
        },
        on_conflict="user_id,bot_id",
    ).execute()

    # Also keep your in-memory store for now (UI wiring)
    bot_map = _get_user_bot_map(user_id)
    bot_map[bot_id] = {
        "state": "running",
        "message": "Started via dashboard.",
        "updated_at": _now_iso(),
    }

    return {"ok": True, "bot_id": bot_id, "state": "running"}

@api.post("/bots/stop")
def bots_stop(payload: BotActionIn, request: Request, response: Response):
    u = require_user(request, response)
    user_id = u["id"]

    bot_id = (payload.bot_id or "").strip()
    if bot_id not in SUPPORTED_BOTS:
        raise HTTPException(status_code=400, detail=f"Unknown bot_id '{bot_id}'")

    sb = get_supabase_service()

    # desired_state = paused
    sb.table("bot_desired_state").upsert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "desired_state": "paused",
            "updated_at": _now_iso(),
        },
        on_conflict="user_id,bot_id",
    ).execute()

    # runtime reflects pause
    sb.table("bot_runtime_state").upsert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "runtime_state": "paused",
            "updated_at": _now_iso(),
        },
        on_conflict="user_id,bot_id",
    ).execute()

    bot_map = _get_user_bot_map(user_id)
    bot_map[bot_id] = {
        "state": "paused",
        "message": "Paused via dashboard.",
        "updated_at": _now_iso(),
    }

    return {"ok": True, "bot_id": bot_id, "state": "paused"}

@api.get("/bots/logs")
def bots_logs(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    limit: int = Query(200, ge=10, le=2000),
):
    u = require_user(request, response)
    user_id = u["id"]

    if bot_id not in SUPPORTED_BOTS:
        raise HTTPException(status_code=400, detail=f"Unknown bot_id '{bot_id}'")

    sb = get_supabase_service()
    rows = (
        sb.table("bot_logs")
        .select("ts,level,message")
        .eq("user_id", user_id)
        .eq("bot_id", bot_id)
        .order("ts", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )

    lines = [f"[{r['ts']}] {r.get('level','info')}: {r.get('message','')}" for r in reversed(rows)]
    return {"ok": True, "bot_id": bot_id, "lines": lines}


@api.get("/debug/pipeline")
def debug_pipeline():
    v = os.getenv("PIPELINE_SECRET", "")
    return {
        "PIPELINE_SECRET_set": bool(v.strip()),
        "PIPELINE_SECRET_len": len(v.strip()),
        "PIPELINE_SECRET_prefix": v.strip()[:6],
        "PIPELINE_SECRET_suffix": v.strip()[-6:] if len(v.strip()) >= 6 else v.strip(),
    }

@api.get("/debug/env")
def debug_env():
    return {
        "ENV": ENV,
        "CORS_ORIGINS": CORS_ORIGINS,
        "COOKIE_SECURE": COOKIE_SECURE,
        "COOKIE_SAMESITE": COOKIE_SAMESITE,
        "COOKIE_NAME": COOKIE_NAME,
        "TURNSTILE_ENABLED": TURNSTILE_ENABLED,
        "TURNSTILE_SECRET_KEY_set": bool(TURNSTILE_SECRET_KEY),

        # ✅ add these
        "INTEGRATIONS_ENC_KEY_set": bool(os.getenv("INTEGRATIONS_ENC_KEY", "").strip()),
        "INTEGRATIONS_ENC_KEY_len": len(os.getenv("INTEGRATIONS_ENC_KEY", "").strip()),
        "INTEGRATIONS_ENC_KEY_prefix": os.getenv("INTEGRATIONS_ENC_KEY", "").strip()[:6],
    }

# Routers
app.include_router(cron_router, prefix="/api")
app.include_router(alpaca_router, prefix="/api")
app.include_router(alpaca_trading_router, prefix="/api")

app.include_router(market_us_router)
app.include_router(macro_router)
app.include_router(fundamentals_router)
app.include_router(calendar_router)
app.include_router(fx_router)
app.include_router(opportunities_router)

app.include_router(auth_bot_runner_router, prefix="/api")
app.include_router(integrations_alpaca_router, prefix="/api")

app.include_router(api)
