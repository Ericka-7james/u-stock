# api/clients/alpaca_client.py
import os
import requests
from typing import List, Dict, Any

ALPACA_DATA_BASE_URL = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip()

def alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
    }

def latest_quotes(symbols: List[str], api_key: str, api_secret: str, feed: str = "sip") -> Dict[str, Any]:
    url = f"{ALPACA_DATA_BASE_URL}/v2/stocks/quotes/latest"
    params = {"symbols": ",".join(symbols), "feed": feed}
    r = requests.get(url, params=params, headers=alpaca_headers(api_key, api_secret), timeout=8)
    if r.status_code >= 400 and feed != "iex":
        params["feed"] = "iex"
        r = requests.get(url, params=params, headers=alpaca_headers(api_key, api_secret), timeout=8)
    r.raise_for_status()
    return r.json()

def recent_trades(symbol: str, api_key: str, api_secret: str, limit: int = 50, feed: str = "sip") -> Dict[str, Any]:
    url = f"{ALPACA_DATA_BASE_URL}/v2/stocks/{symbol}/trades"
    params = {"limit": limit, "feed": feed}
    r = requests.get(url, params=params, headers=alpaca_headers(api_key, api_secret), timeout=8)
    if r.status_code >= 400 and feed != "iex":
        params["feed"] = "iex"
        r = requests.get(url, params=params, headers=alpaca_headers(api_key, api_secret), timeout=8)
    r.raise_for_status()
    return r.json()
