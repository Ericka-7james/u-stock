# backend/api/security/bot_runner_token.py
from __future__ import annotations

import hashlib
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import jwt
from fastapi import HTTPException

from api.db import get_supabase_service


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _now_epoch() -> int:
    return int(time.time())


def _now_iso() -> str:
    # keep simple (Supabase accepts ISO)
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class BotRunnerConfig:
    jwt_secret: str
    issuer: str
    audience: str
    access_ttl_seconds: int
    refresh_pepper: str
    pair_code_ttl_seconds: int
    refresh_ttl_seconds: int  # optional expiry for refresh tokens (0 = no expiry)


def load_bot_runner_config() -> BotRunnerConfig:
    jwt_secret = _env("BOT_RUNNER_JWT_SECRET")
    if not jwt_secret:
        raise HTTPException(status_code=500, detail="BOT_RUNNER_JWT_SECRET missing")

    pepper = _env("RUNNER_REFRESH_PEPPER")
    if not pepper:
        raise HTTPException(status_code=500, detail="RUNNER_REFRESH_PEPPER missing")

    issuer = _env("BOT_RUNNER_ISSUER", "u-stock")
    audience = _env("BOT_RUNNER_AUDIENCE", "runner")

    try:
        access_ttl = int(_env("BOT_RUNNER_JWT_TTL_SECONDS", "900") or 900)
    except Exception:
        access_ttl = 900

    try:
        pair_ttl = int(_env("RUNNER_PAIR_CODE_TTL_SECONDS", "600") or 600)
    except Exception:
        pair_ttl = 600

    # Refresh token expiry is optional; default 0 = never expires (revocation handles security)
    try:
        refresh_ttl = int(_env("RUNNER_REFRESH_TTL_SECONDS", "0") or 0)
    except Exception:
        refresh_ttl = 0

    return BotRunnerConfig(
        jwt_secret=jwt_secret,
        issuer=issuer,
        audience=audience,
        access_ttl_seconds=max(60, access_ttl),
        refresh_pepper=pepper,
        pair_code_ttl_seconds=max(60, pair_ttl),
        refresh_ttl_seconds=max(0, refresh_ttl),
    )


# ---------------------------------------------------------------------
# Access JWT (runner -> backend)
# ---------------------------------------------------------------------
def mint_access_jwt(*, user_id: str, device_id: str, bot_id: str, cfg: BotRunnerConfig) -> Dict[str, Any]:
    now = _now_epoch()
    exp = now + int(cfg.access_ttl_seconds)

    payload = {
        "sub": str(user_id),
        "did": str(device_id),
        "bot_id": str(bot_id),
        "iat": now,
        "exp": exp,
        "iss": cfg.issuer,
        "aud": cfg.audience,
    }

    token = jwt.encode(payload, cfg.jwt_secret, algorithm="HS256")
    return {"ok": True, "token": token, "expires_in": int(cfg.access_ttl_seconds), "exp": exp}


def verify_bot_runner_token(token: str, cfg: BotRunnerConfig) -> Dict[str, Any]:
    # Raises jwt.InvalidTokenError / ExpiredSignatureError for caller to map
    payload = jwt.decode(
        token,
        cfg.jwt_secret,
        algorithms=["HS256"],
        audience=cfg.audience,
        issuer=cfg.issuer,
        options={"require": ["exp", "iat", "sub"]},
    )
    if not isinstance(payload, dict):
        raise jwt.InvalidTokenError("payload not a dict")
    return payload


# ✅ Back-compat export (your require_bot_runner imports this name)
def verify_bot_runner_access_token(token: str, cfg: BotRunnerConfig) -> Dict[str, Any]:
    return verify_bot_runner_token(token, cfg)


# ---------------------------------------------------------------------
# DEV helper (cookie-auth) — short-lived runner token for local tests
# ---------------------------------------------------------------------
def mint_bot_runner_token(user_id: str, cfg: BotRunnerConfig) -> Dict[str, Any]:
    """
    Back-compat helper: mint a short-lived Bearer token for the currently logged-in user.
    This is NOT the production device auth path, but useful for quick dev testing.
    """
    # device_id is "dev" here; prod uses real device_id
    return mint_access_jwt(user_id=user_id, device_id="dev", bot_id="*", cfg=cfg)


# ---------------------------------------------------------------------
# Production device auth: pairing + refresh token
# ---------------------------------------------------------------------
def _peppered_refresh_hash(refresh_token: str, *, pepper: str) -> str:
    # peppered hash so DB leak doesn't give tokens
    return _sha256_hex(f"{pepper}|{refresh_token}")


def _pair_code_hash(pair_code: str, *, pepper: str) -> str:
    # also pepper the pairing code hash
    return _sha256_hex(f"{pepper}|PAIR|{pair_code}")


