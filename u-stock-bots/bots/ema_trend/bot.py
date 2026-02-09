# backend/api/routes/bots.py
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from api.deps import require_user
from api.security.bot_runner_dep import require_bot_runner, require_bot_runner_claims
from api.core.bots.validators import clean_bot_id, normalize_mode, parse_ts_to_epoch_seconds
from api.core.bots.service import BotService
from api.db import get_supabase_service

router = APIRouter(prefix="/api/bots", tags=["bots"])


def get_bot_service() -> BotService:
    return BotService()


# -------------------------
# Cookie-auth (frontend)
# -------------------------
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


@router.post("/arm")
def arm(
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
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.disarm(user_id, bid)


@router.get("/log")
def log(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    mode: str = Query("paper", description="paper | live"),
    limit: int = Query(50, ge=1, le=300),
    start_ts: int = Query(0, ge=0, description="Epoch seconds (inclusive). 0 = no lower bound."),
    end_ts: int = Query(0, ge=0, description="Epoch seconds (inclusive). 0 = no upper bound."),
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    m = normalize_mode(mode)
    return svc.get_log(
        user_id,
        bid,
        mode=m,
        limit=int(limit),
        start_ts=int(start_ts or 0),
        end_ts=int(end_ts or 0),
    )


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
    start_ts: int = Query(0, ge=0, description="Epoch seconds (inclusive). 0 = no lower bound."),
    end_ts: int = Query(0, ge=0, description="Epoch seconds (inclusive). 0 = no upper bound."),
):
    u = require_user(request, response)
    user_id = str(u.get("id") or "").strip()

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    m = normalize_mode(mode)
    svc = get_supabase_service()

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

        next_before = 0
        if items:
            next_before = int(items[-1].get("ts") or 0)

        return {"ok": True, "bot_id": bid, "mode": m, "items": items, "next_before_ts": next_before}

    except Exception as e:
        return {"ok": False, "bot_id": bid, "mode": m, "items": [], "error": f"{type(e).__name__}"}


# -------------------------
# Runner-auth (Bearer runner JWT)
# -------------------------

def _require_uid_claim(claims: Dict[str, Any]) -> str:
    """
    ✅ user_id should NOT be optional.
    We REQUIRE runner tokens to be bound to a user_id via claims['uid'].

    This fixes the underlying 422 by removing user_id from query params entirely.
    Instead, the runner must mint a token that includes 'uid'.
    """
    uid = str((claims or {}).get("uid") or "").strip()
    if not uid:
        raise JSONResponse(
            status_code=401,
            content={
                "detail": "Runner token missing uid claim. Mint runner token with X-Runner-User-Id so uid is embedded."
            },
        )
    return uid


def _enforce_payload_uid(payload: Dict[str, Any], uid: str) -> Dict[str, Any]:
    """
    If payload includes user_id, it MUST match uid.
    If it doesn't include user_id, we inject it (so downstream stays consistent).
    """
    got = str(payload.get("user_id") or "").strip()
    if got and got != uid:
        return {"__error__": "user_id mismatch (payload does not match token uid)"}
    patch = dict(payload)
    patch["user_id"] = uid
    return patch


@router.post("/heartbeat")
def heartbeat(
    payload: Dict[str, Any],
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
):
    bid = clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    uid = str((claims or {}).get("uid") or "").strip()
    if not uid:
        return JSONResponse(
            status_code=401,
            content={"detail": "Runner token missing uid claim. Mint runner token with X-Runner-User-Id."},
        )

    patch = _enforce_payload_uid(payload, uid)
    if patch.get("__error__"):
        return JSONResponse(status_code=401, content={"detail": patch["__error__"]})

    patch["bot_id"] = bid
    patch["runner_id"] = runner_id

    return svc.heartbeat(uid, patch)


@router.get("/status_runner")
def status_runner(
    bot_id: str = Query(...),
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
):
    """
    ✅ FIX UNDERLYING ISSUE:
    - user_id is not a query param anymore (so runner won't trigger 422 by forgetting it)
    - user_id is REQUIRED via JWT claim 'uid'
    """
    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    uid = str((claims or {}).get("uid") or "").strip()
    if not uid:
        return JSONResponse(
            status_code=401,
            content={"detail": "Runner token missing uid claim. Mint runner token with X-Runner-User-Id."},
        )

    # runner_id currently unused, but kept for tracing/back-compat
    return svc.status(uid, bid)


@router.post("/submit-intents")
def submit_intents(
    payload: Dict[str, Any],
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
):
    bid = clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    uid = str((claims or {}).get("uid") or "").strip()
    if not uid:
        return JSONResponse(
            status_code=401,
            content={"detail": "Runner token missing uid claim. Mint runner token with X-Runner-User-Id."},
        )

    patch = _enforce_payload_uid(payload, uid)
    if patch.get("__error__"):
        return JSONResponse(status_code=401, content={"detail": patch["__error__"]})

    ts = patch.get("ts")
    try:
        ts_int = int(ts) if ts is not None else 0
    except Exception:
        ts_int = 0

    items = patch.get("items") or []
    if not isinstance(items, list):
        return JSONResponse(status_code=400, content={"detail": "items must be a list"})

    return svc.submit_intents(uid, bid, ts_int, items)


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
