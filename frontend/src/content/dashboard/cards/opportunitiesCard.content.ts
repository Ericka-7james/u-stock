// frontend/src/content/dashboard/cards/opportunitiesCard.content.ts

export const OPPORTUNITIES_CARD_COPY = {
  title: "Opportunities",
  subtitle: "Bot-ranked picks (requires a bot running).",

  states: {
    loading: "Loading…",
    requiresBotFallback: "Start a bot to generate opportunities.",
    empty: "No opportunities returned yet.",
  },

  row: {
    scorePrefix: "Score:",
    symbolFallback: "—",
    clickTitle: "Click to load this symbol",
  },
} as const;