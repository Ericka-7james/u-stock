# u-stock-bots/bots/ema_trend/tests/test_signal.py
from __future__ import annotations

import pytest

from bots.ema_trend.config import EMATrendConfig
from bots.ema_trend.signal import compute_signal


def _bars(*, o, h, l, c):
  return {"o": list(o), "h": list(h), "l": list(l), "c": list(c)}


def _make_trendy_bars_up(n=60, start=100.0, step=0.02):
  # mild uptrend with consistent ranges
  c = [start + i * step for i in range(n)]
  o = c[:]
  h = [x + 0.15 for x in c]
  l = [x - 0.15 for x in c]

  # last candle "reclaim" style: dip down then close up
  o[-1] = c[-2]  # open near prev close
  l[-1] = c[-1] - 0.25
  h[-1] = c[-1] + 0.15
  return _bars(o=o, h=h, l=l, c=c)


def _make_trendy_bars_down():
  """
  Downtrend where the LAST candle:
    - closes below EMA(fast)
    - has a wick high that reaches/touches EMA(fast)
  This guarantees the short reclaim condition in compute_signal().
  """
  import bots.ema_trend.signal as signal_mod

  n = 80
  # Base downtrend
  c = [120.0 - i * 0.25 for i in range(n)]
  o = c[:]
  h = [x + 0.20 for x in c]
  l = [x - 0.20 for x in c]

  # Pass 1: compute EMA on base series
  e = signal_mod.ema(c, 9)
  assert e, "EMA should exist for test series"

  # Force last candle to be a reclaim-from-below:
  # close below EMA, high >= EMA
  c[-1] = float(e[-1]) - 0.30
  o[-1] = c[-1] + 0.10
  l[-1] = c[-1] - 0.50

  # Pass 2: recompute EMA after changing last close (EMA shifts a bit)
  e2 = signal_mod.ema(c, 9)
  assert e2, "EMA should exist after adjusting last close"

  # Now hard-pin the last high to be above the *current* EMA
  h[-1] = float(e2[-1]) + 0.20

  # Ensure earlier bars have realistic ranges so ATR isn't ~0
  for i in range(n - 1):
    h[i] = max(h[i], o[i], c[i]) + 0.15
    l[i] = min(l[i], o[i], c[i]) - 0.15

  return {"o": o, "h": h, "l": l, "c": c}


def test_compute_signal_returns_none_on_missing_keys():
  cfg = EMATrendConfig()
  triple, reasons, conf = compute_signal({"c": [1, 2, 3]}, cfg, "up")
  assert triple is None
  assert conf == 0.0
  # new behavior: always provides a reason on early returns
  assert "bars_missing_or_invalid" in reasons


def test_compute_signal_returns_none_when_atr_too_low():
  cfg = EMATrendConfig(min_atr_pct=5.0)  # force failure

  # tiny ranges, tiny ATR%
  n = 60
  c = [100.0] * n
  o = c[:]
  h = [100.01] * n
  l = [99.99] * n
  triple, reasons, conf = compute_signal(_bars(o=o, h=h, l=l, c=c), cfg, "up")

  assert triple is None
  assert conf == 0.0
  assert "atr_too_low" in reasons


def test_compute_signal_long_requires_reclaim_and_confirmation():
  # Make rules easier to pass in tests
  cfg = EMATrendConfig(
    min_atr_pct=0.05,
    min_stop_pct=0.01,
    max_stop_pct=5.0,
    stop_atr_pad=0.05,
    rr_multiple=1.5,
    ema_fast=9,
    atr_n=14,
  )

  bars = _make_trendy_bars_up()
  triple, reasons, conf = compute_signal(bars, cfg, "up")
  assert triple is not None
  entry, stop, tp = triple

  assert entry > stop
  assert tp > entry
  assert conf > 0.0
  assert len(reasons) > 0


def test_compute_signal_short_requires_reclaim_and_confirmation():
  cfg = EMATrendConfig(
    min_atr_pct=0.05,
    min_stop_pct=0.01,
    max_stop_pct=5.0,
    stop_atr_pad=0.05,
    rr_multiple=1.5,
    ema_fast=9,
    atr_n=14,
  )

  bars = _make_trendy_bars_down()
  triple, reasons, conf = compute_signal(bars, cfg, "down")
  assert triple is not None
  entry, stop, tp = triple

  assert stop > entry
  assert tp < entry
  assert conf > 0.0
  assert len(reasons) > 0


def test_compute_signal_respects_risk_bounds():
  # Very strict max_stop_pct so we force rejection
  cfg = EMATrendConfig(
    min_atr_pct=0.05,
    min_stop_pct=0.01,
    max_stop_pct=0.05,  # extremely tight
    stop_atr_pad=0.50,  # makes stop wider
    rr_multiple=1.5,
    ema_fast=9,
    atr_n=14,
  )

  bars = _make_trendy_bars_up()
  triple, reasons, conf = compute_signal(bars, cfg, "up")

  assert triple is None
  assert conf == 0.0

  # should explain rejection
  assert any("risk_bounds" in r.lower() for r in reasons)

  # should have passed ATR gate (works whether reason_codes uses ATR_OK_1M or fallback atr_ok)
  assert any(("atr_ok" in r.lower()) or (r.upper().startswith("ATR_OK")) for r in reasons)