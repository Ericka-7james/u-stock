# u-stock-bots/runner/api_client.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional, Tuple

from bots._shared.ustock_http import UStockAPI


def now_epoch() -> int:
    return int(time.time())


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _as_dict(x: Any) -> Dict[str, Any]:
    return x if isinstance(x, dict) else {}


def _as_list_of_dicts(x: Any) -> List[Dict[str, Any]]:
    if not isinstance(x, list):
        return []
    return [it for it in x if isinstance(it, dict)]


def _is_jwt(s: str) -> bool:
    return str(s or "").count(".") == 2


def _runner_id_for_mint(bot_id: str) -> str:
    return _env("RUNNER_ID") or _env("RUNNER_DEVICE_ID") or str(bot_id or "").strip() or "local-runner"


def _mint_runner_token(api: UStockAPI, *, bot_id: str) -> Tuple[str, int]:
    """
    Calls backend POST /api/runner/token using X-Runner-Secret to mint a JWT.
    Returns (token, expires_in_seconds).
    """
    shared = _env("RUNNER_SHARED_SECRET")
    if not shared:
        raise RuntimeError(
            "RUNNER_SHARED_SECRET missing. Set it in u-stock-bots env to mint a token via /api/runner/token."
        )

    runner_id = _runner_id_for_mint(bot_id)
    res = api.post(
        "/api/runner/token",
        json={"runner_id": runner_id},
        headers={"X-Runner-Secret": shared},
    )
    data = _as_dict(res)
    token = str(data.get("token") or "").strip()
    expires_in = int(data.get("expires_in") or 0)

    if not _is_jwt(token):
        raise RuntimeError("Minted runner token is not a JWT (unexpected response).")

    return token, max(30, expires_in)


class _TokenCache:
    def __init__(self) -> None:
        self.token: str = ""
        self.exp_epoch: int = 0

    def valid(self) -> bool:
        # refresh a bit early
        return bool(self.token) and _is_jwt(self.token) and (now_epoch() + 20) < int(self.exp_epoch or 0)


_CACHE = _TokenCache()


def _dev_token_from_env() -> str:
    """
    DEV fallback tokens (optional):
      - BOT_RUNNER_TOKEN
      - RUNNER_TOKEN
    """
    return (os.getenv("BOT_RUNNER_TOKEN") or os.getenv("RUNNER_TOKEN") or "").strip()


def _auth_headers_for_bot(api: UStockAPI, *, bot_id: str) -> Dict[str, str]:
    """
    Auth priority:
      1) Mint JWT via /api/runner/token (RUNNER_SHARED_SECRET)
      2) DEV env token (BOT_RUNNER_TOKEN / RUNNER_TOKEN)
      3) Empty -> backend will 401
    """
    bid = str(bot_id or "").strip()

    # 1) mint token via shared secret
    if _env("RUNNER_SHARED_SECRET"):
        if not _CACHE.valid():
            tok, ttl = _mint_runner_token(api, bot_id=bid)
            _CACHE.token = tok
            _CACHE.exp_epoch = now_epoch() + ttl
        return {"Authorization": f"Bearer {_CACHE.token}"}

    # 2) dev env token
    tok = _dev_token_from_env()
    if not tok:
        return {}

    if not _is_jwt(tok):
        raise RuntimeError(
            "RUNNER_TOKEN/BOT_RUNNER_TOKEN is not a JWT. "
            "Preferred: set RUNNER_SHARED_SECRET so the runner can mint a valid JWT from /api/runner/token."
        )

    return {"Authorization": f"Bearer {tok}"}


# -------------------------
# API methods (match your runner expectations)
# -------------------------
def get_status(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    data = api.get(
        "/api/bots/status_runner",
        params={"bot_id": str(bot_id or "").strip()},
        headers=_auth_headers_for_bot(api, bot_id=str(bot_id or "").strip()),
    )
    return _as_dict(data)


def submit_intents(api: UStockAPI, bot_id: str, intents: List[Dict[str, Any]]) -> None:
    payload = {
        "bot_id": str(bot_id or "").strip(),
        "ts": now_epoch(),
        "items": _as_list_of_dicts(intents),
    }
    api.post(
        "/api/bots/submit-intents",
        json=payload,
        headers=_auth_headers_for_bot(api, bot_id=str(bot_id or "").strip()),
    )


def market_session(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    try:
        data = api.get(
            "/api/market/us/session",
            headers=_auth_headers_for_bot(api, bot_id=str(bot_id or "").strip()),
        )
        d = _as_dict(data)
        if "ok" not in d:
            d["ok"] = False
        return d
    except Exception:
        return {"ok": False}


def sync_trade_fills(api: UStockAPI, *, bot_id: str, mode: str) -> None:
    api.post(
        "/api/trade_fills/sync_runner",
        json={"bot_id": str(bot_id or "").strip(), "mode": str(mode or "paper").strip().lower()},
        headers=_auth_headers_for_bot(api, bot_id=str(bot_id or "").strip()),
    )


# ✅ KEEP THIS NAME because runner.heartbeat.py expects it
def post_heartbeat(
    api: UStockAPI,
    *,
    bot_id: str,
    intent: str,
    effective_state: str,
    mode: str,
    message: Optional[str] = None,
    reason_code: Optional[str] = None,
    paused_reason: Optional[str] = None,
    next_open_epoch: Optional[int] = None,
    last_error: Optional[str] = None,
    last_tick: Optional[int] = None,
) -> None:
    now = now_epoch()

    def _s(x: Any) -> Optional[str]:
        if x is None:
            return None
        s = str(x).strip()
        return s if s else None

    payload: Dict[str, Any] = {
        "bot_id": _s(bot_id) or "unknown",
        "intent": (_s(intent) or "paused").lower(),
        "effective_state": _s(effective_state) or "unknown",
        "mode": (_s(mode) or "paper").lower(),
        "heartbeat_at": now,
        "last_run": now,
        "last_tick": int(last_tick or now),
        "reason_code": _s(reason_code),
        "message": _s(message),
        "paused_reason": _s(paused_reason),
        "next_open_epoch": int(next_open_epoch) if isinstance(next_open_epoch, (int, float)) else None,
        "last_error": _s(last_error),
    }

    api.post(
        "/api/bots/heartbeat",
        json=payload,
        headers=_auth_headers_for_bot(api, bot_id=str(bot_id or "").strip()),
    )
