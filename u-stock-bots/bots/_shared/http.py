# u-stock-bots/bots/_shared/http.py
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urljoin

import requests
from dotenv import load_dotenv

# Load env from repo root or current folder
# This makes it reliable whether you run from u-stock-bots/ or elsewhere.
HERE = Path(__file__).resolve()
BOTS_ROOT = HERE.parents[2]  # u-stock-bots/
load_dotenv(BOTS_ROOT / ".env.local", override=True)
load_dotenv(BOTS_ROOT / ".env", override=False)



class UStockAPI:
    """
    Thin HTTP client for the u-stock backend.

    Runner auth:
      - BOT_RUNNER_SECRET (required)
      - RUNNER_USER_ID or BOT_RUNNER_USER_ID (required)

    Sends:
      - X-Bot-Runner-Secret
      - X-Runner-User-Id
    """

    def __init__(self, base_url: Optional[str] = None, timeout: int = 15):
        self.base_url = (
            (base_url or os.getenv("USTOCK_API_BASE") or os.getenv("USTOCK_API_URL") or "http://127.0.0.1:8000")
            .rstrip("/")
            + "/"
        )
        self.timeout = timeout
        self.session = requests.Session()

        self.runner_secret = (os.getenv("BOT_RUNNER_SECRET") or os.getenv("RUNNER_SECRET") or "").strip()

        # accept either env name so you don't get stuck on naming
        self.runner_user_id = (
            (os.getenv("RUNNER_USER_ID") or os.getenv("BOT_RUNNER_USER_ID") or os.getenv("BOT_RUNNER_USER") or "").strip()
        )

    def _default_headers(self) -> Dict[str, str]:
        h: Dict[str, str] = {"accept": "application/json"}

        if self.runner_secret:
            h["X-Bot-Runner-Secret"] = self.runner_secret

        # Runner auth REQUIRES a user id to scope operations to a user
        if self.runner_user_id:
            h["X-Runner-User-Id"] = self.runner_user_id

        return h

    def _merge_headers(self, headers: Optional[Dict[str, str]]) -> Dict[str, str]:
        out = self._default_headers()
        if headers:
            out.update({k: str(v) for k, v in headers.items()})
        return out

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        data: Any = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Any:
        url = urljoin(self.base_url, path.lstrip("/"))
        h = self._merge_headers(headers)

        r = self.session.request(
            method.upper(),
            url,
            params=params,
            json=json,
            data=data,
            headers=h,
            timeout=self.timeout,
        )

        try:
            r.raise_for_status()
        except requests.HTTPError as e:
            msg = f"{e} | url={url} | body={r.text[:800]}"
            raise requests.HTTPError(msg, response=r) from None

        # Try json; fall back to text
        try:
            return r.json()
        except Exception:
            return {"ok": True, "text": r.text}

    def get(self, path: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Any:
        return self.request("GET", path, params=params, headers=headers)

    def post(
        self,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        data: Any = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Any:
        return self.request("POST", path, params=None, json=json, data=data, headers=headers)
