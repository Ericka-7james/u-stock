# backend/api/clients/tests/test_fmp_calendar_client.py
from __future__ import annotations

from typing import Any, Dict, Optional, List
import pytest

from api.clients import fmp_calendar_client


class DummyResp:
    def __init__(self, status_code: int, payload: Any = None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            raise requests.HTTPError(f"{self.status_code} error")


def _make_get_stub(responses: List[DummyResp], calls_out: list):
    idx = {"i": 0}

    def _get(url, params=None, timeout=None):
        calls_out.append(
            {"url": url, "params": dict(params or {}), "timeout": timeout}
        )
        i = idx["i"]
        if i >= len(responses):
            raise AssertionError(f"requests.get called too many times ({i+1}); expected {len(responses)}")
        idx["i"] += 1
        return responses[i]

    return _get


@pytest.fixture(autouse=True)
def _clear_cache():
    # Ensure cache doesn't leak between tests
    fmp_calendar_client._CACHE.clear()
    yield
    fmp_calendar_client._CACHE.clear()


def test_requires_api_key(monkeypatch):
    monkeypatch.delenv("FMP_API_KEY", raising=False)
    with pytest.raises(RuntimeError) as e:
        fmp_calendar_client.fmp_economic_calendar("2026-01-01", "2026-01-31", cache_ttl_sec=0)
    assert "FMP_API_KEY missing" in str(e.value)


def test_requires_dates(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "TESTKEY")
    with pytest.raises(ValueError):
        fmp_calendar_client.fmp_economic_calendar("", "2026-01-31", cache_ttl_sec=0)
    with pytest.raises(ValueError):
        fmp_calendar_client.fmp_economic_calendar("2026-01-01", "", cache_ttl_sec=0)


def test_happy_path_with_meta(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "TESTKEY")

    calls = []
    monkeypatch.setattr(
        fmp_calendar_client.requests,
        "get",
        _make_get_stub([DummyResp(200, payload=[{"event": "CPI"}])], calls),
    )

    out = fmp_calendar_client.fmp_economic_calendar(
        "2026-01-01", "2026-01-31", cache_ttl_sec=0
    )

    assert out["data"] == [{"event": "CPI"}]
    assert out["meta"]["cached"] is False
    assert out["meta"]["attempts"] == 1
    assert calls[0]["url"] == f"{fmp_calendar_client.FMP_BASE}/economic_calendar"
    assert calls[0]["params"]["from"] == "2026-01-01"
    assert calls[0]["params"]["to"] == "2026-01-31"
    assert calls[0]["params"]["apikey"] == "TESTKEY"
    assert calls[0]["timeout"] == 12


def test_validation_rejects_non_list_payload(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "TESTKEY")

    calls = []
    monkeypatch.setattr(
        fmp_calendar_client.requests,
        "get",
        _make_get_stub([DummyResp(200, payload={"error": "not a list"})], calls),
    )

    with pytest.raises(RuntimeError) as e:
        fmp_calendar_client.fmp_economic_calendar(
            "2026-01-01", "2026-01-31", cache_ttl_sec=0, max_retries=0
        )

    assert "fmp_calendar_unexpected_payload" in str(e.value)
    assert len(calls) == 1


def test_retries_on_429_then_succeeds(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "TESTKEY")

    calls = []
    monkeypatch.setattr(
        fmp_calendar_client.requests,
        "get",
        _make_get_stub(
            [
                DummyResp(429, payload={"message": "rate limit"}),
                DummyResp(200, payload=[{"event": "GDP"}]),
            ],
            calls,
        ),
    )

    # Avoid real sleeping in tests
    monkeypatch.setattr(fmp_calendar_client.time, "sleep", lambda _: None)

    out = fmp_calendar_client.fmp_economic_calendar(
        "2026-01-01", "2026-01-31", cache_ttl_sec=0, max_retries=2
    )

    assert out["data"] == [{"event": "GDP"}]
    assert out["meta"]["attempts"] == 2
    assert len(calls) == 2


def test_retries_on_5xx_then_succeeds(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "TESTKEY")

    calls = []
    monkeypatch.setattr(
        fmp_calendar_client.requests,
        "get",
        _make_get_stub(
            [
                DummyResp(503, payload={"message": "down"}),
                DummyResp(200, payload=[{"event": "NFP"}]),
            ],
            calls,
        ),
    )
    monkeypatch.setattr(fmp_calendar_client.time, "sleep", lambda _: None)

    out = fmp_calendar_client.fmp_economic_calendar(
        "2026-01-01", "2026-01-31", cache_ttl_sec=0, max_retries=2
    )

    assert out["data"] == [{"event": "NFP"}]
    assert out["meta"]["attempts"] == 2
    assert len(calls) == 2


def test_does_not_retry_on_4xx_http_error(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "TESTKEY")

    calls = []
    monkeypatch.setattr(
        fmp_calendar_client.requests,
        "get",
        _make_get_stub([DummyResp(401, payload={"message": "bad auth"})], calls),
    )

    import requests
    with pytest.raises(requests.HTTPError):
        fmp_calendar_client.fmp_economic_calendar(
            "2026-01-01", "2026-01-31", cache_ttl_sec=0, max_retries=2
        )

    assert len(calls) == 1


def test_caching_skips_second_network_call(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "TESTKEY")

    calls = []
    monkeypatch.setattr(
        fmp_calendar_client.requests,
        "get",
        _make_get_stub([DummyResp(200, payload=[{"event": "CPI"}])], calls),
    )

    out1 = fmp_calendar_client.fmp_economic_calendar(
        "2026-01-01", "2026-01-31", cache_ttl_sec=999
    )
    out2 = fmp_calendar_client.fmp_economic_calendar(
        "2026-01-01", "2026-01-31", cache_ttl_sec=999
    )

    assert out1["data"] == out2["data"] == [{"event": "CPI"}]
    assert out1["meta"]["cached"] is False
    assert out2["meta"]["cached"] is True
    assert len(calls) == 1  # second call served from cache
