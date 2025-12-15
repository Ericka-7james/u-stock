# api/index.py
import os
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Response, Request
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

COOKIE_NAME = os.getenv("USTOCK_COOKIE_NAME", "access_token").strip()
COOKIE_SECURE = ENV == "production"
COOKIE_SAMESITE = "none" if ENV == "production" else "lax"
COOKIE_MAX_AGE = int(os.getenv("USTOCK_COOKIE_MAX_AGE", "604800"))  # 7 days seconds

API_PREFIX = "/api"

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

# ---------- Models ----------
class AlpacaKeys(BaseModel):
    api_key: str
    api_secret: str
    mode: str = "paper"  # "paper" or "live"

class PolygonKeys(BaseModel):
    api_key: str

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

# ---------- Supabase clients ----------
def get_supabase_anon() -> Client:
    """Anon client used for auth endpoints."""
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_ANON_KEY is missing")
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

def get_supabase_user(jwt_token: str) -> Client:
    """
    User-scoped client for RLS-protected DB operations.
    This makes PostgREST enforce policies using auth.uid().
    """
    sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    sb.postgrest.auth(jwt_token)
    return sb

# ---------- Cookie helpers ----------
def set_auth_cookie(response: Response, access_token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=COOKIE_MAX_AGE,
        path="/",
    )

def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")

