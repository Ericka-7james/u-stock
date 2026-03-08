# u-stock-bots/runner/main.py
from __future__ import annotations

import os
import time
import traceback

from bots._shared.http import UStockAPI


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default


def main():
    api_base = os.getenv("USTOCK_API_BASE", "http://127.0.0.1:8000").rstrip("/")
    loop_sleep = _env_int("USTOCK_LOOP_SLEEP", 15)
    bot_id = os.getenv("USTOCK_BOT_ID", "ema_trend").strip()  # keep your default

    api = UStockAPI(base_url=api_base, timeout=20)

    print(f"[runner] API={api_base} loop={loop_sleep}s bot={bot_id}")

    while True:
        try:
            # 1) get symbols universe (runner endpoint)
            opp = api.get("/api/opportunities", params={"limit": 12})
            symbols = (opp or {}).get("symbols") or []
            if not symbols:
                print("[runner] opportunities empty; sleeping")
                time.sleep(loop_sleep)
                continue

            # 2) pull bars for each symbol (EMA bot needs this)
            # NOTE: this assumes your backend supports runner auth via BOT_RUNNER_SECRET
            for sym in symbols[:12]:
                bars = api.get(
                    "/api/market/us/bars",
                    params={"symbol": sym, "timeframe": "15Min", "limit": 100, "feed": "sip"},
                )
                # minimal sanity print
                ohlc = (bars or {}).get("bars") or {}
                closes = ohlc.get("c") or []
                if closes:
                    print(f"[runner] bars {sym} ok (n={len(closes)}) last_c={closes[-1]}")
                else:
                    print(f"[runner] bars {sym} returned no data")

            time.sleep(loop_sleep)

        except KeyboardInterrupt:
            print("[runner] stopped by user")
            break
        except Exception as e:
            print(f"[runner] error: {type(e).__name__}: {e}")
            print(traceback.format_exc(limit=6))
            time.sleep(2)


if __name__ == "__main__":
    main()
