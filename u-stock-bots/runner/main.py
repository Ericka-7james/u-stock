# u-stock-bots/runner/main.py
from __future__ import annotations

import os
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Optional

# ------------------------------------------------------------
# Make imports work no matter where you run from
# - Allows: `python -m runner.main` from u-stock-bots/
# - Fixes: ModuleNotFoundError: No module named 'bots'
# ------------------------------------------------------------
THIS_FILE = Path(__file__).resolve()
RUNNER_DIR = THIS_FILE.parent           # .../u-stock-bots/runner
BOTS_ROOT = RUNNER_DIR.parent           # .../u-stock-bots

if str(BOTS_ROOT) not in sys.path:
    sys.path.insert(0, str(BOTS_ROOT))

# If you ever colocate backend as ../backend and want to import its "api" package,
# you can optionally add it too (safe even if it doesn't exist).
BACKEND_ROOT = BOTS_ROOT.parent / "backend"
if BACKEND_ROOT.exists() and str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


# ------------------------------------------------------------
# Imports from your bots package
# ------------------------------------------------------------
from bots._shared.config import RunnerConfig
from bots._shared.http import UStockAPI
from bots.ema_trend.bot import run as ema_trend_run
from bots.logging.journal import Journal

# Phase 2 executor placeholder (won't actually hit TradeStation yet)
from bots.execution.tradestation import TradeStationExecutor


# ------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------
def _ensure_dir(p: str) -> None:
    Path(p).parent.mkdir(parents=True, exist_ok=True)


def _sleep(seconds: float) -> None:
    # Central place to change sleep behavior if needed later
    time.sleep(max(0.0, float(seconds)))


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _mk_runner_headers(cfg: RunnerConfig) -> Dict[str, str]:
    """
    Runner auth: backend should accept these via require_user_or_runner().
    These env var names are guesses based on your earlier pattern—adjust if needed
    to match your RunnerConfig fields.
    """
    h: Dict[str, str] = {"accept": "application/json"}

    secret = getattr(cfg, "runner_secret", None) or os.getenv("BOT_RUNNER_SECRET") or os.getenv("X_BOT_RUNNER_SECRET")
    user_id = getattr(cfg, "runner_user_id", None) or os.getenv("RUNNER_USER_ID") or os.getenv("X_RUNNER_USER_ID")

    if secret:
        h["X-Bot-Runner-Secret"] = str(secret)
    if user_id:
        h["X-Runner-User-Id"] = str(user_id)

    return h


def _safe_post(api: UStockAPI, path: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> None:
    """
    Best-effort POST that never crashes the loop if the endpoint isn't ready.
    """
    try:
        # UStockAPI might support post(); if not, fall back to request()
        if hasattr(api, "post"):
            api.post(path, json=payload, headers=headers)  # type: ignore[arg-type]
        elif hasattr(api, "request"):
            api.request("POST", path, json=payload, headers=headers)  # type: ignore[arg-type]
    except Exception:
        pass


def _safe_get(api: UStockAPI, path: str, headers: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
    try:
        if hasattr(api, "get"):
            return api.get(path, headers=headers)  # type: ignore[arg-type]
        if hasattr(api, "request"):
            return api.request("GET", path, headers=headers)  # type: ignore[arg-type]
    except Exception:
        return None
    return None


def main() -> None:
    cfg = RunnerConfig()

    # Create API client (your UStockAPI likely reads cfg.api_base internally;
    # if it accepts a base_url param, you can update this line accordingly.)
    api = UStockAPI()

    # Logs
    _ensure_dir("logs/journal.ndjson")
    journal = Journal(path="logs/journal.ndjson")

    # Executor placeholder
    executor = TradeStationExecutor()

    # Runner headers for require_user_or_runner protected endpoints
    runner_headers = _mk_runner_headers(cfg)

    bot_id = "ema_trend"

    print(f"[runner] API={getattr(cfg, 'api_base', 'unknown')} loop={cfg.loop_sleep_seconds}s bot={bot_id}")

    # Basic exponential backoff if repeated failures happen
    backoff = 1.0
    backoff_max = 30.0

    def gate_ok() -> bool:
        """
        Optional "gate" check.
        If endpoint doesn't exist, we don't block local testing.
        """
        g = _safe_get(api, "/api/bot-runner/gate", headers=runner_headers)
        if not g:
            return True
        return bool(g.get("ok", True))

    while True:
        try:
            # Heartbeat: runner alive
            _safe_post(
                api,
                "/api/bot-runner/heartbeat",
                {"ok": True, "bot_id": bot_id, "runtime_state": "running", "ts": _now_iso()},
                headers=runner_headers,
            )

            if not gate_ok():
                print("[runner] gate blocked - sleeping")
                _safe_post(
                    api,
                    "/api/bot-runner/runtime",
                    {"bot_id": bot_id, "runtime_state": "paused", "note": "gate_blocked", "ts": _now_iso()},
                    headers=runner_headers,
                )
                _sleep(cfg.loop_sleep_seconds)
                continue

            # Run strategy
            intents = ema_trend_run(api)  # your bot calls backend endpoints using `api`

            if intents:
                print(f"[{bot_id}] intents={len(intents)}")
            else:
                print(f"[{bot_id}] intents=0")

            for intent in intents:
                # 1) log intent locally
                journal.log_intent(intent)

                # 2) Phase 2 placeholder: submit bracket order (SIM)
                result = executor.place_bracket(intent)
                journal.log_order(intent, asdict(result))

                print(
                    f"[order] {intent.symbol} {intent.side} "
                    f"entry={intent.entry} stop={intent.stop} tp={intent.take_profit} "
                    f"conf={intent.confidence} status={result.status}"
                )

                # 3) best-effort: push intent/order logs to backend (if you have endpoints)
                _safe_post(
                    api,
                    "/api/bot-runner/log",
                    {
                        "bot_id": bot_id,
                        "level": "info",
                        "message": f"order {intent.symbol} {intent.side} entry={intent.entry} stop={intent.stop} tp={intent.take_profit} status={result.status}",
                        "ts": _now_iso(),
                    },
                    headers=runner_headers,
                )

            # Reset backoff on success
            backoff = 1.0
            _sleep(cfg.loop_sleep_seconds)

        except KeyboardInterrupt:
            print("\n[runner] stopped by user")
            _safe_post(
                api,
                "/api/bot-runner/runtime",
                {"bot_id": bot_id, "runtime_state": "stopped", "note": "keyboard_interrupt", "ts": _now_iso()},
                headers=runner_headers,
            )
            return

        except Exception as e:
            # Log locally
            print(f"[runner] error: {type(e).__name__}: {e}")

            # Best-effort: mark runtime error in backend
            _safe_post(
                api,
                "/api/bot-runner/runtime",
                {
                    "bot_id": bot_id,
                    "runtime_state": "error",
                    "last_error_type": type(e).__name__,
                    "last_error_message": str(e),
                    "ts": _now_iso(),
                },
                headers=runner_headers,
            )

            # Backoff sleep (prevents tight crash loop)
            _sleep(backoff)
            backoff = min(backoff * 2.0, backoff_max)


if __name__ == "__main__":
    main()
