# src/data_scout/tickers/universe.py

from __future__ import annotations

import io
from pathlib import Path
from typing import List, Set, Tuple

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------- CONSTANTS ---------------------------------------------------------

# Official NASDAQ Trader listing feeds – try these in order for nasdaqlisted.txt
NASDAQ_TRADER_URLS = [
    # Primary (often more reliable)
    "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    "https://nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    # Original ftp host as a last resort
    "https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
]

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
    """
    Directory for raw NASDAQ Trader files.
    """
    path = tickers_root() / "nasdaq_trader"
    path.mkdir(parents=True, exist_ok=True)
    return path


def wiki_dir() -> Path:
    """
    Directory for wiki-derived index components.
    """
    path = tickers_root() / "wiki"
    path.mkdir(parents=True, exist_ok=True)
    return path


def universe_dir() -> Path:
    """
    Directory for final universe parquet(s).
    """
    path = tickers_root() / "universe"
    path.mkdir(parents=True, exist_ok=True)
    return path


# ---------- NASDAQ TRADER DOWNLOAD + CLEAN ------------------------------------


def _build_session() -> requests.Session:
    """
    Build a requests Session with retry logic.
    """
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=1.5,  # 0s, 1.5s, 3s…
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def _download_text(url: str) -> str:
    """
    Download a text file (with retries) and return its contents.

    This is called at bootstrap time only, not on every ETL run.
    """
    session = _build_session()
    try:
        resp = session.get(url, timeout=10)  # shorter timeout per try
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        raise RuntimeError(f"Failed to download {url}: {e}") from e


def _download_first_ok(urls: list[str]) -> str:
    """
    Try a list of URLs in order, using _download_text for each.

    Returns the first successful response text.
    Raises RuntimeError if all URLs fail.
    """
    last_error: Exception | None = None

    for url in urls:
        try:
            print(f"[universe] Trying NASDAQ feed: {url}", flush=True)
            return _download_text(url)
        except Exception as exc:
            last_error = exc
            print(
                f"[universe] Failed to download from {url}: {exc}",
                flush=True,
            )

    # If we reach here, all URLs failed
    raise RuntimeError(
        f"Failed to download NASDAQ Trader listing from all URLs. Last error: {last_error}"
    )


def download_nasdaq_trader_file(force: bool = False) -> Path:
    """
    Download nasdaqlisted.txt into data/tickers/nasdaq_trader.

    If force=False and the file already exists, it is reused.

    We try multiple NASDAQ_TRADER_URLS before giving up.
    """
    out_dir = nasdaq_trader_dir()
    nasdaq_path = out_dir / "nasdaqlisted.txt"

    if not nasdaq_path.exists() or force:
        txt = _download_first_ok(NASDAQ_TRADER_URLS)
        nasdaq_path.write_text(txt, encoding="utf-8")

    return nasdaq_path


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
    Build a US tickers universe from NASDAQ Trader's nasdaqlisted.txt only,
    clean it, and write Parquet:

      data/tickers/nasdaq_trader/us_tickers_nasdaq_trader.parquet

    Returns the cleaned DataFrame.
    """
    nasdaq_path = download_nasdaq_trader_file(force=False)

    df = _read_nasdaq_file(nasdaq_path)

    # Normalize symbol column name
    if "Symbol" in df.columns:
        df = df.rename(columns={"Symbol": "symbol"})

    # Basic cleaning: drop test issues, blanks, and NaNs
    if "Test Issue" in df.columns:
        df = df[df["Test Issue"] != "Y"]

    df = df[df["symbol"].notna()]
    df["symbol"] = df["symbol"].astype(str).str.strip().str.upper()
    df = df[df["symbol"] != ""]

    # Drop obvious duplicates
    df = df.drop_duplicates(subset=["symbol"])

    df["source"] = "nasdaq"

    out_path = nasdaq_trader_dir() / "us_tickers_nasdaq_trader.parquet"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_path, index=False)

    return df


# ---------- WIKIPEDIA INDEX HELPERS -------------------------------------------


def _fetch_wiki_html(url: str) -> str:
    """
    Fetch raw HTML from Wikipedia with a browser-like User-Agent
    so that pandas.read_html doesn't get a 403.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0 Safari/537.36"
        )
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        raise RuntimeError(f"Failed to fetch Wikipedia page {url}: {e}") from e


def _fetch_wiki_table(url: str, symbol_column: str, index_name: str) -> pd.DataFrame:
    """
    Fetch a table from Wikipedia and return a DataFrame with:
      - symbol
      - index_name
    """
    html = _fetch_wiki_html(url)

    # Wrap in StringIO to avoid FutureWarning about "literal html"
    tables = pd.read_html(io.StringIO(html))
    if not tables:
        raise RuntimeError(f"No tables found at {url}")

    # Find the first table that actually has the expected symbol_column
    df = None
    for tbl in tables:
        if symbol_column in tbl.columns:
            df = tbl
            break

    if df is None:
        all_columns = [list(t.columns) for t in tables]
        raise KeyError(
            f"Expected column '{symbol_column}' in one of the tables at {url}, "
            f"but found columns={all_columns}"
        )

    out = pd.DataFrame(
        {
            "symbol": df[symbol_column].astype(str).str.strip().str.upper(),
            "index_name": index_name,
        }
    )

    out = out[out["symbol"] != ""].drop_duplicates(subset=["symbol"])
    out["source"] = f"wiki:{index_name}"

    wiki_path = wiki_dir() / f"{index_name}.parquet"
    wiki_path.parent.mkdir(parents=True, exist_ok=True)
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
    df["source"] = "fallback:hardcoded"
    df_universe = df_us.sort_values("source").drop_duplicates(subset=["symbol"], keep="first").copy()

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
    """

    # 1) Try NASDAQ Trader as base
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

    # 2) Enrich NASDAQ base with wiki indices (if possible)
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
    """
    path = universe_dir() / "us_equities_universe.parquet"
    df = pd.read_parquet(path, columns=["symbol"])
    return df["symbol"].tolist()


def load_us_universe_set() -> Set[str]:
    """
    Fast loader for membership checks.
    """
    return set(load_us_universe_symbols())


# ---------- CLI ENTRYPOINT ----------------------------------------------------


def main() -> None:
    print("[universe] Rebuilding US equities universe from NASDAQ Trader + Wikipedia…", flush=True)

    df_universe = build_us_equities_universe()
    print(f"[universe] Universe size: {len(df_universe):,} symbols", flush=True)

    # Print preview
    print("\n[universe] First 5 rows:")
    print(df_universe.head().to_string(index=False))

    print("\n[universe] Columns:")
    print(df_universe.columns.tolist())

if __name__ == "__main__":
    print("[universe] __main__ entrypoint reached", flush=True)
    main()
