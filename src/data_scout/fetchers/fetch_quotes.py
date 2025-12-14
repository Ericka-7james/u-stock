from __future__ import annotations

from typing import Any, Dict, List

from yahooquery import Ticker

from data_scout.tickers.universe import load_us_universe_symbols
from data_scout.fetchers._snapshot_utils import (
    SnapshotSpec,
    build_snapshot_wrapper,
    env_int,
    snapshot_is_fresh,
    snapshot_path,
    write_json,
    chunked,
)

# Quotes can refresh faster; if you only run at open once per day, 1440 is fine.
MAX_QUOTES_AGE_MINUTES = env_int("MAX_QUOTES_AGE_MINUTES", 60)
QUOTES_BATCH_SIZE = env_int("QUOTES_BATCH_SIZE", 400)


def pick_keys(source: Dict[str, Any], keys: List[str]) -> Dict[str, Any]:
    if not isinstance(source, dict):
        return {}
    return {k: source.get(k) for k in keys if k in source}


def main() -> None:
    out = snapshot_path("quotes")
    if snapshot_is_fresh(out, MAX_QUOTES_AGE_MINUTES):
        print(f"[quotes] Snapshot is fresh (<={MAX_QUOTES_AGE_MINUTES} min). Skipping.")
        return

    universe = load_us_universe_symbols()
    symbols = universe[:500]  # strongly recommend not doing full universe for quotes yet
    print(f"[quotes] Fetching quotes for {len(symbols)} symbols")

    quotes: Dict[str, Any] = {}

    for idx, batch in enumerate(chunked(symbols, QUOTES_BATCH_SIZE), start=1):
        print(f"[quotes] Batch {idx} — {len(batch)} symbols")
        try:
            t = Ticker(batch)
            price = t.price or {}
            summary = t.summary_detail or {}
        except Exception as e:
            print(f"[quotes] ERROR fetching batch {idx}: {e}")
            continue

        if isinstance(price, dict):
            for sym in batch:
                p = price.get(sym, {}) if isinstance(price.get(sym, {}), dict) else {}
                s = summary.get(sym, {}) if isinstance(summary.get(sym, {}), dict) else {}
                quotes[sym] = {
                    **pick_keys(
                        p,
                        [
                            "regularMarketPrice",
                            "regularMarketTime",
                            "regularMarketChange",
                            "regularMarketChangePercent",
                            "regularMarketPreviousClose",
                            "regularMarketOpen",
                            "regularMarketDayHigh",
                            "regularMarketDayLow",
                            "marketCap",
                            "currency",
                            "exchangeName",
                        ],
                    ),
                    **pick_keys(
                        s,
                        [
                            "bid",
                            "ask",
                            "bidSize",
                            "askSize",
                            "regularMarketVolume",
                            "averageVolume",
                            "averageDailyVolume10Day",
                        ],
                    ),
                }

    spec = SnapshotSpec(dataset="quotes")
    wrapper = build_snapshot_wrapper(
        spec=spec,
        symbols=sorted(quotes.keys()),
        data_key="quotes",
        data=quotes,
        meta={"note": "Quotes can be delayed on free Yahoo sources. Upgrade to Polygon/Alpaca for true live."},
    )
    write_json(out, wrapper)
    print(f"[quotes] Saved JSON snapshot → {out}")


if __name__ == "__main__":
    main()
