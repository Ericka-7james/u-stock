from __future__ import annotations

from typing import Any

from runner import api_client as ac


class FakeAPI:
    def __init__(self, resp: Any = None, *, boom: bool = False):
        self.resp = resp
        self.boom = boom
        self.calls = []

    # api_client.market_session calls api.get(..., params={}, headers={})
    # so accept headers too to avoid signature mismatches.
    def get(self, path: str, params=None, headers=None):
        self.calls.append((path, params, headers))
        if self.boom:
            raise RuntimeError("down")
        return self.resp


def test_market_session_returns_dict_when_ok():
    api = FakeAPI({"ok": True, "is_open": True})
    out = ac.market_session(api, bot_id="bot_123")

    assert out == {"ok": True, "is_open": True}
    assert api.calls[0][0] == "/api/market/us/session"


def test_market_session_returns_ok_false_when_non_dict():
    api = FakeAPI(["not", "a", "dict"])
    out = ac.market_session(api, bot_id="bot_123")

    assert out == {"ok": False}
    assert api.calls[0][0] == "/api/market/us/session"


def test_market_session_returns_ok_false_on_exception():
    api = FakeAPI(boom=True)
    out = ac.market_session(api, bot_id="bot_123")

    assert out == {"ok": False}
    assert api.calls[0][0] == "/api/market/us/session"