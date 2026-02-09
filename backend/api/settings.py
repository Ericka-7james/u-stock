# u-stock-bots/runner/settings.py
from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _env_bool(name: str, default: bool = False) -> bool:
    v = _env(name, "")
    if not v:
        return bool(default)
    return v.lower() in ("1", "true", "t", "yes", "y", "on")


def _env_int(name: str, default: int) -> int:
    v = _env(name, "")
    try:
        return int(v)
    except Exception:
        return int(default)


@dataclass(frozen=True)
class RunnerSettings:
    # Backend API
    api_base: str

    # Runner identity / auth
    bot_id: str
    runner_id: str
    runner_user_id: str
    runner_shared_secret: str

    # Loop behavior
    loop_seconds: int
    heartbeat_every_seconds: int
    respect_market_hours: bool

    # Execution / mode
    executor: str
    mode: str

    # Logging / output
    log_level: str
    output_dir: str

    @staticmethod
    def load() -> "RunnerSettings":
        bot_id = _env("RUNNER_BOT_ID", "ema_trend")

        runner_id = _env("RUNNER_ID", "") or _env("RUNNER_DEVICE_ID", "") or bot_id or "local-runner"
        runner_user_id = _env("RUNNER_USER_ID", "") or _env("USTOCK_USER_ID", "")

        return RunnerSettings(
            api_base=_env("USTOCK_API_BASE", "http://127.0.0.1:8000").rstrip("/"),
            bot_id=bot_id,
            runner_id=runner_id,
            runner_user_id=runner_user_id,
            runner_shared_secret=_env("RUNNER_SHARED_SECRET", ""),

            loop_seconds=_env_int("RUNNER_LOOP_SECONDS", 5),
            heartbeat_every_seconds=_env_int("RUNNER_HEARTBEAT_EVERY_SECONDS", 10),
            respect_market_hours=_env_bool("RUNNER_RESPECT_MARKET_HOURS", True),

            executor=_env("RUNNER_EXECUTOR", "paper"),
            mode=_env("MODE", "paper").lower().strip() or "paper",

            log_level=_env("LOG_LEVEL", "INFO"),
            output_dir=_env("OUTPUT_DIR", "src/output"),
        )
