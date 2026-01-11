# backend/api/routes/opportunities.py
from __future__ import annotations

import time
from typing import Any, Dict

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])

# best-effort in-memory cache (per process)
_CACHE: Dict[str, Dict[str, Any]] = {}


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


# ---------------------------------------------------------
# Runner-friendly endpoint (NO AUTH)
# Runner calls: GET http://127.0.0.1:8000/api/opportunities
# ---------------------------------------------------------
@router.get("")
@router.get("/")
def opportunities_for_runner(
  limit: int = Query(12, ge=1, le=50),
  cache_ttl: int = Query(30, ge=10, le=300),
):
  """
  Runner expects:
    { ok: true, symbols: ["SPY","QQQ",...], generatedAt: epochSeconds }

  Public for local dev. Later we can lock it down via BOT_RUNNER_SECRET.
  """
  cache_key = f"runner:{limit}:{cache_ttl}"
  cached = _cache_get(cache_key)
  if cached:
    return cached

  universe = [
    "SPY", "QQQ", "IWM",
    "AAPL", "MSFT", "NVDA",
    "AMZN", "TSLA", "META",
    "AMD", "GOOGL", "NFLX",
  ]

  out = {"ok": True, "symbols": universe[:limit], "generatedAt": _now_epoch()}
  _cache_set(cache_key, out, ttl=cache_ttl)
  return out


# ---------------------------------------------------------
# NEW: Opportunities for the *current running bot*
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
