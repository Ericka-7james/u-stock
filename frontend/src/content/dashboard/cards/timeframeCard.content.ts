// frontend/src/content/dashboard/cards/timeframeCard.content.ts

export const TIMEFRAME_CARD_COPY = {
  header: {
    title: "Timeframe",
    subtitle:
      "Defaults to Past week. Used for filters and to set the chart candle interval (zoom is controlled in-chart).",
  },

  control: {
    buttonTitle: "Choose date range",
    modalTitle: "Choose date range",
    badgeFallback: "Past week",
  },

  modal: {
    footer: {
      cancel: "Cancel",
      resetWeek: "Reset to week",
      apply: "Apply",
    },

    sections: {
      quickRanges: "Quick ranges",
      customRange: "Custom range",
    },

    presets: [
      { id: "today", label: "Today" },
      { id: "24h", label: "Last 24h" },
      { id: "7d", label: "Past week" },
      { id: "30d", label: "Past 30 days" },
      { id: "90d", label: "Past 90 days" },
      { id: "ytd", label: "Year to date" },
      { id: "custom", label: "Custom" },
    ],

    custom: {
      startLabel: "Start",
      endLabel: "End",
    },

    note: {
      prefix:
        "Note: The TradingView embed can’t be forced to “show exactly this window”. We use this range to pick a sensible ",
      strong: "candle interval",
      suffix: "; you can zoom/pan inside the chart.",
    },
  },
} as const;