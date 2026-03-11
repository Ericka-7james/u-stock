# u-stock-bots/runner/main.py
from __future__ import annotations

"""Runner CLI entrypoint for U-Stock bots.

This module is the process entrypoint for launching the bot runner. It is
responsible for:

- loading local environment files for development usage
- parsing CLI arguments
- validating runtime configuration
- projecting CLI options into environment variables for the rest of the runner
  stack
- printing a small startup snapshot for debugging
- delegating execution to the orchestrator

Design notes:
    - Environment variables remain the single source of truth for downstream
      runner modules.
    - CLI arguments are translated into environment variables before the
      orchestrator starts.
    - Local dotenv loading is optional and can be disabled for production or
      containerized deployments.
"""

import argparse
import os
from pathlib import Path
from typing import Dict, Optional

from dotenv import load_dotenv

_THIS_FILE = Path(__file__).resolve()
_BOTS_ROOT = _THIS_FILE.parents[1]


def _env(name: str, default: str = "") -> str:
    """Returns a stripped environment variable value.

    Args:
        name: Environment variable name.
        default: Default value if the variable is missing.

    Returns:
        str: Trimmed environment variable value or the provided default.
    """
    return str(os.getenv(name, default) or "").strip()


def _env_int(name: str, default: int) -> int:
    """Returns an integer environment variable with fallback.

    Args:
        name: Environment variable name.
        default: Fallback integer value if parsing fails.

    Returns:
        int: Parsed integer value or the provided default.
    """
    raw = _env(name, "")
    if raw == "":
        return int(default)

    try:
        return int(raw)
    except Exception:
        return int(default)


def _load_env_files() -> None:
    """Loads runner dotenv files from the u-stock-bots root directory.

    Load order:
        1. .env
        2. .env.local

    Precedence rules:
        - Existing OS environment variables win over .env
        - .env.local overrides .env values loaded earlier
        - This behavior can be disabled entirely via RUNNER_LOAD_DOTENV=0

    Returns:
        None
    """
    if _env("RUNNER_LOAD_DOTENV", "1").lower() in {"0", "false"}:
        return

    load_dotenv(_BOTS_ROOT / ".env", override=False)
    load_dotenv(_BOTS_ROOT / ".env.local", override=True)


def build_parser() -> argparse.ArgumentParser:
    """Builds the runner CLI parser.

    Returns:
        argparse.ArgumentParser: Configured CLI parser.
    """
    parser = argparse.ArgumentParser("u-stock-bots runner")

    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one orchestrator loop then exit.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable verbose runner debug output.",
    )

    parser.add_argument(
        "--bot",
        type=str,
        default=_env("RUNNER_BOT_ID", "ema_trend"),
        help="Bot ID to run.",
    )
    parser.add_argument(
        "--loop",
        type=int,
        default=_env_int("RUNNER_LOOP_SECONDS", 5),
        help="Loop interval in seconds.",
    )

    parser.add_argument(
        "--no-respect-market-hours",
        action="store_true",
        help="Run even when US market is closed.",
    )

    parser.add_argument(
        "--scanner-limit",
        type=int,
        default=_env_int("OPPS_LIMIT", 12),
        help="Opportunities limit.",
    )
    parser.add_argument(
        "--scanner-ttl",
        type=int,
        default=_env_int("OPPS_CACHE_TTL", 30),
        help="Opportunities cache TTL in seconds.",
    )
    parser.add_argument(
        "--scanner-cache-bust",
        action="store_true",
        help="Bypass the opportunities cache for this run.",
    )
    parser.add_argument(
        "--scanner-path",
        type=str,
        default=_env("OPPS_PATH", "/api/opportunities"),
        help="Backend opportunities path.",
    )
    parser.add_argument(
        "--scanner-secret",
        type=str,
        default=_env("RUNNER_SHARED_SECRET") or _env("BOT_RUNNER_SECRET"),
        help="Runner shared secret for scanner/opportunities requests.",
    )

    return parser


