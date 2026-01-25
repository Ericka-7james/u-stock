# u-stock-bots

Strategy + runner package for U-Stock.

This repo is intentionally split so **strategies never execute trades directly** — they only emit intents. Execution and persistence are handled by the runner.

## Structure

u-stock-bots/
├─ bots/
│  ├─ _shared/        # Indicators, risk, scoring, HTTP, telemetry
│  ├─ ema_trend/      # EMA trend-following strategy
│  ├─ execution/      # Order execution adapters
│  └─ logging/        # NDJSON journaling
│
├─ runner/
│  ├─ bot_runner.py   # Orchestrates strategy → execution → persistence
│  ├─ engine.py       # Routes intents to executors (paper/live)
│  ├─ main.py         # Standalone CLI runner
│  ├─ supabase.py     # Transaction event uploader (idempotent, batched)
│  └─ registry.py     # Bot registry (extensible)
│
├─ pytest.ini
└─ README.md

## Core Concepts

### TradeIntent
A **strategy-only** output describing a potential trade.

Strategies never execute trades directly — they only emit intents.

### Execution (via BotEngine)
Execution happens through the runner engine (paper/live). The strategy never calls brokers.

### Runner Flow

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

## Configuration (env)

Common variables:

- RUNNER_LOOP_SECONDS   : loop interval (seconds)
- RUNNER_BOT_ID         : bot to run (ex: ema_trend)
- USTOCK_API_BASE       : backend base URL (ex: http://127.0.0.1:8000)
- BOT_RUNNER_SECRET     : must match backend BOT_RUNNER_SECRET
- SUPABASE_URL          : optional tx upload
- SUPABASE_SERVICE_ROLE_KEY : optional tx upload

## Run (server / tmux recommended)

### Start runner (continuous)
From repo root:

```bash
source .venv/bin/activate
set -a
source u-stock-bots/.env
set +a

cd u-stock-bots
python -m runner.main
```

## Run once (CLI)
python -m runner.main --once --debug

## Ignore market hours (testing)
Ignore market hours (testing)

## Tests
cd u-stock-bots
python -m pytest -c pytest.ini
