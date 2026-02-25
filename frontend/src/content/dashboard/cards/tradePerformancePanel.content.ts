// frontend/src/content/dashboard/cards/tradePerformancePanel.content.ts

export const TRADE_PERFORMANCE_PANEL_COPY = {
  header: {
    title: "Opportunities",

    subtitles: {
      noBot: "No bot selected — choose a bot to enable bot-aligned picks.",
      paused: (botId: string) => `Bot paused: ${botId}`,
      running: (botId: string) => `Bot live: ${botId}`,
      waiting: (botId: string) => `Bot waiting: ${botId}`,
      starting: (botId: string) => `Bot starting: ${botId}`,
      offline: (botId: string) => `Bot offline: ${botId}`,
      unknown: (botId: string) => `Loading bot: ${botId}`,
      disarmed: (botId: string) => `Bot disarmed: ${botId}`,
      stopped: (botId: string) => `Bot stopped: ${botId}`,
      fallback: (botId: string) => `Bot: ${botId}`,
    },

    range: {
      labelPrefix: "Active range:",
      fallbackLabel: "—",
      aria: "Active range days",
    },
  },

  stats: {
    botStatus: {
      label: "Bot Status",
      values: {
        offline: "OFFLINE",
        paused: "PAUSED",
        waiting: "WAITING",
        starting: "STARTING",
        running: "LIVE",
        disarmed: "DISARMED",
        armed: "ARMED",
        stopped: "STOPPED",
        idle: "IDLE",
        empty: "—",
      },
      subs: {
        noBot: "Select a bot to enable bot-aligned picks.",
        unknown: "Loading status…",
        offline: "Runner offline — no heartbeat.",
        paused: "Paused by user.",
        waiting: "Waiting for market open.",
        starting: "Booting up…",
        running: "Using bot alignment",
        disarmed: "Bot disabled",
        armed: "Ready to run",
        stopped: "Bot stopped.",
        idle: "Standing by",
      },
    },

    tradesContext: {
      label: "Trades Context",
      winRatePrefix: "Win rate",
    },

    mini: {
      leaders: "Leaders",
      aligned: "Aligned",
      internal: "Internal Picks",
    },
  },

  cards: {
    intents: {
      title: "Bot Intents",
      refresh: "Refresh",

      headerLines: {
        selectBot: "Select a bot to view intents.",
        unknown: (botId: string) => `Loading bot status… showing last known intents for ${botId}.`,
        offline: (botId: string) => `Runner offline — showing last known intents for ${botId}.`,
        paused: (botId: string) => `Bot paused — showing last intents for ${botId}.`,
        waiting: (botId: string) => `Waiting for market — latest intents for ${botId}.`,
        starting: (botId: string) => `Starting — latest intents for ${botId}.`,
        disarmed: (botId: string) => `Bot disarmed — last intents (if any) for ${botId}.`,
        stopped: (botId: string) => `Bot stopped — last intents (if any) for ${botId}.`,
        ok: (botId: string) => `Showing latest 10 from ${botId}.`,
      },

      states: {
        loading: "Loading intents…",
        emptyNoBot: "Select a bot to view intents.",
        emptyNoIntents: "No intents yet. (When bot submits intents, they show here.)",
      },

      errors: {
        prefix: "Error:",
        loadFail: "Failed to load intents",
      },

      footnote: "Click an intent to load the symbol in the chart. Intents are suggestions, not orders.",
      updatedPrefix: "Updated",
      updatedFallback: "—",
    },

    topDayTrades: {
      title: "Top Day Trades (Opportunity)",

      tables: {
        aligned: {
          title: "Bot-aligned (leaders ∩ bot)",
          empty: {
            noBot: "Select a bot to enable aligned picks.",
            noOpp: "No bot opportunities yet.",
            offline: "Runner offline — last alignment may be stale.",
            noOverlap: "No overlap yet.",
          },
        },

        leaders: {
          title: "Market leaders (today)",
          empty: "No leaders returned yet.",
          sources: {
            computed: "ALPACA+Computed",
            plain: "ALPACA",
          },
        },

        internal: {
          title: "Internal (bot picks)",
          empty: "Bot opportunities not wired yet.",
        },
      },

      footnote: "Hover any pill to see full details. Prices are USD/share.",
    },
  },
} as const;