def get_cookie_token(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token

def require_user_id(request: Request) -> str:
    token = get_cookie_token(request)
    sb = get_supabase_anon()
    try:
        res = sb.auth.get_user(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid session: {repr(e)}")

    user = getattr(res, "user", None) if res is not None else None
    if user is None and isinstance(res, dict):
        user = res.get("user")

    user_id = getattr(user, "id", None) if user is not None else None
    if not user_id and isinstance(user, dict):
        user_id = user.get("id")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")

    return user_id

def _normalize_provider(p: str) -> str:
    return (p or "").strip().lower()

# ---------- Health / debug ----------
@app.get("/")
def root():
    return {"name": "u-stock-auth-backend", "status": "running", "env": ENV}

@app.get("/health")
def health():
    return {"status": "ok", "supabase_url_set": bool(SUPABASE_URL), "env": ENV}

@api.get("/_debug/routes")
def debug_routes():
    return sorted([r.path for r in app.routes])

@api.get("/debug/env")
def debug_env():
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

# ---------- Auth endpoints ----------
@api.post("/auth/signup", response_model=AuthResponse)
def signup(body: SignupBody, response: Response):
    validate_password(body.password, body.email, body.username)
    sb = get_supabase_anon()
    try:
        res = sb.auth.sign_up({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Supabase signup error: {repr(e)}")

    if not res or not res.user:
        raise HTTPException(status_code=400, detail=f"Signup failed. Raw response: {res}")

    if getattr(res, "session", None) and res.session and getattr(res.session, "access_token", None):
        set_auth_cookie(response, res.session.access_token)

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

    if not res.user or not res.session:
        raise HTTPException(status_code=401, detail="Invalid email/password or email not confirmed")

    set_auth_cookie(response, res.session.access_token)

    return AuthResponse(
        user=UserOut(
            id=res.user.id,
            email=res.user.email,
            avatar=(res.user.user_metadata or {}).get("avatar"),
        ),
        ok=True,
    )

@api.post("/auth/logout")
def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}

@api.get("/auth/me")
def me(user_id: str = Depends(require_user_id)):
    return {"user_id": user_id}

# ---------- Integrations (RLS-friendly) ----------
@api.get("/integrations")
def list_integrations(request: Request, user_id: str = Depends(require_user_id)):
    token = get_cookie_token(request)
    sb = get_supabase_user(token)

    res = sb.table("integrations").select("provider,status").execute()
    rows = getattr(res, "data", None) or (res.get("data", []) if isinstance(res, dict) else [])
    existing = {r["provider"]: r.get("status", "connected") for r in rows}

    apps = []
    for p in ["alpaca", "polygon", "tradingview"]:
        apps.append({"provider": p, "status": existing.get(p, "not_connected")})

    return {"user_id": user_id, "apps": apps}

@api.post("/integrations/alpaca/keys")
def save_alpaca_keys(payload: AlpacaKeys, request: Request, user_id: str = Depends(require_user_id)):
    token = get_cookie_token(request)
    sb = get_supabase_user(token)

    mode = (payload.mode or "paper").strip().lower()
    if mode not in ("paper", "live"):
        raise HTTPException(status_code=400, detail="mode must be 'paper' or 'live'")

    sb.table("integrations").upsert(
        {
            "user_id": user_id,
            "provider": "alpaca",
            "status": "connected",
            "config": {
                "mode": mode,
                "api_key": payload.api_key.strip(),
                "api_secret": payload.api_secret.strip(),
            },
        },
        on_conflict="user_id,provider",
    ).execute()

    return {"ok": True}

@api.post("/integrations/polygon/keys")
def save_polygon_keys(payload: PolygonKeys, request: Request, user_id: str = Depends(require_user_id)):
    token = get_cookie_token(request)
    sb = get_supabase_user(token)

    sb.table("integrations").upsert(
        {
            "user_id": user_id,
            "provider": "polygon",
            "status": "connected",
            "config": {"api_key": payload.api_key.strip()},
        },
        on_conflict="user_id,provider",
    ).execute()

    return {"ok": True}

@api.delete("/integrations/{provider}")
def disconnect_provider(provider: str, request: Request, user_id: str = Depends(require_user_id)):
    token = get_cookie_token(request)
    sb = get_supabase_user(token)

    provider = _normalize_provider(provider)
    if provider not in ("alpaca", "polygon", "tradingview"):
        raise HTTPException(status_code=400, detail="Unknown provider")

    sb.table("integrations").delete().eq("provider", provider).execute()
    return {"ok": True, "provider": provider}

# ---------- Market latest ----------
ALPACA_DATA_BASE = "https://data.alpaca.markets"

def _get_alpaca_keys_from_db(request: Request) -> Dict[str, str]:
    token = get_cookie_token(request)
    sb = get_supabase_user(token)

    res = (
        sb.table("integrations")
        .select("config,status")
        .eq("provider", "alpaca")
        .limit(1)
        .execute()
    )
    rows = getattr(res, "data", None) or (res.get("data", []) if isinstance(res, dict) else [])
    if not rows:
        raise HTTPException(status_code=400, detail="Alpaca not connected. Add keys in Connected Apps.")

    cfg = rows[0].get("config") or {}
    api_key = (cfg.get("api_key") or "").strip()
    api_secret = (cfg.get("api_secret") or "").strip()
    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Alpaca keys missing. Reconnect Alpaca integration.")

    return {"api_key": api_key, "api_secret": api_secret}

def _iso_to_ms(ts: str | None) -> int:
    if not ts:
        return int(datetime.now(timezone.utc).timestamp() * 1000)
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception:
        return int(datetime.now(timezone.utc).timestamp() * 1000)

def _normalize_stock_trade(symbol: str, raw: Dict[str, Any]) -> Dict[str, Any] | None:
    trade = raw.get("trade") if isinstance(raw, dict) else None
    if not trade:
        return None
    price = trade.get("p")
    if price is None:
        return None
    return {
        "source": "alpaca",
        "symbol": symbol,
        "ts": _iso_to_ms(trade.get("t")),
        "price": float(price),
        "size": float(trade.get("s") or 0),
        "kind": "trade",
    }

def _normalize_crypto_trade(symbol: str, raw: Dict[str, Any]) -> Dict[str, Any] | None:
    trade = raw.get("trade") if isinstance(raw, dict) else None
    if not trade:
        return None
    price = trade.get("p")
    if price is None:
        return None
    return {
        "source": "alpaca",
        "symbol": symbol,
        "ts": _iso_to_ms(trade.get("t")),
        "price": float(price),
        "size": float(trade.get("s") or 0),
        "kind": "trade",
    }

@api.get("/market/latest/stocks")
def latest_stocks(symbols: str, request: Request, user_id: str = Depends(require_user_id)):
    keys = _get_alpaca_keys_from_db(request)
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(status_code=400, detail="symbols is required")

    url = f"{ALPACA_DATA_BASE}/v2/stocks/trades/latest"
    headers = {
        "APCA-API-KEY-ID": keys["api_key"],
        "APCA-API-SECRET-KEY": keys["api_secret"],
    }
    params = {"symbols": ",".join(sym_list)}

    r = requests.get(url, headers=headers, params=params, timeout=10)
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    data = r.json()
    trades = (data or {}).get("trades") or {}

    ticks: List[Dict[str, Any]] = []
    for s in sym_list:
        t = _normalize_stock_trade(s, trades.get(s) or {})
        if t:
            ticks.append(t)

    return {"ticks": ticks, "symbols": sym_list}

@api.get("/market/latest/crypto")
def latest_crypto(symbols: str, request: Request, loc: str = "us", user_id: str = Depends(require_user_id)):
    keys = _get_alpaca_keys_from_db(request)
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(status_code=400, detail="symbols is required")

    loc = (loc or "us").strip().lower()
    url = f"{ALPACA_DATA_BASE}/v1beta3/crypto/{loc}/latest/trades"
    headers = {
        "APCA-API-KEY-ID": keys["api_key"],
        "APCA-API-SECRET-KEY": keys["api_secret"],
    }
    params = {"symbols": ",".join(sym_list)}

    r = requests.get(url, headers=headers, params=params, timeout=10)
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    data = r.json()
    trades = (data or {}).get("trades") or {}

    ticks: List[Dict[str, Any]] = []
    for s in sym_list:
        t = _normalize_crypto_trade(s, trades.get(s) or {})
        if t:
            ticks.append(t)

    return {"ticks": ticks, "symbols": sym_list, "loc": loc}

# IMPORTANT: mount the /api router
app.include_router(api)
