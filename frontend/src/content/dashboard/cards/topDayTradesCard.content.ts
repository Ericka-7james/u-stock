// frontend/src/content/dashboard/cards/topDayTradesCard.content.ts

export const TOP_DAY_TRADES_CARD_COPY = {
  header: {
    title: "Top Day Trades",
    subtitle: "Live from Alpaca screener",
  },

  tabs: {
    mostActive: "Most Active",
    topGainers: "Top Gainers",
  },

  states: {
    loading: "Loading top tickers…",
    empty: {
      line1: "No results yet.",
      line2: "If Alpaca isn’t connected, reconnect in Connected Apps.",
    },
  },

  table: {
    columns: {
      symbol: "Symbol",
      price: "Price",
      chgPct: "Chg%",
      volume: "Volume",
    },
  },

  // UI behavior knobs
  limits: {
    maxRows: 10,
  },
} as const;