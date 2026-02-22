# u-stock-bots/runner/main.py
from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


_THIS_FILE = Path(__file__).resolve()
_BOTS_ROOT = _THIS_FILE.parents[1]  # .../u-stock-bots


def _load_env_files() -> None:
    """
    Load runner env (.env then .env.local) from u-stock-bots root.
    Rule: OS env wins; .env.local overrides .env (but NOT OS env).
    """
    # Optional kill-switch for production/container deployments
    if str(os.getenv("RUNNER_LOAD_DOTENV", "1")).strip() in {"0", "false", "False"}:
        return

    load_dotenv(_BOTS_ROOT / ".env", override=False)
    load_dotenv(_BOTS_ROOT / ".env.local", override=True)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser("u-stock-bots runner")
    p.add_argument("--once", action="store_true", help="Run one loop then exit.")
    p.add_argument("--debug", action="store_true", help="Verbose logs (if supported by orchestrator).")

    p.add_argument("--bot", type=str, default=os.getenv("RUNNER_BOT_ID", "ema_trend"), help="Bot ID to run.")
    p.add_argument("--loop", type=int, default=int(os.getenv("RUNNER_LOOP_SECONDS", "5")), help="Loop interval seconds.")

    p.add_argument(
        "--no-respect-market-hours",
        action="store_true",
        help="If set, run even when US market is closed (sets RUNNER_RESPECT_MARKET_HOURS=0).",
    )

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


def _validate_args(args: argparse.Namespace) -> None:
    if int(args.loop) < 1:
        raise SystemExit("--loop must be >= 1")
    if int(args.scanner_limit) < 1:
        raise SystemExit("--scanner-limit must be >= 1")
    if int(args.scanner_ttl) < 0:
        raise SystemExit("--scanner-ttl must be >= 0")


def _mask(s: str) -> str:
    s = str(s or "")
    if not s:
        return ""
    if len(s) <= 4:
        return "****"
    return s[:2] + "****" + s[-2:]


def main(argv: Optional[list[str]] = None) -> None:
    _load_env_files()
    args = build_parser().parse_args(argv)
    _validate_args(args)

    # Env is the single source of truth for the rest of the runner stack.
    os.environ["RUNNER_BOT_ID"] = str(args.bot)
    os.environ["RUNNER_LOOP_SECONDS"] = str(int(args.loop))

    # Make default explicit for deterministic behavior
    if args.no_respect_market_hours:
        os.environ["RUNNER_RESPECT_MARKET_HOURS"] = "0"
    else:
        os.environ.setdefault("RUNNER_RESPECT_MARKET_HOURS", "1")

    # Optional debug flag surfaced to orchestrator/logger
    if args.debug:
        os.environ["RUNNER_DEBUG"] = "1"

    # Scanner env for scanner.py to consume
    os.environ["OPPS_PATH"] = str(args.scanner_path)
    os.environ["OPPS_LIMIT"] = str(int(args.scanner_limit))
    os.environ["OPPS_CACHE_TTL"] = str(int(args.scanner_ttl))
    os.environ["OPPS_CACHE_BUST"] = "1" if args.scanner_cache_bust else "0"
    if args.scanner_secret:
        os.environ["BOT_RUNNER_SECRET"] = str(args.scanner_secret)

    # Minimal startup snapshot for fast debugging
    print(
        "Runner config:",
        f"BOT_ID={os.environ.get('RUNNER_BOT_ID')}",
        f"LOOP_SECONDS={os.environ.get('RUNNER_LOOP_SECONDS')}",
        f"RESPECT_MARKET_HOURS={os.environ.get('RUNNER_RESPECT_MARKET_HOURS')}",
        f"OPPS_PATH={os.environ.get('OPPS_PATH')}",
        f"OPPS_LIMIT={os.environ.get('OPPS_LIMIT')}",
        f"OPPS_CACHE_TTL={os.environ.get('OPPS_CACHE_TTL')}",
        f"OPPS_CACHE_BUST={os.environ.get('OPPS_CACHE_BUST')}",
        f"BOT_RUNNER_SECRET={_mask(os.environ.get('BOT_RUNNER_SECRET', ''))}",
        sep="\n  ",
    )

    from runner.orchestrator import main as orchestrator_main

    max_loops = 1 if args.once else None
    orchestrator_main(max_loops=max_loops)


if __name__ == "__main__":
    main()