def start_pairing(
    *,
    user_id: str,
    device_id: str,
    bot_id: str,
    display_name: Optional[str],
    cfg: BotRunnerConfig,
) -> Dict[str, Any]:
    """
    Cookie-auth endpoint: create/update runner_devices row and set a short-lived pairing code hash.
    Returns the *raw* pairing code once (user will type it on the runner machine).
    """
    did = str(device_id or "").strip()
    if not did:
        raise HTTPException(status_code=400, detail="device_id required")

    bid = str(bot_id or "").strip() or "ema_trend"

    pair_code = secrets.token_urlsafe(9)  # human-typable enough
    pair_hash = _pair_code_hash(pair_code, pepper=cfg.refresh_pepper)

    sb = get_supabase_service()
    # upsert device row (unique device_id)
    row = {
        "user_id": str(user_id),
        "device_id": did,
        "display_name": (str(display_name).strip() if display_name else None),
        "pending_bot_id": bid,
        "pair_code_hash": pair_hash,
        "pair_code_expires_at": _epoch_to_iso(_now_epoch() + int(cfg.pair_code_ttl_seconds)),
        "updated_at": _now_iso(),
        "revoked_at": None,
    }
    sb.table("runner_devices").upsert(row, on_conflict="device_id").execute()

    return {"ok": True, "device_id": did, "bot_id": bid, "pair_code": pair_code, "expires_in": int(cfg.pair_code_ttl_seconds)}


def complete_pairing(*, device_id: str, pair_code: str, cfg: BotRunnerConfig) -> Dict[str, Any]:
    """
    No-cookie endpoint: runner machine posts device_id + pair_code.
    If valid: mint refresh token (returned once) and store ONLY hash in DB.
    """
    did = str(device_id or "").strip()
    code = str(pair_code or "").strip()
    if not did or not code:
        raise HTTPException(status_code=400, detail="device_id and pair_code required")

    sb = get_supabase_service()

    res = sb.table("runner_devices").select("*").eq("device_id", did).maybe_single().execute()
    dev = getattr(res, "data", None) or {}
    if not dev or dev.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Device not found or revoked")

    exp = dev.get("pair_code_expires_at")
    if not exp:
        raise HTTPException(status_code=401, detail="No active pairing code")

    if _iso_to_epoch(exp) < _now_epoch():
        raise HTTPException(status_code=401, detail="Pairing code expired")

    expected_hash = str(dev.get("pair_code_hash") or "")
    if not expected_hash:
        raise HTTPException(status_code=401, detail="No active pairing code")

    got_hash = _pair_code_hash(code, pepper=cfg.refresh_pepper)
    if got_hash != expected_hash:
        raise HTTPException(status_code=401, detail="Invalid pairing code")

    user_id = str(dev.get("user_id") or "").strip()
    pending_bot_id = str(dev.get("pending_bot_id") or "ema_trend").strip()

    # mint refresh token (raw returned once)
    refresh_token = secrets.token_urlsafe(48)
    token_hash = _peppered_refresh_hash(refresh_token, pepper=cfg.refresh_pepper)

    expires_at = None
    if int(cfg.refresh_ttl_seconds) > 0:
        expires_at = _epoch_to_iso(_now_epoch() + int(cfg.refresh_ttl_seconds))

    sb.table("runner_refresh_tokens").insert(
        {
            "user_id": user_id,
            "device_id": did,
            "token_hash": token_hash,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "expires_at": expires_at,
            "revoked_at": None,
        }
    ).execute()

    # clear pairing code so it cannot be reused
    sb.table("runner_devices").update(
        {"pair_code_hash": None, "pair_code_expires_at": None, "updated_at": _now_iso()}
    ).eq("device_id", did).execute()

    return {"ok": True, "device_id": did, "bot_id": pending_bot_id, "refresh_token": refresh_token}


def mint_access_from_refresh(*, refresh_token: str, device_id: str, bot_id: str, cfg: BotRunnerConfig) -> Dict[str, Any]:
    """
    No-cookie endpoint: runner machine exchanges refresh token for short-lived access JWT.
    """
    did = str(device_id or "").strip()
    bid = str(bot_id or "").strip() or "ema_trend"
    rt = str(refresh_token or "").strip()
    if not did or not rt:
        raise HTTPException(status_code=401, detail="Missing runner refresh token")

    sb = get_supabase_service()

    # device must exist and not be revoked
    dres = sb.table("runner_devices").select("user_id,revoked_at").eq("device_id", did).maybe_single().execute()
    dev = getattr(dres, "data", None) or {}
    if not dev or dev.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Device revoked or unknown")

    user_id = str(dev.get("user_id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Device missing user_id")

    token_hash = _peppered_refresh_hash(rt, pepper=cfg.refresh_pepper)

    q = (
        sb.table("runner_refresh_tokens")
        .select("*")
        .eq("device_id", did)
        .eq("token_hash", token_hash)
        .maybe_single()
        .execute()
    )
    row = getattr(q, "data", None) or {}
    if not row or row.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    exp = row.get("expires_at")
    if exp and _iso_to_epoch(exp) < _now_epoch():
        raise HTTPException(status_code=401, detail="Refresh token expired")

    # update last_used + device last_seen
    sb.table("runner_refresh_tokens").update({"last_used_at": _now_iso(), "updated_at": _now_iso()}).eq("id", row["id"]).execute()
    sb.table("runner_devices").update({"last_seen_at": _now_iso(), "updated_at": _now_iso()}).eq("device_id", did).execute()

    return mint_access_jwt(user_id=user_id, device_id=did, bot_id=bid, cfg=cfg)


# ---------------------------------------------------------------------
# Small helpers for timestamptz (avoid bringing more deps)
# ---------------------------------------------------------------------
def _epoch_to_iso(ep: int) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(int(ep), tz=timezone.utc).isoformat()


def _iso_to_epoch(s: str) -> int:
    from datetime import datetime, timezone
    if not s:
        return 0
    txt = str(s).strip()
    if txt.endswith("Z"):
        txt = txt[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(txt)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return 0
