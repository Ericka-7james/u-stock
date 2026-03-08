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


def _runner_user_id() -> str:
    return _env("RUNNER_USER_ID") or _env("USTOCK_USER_ID")


def _normalize_desired_state(x: Any) -> str:
    s = str(x or "").strip().lower()
    if s in {"running"}:
        return "running"
    return "stopped"


def _normalize_effective_state(x: Any) -> str:
    s = str(x or "").strip().lower()
    if not s:
        return "unknown"
    if s == "paused":
        return "stopped"
    return s


def _mint_runner_token(api: UStockAPI, *, bot_id: str) -> Tuple[str, int]:
    """
    Mint a runner JWT via backend /api/runner/token using RUNNER_SHARED_SECRET.
    Returns (token, expires_in_seconds).
    """
    shared = _env("RUNNER_SHARED_SECRET")
    if not shared:
        raise RuntimeError("RUNNER_SHARED_SECRET missing; cannot mint runner token.")

    runner_id = _runner_id_for_mint(bot_id)
    headers = {"X-Runner-Secret": shared}

    uid = _runner_user_id()
    if uid:
        headers["X-Runner-User-Id"] = uid

    res = api.post("/api/runner/token", json={"runner_id": runner_id}, headers=headers)
    data = _as_dict(res)

    token = str(data.get("token") or "").strip()
    expires_in = int(data.get("expires_in") or 0)

    if not _is_jwt(token):
        raise RuntimeError("Minted runner token is not a JWT (unexpected response).")

    return token, max(30, expires_in)


class _TokenCache:
    """
    Cache tokens per runner_id so multiple bots/devices in one process don't collide.
    runner_id -> (token, exp_epoch)
    """

    def __init__(self) -> None:
        self.by_runner_id: Dict[str, Tuple[str, int]] = {}

    def get(self, runner_id: str) -> Tuple[str, int]:
        return self.by_runner_id.get(runner_id, ("", 0))

    def set(self, runner_id: str, token: str, exp_epoch: int) -> None:
        self.by_runner_id[runner_id] = (token, exp_epoch)

    def invalidate(self, runner_id: str) -> None:
        self.by_runner_id.pop(runner_id, None)

    def valid(self, runner_id: str) -> bool:
        tok, exp = self.get(runner_id)
        return bool(tok) and _is_jwt(tok) and (now_epoch() + 20) < int(exp or 0)


_CACHE = _TokenCache()


def _is_unauthorized_401(err: Exception) -> bool:
    """
    Best-effort detection used only to decide whether to re-mint once.
    """
    s = str(err or "")
    s_low = s.lower()
    if "401" in s or "unauthorized" in s_low:
        return True
    if "token" in s_low and "expired" in s_low:
        return True
    return False


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
    shared = _env("RUNNER_SHARED_SECRET")

    if shared:
        runner_id = _runner_id_for_mint(bid)
        if not _CACHE.valid(runner_id):
            tok, ttl = _mint_runner_token(api, bot_id=bid)
            _CACHE.set(runner_id, tok, now_epoch() + ttl)
        tok, _exp = _CACHE.get(runner_id)
        return {"Authorization": f"Bearer {tok}"}

    tok = _dev_token_from_env()
    if not tok:
        return {}

    if not _is_jwt(tok):
        raise RuntimeError(
            "RUNNER_TOKEN/BOT_RUNNER_TOKEN is not a JWT. Prefer RUNNER_SHARED_SECRET to mint a valid token."
        )

    return {"Authorization": f"Bearer {tok}"}


def _get_with_auth_retry(
    api: UStockAPI,
    path: str,
    *,
    bot_id: str,
    params: Optional[Dict[str, Any]] = None,
) -> Any:
    bid = str(bot_id or "").strip()
    shared = _env("RUNNER_SHARED_SECRET")
    runner_id = _runner_id_for_mint(bid) if shared else ""

    try:
        return api.get(path, params=params or {}, headers=_auth_headers_for_bot(api, bot_id=bid))
    except Exception as e:
        if shared and _is_unauthorized_401(e):
            _CACHE.invalidate(runner_id)
            return api.get(path, params=params or {}, headers=_auth_headers_for_bot(api, bot_id=bid))
        raise


def _post_with_auth_retry(
    api: UStockAPI,
    path: str,
    *,
    bot_id: str,
    json: Dict[str, Any],
) -> Any:
    bid = str(bot_id or "").strip()
    shared = _env("RUNNER_SHARED_SECRET")
    runner_id = _runner_id_for_mint(bid) if shared else ""

    try:
        return api.post(path, json=json, headers=_auth_headers_for_bot(api, bot_id=bid))
    except Exception as e:
        if shared and _is_unauthorized_401(e):
            _CACHE.invalidate(runner_id)
            return api.post(path, json=json, headers=_auth_headers_for_bot(api, bot_id=bid))
        raise


