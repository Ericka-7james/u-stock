u-stock-bots/
├─ bots/
│ ├─ _shared/ # Indicators, risk, scoring, HTTP, telemetry
│ ├─ ema_trend/ # EMA trend-following strategy
│ ├─ execution/ # Order execution adapters
│ └─ logging/ # NDJSON journaling
│
├─ runner/
│ ├─ bot_runner.py # Orchestrates strategy → execution → persistence
│ ├─ engine.py # Routes intents to executors (paper/live)
│ ├─ main.py # Standalone CLI runner
│ ├─ supabase.py # Transaction event uploader (idempotent, batched)
│ └─ registry.py # Bot registry (extensible)
│
├─ pytest.ini
└─ README.md


---

## Core Concepts

### TradeIntent
A **strategy-only** output describing a potential trade.

```python
TradeIntent(
    symbol="AAPL",
    side="buy",
    entry=100.0,
    stop=99.5,
    take_profit=101.0,
    confidence=0.72,
    bot_id="ema_trend",
    timeframe="1Min",
    reason_codes=["BIAS_UP", "RECLAIM"]
)


Strategies never execute trades directly — they only emit intents.

Execution

Execution is handled separately via executors:

PaperExecutor – deterministic paper trading (default)

TradeStationExecutor – stub (safe not_implemented until wired)

Future: Alpaca, IBKR, etc.

Execution always happens through BotEngine, which routes based on mode:

paper → PaperExecutor
live  → Broker executor (when enabled)

Runner Flow
Market Gate
   ↓
Strategy (ema_trend)
   ↓
TradeIntents
   ↓
Execution Engine
   ↓
Transaction Events
   ↓
Supabase Upload (idempotent)


The runner:

Respects US market hours

Never crashes on errors

Emits heartbeats

Separates strategy, execution, and persistence

Strategies
EMA Trend (bots/ema_trend)

Trend-following strategy using:

Multi-timeframe EMA bias

Chop and slope filters

ATR-based risk bounds

Weighted confidence scoring

Top-N intent selection per run

Fully unit tested:

Bias detection

Chop filtering

Confidence ranking

Market gating

Failure paths

Logging & Journaling

The logging system writes append-only NDJSON:

logs/journal.ndjson


Logged events:

Strategy intents

Order submissions

Trade exits

Logging is:

Best-effort (never crashes the bot)

UTF-8

Deterministic & testable

Supabase Integration

Transaction events are uploaded via PostgREST with:

Batching

Retries with exponential backoff

Dead-letter queue on failure

Idempotency via deterministic event_id

Only transaction events are uploaded:

order_submitted
order_filled
order_rejected
order_failed
trade_closed


Non-transaction events are filtered out.

Configuration (Environment Variables)
Variable	Purpose
RUNNER_LOOP_SECONDS	Runner loop interval
RUNNER_BOT_ID	Bot to run
RUNNER_EXECUTOR	Executor name
SUPABASE_URL	Supabase base URL
SUPABASE_SERVICE_ROLE_KEY	Supabase service key
SUPABASE_EVENTS_TABLE	Events table
SUPABASE_BATCH_SIZE	Insert batch size
Running Locally
Run runner (continuous)
python -m runner.bot_runner

Run once (CLI runner)
python -m runner.main --once --debug

Ignore market hours
python -m runner.main --no-respect-market-hours

Testing

All components are fully unit tested.

python -m pytest -c pytest.ini


Coverage includes:

Shared utilities

Strategy logic

Execution adapters

Runner orchestration

Supabase upload logic

Registry behavior

Current status: 118 passing tests

Design Principles

Strategy ≠ execution

Fail safe, never fail loud

Deterministic behavior

Idempotent persistence

Testability first

Production-oriented defaults

Roadmap

Alpaca / IBKR execution adapters

Multi-bot registry orchestration

CI (GitHub Actions)

Strategy performance dashboards

Live risk throttling

License

Internal / private (for now).
Designed to support future licensing of strategies or platform components.

Built with intention. Tested with discipline. 🚀