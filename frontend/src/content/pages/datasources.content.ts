// src/content/datasources.content.ts
export const DATASOURCES_PAGE_COPY = {
  header: {
    title: "Data Sources",
    subtitle:
      "This page is for market context + observability — view today’s top movers and filter bot logs to validate behavior. (Start/Stop controls live on the Dashboard.)",
    highlight: "market context + observability",
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
      title: "Market leaders",
      subtitle: "Top movers (today). Click a ticker to load it on the dashboard chart.",
    },
    botLogs: {
      title: "Bot logs",
      subtitle: "Filter by day, status, and search terms. Use logs to debug decisions + runner health.",
      defaultBotId: "ema_trend",
      maxPreview: 3,
      showQuickLink: true,
    },
  },
} as const;