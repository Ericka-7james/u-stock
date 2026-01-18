# u-stock-bots/runner/bot_runner.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional

from bots._shared.ustock_http import UStockAPI


LOOP_SECONDS = int(os.getenv("RUNNER_LOOP_SECONDS", "5"))
BOT_ID = os.getenv("RUNNER_BOT_ID", "ema_trend")  # you can extend to multiple later


def _now() -> int:
    return int(time.time())


def _sleep_smart(seconds: float) -> None:
    time.sleep(max(0.2, float(seconds)))


def _market_session(api: UStockAPI) -> Dict[str, Any]:
    # Expected: { ok: true, is_open: bool, next_open: epoch, reason: "...", ... }
    try:
        data = api.get("/api/market/us/session")
        return data if isinstance(data, dict) else {"ok": False}
    except Exception:
        return {"ok": False}


def _get_status(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    return api.get("/api/bots/status", params={"bot_id": bot_id})


def _heartbeat(
    api: UStockAPI,
    *,
    bot_id: str,
    state: str,
    mode: str,
    paused_reason: Optional[str] = None,
    next_open_epoch: Optional[int] = None,
    last_error: Optional[str] = None,
) -> None:
    payload: Dict[str, Any] = {
        "bot_id": bot_id,
        "state": state,  # running | paused | stopped
        "mode": mode,
        "last_run": _now(),
        "paused_reason": paused_reason,
        "next_open_epoch": next_open_epoch,
        "last_error": last_error,
    }
    api.post("/api/bots/heartbeat", json=payload)


def _submit_intents(api: UStockAPI, bot_id: str, items: List[Dict[str, Any]]) -> None:
    api.post("/api/bots/submit-intents", json={"bot_id": bot_id, "ts": _now(), "items": items})


# ----------------------------------------------------------
# EMA bot adapter (plug your real ema_trend logic in here)
# ----------------------------------------------------------
def compute_intents_for_ema_trend(api: UStockAPI, cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Runs the real EMA Trend bot and converts TradeIntent -> JSON dict.
    """
    from bots.ema_trend.bot import run as ema_run
    from bots.ema_trend.config import EMATrendConfig

    # Merge backend runtime config -> EMATrendConfig if fields overlap
    # (anything unknown is ignored by dataclass if you do **cfg safely)
    try:
        bot_cfg = EMATrendConfig(**{k: v for k, v in (cfg or {}).items() if hasattr(EMATrendConfig(), k)})
    except Exception:
        bot_cfg = EMATrendConfig()

    intents = ema_run(api=api, cfg=bot_cfg) or []
    return [i.__dict__ for i in intents]


def main() -> None:
    base_url = os.getenv("USTOCK_API_BASE", "http://127.0.0.1:8000")
    print(f"[runner] starting | base={base_url} | bot_id={BOT_ID} | loop={LOOP_SECONDS}s")

    with UStockAPI(base_url=base_url, timeout=15) as api:
        while True:
            t0 = time.time()

            try:
                status = _get_status(api, BOT_ID)
                state = str(status.get("state") or "stopped")
                mode = str(status.get("mode") or (status.get("config") or {}).get("mode") or "paper")
                cfg = (status.get("config") or {}) if isinstance(status.get("config"), dict) else {}

                if state != "running":
                    # Not running -> do nothing (but runner stays alive)
                    _sleep_smart(LOOP_SECONDS - (time.time() - t0))
                    continue

                sess = _market_session(api)
                is_open = bool(sess.get("is_open")) if sess.get("ok") else True  # fail-open locally

                if not is_open:
                    paused_reason = str(sess.get("reason") or "Market closed")
                    next_open = sess.get("next_open")
                    next_open_epoch = int(next_open) if isinstance(next_open, (int, float)) else None

                    _heartbeat(
                        api,
                        bot_id=BOT_ID,
                        state="paused",
                        mode=mode,
                        paused_reason=paused_reason,
                        next_open_epoch=next_open_epoch,
                        last_error=None,
                    )
                    _sleep_smart(LOOP_SECONDS - (time.time() - t0))
                    continue

                # Market open -> compute intents
                intents = compute_intents_for_ema_trend(api, cfg)

                # Submit + heartbeat
                _submit_intents(api, BOT_ID, intents)
                _heartbeat(api, bot_id=BOT_ID, state="running", mode=mode, last_error=None)

            except Exception as e:
                # Runner should never die; report error to backend for the UI
                try:
                    _heartbeat(
                        api,
                        bot_id=BOT_ID,
                        state="running",
                        mode="paper",
                        last_error=repr(e),
                    )
                except Exception:
                    pass

            _sleep_smart(LOOP_SECONDS - (time.time() - t0))


if __name__ == "__main__":
    main()
