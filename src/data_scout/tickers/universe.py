# src/data_scout/tickers/universe.py

from __future__ import annotations

import io
from pathlib import Path
from typing import List, Set, Tuple

import pandas as pd
import requests

# ---------- CONSTANTS ---------------------------------------------------------

# Official NASDAQ Trader listing feeds
NASDAQ_LISTED_URL = "https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED_URL = "https://ftp.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"

# Wikipedia index lists
SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
NASDAQ100_URL = "https://en.wikipedia.org/wiki/Nasdaq-100"
DOW30_URL = "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average"


# ---------- PATH HELPERS ------------------------------------------------------


def get_project_root() -> Path:
    """
    Locate the repo root.

    This assumes this file lives at:
      <repo>/src/data_scout/tickers/universe.py

    parents[0] = tickers
    parents[1] = data_scout
    parents[2] = src
    parents[3] = repo root   <-- we want this
    """
    return Path(__file__).resolve().parents[3]


def tickers_root() -> Path:
    """
    Base directory for all ticker-related data.
    """
    root = get_project_root()
    base = root / "data" / "tickers"
    base.mkdir(parents=True, exist_ok=True)
    return base


def nasdaq_trader_dir() -> Path:
    path = tickers_root() / "nasdaq_trader"
    path.mkdir(parents=True, exist_ok=True)
    return path


def wiki_dir() -> Path:
    path = tickers_root() / "wiki"
    path.mkdir(parents=True, exist_ok=True)
    return path


def universe_dir() -> Path:
    path = tickers_root() / "universe"
    path.mkdir(parents=True, exist_ok=True)
    return path


# ---------- NASDAQ TRADER DOWNLOAD + CLEAN ------------------------------------

def _download_text(url: str) -> str:
    """
    Small helper: download a text file in memory.

    We call this at bootstrap time only, *not* during every ETL run.
    """
    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        raise RuntimeError(f"Failed to download {url}: {e}") from e


def download_nasdaq_trader_files(force: bool = False) -> Tuple[Path, Path]:
    """
    Download nasdaqlisted.txt and otherlisted.txt into data/tickers/nasdaq_trader.

    If force=False and files already exist, they are reused.
    """
    out_dir = nasdaq_trader_dir()
    nasdaq_path = out_dir / "nasdaqlisted.txt"
    other_path = out_dir / "otherlisted.txt"

    if not nasdaq_path.exists() or force:
        txt = _download_text(NASDAQ_LISTED_URL)
        nasdaq_path.write_text(txt, encoding="utf-8")

    if not other_path.exists() or force:
        txt = _download_text(OTHER_LISTED_URL)
        other_path.write_text(txt, encoding="utf-8")

    return nasdaq_path, other_path


def _read_nasdaq_file(path: Path) -> pd.DataFrame:
    """
    Read a NASDAQ Trader txt file (pipe-separated).
    The last line is a footer ("File Creation Time ...") which we drop.
    """
    text = path.read_text(encoding="utf-8")
    # Drop last line (footer)
    lines = text.strip().splitlines()
    if len(lines) > 1 and "File Creation Time" in lines[-1]:
        text = "\n".join(lines[:-1])

    df = pd.read_csv(io.StringIO(text), sep="|")
    return df


def build_us_tickers_from_nasdaq_trader() -> pd.DataFrame:
    """
    Merge nasdaqlisted + otherlisted, filter out test issues and junk,
    and write a clean Parquet file:

      data/tickers/nasdaq_trader/us_tickers_nasdaq_trader.parquet

    Returns the cleaned DataFrame.
    """
    nasdaq_path, other_path = download_nasdaq_trader_files(force=False)

    df_nasdaq = _read_nasdaq_file(nasdaq_path)
    df_other = _read_nasdaq_file(other_path)

    df = pd.concat([df_nasdaq, df_other], ignore_index=True)

    # Normalize symbol column name
    if "Symbol" in df.columns:
        df.rename(columns={"Symbol": "symbol"}, inplace=True)

    # Basic cleaning: drop test issues, blanks, and NaNs
    if "Test Issue" in df.columns:
        df = df[df["Test Issue"] != "Y"]

    # Some feeds mark ETFs; keep them for now (they're still valid tickers),
    # but you could filter ETFs out here if you ever want *equities-only*.
    df = df[df["symbol"].notna()]
    df["symbol"] = df["symbol"].astype(str).str.strip().str.upper()
    df = df[df["symbol"] != ""]

    # Drop obvious duplicates
    df = df.drop_duplicates(subset=["symbol"])

    out_path = nasdaq_trader_dir() / "us_tickers_nasdaq_trader.parquet"
    df.to_parquet(out_path, index=False)

    return df


