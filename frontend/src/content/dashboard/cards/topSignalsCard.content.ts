// frontend/src/content/dashboard/cards/topSignalsCard.content.ts

export const TOP_SIGNALS_CARD_COPY = {
  title: "Top signals",

  tooltip: {
    title: "How are top signals ranked?",
    intro:
      "These signals come from your processed datasets (or your backend ranking endpoint). They combine daily, intraday, and multiday indicators to score each ticker.",

    bullets: [
      { label: "Score", text: "Combined signal strength." },
      { label: "1d", text: "Daily return factor." },
      { label: "Intraday", text: "Short-term momentum." },
      { label: "5d", text: "Multiday trend strength." },
    ],

    footer: "Scores are recalculated each time your data pipeline runs.",
  },

  states: {
    loading: "Loading signals…",
    empty: {
      line1: "No signals available yet.",
      line2: "If this is unexpected: start your backend ranking endpoint or run your pipeline.",
    },
  },

  table: {
    headers: {
      ticker: "Ticker",
      score: "Score",
      d1: "1d",
      intraday: "Intraday",
      d5: "5d",
    },
    rowTitle: "Click to load this ticker",
  },
} as const;