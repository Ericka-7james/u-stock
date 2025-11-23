"""
Helpers for loading and validating ticker symbols.

- load_symbol_universe(): raw tickers from us_tickers.csv
- load_clean_symbol_universe(): cleaned & normalized tickers
- is_valid_symbol(): validate against raw universe
- filter_valid_symbols(): validate against a given universe
- load_ticker_set_for_mentions(): small filtered set for Reddit/News
- delisted tracking: add_delisted_symbol(), load_delisted_symbols()
"""

from __future__ import annotations
import json
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Set, List, Optional
from datetime import datetime, timezone

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SYMBOLS_CSV = PROJECT_ROOT / "src" / "data_scout" / "resources" / "us_tickers.csv"


# ---------------------------------------------------------
# Raw Symbol Universe
# ---------------------------------------------------------

@lru_cache(maxsize=1)
def load_symbol_universe() -> Set[str]:
    if not SYMBOLS_CSV.exists():
        print(f"[symbols] WARNING: Missing {SYMBOLS_CSV}")
        return set()

    universe = set()
    with SYMBOLS_CSV.open("r", encoding="utf-8") as f:
        _header = f.readline()
        for line in f:
            sym = line.strip()
            if sym:
                universe.add(sym.upper())
    return universe


def is_valid_symbol(sym: str) -> bool:
    if not sym:
        return False
    return sym.upper() in load_symbol_universe()


def filter_valid_symbols(
    candidates: Iterable[str],
    universe: Set[str] | None = None,
) -> List[str]:
    norm = {c.upper().strip() for c in candidates if c and c.strip()}
    if not norm:
        return []

    if universe is None:
        universe = load_symbol_universe()

    return sorted(sym for sym in norm if sym in universe)


# ---------------------------------------------------------
# Cleaning / Normalization
# ---------------------------------------------------------

DOT_SUFFIXES = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")


def normalize_vendor_symbol(raw: str) -> Optional[str]:
    """Standardize vendor-style tickers:
       - Remove leading $
       - AAPL.U → AAPL-U
       - BRK.B → BRK-B
       - ABR$D → ABR-D
    """
    if not raw:
        return None

    s = raw.strip().upper()

    if s in {"SYMBOL", "ACT SYMBOL", ".", ""}:
        return None

    if s.startswith("$"):
        s = s[1:]

    if "$" in s:
        parts = [p for p in s.split("$") if p]
        if len(parts) == 2:
            return f"{parts[0]}-{parts[1]}"
        return None

    if "." in s:
        left, right = s.split(".", 1)
        if right in DOT_SUFFIXES:
            return f"{left}-{right}"
        return None

    return s


@lru_cache(maxsize=1)
def load_clean_symbol_universe() -> Set[str]:
    raw = load_symbol_universe()
    cleaned = set()

    for r in raw:
        norm = normalize_vendor_symbol(r)
        if norm:
            cleaned.add(norm)

    print(f"[symbols] Cleaned symbol universe: {len(cleaned)} / {len(raw)}")
    return cleaned


# ---------------------------------------------------------
# Delisted Symbol Tracking
# ---------------------------------------------------------

DELISTED_FILE = PROJECT_ROOT / "public" / "data" / "meta" / "delisted.json"


def load_delisted_symbols() -> Set[str]:
    if not DELISTED_FILE.exists():
        return set()

    try:
        with DELISTED_FILE.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        return set()

    return {s.upper().strip() for s in payload.get("symbols", []) if s}


def add_delisted_symbol(sym: str) -> None:
    sym = sym.upper().strip()
    if not sym:
        return

    current = load_delisted_symbols()
    if sym in current:
        return

    current.add(sym)
    DELISTED_FILE.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "symbols": sorted(list(current)),
    }

    with DELISTED_FILE.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"[symbols] Marked delisted: {sym}")


# ---------------------------------------------------------
# Mentions ticker universe (News/Reddit)
# ---------------------------------------------------------

MENTION_INPUT_FILES = [
    PROJECT_ROOT / "public" / "data" / "raw" / "prices.json",
    PROJECT_ROOT / "public" / "data" / "raw" / "fundamentals.json",
]


def _load_universe_from_snapshot(path: Path) -> Set[str]:
    if not path.exists():
        return set()

    try:
        with path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        return set()

    raw = payload.get("universe", [])
    return {t.strip().upper() for t in raw if t}


@lru_cache(maxsize=1)
def load_ticker_set_for_mentions() -> Set[str]:
    combined = set()

    for path in MENTION_INPUT_FILES:
        u = _load_universe_from_snapshot(path)
        combined |= u

    if not combined:
        print("[symbols] Mentions ticker set empty")
        return set()

    cleaned = load_clean_symbol_universe()
    delisted = load_delisted_symbols()

    valid = {t for t in combined if t in cleaned and t not in delisted}

    print(f"[symbols] Mentions ticker set: {len(valid)} valid")
    return valid
