# src/data_scout/symbols.py
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Iterable, Set, List

PACKAGE_ROOT = Path(__file__).resolve().parent
SYMBOLS_CSV = PACKAGE_ROOT / "resources" / "us_tickers.csv"


@lru_cache(maxsize=1)
def load_symbol_universe() -> Set[str]:
    """
    Load the universe of valid tickers from us_tickers.csv.

    Expected schema (at minimum):
        symbol,exchange,name
    """
    symbols: Set[str] = set()

    if not SYMBOLS_CSV.exists():
        # Fail soft: no filter if file missing (you can tighten later)
        print(f"[symbols] WARNING: {SYMBOLS_CSV} not found, symbol validation disabled.")
        return symbols

    with SYMBOLS_CSV.open("r", encoding="utf-8") as f:
        first = True
        for line in f:
            line = line.strip()
            if not line:
                continue
            if first:
                # skip header
                first = False
                continue
            # naive CSV split; good enough for simple file
            parts = line.split(",")
            if not parts:
                continue
            sym = parts[0].strip()
            if sym:
                symbols.add(sym.upper())

    print(f"[symbols] Loaded {len(symbols)} symbols from {SYMBOLS_CSV}")
    return symbols


def is_valid_symbol(sym: str) -> bool:
    """
    Check if a symbol is in the loaded universe.
    """
    if not sym:
        return False
    universe = load_symbol_universe()
    if not universe:
        # If universe is empty, treat everything as valid for now
        return True
    return sym.upper() in universe


def filter_valid_symbols(candidates: Iterable[str]) -> List[str]:
    """
    Filter an iterable of candidate tickers down to valid symbols.
    """
    universe = load_symbol_universe()
    if not universe:
        # No universe loaded → return unique uppercase candidates
        return sorted({c.upper() for c in candidates if c})

    result: Set[str] = set()
    for c in candidates:
        if not c:
            continue
        sym = c.upper()
        if sym in universe:
            result.add(sym)
    return sorted(result)
