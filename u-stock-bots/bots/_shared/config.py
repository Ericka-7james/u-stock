from dataclasses import dataclass
import os

@dataclass(frozen=True)
class RunnerConfig:
    api_base: str = os.getenv("USTOCK_API_BASE", "http://127.0.0.1:8000")
    bot_token: str = os.getenv("USTOCK_BOT_TOKEN", "")
    loop_sleep_seconds: int = int(os.getenv("USTOCK_LOOP_SLEEP", "15"))
