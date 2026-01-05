# api/clients/alpaca_client.py
import os
import requests
from typing import Any, Dict, List, Optional


ALPACA_DATA_BASE_URL = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip()


def alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    # client layer should NOT import your security module
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
    }


def _request_json(
    method: str,
    url: str,
    headers: Dict[str, str],
    params: Optional[Dict[str, Any]] = None,
    timeout_sec: int = 12,
) -> Dict[str, Any]:
    r = requests.request(method, url, headers=headers, params=params, timeout=timeout_sec)
    if r.status_code >= 400:
        raise RuntimeError(f"alpaca_http_error {r.status_code}: {r.text}")
    return r.json() or {}


# -------------------------
# Bars
# -------------------------
def stock_bars(
    symbol: str,
    api_key: str,
    api_secret: str,
    timeframe: str = "1Day",
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 200,
    adjustment: str = "raw",
    feed: str = "sip",
    base_url: Optional[str] = None,
    timeout_sec: int = 12,
) -> Dict[str, Any]:
    """
    Alpaca Market Data (stocks) v2:
      GET /v2/stocks/{symbol}/bars
    """
    base = (base_url or ALPACA_DATA_BASE_URL).strip()
    sym = (symbol or "").upper().strip()
    if not sym:
        raise ValueError("symbol is required")

    url = f"{base}/v2/stocks/{sym}/bars"
    params: Dict[str, Any] = {
        "timeframe": timeframe,
        "limit": int(limit),
        "adjustment": adjustment,
        "feed": feed,
    }
    if start:
        params["start"] = start
    if end:
        params["end"] = end

    headers = alpaca_headers(api_key, api_secret)

    r = requests.get(url, params=params, headers=headers, timeout=timeout_sec)

    # Fallback if SIP not allowed
    if r.status_code >= 400 and feed != "iex":
        params["feed"] = "iex"
        r = requests.get(url, params=params, headers=headers, timeout=timeout_sec)

    if r.status_code >= 400:
        raise RuntimeError(f"alpaca_stock_bars_error {r.status_code}: {r.text}")

    payload = r.json() or {}
    payload.setdefault("meta", {})
    payload["meta"]["feed_used"] = params.get("feed")
    payload["meta"]["adjustment"] = adjustment
    return payload


def crypto_bars(
    symbols: List[str],
    api_key: str,
    api_secret: str,
    timeframe: str = "1Day",
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 200,
    base_url: Optional[str] = None,
    timeout_sec: int = 12,
) -> Dict[str, Any]:
    """
    Alpaca Market Data (crypto) v1beta3:
      GET /v1beta3/crypto/us/bars?symbols=BTC/USD,ETH/USD&timeframe=1Day...
    """
    base = (base_url or ALPACA_DATA_BASE_URL).strip()
    syms = [str(s).upper().strip() for s in (symbols or []) if str(s).strip()]
    if not syms:
        raise ValueError("symbols is required (ex: ['BTC/USD'])")

    url = f"{base}/v1beta3/crypto/us/bars"
    params: Dict[str, Any] = {
        "symbols": ",".join(syms),
        "timeframe": timeframe,
        "limit": int(limit),
    }
    if start:
        params["start"] = start
    if end:
        params["end"] = end

    headers = alpaca_headers(api_key, api_secret)
    r = requests.get(url, params=params, headers=headers, timeout=timeout_sec)

    if r.status_code >= 400:
        raise RuntimeError(f"alpaca_crypto_bars_error {r.status_code}: {r.text}")

    return r.json() or {}


# -------------------------
# Quotes / Trades (used by market_us.py)
# -------------------------
def latest_quotes(
    symbols: List[str],
    api_key: str,
    api_secret: str,
    feed: str = "sip",
    base_url: Optional[str] = None,
    timeout_sec: int = 12,
) -> Dict[str, Any]:
    """
    Latest quotes for multiple symbols:
      GET /v2/stocks/quotes/latest?symbols=AAPL,MSFT&feed=sip

    Returns JSON like:
      {"quotes": {"AAPL": {...}, "MSFT": {...}}, "meta": {...}}
    """
    base = (base_url or ALPACA_DATA_BASE_URL).strip()
    syms = [str(s).upper().strip() for s in (symbols or []) if str(s).strip()]
    if not syms:
        raise ValueError("symbols is required")

    url = f"{base}/v2/stocks/quotes/latest"
    headers = alpaca_headers(api_key, api_secret)
    params: Dict[str, Any] = {"symbols": ",".join(syms), "feed": feed}

    r = requests.get(url, params=params, headers=headers, timeout=timeout_sec)

    # Fallback SIP -> IEX
    if r.status_code >= 400 and feed != "iex":
        params["feed"] = "iex"
        r = requests.get(url, params=params, headers=headers, timeout=timeout_sec)

    if r.status_code >= 400:
        raise RuntimeError(f"alpaca_latest_quotes_error {r.status_code}: {r.text}")

    payload = r.json() or {}
    payload.setdefault("meta", {})
    payload["meta"]["feed_used"] = params.get("feed")
    return payload


def recent_trades(
    symbols: List[str],
    api_key: str,
    api_secret: str,
    limit: int = 50,
    feed: str = "sip",
    base_url: Optional[str] = None,
    timeout_sec: int = 12,
) -> Dict[str, Any]:
    """
    Recent trades for multiple symbols:
      GET /v2/stocks/trades?symbols=AAPL,MSFT&limit=50&feed=sip

    Returns JSON like:
      {"trades": {"AAPL": [...], "MSFT": [...]}, "next_page_token": "...", "meta": {...}}
    """
    base = (base_url or ALPACA_DATA_BASE_URL).strip()
    syms = [str(s).upper().strip() for s in (symbols or []) if str(s).strip()]
    if not syms:
        raise ValueError("symbols is required")

    url = f"{base}/v2/stocks/trades"
    headers = alpaca_headers(api_key, api_secret)
    params: Dict[str, Any] = {"symbols": ",".join(syms), "limit": int(limit), "feed": feed}

    r = requests.get(url, params=params, headers=headers, timeout=timeout_sec)

    # Fallback SIP -> IEX
    if r.status_code >= 400 and feed != "iex":
        params["feed"] = "iex"
        r = requests.get(url, params=params, headers=headers, timeout=timeout_sec)

    if r.status_code >= 400:
        raise RuntimeError(f"alpaca_recent_trades_error {r.status_code}: {r.text}")

    payload = r.json() or {}
    payload.setdefault("meta", {})
    payload["meta"]["feed_used"] = params.get("feed")
    return payload
