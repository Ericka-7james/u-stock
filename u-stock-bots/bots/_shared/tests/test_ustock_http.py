from __future__ import annotations

from typing import Any, Dict, Optional
from unittest.mock import MagicMock

import pytest
import requests

from bots._shared.ustock_http import UStockAPI


class FakeResponse:
    def __init__(
        self,
        *,
        status_code: int = 200,
        reason: str = "OK",
        text: str = "",
        headers: Optional[Dict[str, str]] = None,
        json_obj: Any = None,
    ) -> None:
        self.status_code = status_code
        self.reason = reason
        self.text = text
        self.headers = headers or {}
        self._json_obj = json_obj

    def json(self) -> Any:
        if self._json_obj is not None:
            return self._json_obj
        # simulate requests behavior if body isn't valid json
        raise ValueError("No JSON")

    def raise_for_status(self) -> None:
        if not (200 <= int(self.status_code) < 300):
            raise requests.HTTPError(f"{self.status_code} {self.reason}", response=self)


def test_base_url_normalization() -> None:
    api = UStockAPI(base_url="http://localhost:8000")
    assert api.base_url == "http://localhost:8000/"

    api2 = UStockAPI(base_url="http://localhost:8000/")
    assert api2.base_url == "http://localhost:8000/"


def test_default_headers_include_accept(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BOT_RUNNER_SECRET", raising=False)
    monkeypatch.delenv("RUNNER_USER_ID", raising=False)

    api = UStockAPI(base_url="http://x")
    h = api._default_headers()
    assert h["accept"] == "application/json"
    assert "X-Bot-Runner-Secret" not in h
    assert "X-Runner-User-Id" not in h


def test_default_headers_include_runner_headers_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BOT_RUNNER_SECRET", "shhh")
    monkeypatch.setenv("RUNNER_USER_ID", "user_123")

    api = UStockAPI(base_url="http://x")
    h = api._default_headers()
    assert h["X-Bot-Runner-Secret"] == "shhh"
    assert h["X-Runner-User-Id"] == "user_123"


def test_request_builds_url_and_passes_params_json_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    api = UStockAPI(base_url="http://localhost:8000", timeout=9)

    captured: Dict[str, Any] = {}

    def fake_request(*, method, url, params, json, headers, timeout):
        captured["method"] = method
        captured["url"] = url
        captured["params"] = params
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return FakeResponse(headers={"content-type": "application/json"}, json_obj={"ok": True})

    api.session.request = fake_request  # type: ignore

    out = api.request(
        "POST",
        "/api/test",
        params={"a": 1},
        json={"x": "y"},
        headers={"X-Test": "1"},
    )

    assert out == {"ok": True}
    assert captured["method"] == "POST"
    assert captured["url"] == "http://localhost:8000/api/test"
    assert captured["params"] == {"a": 1}
    assert captured["json"] == {"x": "y"}
    assert captured["timeout"] == 9
    assert captured["headers"]["accept"] == "application/json"
    assert captured["headers"]["X-Test"] == "1"


def test_request_parses_json_when_content_type_json() -> None:
    api = UStockAPI(base_url="http://x")

    api.session.request = lambda **kwargs: FakeResponse(  # type: ignore
        headers={"content-type": "application/json; charset=utf-8"},
        json_obj={"hello": "world"},
    )
    assert api.get("/api/ok") == {"hello": "world"}


def test_request_attempts_json_when_content_type_missing_but_body_looks_json() -> None:
    api = UStockAPI(base_url="http://x")

    api.session.request = lambda **kwargs: FakeResponse(  # type: ignore
        headers={},
        text='{"a":1}',
        json_obj={"a": 1},
    )
    assert api.get("/api/ok") == {"a": 1}


def test_request_returns_text_when_not_json() -> None:
    api = UStockAPI(base_url="http://x")

    api.session.request = lambda **kwargs: FakeResponse(  # type: ignore
        headers={"content-type": "text/plain"},
        text="OK",
    )
    assert api.get("/api/text") == "OK"


def test_request_raises_http_error_with_truncated_body() -> None:
    api = UStockAPI(base_url="http://x")

    big_body = "X" * 2000
    api.session.request = lambda **kwargs: FakeResponse(  # type: ignore
        status_code=500,
        reason="Server Error",
        text=big_body,
        headers={"content-type": "text/plain"},
    )

    with pytest.raises(requests.HTTPError) as ei:
        api.get("/api/fail")

    msg = str(ei.value)
    assert "500" in msg
    assert "Server Error" in msg
    # UStockAPI truncates to 800 chars
    assert len(msg) < 1200


def test_close_closes_underlying_session() -> None:
    api = UStockAPI(base_url="http://x")
    api.session = MagicMock()
    api.close()
    api.session.close.assert_called_once()
