# backend/api/routes/bots.py
from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

from api.db import get_supabase_service
from api.deps import require_user

router = APIRouter(prefix="/api/bots", tags=["bots"])

BOT_ID_RE = re.compile(r"^[a-zA-Z0-9_]{1,64}$")
HEARTBEAT_STALE_SECONDS = int(os.getenv("USTOCK_BOT_HEARTBEAT_STALE_SECONDS", "25"))

INTENTS = {"running", "paused"}
EFFECTIVE_STATES = {
    "starting",
    "running",
    "waiting_for_market",
    "paused",
    "stopped",
    "degraded",
    "error",
    "offline",
}

BOT_RUNNER_SECRET = (os.getenv("BOT_RUNNER_SECRET") or "").strip()


# -----------------------------
# Small helpers
# -----------------------------
def _now_epoch() -> int:
    return int(time.time())


def _clean_bot_id(bot_id: Any) -> str:
    bid = str(bot_id or "").strip()
    if not bid:
        return ""
    if not BOT_ID_RE.match(bid):
        return ""
    return bid


def _normalize_mode(x: Any) -> str:
    m = str(x or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _normalize_intent(x: Any, default: str = "paused") -> str:
    v = str(x or "").strip().lower()
    return v if v in INTENTS else default


def _normalize_effective_state(x: Any, default: str = "stopped") -> str:
    v = str(x or "").strip().lower()
    return v if v in EFFECTIVE_STATES else default


def _parse_ts_to_epoch_seconds(ts_val: Any) -> int:
    """
    Supabase returns timestamptz as ISO strings.
    Convert to epoch seconds.
    """
    if not ts_val:
        return 0
    if isinstance(ts_val, (int, float)):
        return int(ts_val)
    s = str(ts_val).strip()
    if not s:
        return 0
    # handle Z
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return 0


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_config() -> Dict[str, Any]:
    return {
        "mode": "paper",
        "risk_per_trade": 0.005,
        "max_trades_per_day": 3,
        "min_confidence": 0.62,
    }


def _require_runner(
    *,
    x_bot_runner_secret: Optional[str],
    x_runner_user_id: Optional[str],
) -> str:
    """
    Runner auth: requires BOT_RUNNER_SECRET set on backend AND provided in header.
    Runner must also provide user_id (uuid) via header.
    """
    if not BOT_RUNNER_SECRET:
        raise HTTPException(status_code=500, detail="Server not configured for runner auth (BOT_RUNNER_SECRET missing)")

    got = (x_bot_runner_secret or "").strip()
    if not got or got != BOT_RUNNER_SECRET:
        raise HTTPException(status_code=401, detail="Runner not authenticated")

    uid = (x_runner_user_id or "").strip()
    if not uid:
        raise HTTPException(status_code=400, detail="Runner user_id missing (X-Runner-User-Id)")
    return uid


def _compute_offline(desired_state: str, last_heartbeat_epoch: int) -> Tuple[bool, Optional[int]]:
    now = _now_epoch()
    if desired_state != "running":
        return False, None
    if not last_heartbeat_epoch:
        # desired running but never heartbeated
        return True, None
    age = now - int(last_heartbeat_epoch)
    return age > HEARTBEAT_STALE_SECONDS, age


# -----------------------------
# Supabase accessors
# -----------------------------
def _sb():
    return get_supabase_service()


def _get_desired_state(user_id: str, bot_id: str) -> str:
    sb = _sb()
    res = (
        sb.table("bot_desired_state")
        .select("desired_state")
        .eq("user_id", user_id)
        .eq("bot_id", bot_id)
        .maybe_single()
        .execute()
    )
    row = getattr(res, "data", None) or {}
    desired = str(row.get("desired_state") or "paused").lower()
    return desired if desired in ("running", "paused") else "paused"


def _set_desired_state(user_id: str, bot_id: str, desired_state: str) -> None:
    sb = _sb()
    sb.table("bot_desired_state").upsert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "desired_state": desired_state,
            "updated_at": _iso_now(),
        },
        on_conflict="user_id,bot_id",
    ).execute()


