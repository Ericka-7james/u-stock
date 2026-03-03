from __future__ import annotations

import argparse

from runner.backtest.backtest_api import BacktestAPI, BacktestSpec


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", required=True)
    ap.add_argument("--tf", required=True, help="Example: 1Min, 5Min, 15Min, 1Hour, 1Day")
    ap.add_argument("--start", required=True, help="YYYY-MM-DD or ISO")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD or ISO")
    ap.add_argument("--feed", default=None)
    args = ap.parse_args()

    spec = BacktestSpec(
        provider="alpaca",
        symbol=args.symbol,
        tf=args.tf,
        start=args.start,
        end=args.end,
        feed=args.feed,
    )
    api = BacktestAPI(spec=spec, cache_root=".cache/bars")
    print("OK. Dataset ready. Max index:", api.max_index())


if __name__ == "__main__":
    main()