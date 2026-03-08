# backend/api/routes/bots.py
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from api.core.bots.service import BotService
from api.core.bots.validators import clean_bot_id, normalize_mode, parse_ts_to_epoch_seconds
from api.db import get_supabase_service
from api.deps import require_user
from api.security.bot_runner_dep import (
    require_bot_runner,
    require_bot_runner_claims,
)

router = APIRouter(prefix="/api/bots", tags=["bots"])


def get_bot_service() -> BotService:
    return BotService()


def _claims_user_id(claims: Dict[str, Any]) -> str:
    """
    Different minting paths may use different claim keys. Try common ones.
    """
    c = claims or {}
    return str(c.get("uid") or c.get("sub") or c.get("user_id") or "").strip()


def _require_bot_id(raw: Any) -> str:
    bid = clean_bot_id(raw)
    if not bid:
        raise HTTPException(status_code=400, detail="bot_id required")
    return bid


def _require_payload_obj(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be an object")
    return payload


def _require_cookie_user_id(request: Request, response: Response) -> str:
    u = require_user(request, response)
    uid = str(u.get("id") or "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="unauthorized")
    return uid


def _require_uid_from_claims(claims: Dict[str, Any]) -> str:
    uid = _claims_user_id(claims)
    if not uid:
        raise HTTPException(status_code=401, detail="runner token missing uid")
    return uid


def _runner_effective_user_id(*, claims: Dict[str, Any], fallback_user_id: Any = None) -> str:
    """
    Prefer signed runner claims. Allow fallback only if claims path did not carry uid.
    """
    uid = _claims_user_id(claims)
    if uid:
        return uid

    fb = str(fallback_user_id or "").strip()
    if fb:
        return fb

    raise HTTPException(status_code=401, detail="runner token missing uid")


def _epoch_to_iso_z(ep: int) -> str:
    import time as _t

    return _t.strftime("%Y-%m-%dT%H:%M:%SZ", _t.gmtime(int(ep)))


# -----------------------------
# Basic endpoints (cookie-auth)
# -----------------------------
@router.get("")
def list_bots(svc: BotService = Depends(get_bot_service)):
    """
    UI calls GET /api/bots in DashboardPage.
    Return same shape as available() for now.
    """
    return svc.available()


@router.get("/available")
def available(svc: BotService = Depends(get_bot_service)):
    return svc.available()


@router.get("/status")
def status(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    svc: BotService = Depends(get_bot_service),
):
    user_id = _require_cookie_user_id(request, response)
    bid = _require_bot_id(bot_id)
    return svc.status(user_id, bid)


# -----------------------------
# Cookie-auth control endpoints
# -----------------------------
@router.post("/arm")
def arm(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
):
    user_id = _require_cookie_user_id(request, response)
    payload = _require_payload_obj(payload)

    bid = _require_bot_id(payload.get("bot_id"))
    mode = payload.get("mode")
    mode_norm = normalize_mode(mode) if mode else None
    return svc.arm(user_id, bid, mode_norm)


@router.post("/disarm")
def disarm(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
):
    user_id = _require_cookie_user_id(request, response)
    payload = _require_payload_obj(payload)

    bid = _require_bot_id(payload.get("bot_id"))
    return svc.disarm(user_id, bid)


@router.post("/start")
def start(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
):
    user_id = _require_cookie_user_id(request, response)
    payload = _require_payload_obj(payload)

    bid = _require_bot_id(payload.get("bot_id"))
    mode = normalize_mode(payload.get("mode"))
    return svc.start(user_id, bid, mode)


@router.post("/stop")
def stop(
    request: Request,
    response: Response,
    payload: Optional[Dict[str, Any]] = None,
    bot_id: Optional[str] = Query(None),
    svc: BotService = Depends(get_bot_service),
):
    user_id = _require_cookie_user_id(request, response)
    payload = payload if isinstance(payload, dict) else {}

    raw = bot_id or payload.get("bot_id")
    bid = _require_bot_id(raw)
    return svc.stop(user_id, bid)


# -----------------------------
# Cookie-auth logs + snapshots
# -----------------------------
@router.get("/log")
def log(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    mode: str = Query("paper", description="paper|live"),
    limit: int = Query(50, ge=1, le=300),
    start_ts: int = Query(0, ge=0, description="Epoch seconds (inclusive). 0 = no lower bound."),
    end_ts: int = Query(0, ge=0, description="Epoch seconds (inclusive). 0 = no upper bound."),
    svc: BotService = Depends(get_bot_service),
):
    user_id = _require_cookie_user_id(request, response)
    bid = _require_bot_id(bot_id)
    m = normalize_mode(mode)

    return svc.get_log(
        user_id,
        bid,
        mode=m,
        limit=int(limit),
        start_ts=int(start_ts or 0),
        end_ts=int(end_ts or 0),
    )


@router.get("/intents")
def intents_snapshot(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    limit: int = Query(10, ge=1, le=10),
    svc: BotService = Depends(get_bot_service),
):
    user_id = _require_cookie_user_id(request, response)
    bid = _require_bot_id(bot_id)

    st = svc.status(user_id, bid)
    items = st.get("lastIntentsPreview") or []
    if not isinstance(items, list):
        items = []

    return {
        "ok": True,
        "bot_id": bid,
        "count": int(st.get("lastIntents") or 0),
        "ts": int(st.get("lastIntentsAt") or 0),
        "items": items[: int(limit)],
    }


@router.get("/events")
def events_feed(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    mode: str = Query("paper"),
    limit: int = Query(60, ge=1, le=300),
    before_ts: int = Query(0, ge=0),
    start_ts: int = Query(0, ge=0, description="Epoch seconds (inclusive). 0 = no lower bound."),
    end_ts: int = Query(0, ge=0, description="Epoch seconds (inclusive). 0 = no upper bound."),
):
    user_id = _require_cookie_user_id(request, response)
    bid = _require_bot_id(bot_id)

    m = normalize_mode(mode)
    sb = get_supabase_service()

    try:
        q = (
            sb.table("bot_events")
            .select("ts,level,event_type,symbol,payload,event_id,bot_id,mode")
            .eq("user_id", user_id)
            .eq("bot_id", bid)
            .eq("mode", m)
            .order("ts", desc=True)
            .limit(int(limit))
        )

        if int(before_ts or 0) > 0:
            q = q.lt("ts", _epoch_to_iso_z(int(before_ts)))

        if int(end_ts or 0) > 0:
            q = q.lt("ts", _epoch_to_iso_z(int(end_ts) + 1))
        if int(start_ts or 0) > 0:
            q = q.gte("ts", _epoch_to_iso_z(int(start_ts)))

        res = q.execute()
        rows = res.data if hasattr(res, "data") else (res.get("data") if isinstance(res, dict) else None)
        if not isinstance(rows, list):
            rows = []

        items: List[Dict[str, Any]] = []
        for r in rows:
            if not isinstance(r, dict):
                continue
            payload = r.get("payload")
            if not isinstance(payload, dict):
                payload = {"raw": payload}

            items.append(
                {
                    "ts": parse_ts_to_epoch_seconds(r.get("ts")),
                    "level": str(r.get("level") or "info").strip().lower(),
                    "event_type": str(r.get("event_type") or "").strip(),
                    "symbol": (str(r.get("symbol") or "").strip().upper() or None),
                    "event_id": str(r.get("event_id") or "").strip() or None,
                    "payload": payload,
                }
            )

        next_before = int(items[-1]["ts"]) if items else 0
        return {"ok": True, "bot_id": bid, "mode": m, "items": items, "next_before_ts": next_before}

    except Exception as e:
        return {
            "ok": False,
            "bot_id": bid,
            "mode": m,
            "items": [],
            "error": f"{type(e).__name__}: {e}",
        }


# -----------------------------
# Runner-auth endpoints
# -----------------------------
@router.post("/heartbeat")
def heartbeat(
    payload: Dict[str, Any],
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
):
    payload = _require_payload_obj(payload)
    bid = _require_bot_id(payload.get("bot_id"))
    uid = _require_uid_from_claims(claims)

    out = dict(payload)
    out["bot_id"] = bid
    out["runner_id"] = runner_id
    out["user_id"] = uid  # server-sourced, not trusted from client
    return svc.heartbeat(uid, out)


@router.get("/status_runner")
def status_runner(
    bot_id: str = Query(...),
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
):
    bid = _require_bot_id(bot_id)
    uid = _require_uid_from_claims(claims)

    out = svc.status(uid, bid)
    if isinstance(out, dict):
        out.setdefault("runner_id", runner_id)
        out.setdefault("user_id", uid)
        out.setdefault("bot_id", bid)
    return out


@router.post("/submit-intents")
def submit_intents(
    payload: Dict[str, Any],
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
):
    payload = _require_payload_obj(payload)
    bid = _require_bot_id(payload.get("bot_id"))
    uid = _runner_effective_user_id(claims=claims, fallback_user_id=payload.get("user_id"))

    ts = payload.get("ts")
    try:
        ts_int = int(ts) if ts is not None else 0
    except Exception:
        ts_int = 0

    items = payload.get("items") or []
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be a list")

    # expose runner_id to service only if it wants to log later via payload/event tables
    return svc.submit_intents(uid, bid, ts_int, items)


# -----------------------------
# Config endpoints (cookie-auth)
# -----------------------------
@router.get("/config")
def get_config(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    svc: BotService = Depends(get_bot_service),
):
    user_id = _require_cookie_user_id(request, response)
    bid = _require_bot_id(bot_id)
    return svc.get_config(user_id, bid)


@router.post("/config")
def set_config(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
):
    user_id = _require_cookie_user_id(request, response)
    payload = _require_payload_obj(payload)

    bid = _require_bot_id(payload.get("bot_id"))
    config = payload.get("config")
    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="config must be an object")

    return svc.set_config(user_id, bid, config)