// src/content/datasources.content.ts
export const DATASOURCES_PAGE_COPY = {
  header: {
    title: "Data Sources",
    subtitle:
      "This page is for market context + observability — view today’s top movers and filter bot logs to validate behavior. (Start/Stop controls live on the Dashboard.)",
    actions: {
      backToDashboardLabel: "← Back to dashboard",
      connectedAppsLabel: "Connected apps →",
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
