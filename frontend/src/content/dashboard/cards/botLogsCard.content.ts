// frontend/src/content/dashboard/cards/botLogsCard.content.ts
export const BOT_LOGS_CARD_COPY = {
  header: {
    title: "Bot logs",
    subtitle: "Understand what the bot is doing — filter by day, outcome, and search terms.",
    chips: {
      botEffTitle: "Bot effective state",
      filteredEventsTitle: "Filtered events",
      issuesTitle: "Warnings/errors in filtered range",
      noIssuesTitle: "No warnings/errors in filtered range",
      eventsSuffix: "events",
      issuesSuffix: "issues",
      noIssuesValue: "0 issues",
    },
    quickLink: {
      title: "Connected apps →",
      aria: "Go to Connected apps",
    },
  },

  statusPill: {
    running: "Live",
    waiting: "Waiting for market",
    paused: "Paused",
    offline: "Runner offline",
    error: "Error",
    starting: "Starting…",
    stopping: "Stopping…",
    unknown: "Unknown",
  },

  explainer: {
    running: {
      title: "Live: scanning for trades",
      body: "The bot is online and evaluating signals. Orders may be placed if risk checks pass.",
    },
    waiting: {
      title: "Waiting for market open",
      bodyPrefix: "The market is closed, so the bot is idle. Next open:",
      nextOpenFallback: "—",
      metaPrefix: "Next open:",
    },
    paused: {
      title: "Paused",
      body: "The bot is not trading right now. Start the bot from the Dashboard when you’re ready.",
    },
    starting: {
      title: "Starting up",
      body: "Loading configuration and checking connectivity.",
    },
    offline: {
      title: "Runner offline",
      body: "U-Stock isn’t receiving runner heartbeats. Check your runner host and API connectivity.",
    },
    error: {
      title: "Error state",
      body: "The bot reported an error. Review recent issues below and the raw details in “View all”.",
    },
    degraded: {
      title: "Degraded",
      body: "The bot is running, but some dependencies may be failing (data/broker/session). Review recent issues.",
    },
    unknown: {
      title: "Status unknown",
      body: "The bot status couldn’t be determined. Refresh and verify the runner is online.",
    },
  },

  controls: {
    bot: "Bot",
    day: "Day",
    outcome: "Outcome",
    search: "Search",
    limit: "Limit",

    outcomes: {
      all: "All",
      good: "Normal",
      issues: "Issues",
    },

    dayFallbackLoading: "Loading…",
    dayFallbackNone: "No days yet",

    searchPlaceholder: "Search events, categories, raw details…",
  },

  buttons: {
    refreshIdle: "Refresh",
    refreshBusy: "Refreshing…",
    viewAll: "View all",
    close: "Close",
  },

  banners: {
    loadFailTitle: "Couldn’t load logs",
  },

  list: {
    loading: "Loading events…",
    empty: "No events match these filters yet.",
  },

  modal: {
    titlePrefix: "Bot events",
    sep: " · ",
  },

  details: {
    details: "Details",
    rawLog: "Raw log",
    raw: {
      level: "Level",
      message: "Message",
      meta: "Meta",
      dash: "—",
    },
  },

  severity: {
    ok: "OK",
    warn: "WARN",
    error: "ERROR",
  },

  classify: {
    fallbackUpdate: "Update",
    category: {
      system: "System",
      market: "Market",
      orders: "Orders",
      risk: "Risk",
      strategy: "Strategy",
      runner: "Runner",
    },
    action: {
      update: "Update",
      waiting: "Waiting",
      starting: "Starting",
      running: "Running",
      paused: "Paused",
      offline: "Offline",
      runner: "Runner",
      order: "Order",
      fill: "Fill",
      rejected: "Rejected",
      blocked: "Blocked",
      issue: "Issue",
    },
    headline: {
      waiting: "Market is closed — bot is waiting",
      waitingDetail: "No trades will be placed until the next open.",

      starting: "Bot is starting up",
      startingDetail: "Loading config and checking market session.",

      running: "Bot is running",
      runningDetail: "Scanning for setups and evaluating signals.",

      paused: "Bot is paused",
      pausedDetail: "Start the bot from the Dashboard to resume.",

      offlineBad: "Runner appears offline",
      offlineOk: "Runner heartbeat received",
      offlineBadDetail: "U-Stock runner is not reporting in. Check your runner host.",
      offlineOkDetail: "Runner is online and reporting.",

      orderSubmitted: "Order submitted",
      orderFilled: "Order filled",
      orderRejected: "Order rejected",

      riskBlocked: "Risk controls blocked an action",

      issueFallback: "Something needs attention",
    },
  },
} as const;