# u-stock-bots/bots/_shared/ustock_http.py
from __future__ import annotations

import os
from typing import Any, Dict, Optional
from urllib.parse import urljoin

import requests


class UStockAPI:
    """
    Lightweight HTTP client for the U-Stock API.

    Reads defaults from environment:
      - USTOCK_API_BASE (default http://localhost:8000)
      - BOT_RUNNER_SECRET (optional -> X-Bot-Runner-Secret header)
      - RUNNER_USER_ID (optional -> X-Runner-User-Id header)
    """

    def __init__(self, base_url: Optional[str] = None, timeout: int = 15):
        base = base_url or os.getenv("USTOCK_API_BASE") or "http://localhost:8000"
        self.base_url = base.rstrip("/") + "/"

        self.timeout = int(timeout)
        self.session = requests.Session()

        self.runner_secret = (os.getenv("BOT_RUNNER_SECRET") or "").strip()
        self.runner_user_id = (os.getenv("RUNNER_USER_ID") or "").strip()

    def close(self) -> None:
        """Close the underlying requests session."""
        self.session.close()

    def __enter__(self) -> "UStockAPI":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def _default_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {"accept": "application/json"}

        if self.runner_secret:
            headers["X-Bot-Runner-Secret"] = self.runner_secret
        if self.runner_user_id:
            headers["X-Runner-User-Id"] = self.runner_user_id

        return headers

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Any:
        url = urljoin(self.base_url, path.lstrip("/"))

        h = self._default_headers()
        if headers:
            h.update(headers)

        r = self.session.request(
            method=str(method).upper(),
            url=url,
            params=params,
            json=json,
            headers=h,
            timeout=self.timeout,
        )

        try:
            r.raise_for_status()
        except requests.HTTPError:
            body = (r.text or "")[:800]
            raise requests.HTTPError(
                f"{r.status_code} {r.reason} | {body}",
                response=r,
            )

        # Be resilient if API returns empty body or non-JSON.
        content_type = (r.headers.get("content-type") or "").lower()
        if "application/json" in content_type:
            return r.json()

        # If the server forgot content-type but body looks JSON-ish, try anyway.
        text = (r.text or "").strip()
        if text.startswith("{") or text.startswith("["):
            return r.json()

        return text

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        return self.request("GET", path, params=params)

    def post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Any:
        return self.request("POST", path, json=json)


