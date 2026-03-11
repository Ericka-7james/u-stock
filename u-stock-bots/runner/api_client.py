# u-stock-bots/runner/api_client.py
from __future__ import annotations

"""Runner-side API client helpers for U-Stock bot operations.

This module wraps the lower-level ``UStockAPI`` transport with runner-aware
authentication, token minting, token caching, retry-on-401 behavior, and
higher-level helper methods for bot runner operations such as:

- heartbeat submission
- runner-visible bot status retrieval
- intent submission
- trade fill sync
- market session lookup

Authentication flow:
    Preferred:
        1. Use RUNNER_SHARED_SECRET to mint a short-lived runner JWT from
           /api/runner/token.
        2. Cache the JWT per runner id until near expiration.
        3. Send the JWT as Authorization: Bearer <token>.

    Development fallback:
        - RUNNER_TOKEN
        - BOT_RUNNER_TOKEN

User binding:
    Runner-authenticated flows expect a runner-bound user id via:
        - RUNNER_USER_ID
        - USTOCK_USER_ID

    This value is sent during token minting and is also included in selected
    payloads for compatibility and enforcement checks.
"""

import os
import time
from typing import Any, Dict, List, Optional, Tuple

from bots._shared.ustock_http import UStockAPI


def now_epoch() -> int:
    """Returns the current epoch time in seconds.

    Returns:
        Current Unix timestamp in seconds.
    """
    return int(time.time())


def _env(name: str, default: str = "") -> str:
    """Returns a stripped environment variable value.

    Args:
        name: Environment variable name.
        default: Default value if the variable is missing.

    Returns:
        Trimmed environment variable value or the provided default.
    """
    return str(os.getenv(name, default) or "").strip()


def _as_dict(value: Any) -> Dict[str, Any]:
    """Returns the input as a dict when possible.

    Args:
        value: Arbitrary value.

    Returns:
        Input value if it is a dict, otherwise an empty dict.
    """
    return value if isinstance(value, dict) else {}


def _as_list_of_dicts(value: Any) -> List[Dict[str, Any]]:
    """Returns a filtered list of dict items.

    Args:
        value: Arbitrary value.

    Returns:
        Dict items if the input is a list, otherwise an empty list.
    """
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _is_jwt(value: str) -> bool:
    """Returns whether a string looks like a JWT.

    Args:
        value: Token candidate.

    Returns:
        True if the string has three JWT dot-separated segments.
    """
    return str(value or "").count(".") == 2


def _runner_id_for_mint(bot_id: str) -> str:
    """Resolves the runner id used for token minting.

    Resolution order:
        - RUNNER_ID
        - RUNNER_DEVICE_ID
        - bot_id
        - local-runner

    Args:
        bot_id: Bot identifier.

    Returns:
        Runner identifier used for token minting and token caching.
    """
    return (
        _env("RUNNER_ID")
        or _env("RUNNER_DEVICE_ID")
        or str(bot_id or "").strip()
        or "local-runner"
    )


def _runner_shared_secret() -> str:
    """Returns the configured runner shared secret.

    Returns:
        Shared secret from preferred or legacy environment variables.
    """
    return _env("RUNNER_SHARED_SECRET") or _env("BOT_RUNNER_SECRET")


def _runner_user_id() -> str:
    """Returns the configured runner-bound user id.

    Returns:
        User id from preferred or legacy environment variables.
    """
    return _env("RUNNER_USER_ID") or _env("USTOCK_USER_ID")


def _require_runner_user_id(operation: str) -> str:
    """Returns the configured runner-bound user id or raises.

    Args:
        operation: Human-readable operation name for diagnostics.

    Raises:
        RuntimeError: If no runner-bound user id is configured.

    Returns:
        Runner-bound application user id.
    """
    uid = _runner_user_id()
    if not uid:
        raise RuntimeError(
            f"Runner missing user_id for {operation}. "
            "Set RUNNER_USER_ID (or USTOCK_USER_ID) in env."
        )
    return uid


