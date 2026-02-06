# backend/api/routes/opportunities.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from api.deps import require_user
from api.security.bot_runner_token import load_bot_runner_config, verify_bot_runner_token
from api.core.integrations.alpaca_creds import get_user_alpaca_creds_by_user_id
from api.core.market.market_leaders_service import market_leaders as market_leaders_service

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])

_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_VERSION = "v8-opportunities-ui+runner-bearer"

BOT_RUNNER_SECRET = (os.getenv("BOT_RUNNER_SECRET") or "").strip()
ENV = (os.getenv("ENV") or "development").strip().lower()

SAFE_FALLBACK_ENABLED = (os.getenv("OPPORTUNITIES_ALLOW_SAFE_FALLBACK", "true").strip().lower() != "false")
SAFE_FALLBACK_SYMBOLS_RAW = (os.getenv("OPPORTUNITIES_SAFE_FALLBACK_SYMBOLS", "SPY,QQQ,AAPL") or "").strip()

_FALLBACK_BY_BOT: Dict[str, List[str]] = {
    "ema_trend": ["SPY", "QQQ", "AAPL"],
    "orb": ["TSLA", "NVDA", "AMD"],
    "mean_revert": ["MSFT", "AMZN", "META"],
}

_FALLBACK_GLOBAL: List[str] = [
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

_MAX_LIMIT = 50


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


def _clamp_int(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(v)))


def _clean_symbol(x: Any) -> str:
    s = str(x or "").strip().upper()
    if not s or len(s) > 16:
        return ""
    for ch in s:
        if not (ch.isalnum() or ch in {".", "-"}):
            return ""
    return s


def _unique_extend(dst: List[str], seen: Set[str], src: List[str]) -> None:
    for raw in src:
        s = _clean_symbol(raw)
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        dst.append(s)


def _parse_csv_symbols(raw: str) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()
    for part in (raw or "").split(","):
        s = _clean_symbol(part)
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _require_runner_secret_if_configured(request: Request) -> None:
    """
    Dev/test fallback auth:
      - if BOT_RUNNER_SECRET is configured, require it
      - if BOT_RUNNER_SECRET is NOT configured, do nothing (allow unauth in dev)
    """
    if not BOT_RUNNER_SECRET:
        return

    header = (request.headers.get("x-bot-runner-secret") or "").strip()
    query = (request.query_params.get("bot_runner_secret") or "").strip()
    provided = header or query

    if not provided or provided != BOT_RUNNER_SECRET:
        raise HTTPException(
            status_code=401,
            detail={"code": "BOT_RUNNER_UNAUTHORIZED", "message": "Missing/invalid bot runner secret."},
        )


def _maybe_runner_user_id_from_bearer(request: Request) -> Optional[str]:
    """
    Extracts runner user id from Authorization: Bearer <token>.
    Uses verify_bot_runner_token directly (NOT FastAPI dependency) for robustness.
    """
    auth = (request.headers.get("authorization") or "").strip()
    if not auth.startswith("Bearer "):
        return None

    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None

    try:
        cfg = load_bot_runner_config()
        payload = verify_bot_runner_token(token, cfg)
        sub = str(payload.get("sub") or "").strip()
        return sub or None
    except Exception:
        return None


def _extract_leader_symbols(payload: Dict[str, Any]) -> List[str]:
    items = (payload or {}).get("items") or []
    out: List[str] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        s = _clean_symbol(it.get("symbol"))
        if s:
            out.append(s)
    return out


def _fetch_market_leaders_for_user(
    *,
    user_id: str,
    direction: str,
    show_more: bool,
    cache_ttl: int,
) -> Dict[str, Any]:
    api_key, api_secret, mode = get_user_alpaca_creds_by_user_id(user_id)
    eff_limit = 15 if show_more else 7

    return market_leaders_service(
        user_id=user_id,
        api_key=api_key,
        api_secret=api_secret,
        mode=mode,
        market="stocks",
        direction=direction,
        limit=eff_limit,
        cache_ttl=int(cache_ttl),
        fetch_multiplier=15,
        cache_bust=0,
    )


# -------------------------------------------------------------------
# ✅ UI endpoint (cookies) — fixes your Dashboard 404
# GET /api/opportunities/bot/top?limit=8
# -------------------------------------------------------------------
@router.get("/bot/top")
def bot_top_for_ui(
    request: Request,
    response: Response,
    limit: int = Query(8, ge=1, le=50),
    bot_id: Optional[str] = Query(None),
):
    """
    Dashboard-friendly endpoint (cookie-auth).
    Your frontend expects:
      { stocks: [...], crypto: [...], funds: [...] }

    For now: returns empty lists (safe) until your ranking logic is wired.
    """
    _ = require_user(request, response)  # ensures cookies auth
    _ = (bot_id or "").strip()

    return {"stocks": [], "crypto": [], "funds": []}


