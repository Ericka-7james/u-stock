// frontend/src/content/pages/backtestPracticePage.content.ts
export const BACKTEST_PRACTICE_PAGE_COPY = {
  header: {
    title: "Backtest Practice Lab",
    tagline: "A front-facing sandbox for scan backtests (configs in, insights out).",
    hint: "Frontend stub today. Backend job runner next.",
  },

  intro: {
    primary:
      "Use this page to practice the scan backtest workflow without touching the CLI. You’ll enter a config, start a run, then review summary stats and download artifacts.",
    secondary:
      "For now the run is mocked so the UI wiring is real. Once the backend endpoints exist, this becomes a live job-based backtester.",
  },

  status: {
    idle: "Idle",
    queued: "Queued",
    running: "Running",
    done: "Done",
    failed: "Failed",
  },

  sections: {
    config: {
      title: "Configuration",
      subtitle: "Set your scan backtest inputs.",
      note:
        "Guardrails will be enforced in the backend too (rate limits, max steps, date range caps).",
    },
    preview: {
      title: "Preview",
      subtitle: "A quick glance at what will be sent to the backend.",
    },
    results: {
      title: "Results",
      subtitle:
        "When connected, this section will reflect the job status and show a user-friendly report.",
    },
    safety: {
      title: "Safety defaults",
      items: [
        "Auth required to run backtests.",
        "Backend will validate configs (no arbitrary commands).",
        "Caps on steps, date range, and symbol count to protect compute.",
        "Artifacts downloadable only for your own jobs.",
      ],
    },
  },

  fields: {
    symbols: {
      label: "Symbols",
      placeholder: "SPY,QQQ,AAPL",
      help: "Comma-separated. Example: SPY,QQQ,AAPL,MSFT,NVDA",
    },
    tfEntry: { label: "Entry timeframe" },
    tfBias: { label: "Bias timeframe" },
    start: { label: "Start date" },
    end: { label: "End date" },
    warmup: { label: "Warmup bars" },
    steps: { label: "Max steps" },
    qty: { label: "Qty" },
  },

  buttons: {
    run: "Run backtest",
    running: "Running…",
    reset: "Reset",
  },

  kv: {
    symbols: "Symbols",
    timeframes: "Timeframes",
    range: "Date range",
    params: "Params",
  },

  validation: {
    title: "Fix these before running:",
    ok: "Config looks valid.",
  },

  empty: {
    title: "No runs yet",
    body: "Run a backtest to see a summary and downloadable artifacts here.",
  },

  progress: {
    title: "Run in progress",
    body: "Tracking job:",
  },

  metrics: {
    trades: "Trades",
    winRate: "Win rate",
    pnl: "PnL",
    maxDD: "Max drawdown",
    avgTrade: "Avg trade",
    exposure: "Exposure",
  },

  artifacts: {
    title: "Artifacts",
    report: "Download report.txt",
    json: "Download run.json",
    csv: "Download trades.csv",
    note: "Downloads will enable once the backend returns artifact URLs.",
  },

  errors: {
    invalid: {
      title: "Config needs a quick fix",
      body: "Please correct the fields below and try again.",
    },
  },
} as const;