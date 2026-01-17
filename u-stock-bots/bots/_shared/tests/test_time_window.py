from __future__ import annotations

import bots._shared.filters.time_window as tw


def test_is_trade_window_true_in_morning(monkeypatch):
    monkeypatch.setattr(tw, "_local_hhmm", lambda epoch=None: (10, 0))
    assert tw.is_trade_window_local() is True


def test_is_trade_window_true_in_afternoon(monkeypatch):
    monkeypatch.setattr(tw, "_local_hhmm", lambda epoch=None: (14, 0))
    assert tw.is_trade_window_local() is True


def test_is_trade_window_false_outside(monkeypatch):
    monkeypatch.setattr(tw, "_local_hhmm", lambda epoch=None: (8, 0))
    assert tw.is_trade_window_local() is False
    monkeypatch.setattr(tw, "_local_hhmm", lambda epoch=None: (12, 0))
    assert tw.is_trade_window_local() is False
    monkeypatch.setattr(tw, "_local_hhmm", lambda epoch=None: (16, 30))
    assert tw.is_trade_window_local() is False
