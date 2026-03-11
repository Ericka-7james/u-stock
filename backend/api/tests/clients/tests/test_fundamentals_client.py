# backend/api/clients/tests/test_fundamentals_client.py
from __future__ import annotations

from typing import Any, Dict, Optional, List
import pytest

from api.clients import fundamentals_client


class DummyResp:
    def __init__(self, status_code: int, payload: Optional[Dict[str, Any]] = None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> Dict[str, Any]:
        return self._payload


def _make_get_stub(responses: List[DummyResp], calls_out: list):
    idx = {"i": 0}

    def _get(url, params=None, timeout=None):
        calls_out.append(
            {
                "url": url,
                "params": dict(params or {}),
                "timeout": timeout,
            }
        )
        i = idx["i"]
        if i >= len(responses):
            raise AssertionError(f"requests.get called too many times ({i+1}); expected {len(responses)}")
        idx["i"] += 1
        return responses[i]

    return _get


def test_requires_api_key(monkeypatch):
    monkeypatch.setattr(fundamentals_client.os, "getenv", lambda *args, **kwargs: "")
    with pytest.raises(RuntimeError) as e:
        fundamentals_client.alpha_company_overview("AAPL")
    assert "ALPHAVANTAGE_API_KEY missing" in str(e.value)


@pytest.mark.parametrize("bad_symbol", ["", "   ", None])
def test_requires_symbol(bad_symbol, monkeypatch):
    monkeypatch.setattr(fundamentals_client.os, "getenv", lambda name, default="": "x" if name == "ALPHAVANTAGE_API_KEY" else default)
    with pytest.raises(ValueError):
        fundamentals_client.alpha_company_overview(bad_symbol)


def test_uppercases_symbol_and_calls_endpoint(monkeypatch):
    monkeypatch.setattr(fundamentals_client.os, "getenv", lambda name, default="": "KEY123" if name == "ALPHAVANTAGE_API_KEY" else default)

    calls = []
    monkeypatch.setattr(
        fundamentals_client.requests,
        "get",
        _make_get_stub([DummyResp(200, {"Symbol": "AAPL"})], calls),
    )

    out = fundamentals_client.alpha_company_overview("aapl", ttl_sec=999)

    assert out["cached"] is False
    assert out["data"]["Symbol"] == "AAPL"
    assert calls[0]["url"] == "https://www.alphavantage.co/query"
    assert calls[0]["params"]["function"] == "OVERVIEW"
    assert calls[0]["params"]["symbol"] == "AAPL"
    assert calls[0]["params"]["apikey"] == "KEY123"
    assert calls[0]["timeout"] == 12


def test_cache_hit_skips_second_http_call(monkeypatch):
    monkeypatch.setattr(fundamentals_client.os, "getenv", lambda name, default="": "KEY123" if name == "ALPHAVANTAGE_API_KEY" else default)

    calls = []
    monkeypatch.setattr(
        fundamentals_client.requests,
        "get",
        _make_get_stub([DummyResp(200, {"Symbol": "MSFT"})], calls),
    )

    first = fundamentals_client.alpha_company_overview("msft", ttl_sec=3600)
    second = fundamentals_client.alpha_company_overview("MSFT", ttl_sec=3600)

    assert first["cached"] is False
    assert second["cached"] is True
    assert len(calls) == 1
    assert second["data"]["Symbol"] == "MSFT"


def test_cache_expired_makes_second_http_call(monkeypatch):
    monkeypatch.setattr(fundamentals_client.os, "getenv", lambda name, default="": "KEY123" if name == "ALPHAVANTAGE_API_KEY" else default)

    t = {"now": 1000.0}
    monkeypatch.setattr(fundamentals_client.time, "time", lambda: t["now"])

    calls = []
    monkeypatch.setattr(
        fundamentals_client.requests,
        "get",
        _make_get_stub(
            [DummyResp(200, {"Symbol": "TSLA"}), DummyResp(200, {"Symbol": "TSLA", "Name": "Tesla"})],
            calls,
        ),
    )

    first = fundamentals_client.alpha_company_overview("tsla", ttl_sec=1)
    t["now"] = 1002.0  # expired
    second = fundamentals_client.alpha_company_overview("TSLA", ttl_sec=1)

    assert first["cached"] is False
    assert second["cached"] is False
    assert len(calls) == 2
    assert second["data"].get("Name") == "Tesla"


def test_retries_on_payload_note_then_succeeds(monkeypatch):
    monkeypatch.setattr(fundamentals_client.os, "getenv", lambda name, default="": "KEY123" if name == "ALPHAVANTAGE_API_KEY" else default)

    # don't actually sleep in tests
    monkeypatch.setattr(fundamentals_client, "_sleep_backoff", lambda attempt: None)

    calls = []
    monkeypatch.setattr(
        fundamentals_client.requests,
        "get",
        _make_get_stub(
            [
                DummyResp(200, {"Note": "rate limit"}),
                DummyResp(200, {"Symbol": "NVDA"}),
            ],
            calls,
        ),
    )

    out = fundamentals_client.alpha_company_overview("nvda", max_retries=2)

    assert out["cached"] is False
    assert out["data"]["Symbol"] == "NVDA"
    assert len(calls) == 2


def test_raises_after_retries_exhausted(monkeypatch):
    monkeypatch.setattr(fundamentals_client.os, "getenv", lambda name, default="": "KEY123" if name == "ALPHAVANTAGE_API_KEY" else default)
    monkeypatch.setattr(fundamentals_client, "_sleep_backoff", lambda attempt: None)

    calls = []
    monkeypatch.setattr(
        fundamentals_client.requests,
        "get",
        _make_get_stub(
            [
                DummyResp(200, {"Note": "rate limit"}),
                DummyResp(200, {"Note": "rate limit"}),
                DummyResp(200, {"Note": "rate limit"}),
            ],
            calls,
        ),
    )

    with pytest.raises(RuntimeError) as e:
        fundamentals_client.alpha_company_overview("qqq", max_retries=2)

    assert "alphavantage_overview_failed" in str(e.value)
    assert len(calls) == 3
