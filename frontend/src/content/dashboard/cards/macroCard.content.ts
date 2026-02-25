// frontend/src/content/dashboard/cards/macroCard.content.ts

export const MACRO_CARD_COPY = {
  title: "Macro",

  tooltip: {
    title: "Macro help",
    body: "US macro snapshot (FRED): rates, inflation (CPI YoY), labor, and a simple risk signal.",
  },

  pill: {
    unknown: "Unknown",
  },

  states: {
    loading: "Loading…",
  },

  labels: {
    fedFunds: "Fed Funds (DFF)",
    tenYear: "10Y Yield (DGS10)",
    cpiYoY: "CPI YoY",
    unemployment: "Unemployment (UNRATE)",
  },

  footer: {
    sourcePrefix: "Source:",
    sourceFallback: "—",
    dot: " · ",
    cacheFallback: "cached 10m",
    cachePrefix: "cached ",
    cacheSuffix: "m",
  },
} as const;