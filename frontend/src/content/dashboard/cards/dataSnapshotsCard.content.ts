// frontend/src/content/dashboard/cards/dataSnapshotsCard.content.ts

export const DATA_SNAPSHOTS_CARD_COPY = {
  title: "Data snapshots",
  fallback: {
    datetime: "—",
    universeSize: "---",
  },
  rows: {
    signals: "Signals:",
    prices: "Prices:",
    universe: "Universe size (prices):",
  },
} as const;