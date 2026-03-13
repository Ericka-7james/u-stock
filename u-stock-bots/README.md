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
  │  └─ registry.py     # Bot registry (extensible)\
  |  └─ backtest/       # Bot registry (extensible)
  │
  ├─ pytest.ini
  └─ README.md

## Core Concepts

### TradeIntent
  A **strategy-only** output describing a potential trade.
  Strategies never execute trades directly — they only emit intents.

### Execution (via BotEngine)
  Execution happens through the runner engine (paper/live).
  The strategy never calls brokers directly.

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
- SUPABASE_URL          : optional tx upload
- SUPABASE_SERVICE_ROLE_KEY : optional tx upload

For backtesting or live data access, you may also need:
- ALPACA_API_KEY
- ALPACA_API_SECRET
- ALPACA_MODE (paper or live)

## Run the system

### Start runner (continuous)
From repo root:
  ```bash
  .\.venv\Scripts\Activate.ps1

  cd u-stock-bots
  python -m runner.main
  ```
### Backtesting (EMA Trend)
The EMA trend strategy supports historical backtesting through a dedicated CLI module.
  Backtests:
  - Do not execute real trades
  - Simulate historical performance
  - Generate full execution logs

### Run EMA Backtest (Windows PowerShell)
  ```bash
  .\.venv\Scripts\Activate.ps1
  cd u-stock-bots

  python -m runner.backtest.run_ema_scan_backtest ^
    --symbols "SPY,QQQ,AAPL,MSFT,NVDA" ^
    --tf_entry "5Min" ^
    --tf_bias "15Min" ^
    --start "2023-08-01" ^
    --end "2024-02-01" ^
    --warmup 320 ^
    --steps 200000 ^
    --qty 1
  ```

### Run EMA Backtest (Mac/Linux)
  ```bash
  python -m runner.backtest.run_ema_scan_backtest \
    --symbols "SPY,QQQ,AAPL,MSFT,NVDA" \
    --tf_entry "5Min" \
    --tf_bias "15Min" \
    --start "2023-08-01" \
    --end "2024-02-01" \
    --warmup 320 \
    --steps 200000 \
    --qty 1
  ```

### Parameter Breakdown
  - --symbols - Comma-separated tickers to scan.
  - --tf_entry - Entry timeframe (example: 5Min).
  - --tf_bias - Higher timeframe bias filter (example: 15Min).
  - --start / --end - Historical date range.
  - --warmup - Number of bars preloaded before simulation begins.
            - Prevents indicator distortion at the start of the dataset.
  - --steps - Maximum number of bars processed.
  - --qty - Simulated position size per trade.

### Backtest Output
  Artifacts are saved under:
    ```bash
    .cache/backtests/<timestamp>_ema_scan_...
    ```

    Each run prints:
    - run_dir
    - log_path
    - report_path

    You can inspect:
    - report.txt — summary metrics
    - run.json.gz — full execution trace

## Ignore market hours (testing)
To disable market-hours gating for development/testing:
  Set:
    ``` bash
    RESPECT_MARKET_HOURS=0
    ```

## Tests

Run all tests:
  ``` bash
  cd u-stock-bots
  python -m pytest -c pytest.ini
  ```

  # Run EMA strategy tests only:
  ``` bash
  python -m pytest bots/ema_trend -c pytest.ini
  ```

  # Run backtest module tests only:
  ``` bash
  python -m pytest runner/backtest -c pytest.ini
  ```

### Design Philosophy

This repo enforces separation of concerns:
  - Strategies generate intents only
  - Execution is centralized in the runner
  - Persistence is idempotent
  - Backtests reuse the same signal logic as live trading
  - No strategy has direct broker access
The goal is reproducibility, modularity, and controlled risk exposure.