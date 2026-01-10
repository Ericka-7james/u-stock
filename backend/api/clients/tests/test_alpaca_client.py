# backend/api/clients/tests/test_alpaca_client.py
from __future__ import annotations

from typing import Any, Dict, Optional, Callable, List
import pytest

from api.clients import alpaca_client


class DummyResp:
    def __init__(self, status_code: int, payload: Optional[Dict[str, Any]] = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or ("" if payload is None else str(payload))

    def json(self) -> Dict[str, Any]:
        return self._payload or {}


def _make_get_stub(responses: List[DummyResp], calls_out: list):
    idx = {"i": 0}

    def _get(url, params=None, headers=None, timeout=None):
        calls_out.append({
            "url": url,
            "params": dict(params or {}),      # <-- snapshot
            "headers": dict(headers or {}),    # <-- snapshot
            "timeout": timeout,
        })
        i = idx["i"]
        if i >= len(responses):
            raise AssertionError(f"requests.get called too many times ({i+1}); expected {len(responses)}")
        idx["i"] += 1
        return responses[i]

    return _get

def test_alpaca_headers():
    h = alpaca_client.alpaca_headers("KEY", "SECRET")
    assert h["APCA-API-KEY-ID"] == "KEY"
    assert h["APCA-API-SECRET-KEY"] == "SECRET"


@pytest.mark.parametrize("bad_symbol", ["", "   ", None])
def test_stock_bars_requires_symbol(bad_symbol):
    with pytest.raises(ValueError):
        alpaca_client.stock_bars(
            symbol=bad_symbol, api_key="k", api_secret="s", base_url="https://data.alpaca.markets"
        )


def test_crypto_bars_requires_symbols():
    with pytest.raises(ValueError):
        alpaca_client.crypto_bars(symbols=[], api_key="k", api_secret="s", base_url="https://data.alpaca.markets")


def test_stock_bars_uppercases_symbol_and_sets_meta(monkeypatch):
    calls = []
    monkeypatch.setattr(
        alpaca_client.requests,
        "get",
        _make_get_stub([DummyResp(200, {"bars": []})], calls),
    )

    payload = alpaca_client.stock_bars(
        symbol="aapl",
        api_key="k",
        api_secret="s",
        timeframe="1Day",
        limit=10,
        adjustment="raw",
        feed="sip",
        base_url="https://data.alpaca.markets",
        timeout_sec=3,
    )

    assert calls[0]["url"] == "https://data.alpaca.markets/v2/stocks/AAPL/bars"
    assert calls[0]["params"]["timeframe"] == "1Day"
    assert calls[0]["params"]["limit"] == 10
    assert calls[0]["params"]["adjustment"] == "raw"
    assert calls[0]["params"]["feed"] == "sip"
    assert calls[0]["timeout"] == 3
    assert payload["meta"]["feed_used"] == "sip"
    assert payload["meta"]["adjustment"] == "raw"


def test_stock_bars_fallbacks_sip_to_iex(monkeypatch):
    calls = []
    monkeypatch.setattr(
        alpaca_client.requests,
        "get",
        _make_get_stub(
            [
                DummyResp(403, {"message": "forbidden"}, text="forbidden"),  # first attempt SIP fails
                DummyResp(200, {"bars": [{"t": "x"}]}),  # fallback IEX succeeds
            ],
            calls,
        ),
    )

    payload = alpaca_client.stock_bars(
        symbol="MSFT",
        api_key="k",
        api_secret="s",
        feed="sip",
        base_url="https://data.alpaca.markets",
    )

    assert len(calls) == 2
    assert calls[0]["params"]["feed"] in ("sip", "iex")
    assert calls[1]["params"]["feed"] == "iex"
    assert payload["meta"]["feed_used"] == "iex"


def test_stock_bars_raises_after_fallback_failure(monkeypatch):
    calls = []
    monkeypatch.setattr(
        alpaca_client.requests,
        "get",
        _make_get_stub(
            [
                DummyResp(401, {"error": "bad"}, text="bad"),  # SIP fails
                DummyResp(401, {"error": "bad"}, text="bad"),  # IEX also fails
            ],
            calls,
        ),
    )

    with pytest.raises(RuntimeError) as e:
        alpaca_client.stock_bars(
            symbol="T",
            api_key="k",
            api_secret="s",
            feed="sip",
            base_url="https://data.alpaca.markets",
        )
    assert "alpaca_stock_bars_error" in str(e.value)
    assert len(calls) == 2
    assert calls[1]["params"]["feed"] == "iex"


def test_latest_quotes_requires_symbols():
    with pytest.raises(ValueError):
        alpaca_client.latest_quotes(symbols=[], api_key="k", api_secret="s", base_url="https://data.alpaca.markets")


def test_latest_quotes_fallbacks_sip_to_iex(monkeypatch):
    calls = []
    monkeypatch.setattr(
        alpaca_client.requests,
        "get",
        _make_get_stub(
            [
                DummyResp(429, {"message": "rate limit"}, text="rate limit"),
                DummyResp(200, {"quotes": {"AAPL": {"ap": 1.0}}}),
            ],
            calls,
        ),
    )

    payload = alpaca_client.latest_quotes(
        symbols=["aapl", " msft "],
        api_key="k",
        api_secret="s",
        feed="sip",
        base_url="https://data.alpaca.markets",
        timeout_sec=5,
    )

    assert len(calls) == 2
    assert calls[0]["url"] == "https://data.alpaca.markets/v2/stocks/quotes/latest"
    assert calls[0]["params"]["symbols"] == "AAPL,MSFT"
    assert calls[1]["params"]["feed"] == "iex"
    assert payload["meta"]["feed_used"] == "iex"


def test_recent_trades_requires_symbols():
    with pytest.raises(ValueError):
        alpaca_client.recent_trades(symbols=[], api_key="k", api_secret="s", base_url="https://data.alpaca.markets")


def test_recent_trades_fallbacks_sip_to_iex(monkeypatch):
    calls = []
    monkeypatch.setattr(
        alpaca_client.requests,
        "get",
        _make_get_stub(
            [
                DummyResp(403, {"message": "forbidden"}, text="forbidden"),
                DummyResp(200, {"trades": {"AAPL": []}, "next_page_token": None}),
            ],
            calls,
        ),
    )

    payload = alpaca_client.recent_trades(
        symbols=["AAPL"],
        api_key="k",
        api_secret="s",
        feed="sip",
        base_url="https://data.alpaca.markets",
    )

    assert len(calls) == 2
    assert calls[1]["params"]["feed"] == "iex"
    assert payload["meta"]["feed_used"] == "iex"
