# backend/api/routes/bots.py
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from api.deps import require_user
from api.security.bot_runner_dep import require_bot_runner
from api.core.bots.validators import clean_bot_id, normalize_mode, parse_ts_to_epoch_seconds
from api.core.bots.service import BotService
from api.db import get_supabase_service

router = APIRouter(prefix="/api/bots", tags=["bots"])


def get_bot_service() -> BotService:
    # Lazily construct so env is loaded first (and avoids import-time DB calls)
    return BotService()


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
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.status(user_id, bid)


@router.get("/log")
def log(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    limit: int = Query(50, ge=1, le=300),
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.get_log(user_id, bid, limit=int(limit))


@router.post("/start")
def start(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

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
    u = require_user(request, response)
    user_id = u["id"]

    raw = bot_id or (payload or {}).get("bot_id")
    bid = clean_bot_id(raw)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.stop(user_id, bid)


# -------------------------
# NEW: UI read endpoints (cookie auth)
# -------------------------

@router.get("/intents")
def intents_snapshot(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    limit: int = Query(10, ge=1, le=10),
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    st = svc.status(user_id, bid)
    items = (st.get("lastIntentsPreview") or [])
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
):
    """
    UI endpoint: read merged strategy+execution events from Supabase bot_events.
    The runner writes tx events (and risk_gate_block) into bot_events via service-role key.
    We READ with service-role key here server-side (safe).

    Params:
      - bot_id: bot id
      - mode: paper/live
      - limit: max rows
      - before_ts: optional cursor in epoch seconds; fetch events strictly older than this
    """
    u = require_user(request, response)
    user_id = str(u.get("id") or "").strip()

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    m = normalize_mode(mode)
    svc = get_supabase_service()

    # Supabase stores ts as ISO (timestamptz). We'll filter with ISO if before_ts is provided.
    # Convert epoch -> ISO-ish "YYYY-MM-DDTHH:MM:SSZ" via naive UTC conversion:
    def _epoch_to_iso_z(ep: int) -> str:
        import time as _t
        return _t.strftime("%Y-%m-%dT%H:%M:%SZ", _t.gmtime(int(ep)))

    try:
        q = (
            svc.table("bot_events")
            .select("ts,level,event_type,symbol,payload,event_id,bot_id,mode")
            .eq("user_id", user_id)
            .eq("bot_id", bid)
            .eq("mode", m)
            .order("ts", desc=True)
            .limit(int(limit))
        )
        if int(before_ts or 0) > 0:
            q = q.lt("ts", _epoch_to_iso_z(int(before_ts)))

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

        # next cursor = oldest ts in this page (for "load more")
        next_before = 0
        if items:
            next_before = int(items[-1].get("ts") or 0)

        return {"ok": True, "bot_id": bid, "mode": m, "items": items, "next_before_ts": next_before}

    except Exception as e:
        # fail-safe: UI should never crash because events aren't available
        return {"ok": False, "bot_id": bid, "mode": m, "items": [], "error": f"{type(e).__name__}"}


# -------------------------
# Runner-only endpoints (Bearer token)
# -------------------------

@router.post("/heartbeat")
def heartbeat(
    payload: Dict[str, Any],
    runner_user_id: str = Depends(require_bot_runner),
    svc: BotService = Depends(get_bot_service),
):
    """
    Runner-authenticated endpoint (Bearer token).
    """
    bid = clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    payload = dict(payload)
    payload["bot_id"] = bid
    return svc.heartbeat(runner_user_id, payload)


@router.get("/status_runner")
def status_runner(
    bot_id: str = Query(...),
    runner_user_id: str = Depends(require_bot_runner),
    svc: BotService = Depends(get_bot_service),
):
    """
    Runner-authenticated endpoint (Bearer token).
    """
    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.status(runner_user_id, bid)


@router.post("/submit-intents")
def submit_intents(
    payload: Dict[str, Any],
    runner_user_id: str = Depends(require_bot_runner),
    svc: BotService = Depends(get_bot_service),
):
    """
    Runner-authenticated endpoint (Bearer token).
    Used to report strategy intents back to backend for UI visibility.
    """
    bid = clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    ts = payload.get("ts")
    try:
        ts_int = int(ts) if ts is not None else 0
    except Exception:
        ts_int = 0

    items = payload.get("items") or []
    if not isinstance(items, list):
        return JSONResponse(status_code=400, content={"detail": "items must be a list"})

    # Service does sanitization + caps
    return svc.submit_intents(runner_user_id, bid, ts_int, items)


@router.get("/config")
def get_config(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.get_config(user_id, bid)


@router.post("/config")
def set_config(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(payload.get("bot_id"))
    config = payload.get("config")

    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})
    if not isinstance(config, dict):
        return JSONResponse(status_code=400, content={"detail": "config must be an object"})

    return svc.set_config(user_id, bid, config)