def _get_runtime_state(user_id: str, bot_id: str) -> Dict[str, Any]:
    sb = _sb()
    res = (
        sb.table("bot_runtime_state")
        .select("*")
        .eq("user_id", user_id)
        .eq("bot_id", bot_id)
        .maybe_single()
        .execute()
    )
    return getattr(res, "data", None) or {}


def _upsert_runtime_state(user_id: str, bot_id: str, patch: Dict[str, Any]) -> None:
    sb = _sb()
    row = {"user_id": user_id, "bot_id": bot_id, **patch, "updated_at": _iso_now()}
    sb.table("bot_runtime_state").upsert(row, on_conflict="user_id,bot_id").execute()


def _insert_log(user_id: str, bot_id: str, level: str, message: str, meta: Optional[Dict[str, Any]] = None) -> None:
    sb = _sb()
    sb.table("bot_logs").insert(
        {
            "user_id": user_id,
            "bot_id": bot_id,
            "ts": _iso_now(),
            "level": str(level or "info").lower(),
            "message": str(message or ""),
            "meta": meta or {},
        }
    ).execute()


def _get_config(user_id: str, bot_id: str) -> Dict[str, Any]:
    sb = _sb()
    # Assumption: bot_configs has columns: user_id, bot_id, config (jsonb), updated_at (+ maybe id)
    res = (
        sb.table("bot_configs")
        .select("config")
        .eq("user_id", user_id)
        .eq("bot_id", bot_id)
        .maybe_single()
        .execute()
    )
    row = getattr(res, "data", None) or {}
    cfg = row.get("config")
    return cfg if isinstance(cfg, dict) else _default_config()


def _set_config(user_id: str, bot_id: str, cfg: Dict[str, Any]) -> None:
    sb = _sb()
    sb.table("bot_configs").upsert(
        {"user_id": user_id, "bot_id": bot_id, "config": cfg, "updated_at": _iso_now()},
        on_conflict="user_id,bot_id",
    ).execute()


# -----------------------------
# API
# -----------------------------
@router.get("/available")
def available():
    return {
        "bots": [
            {"id": "ema_trend", "name": "EMA Trend Bot", "description": "EMA reclaim + ATR gate + chop filter"},
        ]
    }


@router.get("/status")
def status(request: Request, response: Response, bot_id: str = Query(...)):
    u = require_user(request, response)
    user_id = u["id"]

    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    desired = _get_desired_state(user_id, bid)
    runtime = _get_runtime_state(user_id, bid)
    cfg = _get_config(user_id, bid)

    last_hb_epoch = _parse_ts_to_epoch_seconds(runtime.get("last_heartbeat"))
    offline, age = _compute_offline(desired, last_hb_epoch)

    effective = _normalize_effective_state(runtime.get("runtime_state") or "stopped", default="stopped")
    if offline:
        effective = "offline"

    # Keep your UI shape compatible
    return {
        "bot_id": bid,
        "intent": "running" if desired == "running" else "paused",
        "effective_state": effective,
        "reason_code": None,
        "message": None,
        "heartbeatAt": last_hb_epoch,
        "heartbeatAgeSec": age,
        "lastRun": _parse_ts_to_epoch_seconds(runtime.get("last_started_at")),
        "lastTick": last_hb_epoch,
        "mode": str((cfg.get("mode") if isinstance(cfg, dict) else None) or "paper"),
        "nextOpenEpoch": None,
        "pausedReason": None if desired == "running" else "manual_pause",
        "lastError": runtime.get("last_error_message"),
        "lastIntents": 0,
        "config": cfg if isinstance(cfg, dict) else _default_config(),
    }


