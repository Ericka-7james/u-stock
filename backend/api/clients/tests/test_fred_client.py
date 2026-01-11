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
    # New client uses Optional tuple cache, not a dict
    fred_client._CACHE = None
    yield
    fred_client._CACHE = None


def test_requires_api_key(monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    with pytest.raises(RuntimeError) as e:
        fred_client.get_macro_summary(ttl_seconds=0)
    assert "FRED_API_KEY is missing" in str(e.value)


def test_latest_point_skips_dot_values(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []
    payload = {
        "observations": [
            {"date": "2026-01-02", "value": "."},
            {"date": "2026-01-01", "value": "4.25"},
        ]
    }

    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([DummyResp(200, payload=payload)], calls),
    )

    v = fred_client._latest_point("DFF")
    assert v == 4.25

    assert calls[0]["url"] == f"{fred_client.FRED_BASE}/series/observations"
    assert calls[0]["params"]["series_id"] == "DFF"
    assert calls[0]["params"]["api_key"] == "TESTKEY"
    assert calls[0]["params"]["file_type"] == "json"
    assert calls[0]["params"]["sort_order"] == "desc"
    assert calls[0]["params"]["limit"] == 10
    assert calls[0]["timeout"] == 15


def test_latest_two_points_requires_enough_observations(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []
    payload = {"observations": [{"date": "2026-01-01", "value": "100.0"}]}  # only one valid point

    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([DummyResp(200, payload=payload)], calls),
    )

    with pytest.raises(RuntimeError) as e:
        fred_client._latest_two_points("CPIAUCSL")

    assert "Not enough observations" in str(e.value)


def test_get_macro_summary_happy_path_and_math(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []

    # get_macro_summary calls in this order:
    # 1) _latest_point("DFF")
    # 2) _latest_point("DGS10")
    # 3) _latest_two_points("CPIAUCSL")  (limit 13, desc)
    # 4) _latest_point("UNRATE")
    #
    # CPI YoY uses: ((latest / approx_12m_ago) - 1) * 100
    # We'll provide CPI latest=310.0, 12m=300.0 -> 3.333...%

    resp_dff = DummyResp(
        200,
        payload={"observations": [{"date": "2026-01-01", "value": "5.25"}]},
    )
    resp_dgs10 = DummyResp(
        200,
        payload={"observations": [{"date": "2026-01-01", "value": "4.60"}]},
    )

    # For _latest_two_points: expects up to 13 observations, desc order.
    # We give at least 2 numeric values; function takes vals[0] and vals[-1].
    resp_cpi = DummyResp(
        200,
        payload={
            "observations": [
                {"date": "2026-01-01", "value": "310.0"},
                {"date": "2025-12-01", "value": "309.0"},
                {"date": "2025-11-01", "value": "308.0"},
                # ... pretend more ...
                {"date": "2025-01-01", "value": "300.0"},
            ]
        },
    )

    resp_unrate = DummyResp(
        200,
        payload={"observations": [{"date": "2026-01-01", "value": "4.20"}]},
    )

    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([resp_dff, resp_dgs10, resp_cpi, resp_unrate], calls),
    )

    out = fred_client.get_macro_summary(ttl_seconds=0)

    assert out["ok"] is True
    assert out["source"] == "fred"
    assert out["rates"]["fed_funds"] == 5.25
    assert out["rates"]["ten_year"] == 4.60
    assert out["labor"]["unemployment"] == 4.20

    # CPI YoY ~ 3.3333%
    assert abs(out["inflation"]["cpi_yoy"] - 3.3333333) < 1e-3

    # risk rules:
    # fed_funds >= 4.5 -> +1
    # ten_year >= 4.5 -> +1
    # cpi_yoy >= 3.5 -> 0 (3.33 is below 3.5)
    # unrate >= 4.5 -> 0
    # score=2 -> Medium
    assert out["risk"] == "Medium"

    # Basic param checks
    assert calls[0]["params"]["series_id"] == "DFF"
    assert calls[1]["params"]["series_id"] == "DGS10"
    assert calls[2]["params"]["series_id"] == "CPIAUCSL"
    assert calls[3]["params"]["series_id"] == "UNRATE"

    # CPI request uses limit 13 in client
    assert calls[2]["params"]["limit"] == 13
    assert calls[2]["params"]["sort_order"] == "desc"


def test_caching_skips_second_network_call(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")

    calls = []

    resp_dff = DummyResp(200, payload={"observations": [{"date": "x", "value": "5.00"}]})
    resp_dgs10 = DummyResp(200, payload={"observations": [{"date": "x", "value": "4.00"}]})
    resp_cpi = DummyResp(
        200,
        payload={
            "observations": [
                {"date": "x", "value": "310.0"},
                {"date": "y", "value": "300.0"},
            ]
        },
    )
    resp_unrate = DummyResp(200, payload={"observations": [{"date": "x", "value": "4.00"}]})

    monkeypatch.setattr(
        fred_client.requests,
        "get",
        _make_get_stub([resp_dff, resp_dgs10, resp_cpi, resp_unrate], calls),
    )

    # Control time so cache remains valid
    t = {"now": 1000.0}

    def _time():
        return t["now"]

    monkeypatch.setattr(fred_client.time, "time", _time)

    out1 = fred_client.get_macro_summary(ttl_seconds=999)
    t["now"] = 1001.0
    out2 = fred_client.get_macro_summary(ttl_seconds=999)

    assert out1 == out2
    assert len(calls) == 4  # only first call hits network (4 requests)
