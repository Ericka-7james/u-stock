# backend/api/clients/tests/test_fred_client.py
from __future__ import annotations

from typing import Any, Dict, List
import pytest

from api.clients import fred_client


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
        calls_out.append({"url": url, "params": dict(params or {}), "timeout": timeout})
        i = idx["i"]
        if i >= len(responses):
            raise AssertionError(f"requests.get called too many times ({i+1}); expected {len(responses)}")
        idx["i"] += 1
        return responses[i]

    return _get


@pytest.fixture(autouse=True)
def _clear_cache():
    fred_client._CACHE.clear()
    yield
    fred_client._CACHE.clear()


def test_requires_api_key(monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    with pytest.raises(RuntimeError) as e:
        fred_client.fred_series_observations("CPIAUCSL", ttl_sec=0)
    assert "FRED_API_KEY missing" in str(e.value)


def test_requires_series_id(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")
    with pytest.raises(ValueError):
        fred_client.fred_series_observations("", ttl_sec=0)


def test_happy_path_and_params(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []
    payload = {"observations": [{"date": "2026-01-01", "value": "1.0"}]}
    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([DummyResp(200, payload=payload)], calls),
    )

    out = fred_client.fred_series_observations("CPIAUCSL", ttl_sec=0)

    assert out["cached"] is False
    assert out["data"]["observations"][0]["value"] == "1.0"
    assert out["meta"]["attempts"] == 1
    assert calls[0]["url"] == f"{fred_client.FRED_BASE}/series/observations"
    assert calls[0]["params"]["series_id"] == "CPIAUCSL"
    assert calls[0]["params"]["api_key"] == "TESTKEY"
    assert calls[0]["params"]["file_type"] == "json"
    assert calls[0]["timeout"] == 8


def test_validation_requires_observations_list(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []
    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([DummyResp(200, payload={"not_obs": True})], calls),
    )

    with pytest.raises(RuntimeError) as e:
        fred_client.fred_series_observations("CPIAUCSL", ttl_sec=0, max_retries=0)

    assert "fred_missing_observations" in str(e.value)
    assert len(calls) == 1


def test_retries_on_429_then_succeeds(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []
    good = {"observations": []}
    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([DummyResp(429, payload={"message": "rate"}), DummyResp(200, payload=good)], calls),
    )
    monkeypatch.setattr(fred_client.time, "sleep", lambda _: None)

    out = fred_client.fred_series_observations("CPIAUCSL", ttl_sec=0, max_retries=2)

    assert out["cached"] is False
    assert out["data"]["observations"] == []
    assert out["meta"]["attempts"] == 2
    assert len(calls) == 2


def test_does_not_retry_on_4xx_http_error(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []
    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([DummyResp(401, payload={"message": "bad"})], calls),
    )

    import requests
    with pytest.raises(requests.HTTPError):
        fred_client.fred_series_observations("CPIAUCSL", ttl_sec=0, max_retries=2)

    assert len(calls) == 1


def test_caching_skips_second_network_call(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []
    payload = {"observations": [{"date": "x", "value": "1"}]}
    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([DummyResp(200, payload=payload)], calls),
    )

    out1 = fred_client.fred_series_observations("CPIAUCSL", ttl_sec=999)
    out2 = fred_client.fred_series_observations("CPIAUCSL", ttl_sec=999)

    assert out1["data"] == out2["data"]
    assert out1["cached"] is False
    assert out2["cached"] is True
    assert len(calls) == 1


def test_compat_export_calls_main(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []
    payload = {"observations": []}
    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([DummyResp(200, payload=payload)], calls),
    )

    out = fred_client.get_series_observations("CPIAUCSL", ttl_sec=0)
    assert out["data"]["observations"] == []
