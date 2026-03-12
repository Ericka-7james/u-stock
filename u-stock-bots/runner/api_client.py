# u-stock-bots/runner/api_client.py
from __future__ import annotations

"""Runner-side API client helpers for U-Stock bot operations."""

import os
import time
from typing import Any, Dict, List, Optional, Tuple

from bots._shared.ustock_http import UStockAPI


def now_epoch() -> int:
    """Returns the current epoch time in seconds."""
    return int(time.time())


def _env(name: str, default: str = "") -> str:
    """Returns a stripped environment variable value."""
    return str(os.getenv(name, default) or "").strip()


def _as_dict(value: Any) -> Dict[str, Any]:
    """Returns the input as a dict when possible."""
    return value if isinstance(value, dict) else {}


def _as_list_of_dicts(value: Any) -> List[Dict[str, Any]]:
    """Returns a filtered list of dict items."""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _is_jwt(value: str) -> bool:
    """Returns whether a string looks like a JWT."""
    return str(value or "").count(".") == 2


def _runner_id_for_mint(bot_id: str) -> str:
    """Resolves the runner id used for token minting."""
    return (
        _env("RUNNER_ID")
        or _env("RUNNER_DEVICE_ID")
        or str(bot_id or "").strip()
        or "local-runner"
    )


def _runner_shared_secret() -> str:
    """Returns the configured runner shared secret."""
    return _env("RUNNER_SHARED_SECRET") or _env("BOT_RUNNER_SECRET")


def _runner_user_id() -> str:
    """Returns the configured runner-bound user id."""
    return _env("RUNNER_USER_ID") or _env("USTOCK_USER_ID")


def _runner_id() -> str:
    """Returns the configured runner id when available."""
    return _env("RUNNER_ID") or _env("RUNNER_DEVICE_ID")


def _require_runner_user_id(operation: str) -> str:
    """Returns the configured runner-bound user id or raises."""
    uid = _runner_user_id()
    if not uid:
        raise RuntimeError(
            f"Runner missing user_id for {operation}. "
            "Set RUNNER_USER_ID (or USTOCK_USER_ID) in env."
        )
    return uid


def _normalize_runtime_state(value: Any) -> str:
    """Normalizes runtime state values to the backend canonical set."""
    state = str(value or "").strip().lower()

    if state in {"running", "active", "live"}:
        return "running"
    if state in {"starting", "booting", "initializing"}:
        return "starting"
    if state in {"stopping", "shutting_down", "shutting-down"}:
        return "stopping"
    if state in {"errored", "error", "failed", "fatal"}:
        return "errored"
    if state in {"offline", "stopped", "idle", "dead", ""}:
        return "offline"

    return "offline"


def _mint_runner_token(api: UStockAPI, *, bot_id: str) -> Tuple[str, int]:
    """Mints a short-lived runner JWT through the backend."""
    shared = _runner_shared_secret()
    if not shared:
        raise RuntimeError("RUNNER_SHARED_SECRET missing; cannot mint runner token.")

    uid = _require_runner_user_id("token mint")
    runner_id = _runner_id_for_mint(bot_id)

    headers = {
        "X-Runner-Secret": shared,
        "X-Runner-User-Id": uid,
    }

    response = api.post("/api/runner/token", json={"runner_id": runner_id}, headers=headers)
    data = _as_dict(response)

    token = str(data.get("token") or "").strip()
    expires_in = int(data.get("expires_in") or 0)

    if not _is_jwt(token):
        raise RuntimeError("Minted runner token is not a JWT (unexpected response).")

    return token, max(30, expires_in)


