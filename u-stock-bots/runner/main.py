# u-stock-bots/runner/main.py
from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# ------------------------------------------------------------
# Load runner env (.env then .env.local) from u-stock-bots root.
# Rule: OS env wins; .env.local overrides .env (but NOT OS env).
# ------------------------------------------------------------
_THIS_FILE = Path(__file__).resolve()  # .../u-stock-bots/runner/main.py
_BOTS_ROOT = _THIS_FILE.parents[1]  # .../u-stock-bots

# Load base first (no override)
load_dotenv(_BOTS_ROOT / ".env", override=False)
# Allow .env.local to override .env (but not OS env)
load_dotenv(_BOTS_ROOT / ".env.local", override=True)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser("u-stock-bots runner")
    p.add_argument("--once", action="store_true", help="Run one loop then exit.")
    p.add_argument("--debug", action="store_true", help="Verbose logs (if supported by orchestrator).")

    # Keep these args so your workflow doesn’t change, but orchestrator owns behavior.
    p.add_argument("--bot", type=str, default=os.getenv("RUNNER_BOT_ID", "ema_trend"), help="Bot ID to run.")
    p.add_argument("--loop", type=int, default=int(os.getenv("RUNNER_LOOP_SECONDS", "5")), help="Loop interval seconds.")

    p.add_argument(
        "--no-respect-market-hours",
        action="store_true",
        help="If set, run even when US market is closed (sets RUNNER_RESPECT_MARKET_HOURS=0).",
    )

    # Scanner controls (passed via env so orchestrator/scanner can read consistently)
    p.add_argument("--scanner-limit", type=int, default=int(os.getenv("OPPS_LIMIT", "12")), help="Opportunities limit.")
    p.add_argument("--scanner-ttl", type=int, default=int(os.getenv("OPPS_CACHE_TTL", "30")), help="Opportunities cache TTL.")
    p.add_argument(
        "--scanner-cache-bust",
        action="store_true",
        help="If set, bypass cache for opportunities fetch (sets OPPS_CACHE_BUST=1).",
    )
    p.add_argument(
        "--scanner-path",
        type=str,
        default=os.getenv("OPPS_PATH", "/api/opportunities"),
        help="Backend opportunities path.",
    )
    p.add_argument(
        "--scanner-secret",
        type=str,
        default=os.getenv("BOT_RUNNER_SECRET", ""),
        help="Runner secret for opportunities endpoint (optional).",
    )

    return p


def main(argv: Optional[list[str]] = None) -> None:
    args = build_parser().parse_args(argv)

    # Keep env as the single source of truth for the rest of the runner stack.
    os.environ["RUNNER_BOT_ID"] = str(args.bot)
    os.environ["RUNNER_LOOP_SECONDS"] = str(int(args.loop))

    if args.no_respect_market_hours:
        os.environ["RUNNER_RESPECT_MARKET_HOURS"] = "0"

    # Scanner env for scanner.py to consume
    os.environ["OPPS_PATH"] = str(args.scanner_path)
    os.environ["OPPS_LIMIT"] = str(int(args.scanner_limit))
    os.environ["OPPS_CACHE_TTL"] = str(int(args.scanner_ttl))
    os.environ["OPPS_CACHE_BUST"] = "1" if args.scanner_cache_bust else "0"
    if args.scanner_secret:
        os.environ["BOT_RUNNER_SECRET"] = str(args.scanner_secret)

    # Import after env load so orchestrator sees final env values.
    from runner.orchestrator import main as orchestrator_main

    # One loop vs infinite.
    max_loops = 1 if args.once else None

    # Orchestrator already supports injecting sleep_fn for tests; CLI just runs it.
    orchestrator_main(max_loops=max_loops)


if __name__ == "__main__":
    main()