def _normalize_desired_state(value: Any) -> str:
    """Normalizes a desired bot state string.

    Args:
        value: Raw desired state or intent value.

    Returns:
        Normalized desired state.

    Notes:
        Control-plane desired state remains intentionally narrow:
        - running
        - stopped
    """
    state = str(value or "").strip().lower()
    if state == "running":
        return "running"
    if state == "paused":
        return "stopped"
    return "stopped"


def _normalize_effective_state(value: Any) -> str:
    """Normalizes an effective runtime state string.

    Args:
        value: Raw effective state value.

    Returns:
        Normalized effective runtime state.

    Notes:
        Runtime state must preserve live non-terminal values such as
        ``paused`` or ``waiting_for_market``. Collapsing ``paused`` into
        ``stopped`` causes the backend and UI to misrepresent a live-but-blocked
        runner as fully stopped.
    """
    state = str(value or "").strip().lower()
    if not state:
        return "unknown"
    return state


def _mint_runner_token(api: UStockAPI, *, bot_id: str) -> Tuple[str, int]:
    """Mints a short-lived runner JWT through the backend.

    The token mint request requires:
        - RUNNER_SHARED_SECRET or BOT_RUNNER_SECRET
        - RUNNER_USER_ID or USTOCK_USER_ID

    Args:
        api: Shared HTTP client.
        bot_id: Bot identifier used to derive a runner id if not explicitly set.

    Raises:
        RuntimeError: If required authentication configuration is missing or
            the response does not contain a valid JWT.

    Returns:
        Minted JWT and expiration time in seconds.
    """
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
    """Caches runner JWTs per runner id.

    This prevents multiple bots or runner devices inside one process from
    overwriting each other's cached JWTs.

    Cache format:
        runner_id -> (token, exp_epoch)
    """

    def __init__(self) -> None:
        """Initializes the token cache."""
        self.by_runner_id: Dict[str, Tuple[str, int]] = {}

    def get(self, runner_id: str) -> Tuple[str, int]:
        """Returns the cached token tuple for a runner id.

        Args:
            runner_id: Runner identifier.

        Returns:
            Cached token and expiration epoch, or ("", 0).
        """
        return self.by_runner_id.get(runner_id, ("", 0))

    def set(self, runner_id: str, token: str, exp_epoch: int) -> None:
        """Stores a token for a runner id.

        Args:
            runner_id: Runner identifier.
            token: JWT token string.
            exp_epoch: Expiration epoch in seconds.
        """
        self.by_runner_id[runner_id] = (token, exp_epoch)

    def invalidate(self, runner_id: str) -> None:
        """Invalidates a cached token for a runner id.

        Args:
            runner_id: Runner identifier.
        """
        self.by_runner_id.pop(runner_id, None)

    def valid(self, runner_id: str) -> bool:
        """Returns whether a cached token is still usable.

        A small safety buffer is applied so nearly expired tokens are treated
        as invalid and reminted proactively.

        Args:
            runner_id: Runner identifier.

        Returns:
            True if the cached token is still usable.
        """
        token, exp_epoch = self.get(runner_id)
        return bool(token) and _is_jwt(token) and (now_epoch() + 20) < int(exp_epoch or 0)


_CACHE = _TokenCache()


def _is_unauthorized_401(err: Exception) -> bool:
    """Returns whether an exception appears to represent an auth failure.

    This is best-effort logic used only to decide whether to invalidate a
    cached token and attempt one remint.

    Args:
        err: Exception raised by the transport layer.

    Returns:
        True if the exception looks like a 401 or token-expired case.
    """
    text = str(err or "")
    text_low = text.lower()

    if "401" in text or "unauthorized" in text_low:
        return True
    if "token" in text_low and "expired" in text_low:
        return True
    return False


def _dev_token_from_env() -> str:
    """Returns an optional development fallback token.

    Supported environment variables:
        - RUNNER_TOKEN
        - BOT_RUNNER_TOKEN

    Returns:
        JWT token from environment, or an empty string.
    """
    return (_env("RUNNER_TOKEN") or _env("BOT_RUNNER_TOKEN") or "").strip()


