# u-stock-bots/runner/main.py
from __future__ import annotations

import argparse
import os
import time
from typing import Any, Dict, Optional

from bots._shared.http import UStockAPI

# Your bot entrypoints
from bots.ema_trend.bot import run as ema_trend_run
# from bots.orb.bot import run as orb_run  # if you have it

DEFAULT_LOOP_SECONDS = int(os.getenv("RUNNER_LOOP_SECONDS", "15"))


def _sleep(seconds: float) -> None:
    time.sleep(max(0.0, float(seconds)))


def _fmt_hhmmss(seconds: Optional[int]) -> str:
    if seconds is None:
        return "?"
    s = int(seconds)
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    if h > 0:
        return f"{h}h {m}m {sec}s"
    if m > 0:
        return f"{m}m {sec}s"
    return f"{sec}s"


def _get_market_session(api: UStockAPI) -> Dict[str, Any]:
    # backend session endpoint
    return api.get("/api/market/us/session")


def _gate_us_market(api: UStockAPI, *, debug: bool = False) -> bool:
    """
    Returns True if market is open.
    If closed, sleeps until next open (or a safe fallback).
    """
    try:
        sess = _get_market_session(api)
    except Exception as e:
        # If session endpoint fails, we fail "open" to avoid freezing forever.
        # But we should back off a bit.
        print(f"[runner] market session check failed: {e}")
        _sleep(60)
        return True

    if not (sess or {}).get("ok"):
        print("[runner] market session returned not ok; will retry soon")
        _sleep(60)
        return True

    is_open = bool(sess.get("is_open"))
    if is_open:
        if debug:
            print(f"[runner] market: OPEN (next_close={sess.get('next_close')})")
        return True

    # CLOSED
    wait = sess.get("seconds_until_open")
    msg = f"[runner] market: CLOSED (next_open={sess.get('next_open')})"

    if isinstance(wait, (int, float)) and wait is not None:
        # Add a small buffer so we don't wake up before open.
        wait_s = int(wait) + 20
        print(f"{msg} → sleeping {_fmt_hhmmss(wait_s)}")
        _sleep(wait_s)
        return False

    # Fallback if next_open missing
    print(f"{msg} → sleeping 30m (fallback)")
    _sleep(30 * 60)
    return False


def _run_selected_bot(api: UStockAPI, bot_name: str):
    if bot_name == "ema_trend":
        return ema_trend_run(api)
    # elif bot_name == "orb":
    #     return orb_run(api)
    else:
        raise ValueError(f"Unknown bot '{bot_name}'")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Run one iteration then exit.")
    parser.add_argument("--debug", action="store_true", help="Verbose logs.")
    parser.add_argument("--loop", type=int, default=DEFAULT_LOOP_SECONDS, help="Loop interval in seconds when market open.")
    parser.add_argument("--bot", type=str, default=os.getenv("RUNNER_BOT", "ema_trend"), help="Bot to run.")
    parser.add_argument(
        "--respect-market-hours",
        action="store_true",
        default=True,
        help="If set, do not run bots while US market is closed.",
    )
    args = parser.parse_args()

    api = UStockAPI()

    print(f"[runner] API={api.base_url.rstrip('/')} loop={args.loop}s bot={args.bot}")

    backoff = 2.0
    max_backoff = 120.0

    while True:
        try:
            # Gate on market hours
            if args.respect_market_hours:
                opened = _gate_us_market(api, debug=args.debug)
                # If it was closed, _gate_us_market already slept.
                # Loop again (don’t run bots until open).
                if not opened:
                    if args.once:
                        # If user asked --once, we end after respecting the gate.
                        return
                    continue

            # Run bot iteration
            intents = _run_selected_bot(api, args.bot)

            if args.debug:
                n = 0 if intents is None else (len(intents) if hasattr(intents, "__len__") else 1)
                print(f"[runner] intents: {n}")

            # Reset backoff on success
            backoff = 2.0

            if args.once:
                return

            _sleep(args.loop)

        except KeyboardInterrupt:
            raise
        except Exception as e:
            print(f"[runner] error: {type(e).__name__}: {e}")
            if args.once:
                raise

            _sleep(backoff)
            backoff = min(max_backoff, backoff * 1.6)


if __name__ == "__main__":
    main()
