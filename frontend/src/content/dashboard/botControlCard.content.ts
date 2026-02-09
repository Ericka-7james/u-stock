// frontend/src/content/dashboard/botControlCard.content.js

export const BOT_CONTROL_CARD_CONTENT = {
  title: "Bot Control",
  help:
    "Select a bot, then Arm → Start. Pause anytime. Arm is persisted server-side until you Disarm.",

  loading: {
    overlayLabel: "Loading bot…",
    overlaySubtitle: "Fetching intent, desired, status…",
  },

  pills: {
    paper: {
      label: "PAPER",
      title: "Paper trading only (live soon).",
    },
    armed: {
      none: "—",
      armed: "ARMED",
      disarmed: "DISARMED",
      titleNone: "Select a bot first.",
      titleArmed: "Armed (persisted). Start enabled.",
      titleDisarmed: "Arm to enable Start.",
    },
  },

  select: {
    label: "Bot",
    placeholder: "Select a bot…",
    hintNone: "Pick a bot to unlock intents + aligned picks.",
  },

  actions: {
    viewLog: "View log",
    risk: "Risk Controls",
    arm: "Arm",
    disarm: "Disarm",
    start: "Start",
    pause: "Pause",
    startTitleNone: "Select a bot first.",
    startTitleNotArmed: "Arm first.",
    startTitleOk: "Start bot",

    // ✅ added for market-closed behavior
    startTitleMarketClosed: "Market is closed. Start will run at next open.",
    startBlockedMarketClosed: "Market is closed. Start is disabled until the next open.",
    nextOpenPrefix: "Next open: ",
  },

  tiles: {
    intent: "Intent",
    effective: "Effective",
    desired: "Desired",
    heartbeat: "Heartbeat",
    market: "Market",
    nextOpen: "Next open",
    status: "Status",
  },

  // ✅ added so your statusLine references are consistent + centralized
  status: {
    noneSelected: "Select a bot to view status.",
    errorPrefix: "Error: ",
    offlinePrefix: "Offline · ",
    offlineSuffix: " since heartbeat",
    offlineNoHeartbeat: "Offline · no heartbeat",
    waitingForOpen: "Waiting for market open",
    starting: "Starting…",
    runningMarketClosed: "Running (market closed)",
    running: "Running",
    armedReady: "Armed (persisted) · Ready to start",
    paused: "Paused",
    idle: "Idle",
  },

  // ✅ added (used in the Market tile)
  market: {
    openNow: "Open now",
  },

  modals: {
    arm: {
      title: "Arm this bot?",
      cancel: "Cancel",
      confirm: "Confirm arm",
      helper: "This persists server-side (survives logout) until you Disarm.",

      // ✅ added (used by the modal layout rows)
      botLabel: "Arm:",
      modeLabel: "Mode:",
    },
    start: {
      title: "Start this bot?",
      cancel: "Cancel",
      confirm: "Confirm start",
      notArmed: "Not armed. Close and Arm first.",
      helper: "You can Pause anytime.",

      // ✅ added
      marketClosed: "Market is closed. Start will run at the next market open.",
      modePrefix: "Mode:",
      botLabel: "Start:",
    },
    log: {
      title: "Bot log",
      close: "Close",
      empty: "No log entries.",
      loading: "Loading…",
    },
    risk: {
      title: "Risk Controls",
      cancel: "Cancel",
      save: "Save",
      fields: {
        risk_per_trade: { label: "risk_per_trade", placeholder: "0.005" },
        max_trades_per_day: { label: "max_trades_per_day", placeholder: "3" },
        min_confidence: { label: "min_confidence", placeholder: "0.62" },
      },

      // ✅ added (inline validation UX)
      validationHint: "Fix the highlighted fields before saving.",
      errors: {
        risk_per_trade_format: "Enter a number like 0.005",
        risk_per_trade_range: "Must be > 0 and < 1 (example: 0.005)",
        max_trades_per_day_format: "Enter an integer like 3",
        max_trades_per_day_range: "Must be a whole number ≥ 0",
        min_confidence_format: "Enter a number like 0.62",
        min_confidence_range: "Must be between 0 and 1 (example: 0.62)",
      },
    },
  },
} as const;
