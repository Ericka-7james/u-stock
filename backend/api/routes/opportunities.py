# backend/api/routes/opportunities.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])

# best-effort in-memory cache (per process)
_CACHE: Dict[str, Dict[str, Any]] = {}

_CACHE_VERSION = "v2-opportunities-runner-secret-cachebust"

# Optional: lock down runner endpoint with a shared secret.
# If unset/blank => endpoint remains public (local dev friendly).
BOT_RUNNER_SECRET = (os.getenv("BOT_RUNNER_SECRET") or "").strip()


def _cache_get(key: str):
    e = _CACHE.get(key)
    if not e:
        return None
    if time.time() > e["expires_at"]:
        _CACHE.pop(key, None)
        return None
    return e["value"]


def _cache_set(key: str, value: Any, ttl: int):
    _CACHE[key] = {"value": value, "expires_at": time.time() + ttl}


def _now_epoch() -> int:
    return int(time.time())


def _require_runner_secret(request: Request) -> None:
    """
    If BOT_RUNNER_SECRET is configured, require it via either:
      - header:  x-bot-runner-secret: <secret>
      - query:   bot_runner_secret=<secret>

    If BOT_RUNNER_SECRET is empty => no auth required.
    """
    if not BOT_RUNNER_SECRET:
        return

    header = (request.headers.get("x-bot-runner-secret") or "").strip()
    query = (request.query_params.get("bot_runner_secret") or "").strip()
    provided = header or query

    if not provided or provided != BOT_RUNNER_SECRET:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "BOT_RUNNER_UNAUTHORIZED",
                "message": "Missing/invalid bot runner secret.",
            },
        )


# ---------------------------------------------------------
# Runner-friendly endpoint (optionally protected)
# Runner calls: GET http://127.0.0.1:8000/api/opportunities
# ---------------------------------------------------------
@router.get("")
@router.get("/")
def opportunities_for_runner(
    request: Request,
    limit: int = Query(12, ge=1, le=50),
    cache_ttl: int = Query(30, ge=10, le=300),
    cache_bust: int = Query(0, ge=0, le=1),
):
    """
    Runner expects:
      { ok: true, symbols: ["SPY","QQQ",...], generatedAt: epochSeconds }

    Public for local dev unless BOT_RUNNER_SECRET is set.
    """
    _require_runner_secret(request)

    cache_key = f"{_CACHE_VERSION}:runner:{limit}:{cache_ttl}"
    if not cache_bust:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    universe = [
        "SPY",
        "QQQ",
        "IWM",
        "AAPL",
        "MSFT",
        "NVDA",
        "AMZN",
        "TSLA",
        "META",
        "AMD",
        "GOOGL",
        "NFLX",
    ]

    out = {"ok": True, "symbols": universe[:limit], "generatedAt": _now_epoch()}
    _cache_set(cache_key, out, ttl=cache_ttl)
    return out


# ---------------------------------------------------------
# Opportunities for the *current running bot*
# (internal profitability ranking)
# ---------------------------------------------------------
@router.get("/bot/top")
def top_bot_opportunities(
    limit: int = Query(8, ge=1, le=50),
):
    """
    Internal opportunities:
    - later: computed from bot performance + strategy fit
    - now: placeholder so UI has a stable route + friendly message

    Returns:
    {
      ok: true,
      requiresBotRunning: true,
      message: "...",
      items: []
    }
    """
    return {
        "ok": True,
        "source": "bot_profitability",
        "requiresBotRunning": True,
        "message": "No bot is running yet. Start a bot to generate opportunities.",
        "items": [],
        "asOf": _now_epoch(),
        "limit": limit,
    }
