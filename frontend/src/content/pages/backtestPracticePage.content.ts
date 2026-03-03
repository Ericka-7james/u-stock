// frontend/src/content/pages/backtestPracticePage.content.ts
export const BACKTEST_PRACTICE_PAGE_COPY = {
  header: {
    title: "Backtest Practice Lab",
    tagline: "Test ideas safely. No real trades. Just receipts.",
    hint: "Mock run right now. Real job runner soon.",
  },

  intro: {
    primary:
      "Pick a few symbols, choose your timeframes, and press Run. You’ll get a quick performance snapshot to help you learn what a strategy would have done.",
    secondary:
      "New here? Start with the defaults, then change one thing at a time (like the date range or timeframes) and watch what moves.",
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
      title: "1) Set it up",
      subtitle: "Think of this as your “experiment settings.”",
      note:
        "Tip: Keep symbols small (3–5) and use a shorter date range while you’re learning. Faster runs, clearer lessons.",
    },

    preview: {
      title: "3) What you’re sending",
      subtitle:
        "This is the exact config the backend will receive. If something looks weird here, fix it before running.",
    },

    results: {
      title: "2) Run + read the snapshot",
      subtitle:
        "After a run, you’ll see a simple summary: how many trades happened, how often they won, and the overall profit/loss for the test period.",
    },

    safety: {
      title: "Safety (why this won’t blow up your account)",
      items: [
        "This page does not place real trades.",
        "Server validation will reject unsafe configs (too many symbols, extreme steps, bad dates).",
        "Backtests run in your account context only, with access controls.",
        "Artifacts will only be downloadable for jobs you created.",
      ],
    },
  },

  fields: {
    symbols: {
      label: "Symbols",
      placeholder: "SPY,QQQ,AAPL",
      help: "Comma-separated tickers. Beginner-friendly starter: SPY, QQQ, AAPL.",
    },

    tfEntry: {
      label: "Entry timeframe",
      help: "How often we look for entries (smaller = more trades).",
    },

    tfBias: {
      label: "Bias timeframe",
      help: "The “bigger picture” trend filter (bigger = smoother).",
    },

    start: {
      label: "Start date",
      help: "Beginning of the historical test window.",
    },

    end: {
      label: "End date",
      help: "End of the historical test window.",
    },

    warmup: {
      label: "Warmup bars",
      help: "Extra candles to ‘warm up’ indicators before counting results.",
    },

    steps: {
      label: "Max steps",
      help: "A compute limit. Lower is faster. Higher tests more history.",
    },

    qty: {
      label: "Qty",
      help: "Position size for the simulation (paper math only).",
    },
  },

  buttons: {
    run: "Run (paper backtest)",
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
    title: "Quick fixes:",
    ok: "Looks good. Ready to run.",
  },

  empty: {
    title: "Nothing yet",
    body: "Hit Run to generate a sample snapshot and see how the results area works.",
  },

  progress: {
    title: "Working…",
    body: "Job id:",
  },

  metrics: {
    trades: "Trades",
    winRate: "Win rate",
    pnl: "PnL",
    maxDD: "Max drawdown",
    avgTrade: "Avg per trade",
    exposure: "Exposure",
  },

  artifacts: {
    title: "Downloads (coming soon)",
    report: "report.txt",
    json: "run.json",
    csv: "trades.csv",
    note: "Once the backend is connected, these buttons will download real files from your run.",
  },

  errors: {
    invalid: {
      title: "Fix a couple things",
      body: "Update the fields below, then try again.",
    },
  },
} as const;