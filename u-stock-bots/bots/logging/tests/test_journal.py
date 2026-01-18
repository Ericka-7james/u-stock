from __future__ import annotations

import json
from pathlib import Path

from bots.logging.journal import Journal
from bots._shared.types import TradeIntent


def _read_lines(p: Path):
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def test_journal_writes_intent_ndjson(tmp_path: Path):
    log_path = tmp_path / "journal.ndjson"
    j = Journal(path=str(log_path), now_fn=lambda: 123.456)

    intent = TradeIntent(
        symbol="AAPL",
        side="buy",
        entry=100.0,
        stop=99.5,
        take_profit=101.0,
        confidence=0.7,
        bot_id="ema_trend",
        timeframe="1Min",
        reason_codes=["X"],
    )

    j.log_intent(intent)

    rows = _read_lines(log_path)
    assert len(rows) == 1
    assert rows[0]["type"] == "intent"
    assert rows[0]["ts"] == 123.456
    assert rows[0]["intent"]["symbol"] == "AAPL"


def test_journal_writes_order_ndjson(tmp_path: Path):
    log_path = tmp_path / "journal.ndjson"
    j = Journal(path=str(log_path), now_fn=lambda: 200.0)

    intent = TradeIntent(
        symbol="MSFT",
        side="sell",
        entry=300.0,
        stop=303.0,
        take_profit=294.0,
        confidence=0.4,
        bot_id="ema_trend",
        timeframe="1Min",
        reason_codes=[],
    )

    j.log_order(intent, {"status": "submitted", "order_id": "SIM_1"})

    rows = _read_lines(log_path)
    assert len(rows) == 1
    assert rows[0]["type"] == "order"
    assert rows[0]["ts"] == 200.0
    assert rows[0]["symbol"] == "MSFT"
    assert rows[0]["bot_id"] == "ema_trend"
    assert rows[0]["result"]["order_id"] == "SIM_1"


def test_journal_writes_exit_ndjson(tmp_path: Path):
    log_path = tmp_path / "journal.ndjson"
    j = Journal(path=str(log_path), now_fn=lambda: 999.0)

    j.log_exit(bot_id="ema_trend", symbol="TSLA", pnl=12.34)

    rows = _read_lines(log_path)
    assert len(rows) == 1
    assert rows[0]["type"] == "exit"
    assert rows[0]["ts"] == 999.0
    assert rows[0]["bot_id"] == "ema_trend"
    assert rows[0]["symbol"] == "TSLA"
    assert rows[0]["pnl"] == 12.34


def test_journal_handles_path_with_no_directory(tmp_path: Path):
    # Use cwd = tmp_path and a filename with no dir portion
    log_path = tmp_path / "journal.ndjson"
    j = Journal(path=str(log_path), now_fn=lambda: 1.0)

    j.log_exit("ema_trend", "AAPL", 1.23)
    rows = _read_lines(log_path)
    assert len(rows) == 1