def _s(x: Any) -> Optional[str]:
    if x is None:
        return None
    s = str(x).strip()
    return s if s else None


# -------------------------
# API methods
# -------------------------
def heartbeat_tick(
    api: UStockAPI,
    *,
    bot_id: str,
    intent: str,
    effective_state: str,
    mode: str,
    message: Optional[str] = None,
    paused_reason: Optional[str] = None,
    next_open_epoch: Optional[int] = None,
    last_error: Optional[str] = None,
    reason_code: Optional[str] = None,
) -> None:
    uid = (_runner_user_id() or "").strip()
    if not uid:
        return

    post_heartbeat(
        api,
        user_id=uid,
        bot_id=bot_id,
        intent=intent,
        desired_state=_normalize_desired_state(intent),
        effective_state=effective_state,
        mode=mode,
        message=message,
        paused_reason=paused_reason,
        next_open_epoch=next_open_epoch,
        last_error=last_error,
        reason_code=reason_code,
        last_tick=now_epoch(),
    )


def get_status(
    api: UStockAPI,
    bot_id: str,
    *,
    user_id: Optional[str] = None,
    **_ignore: Any,
) -> Dict[str, Any]:
    bid = str(bot_id or "").strip()
    uid = (str(user_id or "").strip() or _runner_user_id() or "").strip()
    if not uid:
        raise RuntimeError("Runner missing user_id for get_status. Set RUNNER_USER_ID (or USTOCK_USER_ID) in env.")

    data = _get_with_auth_retry(
        api,
        "/api/bots/status_runner",
        bot_id=bid,
        params={"bot_id": bid, "user_id": uid},
    )
    return _as_dict(data)


def submit_intents(
    api: UStockAPI,
    bot_id: str,
    intents: List[Dict[str, Any]],
    *,
    user_id: Optional[str] = None,
) -> None:
    bid = str(bot_id or "").strip()
    uid = (str(user_id or "").strip() or _runner_user_id() or "").strip()
    if not uid:
        return

    payload = {
        "user_id": uid,
        "bot_id": bid,
        "ts": now_epoch(),
        "items": _as_list_of_dicts(intents),
    }

    _post_with_auth_retry(api, "/api/bots/submit-intents", bot_id=bid, json=payload)


def market_session(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    """
    Market session: no runner auth assumed. Fail-open.
    """
    try:
        data = api.get("/api/market/us/session", params={}, headers={})
        d = _as_dict(data)
        d.setdefault("ok", False)
        return d
    except Exception:
        return {"ok": False}


def sync_trade_fills(api: UStockAPI, *, bot_id: str, mode: str, user_id: Optional[str] = None) -> None:
    bid = str(bot_id or "").strip()
    uid = (str(user_id or "").strip() or _runner_user_id() or "").strip()

    payload: Dict[str, Any] = {"bot_id": bid, "mode": str(mode or "paper").strip().lower()}
    if uid:
        payload["user_id"] = uid

    _post_with_auth_retry(api, "/api/trade_fills/sync_runner", bot_id=bid, json=payload)


def post_heartbeat(
    api: UStockAPI,
    *,
    user_id: str,
    bot_id: str,
    intent: str,
    effective_state: str,
    mode: str,
    desired_state: Optional[str] = None,
    message: Optional[str] = None,
    reason_code: Optional[str] = None,
    paused_reason: Optional[str] = None,
    next_open_epoch: Optional[int] = None,
    last_error: Optional[str] = None,
    last_tick: Optional[int] = None,
) -> None:
    now = now_epoch()
    uid = str(user_id or "").strip()
    if not uid:
        return

    desired = _normalize_desired_state(desired_state or intent)
    eff = _normalize_effective_state(effective_state)
    mode_norm = (str(mode or "paper").strip().lower() or "paper")

    # IMPORTANT: send "" to clear stale errors in storage.
    last_error_str = str(last_error or "").strip()

    payload: Dict[str, Any] = {
        "user_id": uid,
        "bot_id": _s(bot_id) or "unknown",
        "intent": desired,
        "desired_state": desired,
        "effective_state": eff,
        "mode": mode_norm,
        "heartbeat_at": now,
        "last_run": now,
        "last_tick": int(last_tick or now),
        "reason_code": _s(reason_code),
        "message": _s(message),
        "paused_reason": _s(paused_reason),
        "next_open_epoch": int(next_open_epoch) if isinstance(next_open_epoch, (int, float)) else None,
        "last_error": last_error_str,
    }

    _post_with_auth_retry(api, "/api/bots/heartbeat", bot_id=str(bot_id or "").strip(), json=payload)