def _auth_headers_for_bot(api: UStockAPI, *, bot_id: str) -> Dict[str, str]:
    """Builds auth headers for a bot runner request.

    Auth priority:
        1. Mint JWT via /api/runner/token using shared secret.
        2. Use development fallback token from environment.
        3. Return empty headers and let the backend reject the request.

    Args:
        api: Shared HTTP client.
        bot_id: Bot identifier.

    Raises:
        RuntimeError: If the development token is present but not a JWT.

    Returns:
        Authorization headers for the request.
    """
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
    """Performs a GET request with one auth remint retry on 401.

    Args:
        api: Shared HTTP client.
        path: API path.
        bot_id: Bot identifier.
        params: Optional query parameters.

    Returns:
        Parsed API response.

    Raises:
        Exception: Re-raises the original or retried request exception.
    """
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
    """Performs a POST request with one auth remint retry on 401.

    Args:
        api: Shared HTTP client.
        path: API path.
        bot_id: Bot identifier.
        json: JSON request payload.

    Returns:
        Parsed API response.

    Raises:
        Exception: Re-raises the original or retried request exception.
    """
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
    """Returns a stripped non-empty string or None.

    Args:
        value: Arbitrary value.

    Returns:
        Stripped string if non-empty, otherwise None.
    """
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


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
    """Posts a lightweight heartbeat tick for the configured runner user.

    Args:
        api: Shared HTTP client.
        bot_id: Bot identifier.
        intent: Desired bot intent.
        effective_state: Current effective runner state.
        mode: Trading mode, typically paper or live.
        message: Optional status message.
        paused_reason: Optional pause reason.
        next_open_epoch: Optional next market-open epoch.
        last_error: Optional last known error string.
        reason_code: Optional machine-readable reason code.
    """
    uid = _runner_user_id().strip()
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
    """Returns runner-visible backend status for a bot.

    Args:
        api: Shared HTTP client.
        bot_id: Bot identifier.
        user_id: Optional explicit application user id.

    Returns:
        Status payload from the backend.

    Raises:
        RuntimeError: If no runner-bound user id is configured.
    """
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
    """Submits runner-generated intents to the backend.

    Args:
        api: Shared HTTP client.
        bot_id: Bot identifier.
        intents: Candidate intents to submit.
        user_id: Optional explicit application user id.

    Raises:
        RuntimeError: If no runner-bound user id is configured.
    """
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
    """Returns market session information.

    This endpoint is treated as fail-open and does not require runner auth.

    Args:
        api: Shared HTTP client.
        bot_id: Bot identifier. Present for call-site symmetry.

    Returns:
        Market session response, with ``ok`` defaulting to False.
    """
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
    """Triggers trade fill synchronization for the current runner context.

    Args:
        api: Shared HTTP client.
        bot_id: Bot identifier.
        mode: Trading mode, typically paper or live.
        user_id: Optional explicit application user id.

    Raises:
        RuntimeError: If no runner-bound user id is configured.
    """
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
    """Posts a heartbeat payload to the backend.

    Args:
        api: Shared HTTP client.
        user_id: Application user id bound to the runner.
        bot_id: Bot identifier.
        intent: Desired bot intent.
        effective_state: Effective runner state.
        mode: Trading mode, typically paper or live.
        desired_state: Optional explicit desired state override.
        message: Optional human-readable status message.
        reason_code: Optional machine-readable reason code.
        paused_reason: Optional pause reason.
        next_open_epoch: Optional next market-open epoch.
        last_error: Optional last known error string.
        last_tick: Optional last tick epoch.
    """
    now = now_epoch()
    uid = str(user_id or "").strip()
    if not uid:
        return

    desired = _normalize_desired_state(desired_state or intent)
    effective = _normalize_effective_state(effective_state)
    mode_norm = str(mode or "paper").strip().lower() or "paper"

    payload: Dict[str, Any] = {
        "user_id": uid,
        "bot_id": _s(bot_id) or "unknown",
        "intent": desired,
        "desired_state": desired,
        "effective_state": effective,
        "mode": mode_norm,
        "heartbeat_at": now,
        "last_run": now,
        "last_tick": int(last_tick or now),
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