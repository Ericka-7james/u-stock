// frontend/src/content/dashboard/cards/priceChartPanel.content.ts

export const PRICE_CHART_PANEL_COPY = {
  title: "Price action viewer",

  tooltip: {
    title: "What is the Price action viewer?",
    body: ["This chart is powered by TradingView."],
    note:
      "The free embed supports changing candle interval (e.g., 15m/1h/1D). It does not let us force the visible date window. Use the chart controls to zoom/pan.",
  },

  subtitle: {
    candleIntervalPrefix: "Candle interval:",
    dot: " · ",
  },

  fallbacks: {
    symbol: "AAPL",
    interval: "60",
  },

  errors: {
    initFailedPrefix: "TradingView init failed:",
  },
} as const;