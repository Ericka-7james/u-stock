from __future__ import annotations

import os
from typing import Any, Dict, Optional
from urllib.parse import urljoin

import requests
from dotenv import load_dotenv, find_dotenv

# Load nearest .env (bot repo)
load_dotenv(find_dotenv(), override=False)

class UStockAPI:
    def __init__(self, base_url: Optional[str] = None, timeout: int = 15):
        self.base_url = (
            base_url
            or os.getenv("USTOCK_API_BASE")
            or "http://localhost:8000"
        ).rstrip("/") + "/"

        self.timeout = timeout
        self.session = requests.Session()

        self.runner_secret = (os.getenv("BOT_RUNNER_SECRET") or "").strip()
        self.runner_user_id = (os.getenv("RUNNER_USER_ID") or "").strip()

    def _default_headers(self) -> Dict[str, str]:
        headers = {"accept": "application/json"}

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
            method=method.upper(),
            url=url,
            params=params,
            json=json,
            headers=h,
            timeout=self.timeout,
        )

        try:
            r.raise_for_status()
        except requests.HTTPError:
            raise requests.HTTPError(
                f"{r.status_code} {r.reason} | {r.text[:800]}",
                response=r,
            )

        return r.json()

    def get(self, path: str, params: Optional[Dict[str, Any]] = None):
        return self.request("GET", path, params=params)
