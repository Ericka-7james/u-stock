# u-stock-bots/bots/_shared/tests/test_http.py
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
import requests

from bots._shared.ustock_http import UStockAPI


class DummyResponse:
    def __init__(
        self,
        *,
        status_code: int = 200,
        reason: str = "OK",
        text: str = "",
        json_value=None,
        headers=None,
        raise_for_status_exc: Exception | None = None,
    ):
        self.status_code = status_code
        self.reason = reason
        self.text = text
        self._json_value = json_value
        self.headers = headers or {"content-type": "application/json"}
        self._raise_for_status_exc = raise_for_status_exc

    def raise_for_status(self):
        if self._raise_for_status_exc is not None:
            raise self._raise_for_status_exc

    def json(self):
        return self._json_value


def test_base_url_normalization_env(monkeypatch):
    monkeypatch.setenv("USTOCK_API_BASE", "http://localhost:8000/")
    api = UStockAPI()
    assert api.base_url == "http://localhost:8000/"
    api.close()


def test_default_headers_include_runner_auth_and_dev_secret(monkeypatch):
    # ✅ new behavior: bearer token preferred + optional dev secret
    monkeypatch.setenv("RUNNER_TOKEN", "runner-token-abc")
    monkeypatch.setenv("BOT_RUNNER_SECRET", "secret123")

    api = UStockAPI(base_url="http://example.com")

    h = api._default_headers()
    assert h["accept"] == "application/json"
    assert h["Authorization"] == "Bearer runner-token-abc"
    assert h["X-Bot-Runner-Secret"] == "secret123"

    api.close()


def test_default_headers_work_with_dev_secret_only(monkeypatch):
    # ✅ no bearer token => only dev secret is sent
    monkeypatch.delenv("RUNNER_TOKEN", raising=False)
    monkeypatch.delenv("BOT_RUNNER_TOKEN", raising=False)
    monkeypatch.setenv("BOT_RUNNER_SECRET", "secret123")

    api = UStockAPI(base_url="http://example.com")

    h = api._default_headers()
    assert h["accept"] == "application/json"
    assert "Authorization" not in h
    assert h["X-Bot-Runner-Secret"] == "secret123"

    api.close()


def test_request_calls_session_request_with_expected_args():
    # IMPORTANT: base_url should NOT include "/api" because UStockAPI adds "/api" itself.
    api = UStockAPI(base_url="http://example.com", timeout=12)

    mocked = MagicMock()
    api.session.request = mocked

    resp = DummyResponse(json_value={"ok": True})
    mocked.return_value = resp

    out = api.request(
        "get",
        "/v1/ping",
        params={"a": 1},
        json={"b": 2},
        headers={"X-Test": "1"},
    )

    assert out == {"ok": True}

    # Validate call
    assert mocked.call_count == 1
    _, kwargs = mocked.call_args
    assert kwargs["method"] == "GET"
    assert kwargs["url"] == "http://example.com/api/v1/ping"
    assert kwargs["params"] == {"a": 1}
    assert kwargs["json"] == {"b": 2}
    assert kwargs["timeout"] == 12
    assert kwargs["headers"]["accept"] == "application/json"
    assert kwargs["headers"]["X-Test"] == "1"

    api.close()


def test_http_error_message_includes_status_reason_and_truncated_body():
    api = UStockAPI(base_url="http://example.com")

    mocked = MagicMock()
    api.session.request = mocked

    body = "x" * 2000  # ensure truncation to 800
    http_err = requests.HTTPError("boom")

    resp = DummyResponse(
        status_code=500,
        reason="Server Error",
        text=body,
        raise_for_status_exc=http_err,
        headers={"content-type": "text/plain"},
    )
    mocked.return_value = resp

    with pytest.raises(requests.HTTPError) as e:
        api.request("GET", "/fail")

    msg = str(e.value)
    assert "500 Server Error" in msg
    assert "| " in msg
    assert len(msg.split("| ", 1)[1]) <= 800  # truncated body segment

    api.close()


def test_non_json_content_type_returns_text():
    api = UStockAPI(base_url="http://example.com")

    mocked = MagicMock()
    api.session.request = mocked

    resp = DummyResponse(
        text="plain text ok",
        headers={"content-type": "text/plain"},
        json_value={"should_not": "be_used"},
    )
    mocked.return_value = resp

    out = api.request("GET", "/text")
    assert out == "plain text ok"

    api.close()


def test_json_like_text_without_json_content_type_still_parses_json():
    api = UStockAPI(base_url="http://example.com")

    mocked = MagicMock()
    api.session.request = mocked

    resp = DummyResponse(
        text='{"ok": true}',
        headers={"content-type": "text/plain"},
        json_value={"ok": True},
    )
    mocked.return_value = resp

    out = api.request("GET", "/jsonish")
    assert out == {"ok": True}

    api.close()