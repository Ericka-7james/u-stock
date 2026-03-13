// src/content/datasources.content.ts

export const DATASOURCES_PAGE_COPY = {
  header: {
    title: "Data + Logs",
    subtitle:
      "Use this page for U.S. market context and Lucent observability. Review movers, inspect bot behavior, and validate what the system did and why. (Start/Stop controls live on the Dashboard.)",
    highlight: "market context and Lucent observability",
    actions: {
      backToDashboardLabel: "← Back to dashboard",
      connectedAppsLabel: "Connected apps →",
    },
  },

  config: {
    cacheTtlMs: 60_000,
    lastTickerKey: "ustock:last_ticker",

    marketLeaders: {
      endpoint: "/api/market/leaders?market=stocks&direction=up&limit=8",
      fallbackSource: {
        code: "alpaca_movers",
        label: "Alpaca market movers (today)",
      },
      fallbackMeta: { source: "alpaca_movers" },
    },
  },

  cards: {
    marketLeaders: {
      title: "Today’s movers",
      subtitle:
        "Top U.S. stock movers for today. Click a ticker to load it on the dashboard chart and inspect price action.",
      helper:
        "Movers are context, not a trade signal. Use them to find what’s active, then validate trend, liquidity, and risk.",
    },

    botLogs: {
      title: "System logs",
      subtitle:
        "Filter by day, status, and search terms. Logs help you validate decisions, runner states, and intent generation.",
      defaultBotId: "ema_trend",
      maxPreview: 3,
      showQuickLink: true,

      tips: {
        title: "How to read logs (fast)",
        items: [
          "Start with status changes: Waiting → Running → Done (or Paused/Offline).",
          "Look for intents next: what the strategy suggested and what gates allowed.",
          "If something looks wrong, search for the symbol + timeframe + reason codes.",
        ],
        note:
          "Lucent is built to be inspectable. If you can’t explain what happened from the logs, that’s a product bug, not a user failure.",
      },
    },

    integrity: {
      title: "Data integrity notes",
      subtitle:
        "Lucent prioritizes clarity over hype. Market data can vary by provider and timeframe. When in doubt, cross-check and stay paper-first.",
      bullets: [
        "Intraday candles can differ slightly between providers due to aggregation rules.",
        "Premarket and after-hours activity may show different liquidity and spreads.",
        "Backtests should be paired with forward-testing to understand real conditions.",
      ],
    },
  },
} as const;