class _TokenCache:
    """Caches runner JWTs per runner id."""

    def __init__(self) -> None:
        self.by_runner_id: Dict[str, Tuple[str, int]] = {}

    def get(self, runner_id: str) -> Tuple[str, int]:
        return self.by_runner_id.get(runner_id, ("", 0))

    def set(self, runner_id: str, token: str, exp_epoch: int) -> None:
        self.by_runner_id[runner_id] = (token, exp_epoch)

    def invalidate(self, runner_id: str) -> None:
        self.by_runner_id.pop(runner_id, None)

    def valid(self, runner_id: str) -> bool:
        token, exp_epoch = self.get(runner_id)
        return bool(token) and _is_jwt(token) and (now_epoch() + 20) < int(exp_epoch or 0)


_CACHE = _TokenCache()


def _is_unauthorized_401(err: Exception) -> bool:
    """Returns whether an exception appears to represent an auth failure."""
    text = str(err or "")
    text_low = text.lower()

    if "401" in text or "unauthorized" in text_low:
        return True
    if "token" in text_low and "expired" in text_low:
        return True
    return False


def _dev_token_from_env() -> str:
    """Returns an optional development fallback token."""
    return (_env("RUNNER_TOKEN") or _env("BOT_RUNNER_TOKEN") or "").strip()


def _auth_headers_for_bot(api: UStockAPI, *, bot_id: str) -> Dict[str, str]:
    """Builds auth headers for a bot runner request."""
    bot_key = str(bot_id or "").strip()
    shared = _runner_shared_secret()

    if shared:
        runner_id = _runner_id_for_mint(bot_key)
        if not _CACHE.valid(runner_id):
            token, ttl = _mint_runner_token(api, bot_id=bot_key)
            _CACHE.set(runner_id, token, now_epoch() + ttl)

        token, _exp_epoch = _CACHE.get(runner_id)
        return {"Authorization": f"Bearer {token}"}

    token = _dev_token_from_env()
    if not token:
        return {}

    if not _is_jwt(token):
        raise RuntimeError(
            "RUNNER_TOKEN/BOT_RUNNER_TOKEN is not a JWT. "
            "Prefer RUNNER_SHARED_SECRET to mint a valid token."
        )

    return {"Authorization": f"Bearer {token}"}


def _get_with_auth_retry(
    api: UStockAPI,
    path: str,
    *,
    bot_id: str,
    params: Optional[Dict[str, Any]] = None,
) -> Any:
    """Performs a GET request with one auth remint retry on 401."""
    bot_key = str(bot_id or "").strip()
    shared = _runner_shared_secret()
    runner_id = _runner_id_for_mint(bot_key) if shared else ""

    try:
        return api.get(path, params=params or {}, headers=_auth_headers_for_bot(api, bot_id=bot_key))
    except Exception as err:
        if shared and _is_unauthorized_401(err):
            _CACHE.invalidate(runner_id)
            return api.get(
                path,
                params=params or {},
                headers=_auth_headers_for_bot(api, bot_id=bot_key),
            )
        raise


def _post_with_auth_retry(
    api: UStockAPI,
    path: str,
    *,
    bot_id: str,
    json: Dict[str, Any],
) -> Any:
    """Performs a POST request with one auth remint retry on 401."""
    bot_key = str(bot_id or "").strip()
    shared = _runner_shared_secret()
    runner_id = _runner_id_for_mint(bot_key) if shared else ""

    try:
        return api.post(path, json=json, headers=_auth_headers_for_bot(api, bot_id=bot_key))
    except Exception as err:
        if shared and _is_unauthorized_401(err):
            _CACHE.invalidate(runner_id)
            return api.post(
                path,
                json=json,
                headers=_auth_headers_for_bot(api, bot_id=bot_key),
            )
        raise


