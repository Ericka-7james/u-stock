# u-stock-bots/bots/_shared/http.py
from __future__ import annotations

import os
from typing import Any, Dict, Optional
import requests

BOT_RUNNER_HEADER = "X-Bot-Runner-Secret"


def _base_headers() -> Dict[str, str]:
    h: Dict[str, str] = {"accept": "application/json"}
    secret = os.getenv("BOT_RUNNER_SECRET", "").strip()
    if secret:
        h[BOT_RUNNER_HEADER] = secret
    return h


def get_json(url: str, params: Optional[Dict[str, Any]] = None, timeout: int = 15) -> Dict[str, Any]:
    r = requests.get(url, params=params, headers=_base_headers(), timeout=timeout)
    r.raise_for_status()
    return r.json()


def post_json(url: str, payload: Dict[str, Any], timeout: int = 15) -> Dict[str, Any]:
    r = requests.post(url, json=payload, headers=_base_headers(), timeout=timeout)
    r.raise_for_status()
    return r.json()


class UStockAPI:
    """
    Thin API client used by runner + bots.

    - Uses USTOCK_API_BASE (default http://127.0.0.1:8000)
    - Automatically attaches X-Bot-Runner-Secret if BOT_RUNNER_SECRET exists
    - Raises for HTTP errors (requests.raise_for_status)
    """

    def __init__(self, base_url: Optional[str] = None, timeout: int = 15):
        self.base_url = (base_url or os.getenv("USTOCK_API_BASE", "http://127.0.0.1:8000")).rstrip("/")
        self.timeout = timeout

    def _url(self, path: str) -> str:
        p = path if path.startswith("/") else f"/{path}"
        return f"{self.base_url}{p}"

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = self._url(path)
        r = requests.get(url, params=params, headers=_base_headers(), timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = self._url(path)
        r = requests.post(url, json=payload, headers=_base_headers(), timeout=self.timeout)
        r.raise_for_status()
        return r.json()
