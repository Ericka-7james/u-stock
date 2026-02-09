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


def _mint_runner_token(api: UStockAPI, *, bot_id: str) -> Tuple[str, int]:
    """
    Calls backend POST /api/runner/token using shared secret to mint a JWT.
    Returns (token, expires_in_seconds).

    Where it can break:
      - shared secret mismatch (401)
      - backend signing key missing (500)
      - network errors
    """
    shared = _env("RUNNER_SHARED_SECRET")
    if not shared:
        raise RuntimeError(
            "RUNNER_SHARED_SECRET missing. Set it in u-stock-bots env to mint a token via /api/runner/token."
        )

    runner_id = _runner_id_for_mint(bot_id)
    headers = {"X-Runner-Secret": shared}

    # Optional: pass user id to embed uid claim in token
    uid = _runner_user_id()
    if uid:
        headers["X-Runner-User-Id"] = uid

    res = api.post(
        "/api/runner/token",
        json={"runner_id": runner_id},
        headers=headers,
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


def _is_token_expired_401(err: Exception) -> bool:
    s = str(err or "")
    # ustock_http formats like:
    # HTTPError('401 Unauthorized | {"detail":"Runner token expired"}')
    return ("401" in s) and ("expired" in s.lower() or "token expired" in s.lower())


def _invalidate_token_cache() -> None:
    _CACHE.token = ""
    _CACHE.exp_epoch = 0


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


def _post_with_auth_retry(api: UStockAPI, path: str, *, bot_id: str, json: Dict[str, Any]) -> Any:
    """
    POST with auth. If backend says token expired and we can mint, invalidate cache and retry once.
    """
    bid = str(bot_id or "").strip()
    try:
        return api.post(path, json=json, headers=_auth_headers_for_bot(api, bot_id=bid))
    except Exception as e:
        if _env("RUNNER_SHARED_SECRET") and _is_token_expired_401(e):
            _invalidate_token_cache()
            return api.post(path, json=json, headers=_auth_headers_for_bot(api, bot_id=bid))
        raise


def _get_with_auth_retry(api: UStockAPI, path: str, *, bot_id: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """
    GET with auth. If backend says token expired and we can mint, invalidate cache and retry once.
    """
    bid = str(bot_id or "").strip()
    try:
        return api.get(path, params=params or {}, headers=_auth_headers_for_bot(api, bot_id=bid))
    except Exception as e:
        if _env("RUNNER_SHARED_SECRET") and _is_token_expired_401(e):
            _invalidate_token_cache()
            return api.get(path, params=params or {}, headers=_auth_headers_for_bot(api, bot_id=bid))
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
) -> None:
    """
    Convenience: uses RUNNER_USER_ID from env and posts heartbeat.

    Notes:
      - If RUNNER_SHARED_SECRET is set, runner will mint a JWT via /api/runner/token.
      - RUNNER_USER_ID is still required by your /api/bots/heartbeat payload (until backend fully binds uid claim).
    """
    uid = (_runner_user_id() or "").strip()
    if not uid:
        # keep soft: runner can still run locally, but won't report state
        return

    post_heartbeat(
        api,
        user_id=uid,
        bot_id=bot_id,
        intent=intent,
        effective_state=effective_state,
        mode=mode,
        message=message,
        paused_reason=paused_reason,
        next_open_epoch=next_open_epoch,
        last_error=last_error,
        last_tick=now_epoch(),
    )


def get_status(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    """
    Calls /api/bots/status_runner.
    user_id is intended to be bound to the runner token via uid claim (minted with X-Runner-User-Id),
    so this endpoint should NOT require user_id as query param.
    """
    bid = str(bot_id or "").strip()
    data = _get_with_auth_retry(
        api,
        "/api/bots/status_runner",
        bot_id=bid,
        params={"bot_id": bid},
    )
    return _as_dict(data)


def submit_intents(api: UStockAPI, bot_id: str, intents: List[Dict[str, Any]], *, user_id: Optional[str] = None) -> None:
    """
    Backend /api/bots/submit-intents requires user_id in the JSON body.
    """
    bid = str(bot_id or "").strip()
    uid = (str(user_id or "").strip() or _runner_user_id() or "").strip()
    if not uid:
        # TODO: optionally buffer intents locally
        return

    payload = {
        "user_id": uid,
        "bot_id": bid,
        "ts": now_epoch(),
        "items": _as_list_of_dicts(intents),
    }

    _post_with_auth_retry(
        api,
        "/api/bots/submit-intents",
        bot_id=bid,
        json=payload,
    )


def market_session(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    """
    Market session does not need runner auth, but it's fine if present.
    Fail-open shape on error.
    """
    try:
        data = _get_with_auth_retry(
            api,
            "/api/market/us/session",
            bot_id=str(bot_id or "").strip(),
            params=None,
        )
        d = _as_dict(data)
        if "ok" not in d:
            d["ok"] = False
        return d
    except Exception:
        return {"ok": False}


def sync_trade_fills(api: UStockAPI, *, bot_id: str, mode: str, user_id: Optional[str] = None) -> None:
    """
    If your backend ties fills to the user session, you may later want user-bound runner claims.
    """
    bid = str(bot_id or "").strip()
    payload = {"bot_id": bid, "mode": str(mode or "paper").strip().lower()}

    _post_with_auth_retry(
        api,
        "/api/trade_fills/sync_runner",
        bot_id=bid,
        json=payload,
    )


def post_heartbeat(
    api: UStockAPI,
    *,
    user_id: str,
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
    """
    Backend /api/bots/heartbeat requires:
      - bot_id
      - user_id
    """
    now = now_epoch()

    uid = str(user_id or "").strip()
    if not uid:
        return

    payload: Dict[str, Any] = {
        "user_id": uid,
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

    _post_with_auth_retry(
        api,
        "/api/bots/heartbeat",
        bot_id=str(bot_id or "").strip(),
        json=payload,
    )


"""
TODO (security hardening you can do later):
- Bind runner JWT to user_id claim (uid) and have backend enforce:
    payload.user_id == claims['uid'].
- Add local disk buffer for events/intents if backend is down.
- Consider checking uid presence in env at startup and warn loudly if missing.
"""
