from __future__ import annotations

import os
import time
from typing import Dict, Any

from bots._shared.ustock_http import UStockAPI


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def now_epoch() -> int:
    return int(time.time())


class RunnerTokenManager:
    def __init__(self) -> None:
        self.runner_id = _env("RUNNER_ID")
        self.shared_secret = _env("RUNNER_SHARED_SECRET")
        self._token: str = ""
        self._exp_epoch: int = 0

    def is_configured(self) -> bool:
        return bool(self.runner_id and self.shared_secret)

    def _needs_refresh(self) -> bool:
        if not self._token or self._exp_epoch <= 0:
            return True
        return now_epoch() >= (self._exp_epoch - 60)

    def get_token(self, api: UStockAPI) -> str:
        if not self.is_configured():
            raise RuntimeError("Set RUNNER_ID and RUNNER_SHARED_SECRET on the runner.")

        if not self._needs_refresh():
            return self._token

        data = api.post(
            "/runner/token",  # will normalize to /api/runner/token
            json={"runner_id": self.runner_id},
            headers={"X-Runner-Secret": self.shared_secret},
        )
        if not isinstance(data, dict) or not data.get("token"):
            raise RuntimeError(f"Failed to mint runner token: {data}")

        tok = str(data.get("token") or "").strip()
        expires_in = int(data.get("expires_in") or 0)
        if not tok or expires_in <= 0:
            raise RuntimeError("Bad runner token response")

        self._token = tok
        self._exp_epoch = now_epoch() + expires_in
        return self._token