def _s(value: Any) -> Optional[str]:
    """Returns a stripped non-empty string or None."""
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def heartbeat_tick(
    api: UStockAPI,
    *,
    bot_id: str,
    runtime_state: str,
    mode: str,
    message: Optional[str] = None,
    paused_reason: Optional[str] = None,
    next_open_epoch: Optional[int] = None,
    last_error: Optional[str] = None,
    reason_code: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    """Posts a lightweight heartbeat tick for the configured runner user."""
    uid = str(user_id or "").strip() or _runner_user_id().strip()
    if not uid:
        return

    post_heartbeat(
        api,
        user_id=uid,
        bot_id=bot_id,
        runtime_state=runtime_state,
        mode=mode,
        message=message,
        paused_reason=paused_reason,
        next_open_epoch=next_open_epoch,
        last_error=last_error,
        reason_code=reason_code,
    )


def get_status(
    api: UStockAPI,
    bot_id: str,
    *,
    user_id: Optional[str] = None,
    **_ignore: Any,
) -> Dict[str, Any]:
    """Returns runner-visible backend status for a bot."""
    bot_key = str(bot_id or "").strip()
    uid = str(user_id or "").strip() or _require_runner_user_id("get_status")

    data = _get_with_auth_retry(
        api,
        "/api/bots/status_runner",
        bot_id=bot_key,
        params={"bot_id": bot_key, "user_id": uid},
    )
    return _as_dict(data)


def submit_intents(
    api: UStockAPI,
    bot_id: str,
    intents: List[Dict[str, Any]],
    *,
    user_id: Optional[str] = None,
) -> None:
    """Submits runner-generated intents to the backend."""
    bot_key = str(bot_id or "").strip()
    uid = str(user_id or "").strip() or _require_runner_user_id("submit_intents")

    payload = {
        "user_id": uid,
        "bot_id": bot_key,
        "ts": now_epoch(),
        "items": _as_list_of_dicts(intents),
    }

    _post_with_auth_retry(api, "/api/bots/submit-intents", bot_id=bot_key, json=payload)


def market_session(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    """Returns market session information."""
    del bot_id

    try:
        data = api.get("/api/market/us/session", params={}, headers={})
        result = _as_dict(data)
        result.setdefault("ok", False)
        return result
    except Exception:
        return {"ok": False}


def sync_trade_fills(
    api: UStockAPI,
    *,
    bot_id: str,
    mode: str,
    user_id: Optional[str] = None,
) -> None:
    """Triggers trade fill synchronization for the current runner context."""
    bot_key = str(bot_id or "").strip()
    uid = str(user_id or "").strip() or _require_runner_user_id("sync_trade_fills")

    payload: Dict[str, Any] = {
        "bot_id": bot_key,
        "mode": (str(mode or "paper").strip().lower() or "paper"),
        "user_id": uid,
    }

    _post_with_auth_retry(api, "/api/trade_fills/sync_runner", bot_id=bot_key, json=payload)


def post_heartbeat(
    api: UStockAPI,
    *,
    user_id: str,
    bot_id: str,
    runtime_state: str,
    mode: str,
    message: Optional[str] = None,
    reason_code: Optional[str] = None,
    paused_reason: Optional[str] = None,
    next_open_epoch: Optional[int] = None,
    last_error: Optional[str] = None,
    runner_id: Optional[str] = None,
) -> None:
    """Posts a heartbeat payload to the backend."""
    uid = str(user_id or "").strip()
    if not uid:
        return

    payload: Dict[str, Any] = {
        "user_id": uid,
        "bot_id": _s(bot_id) or "unknown",
        "effective_state": _normalize_runtime_state(runtime_state),
        "mode": (str(mode or "paper").strip().lower() or "paper"),
        "runner_id": _s(runner_id) or _s(_runner_id()) or _runner_id_for_mint(str(bot_id or "").strip()),
        "reason_code": _s(reason_code),
        "message": _s(message),
        "paused_reason": _s(paused_reason),
        "next_open_epoch": int(next_open_epoch) if isinstance(next_open_epoch, (int, float)) else None,
        "last_error": str(last_error or "").strip(),
    }

    _post_with_auth_retry(
        api,
        "/api/bots/heartbeat",
        bot_id=str(bot_id or "").strip(),
        json=payload,
    )