# u-stock-bots/runner/backtest/backtest_api.py
from __future__ import annotations

import gzip
import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, Union

BarArray = Union[List[float], List[str]]


def _ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def _parse_tf(tf: str) -> Tuple[int, str]:
    s = str(tf or "").strip()
    if not s:
        return (1, "minute")
    s = s.lower()
    s = s.replace("minutes", "min").replace("minute", "min")
    s = s.replace("hours", "hour").replace("hrs", "hour").replace("hr", "hour")
    s = s.replace("days", "day")

    n = ""
    for ch in s:
        if ch.isdigit():
            n += ch
        else:
            break
    mult = int(n) if n else 1
    rest = s[len(n) :]

    if "min" in rest:
        return (mult, "minute")
    if "hour" in rest:
        return (mult, "hour")
    if "day" in rest:
        return (mult, "day")
    return (mult, "minute")


@dataclass(frozen=True)
class BacktestSpec:
    provider: str  # 'alpaca'
    symbol: str
    tf: str
    start: str  # ISO or YYYY-MM-DD
    end: str    # ISO or YYYY-MM-DD
    feed: Optional[str] = None


class BacktestAPI:
    """
    Adapter used by bots/_shared/data/fetch.fetch_bars via api.get_bars(...).

    Stores bars in array-form:
      {"t":[...], "o":[...], "h":[...], "l":[...], "c":[...], "v":[...]}
    """

    def __init__(self, *, spec: BacktestSpec, cache_root: str = ".cache/bars") -> None:
        self.spec = spec
        self.cache_root = cache_root
        self._bars: Optional[Dict[str, BarArray]] = None
        self._cursor: int = -1  # inclusive index into arrays (end-of-window)
        self._load_or_fetch()

    # ---------- Cursor control ----------
    def set_cursor(self, idx: int) -> None:
        self._cursor = int(idx)

    def set_ready_cursor(self, *, warmup: int) -> int:
        """
        Convenience: set cursor to at least warmup-1 (and within bounds).
        For EMA/rules, you'll usually do warmup ~ max(limit_bias, limit_entry) - 1.
        """
        w = max(1, int(warmup))
        self._cursor = min(self.max_index(), w - 1)
        return self._cursor

    def advance(self, step: int = 1) -> int:
        self._cursor = min(self.max_index(), self._cursor + int(step))
        return self._cursor

    def max_index(self) -> int:
        b = self._bars or {}
        closes = b.get("c") or []
        n = len(closes) if isinstance(closes, list) else 0
        return max(-1, n - 1)

    def ready(self) -> bool:
        return self._bars is not None and self.max_index() >= 1

    # ---------- Called by fetch_bars ----------
    def get_bars(
        self,
        *,
        symbol: str,
        tf: str,
        limit: int = 200,
        feed: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        if not self.ready():
            return None

        symbol = str(symbol or "").strip().upper()
        if symbol != str(self.spec.symbol).strip().upper():
            return None

        tf = str(tf or "").strip()
        if tf != str(self.spec.tf).strip():
            return None

        end = int(self._cursor)
        if end < 1:
            return None

        limit = max(1, int(limit or 200))
        start = max(0, end - limit + 1)

        src = self._bars or {}
        return {
            "t": (src.get("t") or [])[start : end + 1],
            "o": (src.get("o") or [])[start : end + 1],
            "h": (src.get("h") or [])[start : end + 1],
            "l": (src.get("l") or [])[start : end + 1],
            "c": (src.get("c") or [])[start : end + 1],
            "v": (src.get("v") or [])[start : end + 1],
        }

    # ---------- Cache ----------
    def _cache_path(self) -> str:
        sym = str(self.spec.symbol).strip().upper()
        tf = str(self.spec.tf).strip()
        prov = str(self.spec.provider).strip().lower()
        start = str(self.spec.start).replace(":", "").replace("/", "-")
        end = str(self.spec.end).replace(":", "").replace("/", "-")
        base = os.path.join(self.cache_root, prov, sym, tf)
        _ensure_dir(base)
        return os.path.join(base, f"{start}__{end}.json.gz")

    def _load_or_fetch(self) -> None:
        p = self._cache_path()
        if os.path.exists(p):
            self._bars = self._read_gz_json(p)
            # leave cursor at -1; runner decides warmup
            self._cursor = -1
            return

        prov = str(self.spec.provider or "").lower().strip()
        if prov != "alpaca":
            raise RuntimeError(f"Provider '{prov}' not implemented yet (expected 'alpaca').")

        from runner.backtest.providers.alpaca_bars import fetch_stock_bars_arrays

        bars = fetch_stock_bars_arrays(
            symbol=self.spec.symbol,
            timeframe=self.spec.tf,
            start=self.spec.start,
            end=self.spec.end,
            feed=self.spec.feed,
        )

        self.write_cache(bars)
        self._bars = bars
        self._cursor = -1

    def _read_gz_json(self, path: str) -> Dict[str, Any]:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)

    def write_cache(self, bars: Dict[str, Any]) -> str:
        p = self._cache_path()
        _ensure_dir(os.path.dirname(p))
        with gzip.open(p, "wt", encoding="utf-8") as f:
            json.dump(bars, f)
        return p