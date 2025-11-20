"""
data_scout/update_symbols.py

Download the official US symbol list from Nasdaq Trader
and write it to data_scout/resources/us_tickers.csv.

Usage:

    PYTHONPATH=src python -m data_scout.update_symbols
"""

from __future__ import annotations

from pathlib import Path
import requests

# Nasdaq Trader symbol directory
NASDAQ_URLS = [
    "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RESOURCES_DIR = PROJECT_ROOT / "src" / "data_scout" / "resources"
OUTPUT = RESOURCES_DIR / "us_tickers.csv"


def download_symbols() -> None:
    all_syms: set[str] = set()

    for url in NASDAQ_URLS:
        print(f"[symbols] downloading {url}")
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()

        for line in resp.text.splitlines():
            if "|" not in line:
                continue

            sym = line.split("|", 1)[0].strip()

            # Skip header/footer lines
            if not sym or sym.lower() in {"symbol", "file creation time"}:
                continue

            all_syms.add(sym)

    RESOURCES_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        f.write("symbol\n")
        for sym in sorted(all_syms):
            f.write(sym + "\n")

    print(f"[symbols] wrote {len(all_syms)} symbols → {OUTPUT}")


def main() -> None:
    download_symbols()


if __name__ == "__main__":
    main()
