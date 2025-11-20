"""
data_scout/symbols.py

Helpers for loading and validating ticker symbols.

- load_symbol_universe(): set of all valid tickers from us_tickers.csv
- is_valid_symbol(sym): True/False
- filter_valid_symbols(iterable): keep only valid tickers
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Iterable, Set, List


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SYMBOLS_CSV = PROJECT_ROOT / "src" / "data_scout" / "resources" / "us_tickers.csv"


@lru_cache(maxsize=1)
def load_symbol_universe() -> Set[str]:
    """
    Load the official US symbol universe from us_tickers.csv.

    Returns an UPPERCASE set of tickers.
    If the CSV is missing, returns an empty set (callers can fallback).
    """
    if not SYMBOLS_CSV.exists():
        print(f"[symbols] WARNING: {SYMBOLS_CSV} does not exist. "
              "Run `python -m data_scout.update_symbols` to download.")
        return set()

    universe: Set[str] = set()
    with SYMBOLS_CSV.open("r", encoding="utf-8") as f:
        # Skip header
        header = f.readline()
        for line in f:
            sym = line.strip()
            if sym:
                universe.add(sym.upper())
    return universe


def is_valid_symbol(sym: str) -> bool:
    """
    Check whether `sym` is in the loaded symbol universe.
    """
    if not sym:
        return False
    return sym.upper() in load_symbol_universe()


def filter_valid_symbols(symbols: Iterable[str]) -> List[str]:
    """
    Keep only valid symbols from an iterable.
    """
    uni = load_symbol_universe()
    return [s.upper() for s in symbols if s and s.upper() in uni]