@router.get("/log")
def log(request: Request, response: Response, bot_id: str = Query(...), limit: int = Query(50, ge=1, le=300)):
    u = require_user(request, response)
    user_id = u["id"]

    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    sb = _sb()
    res = (
        sb.table("bot_logs")
        .select("ts,level,message,meta")
        .eq("user_id", user_id)
        .eq("bot_id", bid)
        .order("ts", desc=True)
        .limit(int(limit))
        .execute()
    )
    rows = getattr(res, "data", None) or []
    items: List[Dict[str, Any]] = []
    for r in rows:
        items.append(
            {
                "ts": _parse_ts_to_epoch_seconds(r.get("ts")),
                "level": r.get("level"),
                "message": r.get("message"),
                "meta": r.get("meta") or {},
            }
        )
    # your old file-based log endpoint returned newest-last; keep UI stable by reversing
    items = list(reversed(items))
    return {"bot_id": bid, "items": items}


@router.post("/start")
def start(request: Request, response: Response, payload: Dict[str, Any]):
    u = require_user(request, response)
    user_id = u["id"]

    bid = _clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    mode = _normalize_mode(payload.get("mode"))
    cfg = _get_config(user_id, bid)
    if not isinstance(cfg, dict):
        cfg = _default_config()
    cfg["mode"] = mode
    _set_config(user_id, bid, cfg)
    _set_desired_state(user_id, bid, "running")
    _insert_log(user_id, bid, "info", "Intent set: running", {"mode": mode})

    # Optionally reflect “starting” immediately in runtime_state for UX
    _upsert_runtime_state(
        user_id,
        bid,
        {
            "runtime_state": "starting",
            "last_started_at": _iso_now(),
            "last_error_type": None,
            "last_error_message": None,
        },
    )

    return {"ok": True, "bot_id": bid, "intent": "running", "effective_state": "starting", "mode": mode}


@router.post("/stop")
def stop(
    request: Request,
    response: Response,
    payload: Optional[Dict[str, Any]] = None,
    bot_id: Optional[str] = Query(None),
):
    u = require_user(request, response)
    user_id = u["id"]

    raw = bot_id or (payload or {}).get("bot_id")
    bid = _clean_bot_id(raw)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    _set_desired_state(user_id, bid, "paused")
    _insert_log(user_id, bid, "info", "Intent set: paused", {"paused_reason": "manual_pause"})

    _upsert_runtime_state(
        user_id,
        bid,
        {
            "runtime_state": "paused",
            "last_stopped_at": _iso_now(),
            "last_error_type": None,
            "last_error_message": None,
        },
    )

    return {"ok": True, "bot_id": bid, "intent": "paused", "effective_state": "paused"}


@router.post("/heartbeat")
def heartbeat(
    payload: Dict[str, Any],
    x_bot_runner_secret: Optional[str] = Header(default=None, convert_underscores=False, alias="X-Bot-Runner-Secret"),
    x_runner_user_id: Optional[str] = Header(default=None, convert_underscores=False, alias="X-Runner-User-Id"),
):
    # Runner auth + user binding
    user_id = _require_runner(x_bot_runner_secret=x_bot_runner_secret, x_runner_user_id=x_runner_user_id)

    bid = _clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    intent_in = _normalize_intent(payload.get("intent"), default="running")
    eff_in = _normalize_effective_state(payload.get("effective_state"), default="running")
    mode = _normalize_mode(payload.get("mode"))

    reason_code = payload.get("reason_code")
    reason_code = str(reason_code).strip() if reason_code else None

    message = payload.get("message")
    message = str(message).strip() if message else None

    last_error = payload.get("last_error")
    last_error = str(last_error).strip() if last_error else None

    prev = _get_runtime_state(user_id, bid)
    prev_state = str(prev.get("runtime_state") or "").strip().lower() or None
    prev_err = str(prev.get("last_error_message") or "").strip() or None

    # Update runtime row (authoritative for “online/offline”)
    patch: Dict[str, Any] = {
        "runtime_state": eff_in,
        "last_heartbeat": _iso_now(),
        "runner_id": payload.get("runner_id") or prev.get("runner_id"),
        "last_error_type": ("runner_exception" if last_error else None),
        "last_error_message": (last_error if last_error else None),
    }

    # stamp started/stopped times if relevant
    if eff_in in ("starting", "running", "waiting_for_market"):
        patch["last_started_at"] = prev.get("last_started_at") or _iso_now()
    if eff_in in ("paused", "stopped"):
        patch["last_stopped_at"] = _iso_now()

    _upsert_runtime_state(user_id, bid, patch)

    # Log only “interesting”
    if last_error and last_error != prev_err:
        _insert_log(user_id, bid, "error", "Runner error", {"error": last_error, "reason_code": reason_code})
    elif prev_state and prev_state != eff_in:
        _insert_log(
            user_id,
            bid,
            "info",
            "State changed",
            {"from": prev_state, "to": eff_in, "intent": intent_in, "mode": mode, "reason_code": reason_code, "message": message},
        )

    return {"ok": True, "bot_id": bid, "intent": intent_in, "effective_state": eff_in, "ts": _now_epoch()}


