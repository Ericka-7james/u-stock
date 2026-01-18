from __future__ import annotations

from typing import Any, Dict, List, Optional

import runner.main as main_mod


class FakeAPI:
    def __init__(self, sess: Dict[str, Any]):
        self._sess = sess
        self.calls: List[str] = []

    def get(self, path: str):
        self.calls.append(path)
        if path == "/api/market/us/session":
            return self._sess
        return {}

    @property
    def base_url(self) -> str:
        return "http://fake"

    def close(self) -> None:
        return


def test_gate_returns_true_when_open_no_sleep():
    api = FakeAPI({"ok": True, "is_open": True, "next_close": 123})
    slept: List[float] = []

    def sleep_fn(s: float):
        slept.append(float(s))

    opened = main_mod._gate_us_market(api, debug=True, sleep_fn=sleep_fn)
    assert opened is True
    assert slept == []
    assert "/api/market/us/session" in api.calls


def test_gate_returns_false_and_sleeps_until_open_with_buffer():
    api = FakeAPI({"ok": True, "is_open": False, "seconds_until_open": 10, "next_open": 999})
    slept: List[float] = []

    def sleep_fn(s: float):
        slept.append(float(s))

    opened = main_mod._gate_us_market(api, debug=False, sleep_fn=sleep_fn)
    assert opened is False
    # seconds_until_open=10 -> buffer +20 -> 30, and min wait >=10
    assert slept and int(slept[0]) == 30


def test_gate_fails_open_if_session_endpoint_errors(monkeypatch):
    class BoomAPI:
        def get(self, path: str):
            raise RuntimeError("down")

    slept: List[float] = []

    def sleep_fn(s: float):
        slept.append(float(s))

    opened = main_mod._gate_us_market(BoomAPI(), debug=False, sleep_fn=sleep_fn)
    assert opened is True
    # should back off a bit
    assert slept and int(slept[0]) == 60


def test_gate_fails_open_if_session_not_ok(monkeypatch):
    api = FakeAPI({"ok": False})
    slept: List[float] = []

    def sleep_fn(s: float):
        slept.append(float(s))

    opened = main_mod._gate_us_market(api, debug=False, sleep_fn=sleep_fn)
    assert opened is True
    assert slept and int(slept[0]) == 60


def test_gate_closed_without_seconds_until_open_uses_fallback_30m():
    api = FakeAPI({"ok": True, "is_open": False, "next_open": 999})
    slept: List[float] = []

    def sleep_fn(s: float):
        slept.append(float(s))

    opened = main_mod._gate_us_market(api, debug=False, sleep_fn=sleep_fn)
    assert opened is False
    assert slept and int(slept[0]) == 30 * 60
