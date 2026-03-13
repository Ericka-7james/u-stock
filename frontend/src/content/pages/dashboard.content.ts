// frontend/src/content/dashboardpage.content.ts
export const DASHBOARD_PAGE_COPY = {
  loading: {
    generic: "Loading…",
    leaders: "Loading leaders…",
  },

  errors: {
    tradeSummary: {
      detailsCta: "Details",
    },
    opportunities: {
      detailsCta: "Details",
    },
    marketLeaders: {
      detailsCta: "Details",
    },
    bars: {
      detailsCta: "Details",
    },
  },

  labels: {
    selectedRangePrefix: "Selected range:",
    alpacaFetchedPrefix: "Alpaca fetched:",
  },

  // ✅ DataSnapshotsCard
  dataSnapshots: {
    title: "Data snapshots",
    signalsLabel: "Signals:",
    pricesLabel: "Prices:",
    universeLabel: "Universe size (prices):",
    empty: "—",
    emptyUniverse: "---",
  },

  defaults: {
    fallbackTicker: "AAPL",
  },
} as const;