@router.get("/config")
def get_config(request: Request, response: Response, bot_id: str = Query(...)):
    u = require_user(request, response)
    user_id = u["id"]

    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    cfg = _get_config(user_id, bid)
    return {"bot_id": bid, "config": cfg if isinstance(cfg, dict) else _default_config()}


@router.post("/config")
def set_config(request: Request, response: Response, payload: Dict[str, Any]):
    u = require_user(request, response)
    user_id = u["id"]

    bid = _clean_bot_id(payload.get("bot_id"))
    config = payload.get("config")

    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})
    if not isinstance(config, dict):
        return JSONResponse(status_code=400, content={"detail": "config must be an object"})

    existing = _get_config(user_id, bid)
    merged = dict(existing if isinstance(existing, dict) else _default_config())
    merged.update(config)

    merged["mode"] = _normalize_mode(merged.get("mode"))
    # keep these sane (same behavior you had)
    try:
        merged["risk_per_trade"] = float(merged.get("risk_per_trade", 0.005))
    except Exception:
        merged["risk_per_trade"] = 0.005
    try:
        merged["max_trades_per_day"] = max(1, int(merged.get("max_trades_per_day", 3)))
    except Exception:
        merged["max_trades_per_day"] = 3
    try:
        mc = float(merged.get("min_confidence", 0.62))
        merged["min_confidence"] = float(min(0.99, max(0.0, mc)))
    except Exception:
        merged["min_confidence"] = 0.62

    _set_config(user_id, bid, merged)
    _insert_log(user_id, bid, "info", "Config updated", {"config": merged})

    return {"ok": True, "bot_id": bid, "config": merged}

@router.get("/status_runner")
def status_runner(
    bot_id: str = Query(...),
    x_bot_runner_secret: Optional[str] = Header(default=None, convert_underscores=False, alias="X-Bot-Runner-Secret"),
    x_runner_user_id: Optional[str] = Header(default=None, convert_underscores=False, alias="X-Runner-User-Id"),
):
    # Runner auth + user binding
    user_id = _require_runner(x_bot_runner_secret=x_bot_runner_secret, x_runner_user_id=x_runner_user_id)

    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    desired = _get_desired_state(user_id, bid)
    runtime = _get_runtime_state(user_id, bid)
    cfg = _get_config(user_id, bid)

    last_hb_epoch = _parse_ts_to_epoch_seconds(runtime.get("last_heartbeat"))
    offline, age = _compute_offline(desired, last_hb_epoch)

    effective = _normalize_effective_state(runtime.get("runtime_state") or "stopped", default="stopped")
    if offline:
        effective = "offline"

    return {
        "bot_id": bid,
        "intent": "running" if desired == "running" else "paused",
        "effective_state": effective,
        "reason_code": None,
        "message": None,
        "heartbeatAt": last_hb_epoch,
        "heartbeatAgeSec": age,
        "lastRun": _parse_ts_to_epoch_seconds(runtime.get("last_started_at")),
        "lastTick": last_hb_epoch,
        "mode": str((cfg.get("mode") if isinstance(cfg, dict) else None) or "paper"),
        "nextOpenEpoch": None,
        "pausedReason": None if desired == "running" else "manual_pause",
        "lastError": runtime.get("last_error_message"),
        "lastIntents": 0,
        "config": cfg if isinstance(cfg, dict) else _default_config(),
    }