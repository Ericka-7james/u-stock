from __future__ import annotations

import time
from dataclasses import asdict

from bots._shared.config import RunnerConfig
from bots._shared.http import UStockAPI

from bots.ema_trend.bot import run as ema_trend_run
from bots.logging.journal import Journal

# Phase 2 executor placeholder (won't actually hit TradeStation yet)
from bots.execution.tradestation import TradeStationExecutor


def main() -> None:
    cfg = RunnerConfig()
    api = UStockAPI()
    journal = Journal(path="logs/journal.ndjson")
    executor = TradeStationExecutor()

    print(f"[runner] API={cfg.api_base} loop={cfg.loop_sleep_seconds}s bot=ema_trend")

    # Optional: basic "gate" check (if your backend route exists)
    def gate_ok() -> bool:
        try:
            g = api.get("/api/bot-runner/gate")
            return bool(g.get("ok", True))
        except Exception:
            # If gate endpoint doesn't exist yet, don't block local testing
            return True

    while True:
        try:
            if not gate_ok():
                print("[runner] gate blocked - sleeping")
                time.sleep(cfg.loop_sleep_seconds)
                continue

            intents = ema_trend_run(api)

            if intents:
                print(f"[ema_trend] intents={len(intents)}")
            else:
                print("[ema_trend] intents=0")

            for intent in intents:
                # 1) log intent
                journal.log_intent(intent)

                # 2) Phase 2 placeholder: "submit" bracket order
                # NOTE: This currently returns SIM result until we wire real TradeStation API.
                result = executor.place_bracket(intent)
                journal.log_order(intent, asdict(result))

                print(
                    f"[order] {intent.symbol} {intent.side} "
                    f"entry={intent.entry} stop={intent.stop} tp={intent.take_profit} "
                    f"conf={intent.confidence} status={result.status}"
                )

            time.sleep(cfg.loop_sleep_seconds)

        except KeyboardInterrupt:
            print("\n[runner] stopped by user")
            return
        except Exception as e:
            print(f"[runner] error: {e}")
            time.sleep(cfg.loop_sleep_seconds)


if __name__ == "__main__":
    main()
