# u-stock-bots/runner/main.py
from __future__ import annotations

import argparse
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional, Callable

from dotenv import load_dotenv

# ------------------------------------------------------------
# Load runner env (.env then .env.local) from u-stock-bots root.
# Rule: OS env wins; .env.local overrides .env (but NOT OS env).
# ------------------------------------------------------------
_THIS_FILE = Path(__file__).resolve()          # .../u-stock-bots/runner/main.py
_BOTS_ROOT = _THIS_FILE.parents[1]            # .../u-stock-bots

# Load base first (no override)
load_dotenv(_BOTS_ROOT / ".env", override=False)
# Allow .env.local to override .env (but not OS env)
load_dotenv(_BOTS_ROOT / ".env.local", override=True)

# ✅ Use the same API client used elsewhere in u-stock-bots
from bots._shared.ustock_http import UStockAPI
from bots.ema_trend.bot import run as ema_trend_run

DEFAULT_LOOP_SECONDS = int(os.getenv("RUNNER_LOOP_SECONDS", "15"))


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if raw == "":
        return default
    return raw in ("1", "true", "t", "yes", "y", "on")


def _sleep(seconds: float, *, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    sleep_fn(max(0.2, float(seconds)))


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
    return api.get("/api/market/us/session")


def _seconds_until_open(sess: Dict[str, Any]) -> Optional[int]:
    wait = sess.get("seconds_until_open")
    if isinstance(wait, (int, float)):
        return int(wait)
    return None


def _gate_us_market(api: UStockAPI, *, debug: bool = False, sleep_fn: Callable[[float], None] = time.sleep) -> bool:
    """
    Returns True if market is open.
    If closed, sleeps until next open (or fallback) and returns False.
    """
    try:
        sess = _get_market_session(api)
    except Exception as e:
        # fail-open but backoff slightly to avoid tight loop
        print(f"[runner] market session check failed: {type(e).__name__}: {e}")
        _sleep(60, sleep_fn=sleep_fn)
        return True

    if not isinstance(sess, dict) or not sess.get("ok"):
        print("[runner] market session returned not ok; will retry soon")
        _sleep(60, sleep_fn=sleep_fn)
        return True

    is_open = bool(sess.get("is_open"))
    if is_open:
        if debug:
            print(f"[runner] market: OPEN (next_close={sess.get('next_close')})")
        return True

    # CLOSED
    msg = f"[runner] market: CLOSED (next_open={sess.get('next_open')})"
    wait = _seconds_until_open(sess)

    if wait is not None:
        wait_s = max(10, int(wait) + 20)  # buffer to avoid waking early
        print(f"{msg} -> sleeping {_fmt_hhmmss(wait_s)}")
        _sleep(wait_s, sleep_fn=sleep_fn)
        return False

    print(f"{msg} -> sleeping 30m (fallback)")
    _sleep(30 * 60, sleep_fn=sleep_fn)
    return False


def _run_selected_bot(api: UStockAPI, bot_name: str):
    if bot_name == "ema_trend":
        return ema_trend_run(api=api)
    raise ValueError(f"Unknown bot '{bot_name}'")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser()
    p.add_argument("--once", action="store_true", help="Run one iteration then exit.")
    p.add_argument("--debug", action="store_true", help="Verbose logs.")
    p.add_argument("--loop", type=int, default=DEFAULT_LOOP_SECONDS, help="Loop interval in seconds when market open.")
    p.add_argument("--bot", type=str, default=os.getenv("RUNNER_BOT", "ema_trend"), help="Bot to run.")

    # ✅ clearer CLI toggle
    p.add_argument(
        "--no-respect-market-hours",
        action="store_true",
        help="If set, run bots even when US market is closed.",
    )
    return p


def main(
    *,
    argv: Optional[list[str]] = None,
    max_loops: Optional[int] = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> None:
    args = build_parser().parse_args(argv)

    # ✅ precedence:
    # 1) CLI flag (--no-respect-market-hours) forces False
    # 2) else env RUNNER_RESPECT_MARKET_HOURS controls it (default True)
    if args.no_respect_market_hours:
        respect_market_hours = False
    else:
        respect_market_hours = _env_bool("RUNNER_RESPECT_MARKET_HOURS", True)

    api = UStockAPI()
    print(
        f"[runner] API={api.base_url.rstrip('/')} loop={args.loop}s bot={args.bot} "
        f"respect_market_hours={respect_market_hours}"
    )

    backoff = 2.0
    max_backoff = 120.0
    loops = 0

    try:
        while True:
            if max_loops is not None and loops >= int(max_loops):
                return
            loops += 1

            try:
                if respect_market_hours:
                    opened = _gate_us_market(api, debug=args.debug, sleep_fn=sleep_fn)
                    if not opened:
                        if args.once:
                            return
                        continue

                intents = _run_selected_bot(api, args.bot)

                if args.debug:
                    n = 0 if intents is None else (len(intents) if hasattr(intents, "__len__") else 1)
                    print(f"[runner] intents: {n}")

                backoff = 2.0

                if args.once:
                    return

                _sleep(args.loop, sleep_fn=sleep_fn)

            except KeyboardInterrupt:
                raise
            except Exception as e:
                print(f"[runner] error: {type(e).__name__}: {e}")
                if args.once:
                    raise
                _sleep(backoff, sleep_fn=sleep_fn)
                backoff = min(max_backoff, backoff * 1.6)
    finally:
        try:
            api.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