def _validate_args(args: argparse.Namespace) -> None:
    """Validates parsed CLI arguments.

    Args:
        args: Parsed CLI arguments.

    Raises:
        SystemExit: If one or more arguments are invalid.

    Returns:
        None
    """
    if int(args.loop) < 1:
        raise SystemExit("--loop must be >= 1")

    if int(args.scanner_limit) < 1:
        raise SystemExit("--scanner-limit must be >= 1")

    if int(args.scanner_ttl) < 0:
        raise SystemExit("--scanner-ttl must be >= 0")

    if not str(args.bot or "").strip():
        raise SystemExit("--bot must not be empty")

    if not str(args.scanner_path or "").strip():
        raise SystemExit("--scanner-path must not be empty")


def _mask(value: str) -> str:
    """Masks a sensitive string for logging.

    Args:
        value: Raw sensitive value.

    Returns:
        str: Masked value.
    """
    text = str(value or "")
    if not text:
        return ""
    if len(text) <= 4:
        return "****"
    return text[:2] + "****" + text[-2:]


def _apply_runtime_env(args: argparse.Namespace) -> None:
    """Projects CLI arguments into environment variables.

    Downstream runner modules use environment variables as the single source of
    truth, so CLI arguments are normalized into env here before orchestration
    begins.

    Args:
        args: Parsed CLI arguments.

    Returns:
        None
    """
    os.environ["RUNNER_BOT_ID"] = str(args.bot).strip()
    os.environ["RUNNER_LOOP_SECONDS"] = str(int(args.loop))

    if args.no_respect_market_hours:
        os.environ["RUNNER_RESPECT_MARKET_HOURS"] = "0"
    else:
        os.environ.setdefault("RUNNER_RESPECT_MARKET_HOURS", "1")

    if args.debug:
        os.environ["RUNNER_DEBUG"] = "1"

    os.environ["OPPS_PATH"] = str(args.scanner_path).strip()
    os.environ["OPPS_LIMIT"] = str(int(args.scanner_limit))
    os.environ["OPPS_CACHE_TTL"] = str(int(args.scanner_ttl))
    os.environ["OPPS_CACHE_BUST"] = "1" if args.scanner_cache_bust else "0"

    if args.scanner_secret:
        secret = str(args.scanner_secret).strip()
        os.environ["RUNNER_SHARED_SECRET"] = secret
        os.environ["BOT_RUNNER_SECRET"] = secret


def _startup_snapshot() -> Dict[str, str]:
    """Builds a small masked startup configuration snapshot.

    Returns:
        Dict[str, str]: Runner startup snapshot suitable for debug printing.
    """
    return {
        "BOT_ID": _env("RUNNER_BOT_ID"),
        "LOOP_SECONDS": _env("RUNNER_LOOP_SECONDS"),
        "RESPECT_MARKET_HOURS": _env("RUNNER_RESPECT_MARKET_HOURS"),
        "OPPS_PATH": _env("OPPS_PATH"),
        "OPPS_LIMIT": _env("OPPS_LIMIT"),
        "OPPS_CACHE_TTL": _env("OPPS_CACHE_TTL"),
        "OPPS_CACHE_BUST": _env("OPPS_CACHE_BUST"),
        "RUNNER_SHARED_SECRET": _mask(_env("RUNNER_SHARED_SECRET") or _env("BOT_RUNNER_SECRET")),
    }


def _print_startup_snapshot() -> None:
    """Prints a minimal startup snapshot for debugging.

    Returns:
        None
    """
    snapshot = _startup_snapshot()
    print("Runner config:")
    for key, value in snapshot.items():
        print(f"  {key}={value}")


def main(argv: Optional[list[str]] = None) -> None:
    """Runs the runner CLI entrypoint.

    Args:
        argv: Optional CLI argument list. If omitted, argparse uses sys.argv.

    Returns:
        None
    """
    _load_env_files()

    args = build_parser().parse_args(argv)
    _validate_args(args)
    _apply_runtime_env(args)
    _print_startup_snapshot()

    from runner.orchestrator import main as orchestrator_main

    max_loops = 1 if args.once else None
    orchestrator_main(max_loops=max_loops)


if __name__ == "__main__":
    main()