# ---------- WIKIPEDIA INDEX HELPERS -------------------------------------------


def _fetch_wiki_table(url: str, symbol_column: str, index_name: str) -> pd.DataFrame:
    """
    Fetch a table from Wikipedia and return a DataFrame with:
      - symbol
      - index_name
    """
    tables = pd.read_html(url)
    if not tables:
        raise RuntimeError(f"No tables found at {url}")

    df = tables[0]

    if symbol_column not in df.columns:
        # Some tables use slightly different headers; raise clearly
        raise KeyError(
            f"Expected column '{symbol_column}' in first table at {url}, "
            f"got columns={list(df.columns)}"
        )

    out = pd.DataFrame(
        {
            "symbol": df[symbol_column].astype(str).str.strip().str.upper(),
            "index_name": index_name,
        }
    )

    out = out[out["symbol"] != ""].drop_duplicates(subset=["symbol"])

    wiki_path = wiki_dir() / f"{index_name}.parquet"
    out.to_parquet(wiki_path, index=False)

    return out


def build_wiki_index_files() -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Build Parquet files for S&P 500, NASDAQ 100, and Dow 30:

      data/tickers/wiki/sp500.parquet
      data/tickers/wiki/nasdaq100.parquet
      data/tickers/wiki/dow30.parquet
    """
    sp500 = _fetch_wiki_table(SP500_URL, "Symbol", "sp500")
    nasdaq100 = _fetch_wiki_table(NASDAQ100_URL, "Ticker", "nasdaq100")
    dow30 = _fetch_wiki_table(DOW30_URL, "Symbol", "dow30")

    return sp500, nasdaq100, dow30


# ---------- FINAL UNIVERSE ASSEMBLY -------------------------------------------

def _minimal_fallback_universe() -> pd.DataFrame:
    """
    Last-resort fallback if both NASDAQ Trader and Wikipedia are unavailable.

    Provides a small, hardcoded universe of well-known tickers so that
    the rest of the ETL can still function in offline / restricted-network
    environments.
    """
    fallback_symbols = [
        "AAPL",
        "MSFT",
        "GOOGL",
        "AMZN",
        "META",
        "TSLA",
        "NVDA",
        "SPY",
        "QQQ",
        "VTI",
    ]

    df = pd.DataFrame({"symbol": fallback_symbols})
    df["symbol"] = df["symbol"].astype(str).str.upper()

    out_path = universe_dir() / "us_equities_universe.parquet"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_path, index=False)

    print(
        f"[universe] Using minimal hardcoded fallback universe ({len(df)} symbols).",
        flush=True,
    )
    return df

def build_us_equities_universe() -> pd.DataFrame:
    """
    Combine NASDAQ Trader universe with WIKI indices to produce a clean,
    deduplicated symbol list:

      data/tickers/universe/us_equities_universe.parquet

    This is the file your ETL should read for "all valid tickers".
    """

    # -------------------------------
    # 1) Try NASDAQ Trader as base
    # -------------------------------
    try:
        df_us = build_us_tickers_from_nasdaq_trader()
    except Exception as e_nasdaq:
        print(
            f"[universe] Warning: failed to build NASDAQ Trader universe: {e_nasdaq}",
            flush=True,
        )
        print(
            "[universe] Falling back to wiki-only universe (S&P 500 + Nasdaq 100 + Dow 30)…",
            flush=True,
        )
        # If NASDAQ fails, we *try* wiki; if that also fails we go to minimal fallback.
        try:
            sp500, nasdaq100, dow30 = build_wiki_index_files()
            df_universe = pd.concat([sp500, nasdaq100, dow30], ignore_index=True)
            df_universe = df_universe.drop_duplicates(subset=["symbol"]).copy()
            df_universe["symbol"] = df_universe["symbol"].astype(str).str.upper()

            out_path = universe_dir() / "us_equities_universe.parquet"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            df_universe.to_parquet(out_path, index=False)
            return df_universe
        except Exception as e_wiki:
            print(
                f"[universe] Warning: wiki index fetch also failed: {e_wiki}",
                flush=True,
            )
            print(
                "[universe] Falling back to minimal hardcoded ticker universe…",
                flush=True,
            )
            return _minimal_fallback_universe()

    # If we got here, NASDAQ succeeded and df_us exists.

    # -------------------------------
    # 2) Try to enrich with wiki indices
    # -------------------------------
    try:
        sp500, nasdaq100, dow30 = build_wiki_index_files()

        wiki_syms: Set[str] = set(sp500["symbol"]) | set(nasdaq100["symbol"]) | set(
            dow30["symbol"]
        )

        df_us["symbol"] = df_us["symbol"].astype(str).str.upper()
        base_syms: Set[str] = set(df_us["symbol"])

        missing = wiki_syms - base_syms
        if missing:
            df_missing = pd.DataFrame({"symbol": sorted(missing)})
            df_us = pd.concat([df_us, df_missing], ignore_index=True)

        df_universe = df_us.drop_duplicates(subset=["symbol"]).copy()
        df_universe["symbol"] = df_universe["symbol"].astype(str).str.upper()

        out_path = universe_dir() / "us_equities_universe.parquet"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        df_universe.to_parquet(out_path, index=False)
        return df_universe

    except Exception as e_wiki:
        # Wiki failed, but we still have NASDAQ base; that's good enough.
        print(
            f"[universe] Warning: wiki index fetch failed, using NASDAQ-only universe: {e_wiki}",
            flush=True,
        )
        df_universe = df_us.drop_duplicates(subset=["symbol"]).copy()
        df_universe["symbol"] = df_universe["symbol"].astype(str).str.upper()

        out_path = universe_dir() / "us_equities_universe.parquet"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        df_universe.to_parquet(out_path, index=False)
        return df_universe


# ---------- FAST LOADERS FOR THE REST OF THE APP ------------------------------


def load_us_universe_symbols() -> List[str]:
    """
    Fast loader: returns a list of symbols from the canonical universe parquet.

    Use this if you just need a "universe list" to loop over or present.
    """
    path = universe_dir() / "us_equities_universe.parquet"
    df = pd.read_parquet(path, columns=["symbol"])
    return df["symbol"].tolist()


def load_us_universe_set() -> Set[str]:
    """
    Fast loader for membership checks:

      if symbol in load_us_universe_set():
          ...
    """
    return set(load_us_universe_symbols())


# ---------- CLI ENTRYPOINT ----------------------------------------------------


# ---------- CLI ENTRYPOINT ----------------------------------------------------


def main() -> None:
    """
    Bootstrap / refresh the entire ticker universe.

    This is designed to be run manually or as an npm script, not on every
    ETL run.
    """
    print("[universe] Rebuilding US equities universe from NASDAQ Trader + Wikipedia…", flush=True)

    df_universe = build_us_equities_universe()
    print(f"[universe] Universe size: {len(df_universe):,} symbols", flush=True)

    unique_exchanges = (
        df_universe["Listing Exchange"].dropna().unique()
        if "Listing Exchange" in df_universe.columns
        else []
    )
    print(f"[universe] Exchanges in universe: {list(unique_exchanges)}", flush=True)


if __name__ == "__main__":
    print("[universe] __main__ entrypoint reached", flush=True)
    main()
