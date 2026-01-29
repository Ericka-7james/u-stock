from __future__ import annotations

from typing import Any, Dict

from runner import api_client as ac


class FakeAPI:
    def __init__(self, resp: Any = None, *, boom: bool = False):
        self.resp = resp
        self.boom = boom
        self.calls = []

    def get(self, path: str, params=None):
        self.calls.append((path, params))
        if self.boom:
            raise RuntimeError("down")
        return self.resp


def test_market_session_returns_dict_when_ok():
    api = FakeAPI({"ok": True, "is_open": True})
    out = ac.market_session(api)
    assert out["ok"] is True
    assert out["is_open"] is True


def test_market_session_returns_ok_false_when_non_dict():
    api = FakeAPI(["not", "a", "dict"])
    out = ac.market_session(api)
    assert out == {"ok": False}


def test_market_session_returns_ok_false_on_exception():
    api = FakeAPI(boom=True)
    out = ac.market_session(api)
    assert out == {"ok": False}