# -------------------------------------------------------------------
# ✅ Runner endpoint (Bearer token preferred)
# GET /api/opportunities?limit=12&bot_id=ema_trend...
# -------------------------------------------------------------------
@router.get("")
@router.get("/")
def opportunities_for_runner(
    request: Request,
    limit: int = Query(12, ge=1, le=_MAX_LIMIT),
    bot_id: Optional[str] = Query(None),
    include_leaders: bool = Query(True),
    leaders_direction: str = Query("up", pattern="^(up|down)$"),
    leaders_show_more: int = Query(0, ge=0, le=1),
    cache_ttl: int = Query(30, ge=10, le=300),
    cache_bust: int = Query(0, ge=0, le=1),
):
    """
    Runner-friendly symbol universe endpoint.

    Auth policy:
      - production: Authorization Bearer token REQUIRED
      - dev/test: Bearer preferred; else if BOT_RUNNER_SECRET configured require it; else allow unauth
    """
    eff_limit = _clamp_int(int(limit), 1, _MAX_LIMIT)
    bid = (bot_id or "").strip() or "unknown"
    show_more = bool(int(leaders_show_more) == 1)

    runner_user_id = _maybe_runner_user_id_from_bearer(request)

    requires_auth = True
    warnings: List[Dict[str, str]] = []

    if ENV == "production":
        if runner_user_id is None:
            raise HTTPException(
                status_code=401,
                detail={"code": "BOT_RUNNER_UNAUTHORIZED", "message": "Authorization Bearer token required."},
            )
    else:
        if runner_user_id is None:
            if BOT_RUNNER_SECRET:
                _require_runner_secret_if_configured(request)
                requires_auth = True
            else:
                requires_auth = False
                warnings.append({"code": "DEV_AUTH_DISABLED", "message": "Dev mode: no runner auth configured."})

    cache_key = (
        f"{_CACHE_VERSION}:{runner_user_id or 'anon'}:{bid}:{eff_limit}:{include_leaders}:"
        f"{leaders_direction}:{int(show_more)}:{cache_ttl}"
    )
    if not cache_bust:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    symbols: List[str] = []
    seen: Set[str] = set()

    leaders_symbols: List[str] = []
    leader_fetch_ok = False
    leaders_payload_meta: Dict[str, Any] = {}

    if include_leaders and runner_user_id:
        try:
            leaders_payload = _fetch_market_leaders_for_user(
                user_id=runner_user_id,
                direction=leaders_direction,
                show_more=show_more,
                cache_ttl=int(cache_ttl),
            )
            leaders_payload_meta = dict((leaders_payload or {}).get("meta") or {})
            leaders_symbols = _extract_leader_symbols(leaders_payload)
            _unique_extend(symbols, seen, leaders_symbols)
            leader_fetch_ok = True
        except HTTPException:
            raise
        except Exception:
            warnings.append({"code": "LEADERS_FETCH_FAILED", "message": "Could not fetch market leaders."})
            leaders_symbols = []
            leader_fetch_ok = False

    bot_fallback = _FALLBACK_BY_BOT.get(bid) or []
    _unique_extend(symbols, seen, bot_fallback)

    if len(symbols) < eff_limit:
        _unique_extend(symbols, seen, _FALLBACK_GLOBAL)

    final_symbols = symbols[:eff_limit]

    safe_used = False
    if (not final_symbols) and SAFE_FALLBACK_ENABLED:
        safe_list = _parse_csv_symbols(SAFE_FALLBACK_SYMBOLS_RAW) or ["SPY", "QQQ"]
        _unique_extend(final_symbols, set(), safe_list)
        final_symbols = final_symbols[:eff_limit]
        safe_used = True
        warnings.append({"code": "SAFE_FALLBACK_USED", "message": "Used safe fallback symbols."})

    out = {
        "ok": True,
        "symbols": final_symbols,
        "generatedAt": _now_epoch(),
        "meta": {
            "env": ENV,
            "requires_auth": requires_auth,
            "bot_id": bid,
            "runner_user_id": runner_user_id,
            "requested_limit": eff_limit,
            "returned": len(final_symbols),
            "leaders": {
                "enabled": bool(include_leaders),
                "direction": leaders_direction,
                "show_more": bool(show_more),
                "count": len(leaders_symbols),
                "fetch_ok": bool(leader_fetch_ok),
            },
            "sources": [
                {"name": "market_leaders", "count": len(leaders_symbols)},
                {"name": "bot_fallback", "count": len(bot_fallback)},
                {"name": "global_fallback", "count": len(_FALLBACK_GLOBAL)},
                {
                    "name": "safe_fallback",
                    "count": len(_parse_csv_symbols(SAFE_FALLBACK_SYMBOLS_RAW)) if safe_used else 0,
                },
            ],
            "leaders_payload_meta": leaders_payload_meta,
            "warnings": warnings,
            "safe_fallback": {"enabled": bool(SAFE_FALLBACK_ENABLED), "used": bool(safe_used)},
        },
    }

    _cache_set(cache_key, out, ttl=int(cache_ttl))
    return out
