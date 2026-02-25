// frontend/src/content/dashboard/cards/botControlCard.content.ts
export const BOT_CONTROL_CARD_CONTENT = {
  title: "Bot control",
  help: "Select a bot, arm it, then start. Use Risk to tune guardrails. View log shows recent bot events.",

  loading: {
    overlayLabel: "Loading bot state…",
    overlaySubtitle: "Syncing desired state, effective state, and runner heartbeat.",
  },

  pills: {
    paper: { label: "Paper", title: "Paper trading mode" },
    armed: {
      none: "No bot",
      armed: "Armed",
      disarmed: "Disarmed",
      titleNone: "Select a bot to arm/start",
      titleArmed: "Bot is armed (allowed to place orders when started)",
      titleDisarmed: "Bot is disarmed (cannot place orders)",
    },
  },

  select: {
    label: "Bot",
    placeholder: "Choose a bot…",
    hintNone: "Select a bot to view status and controls.",
    staleHint: "Previously selected bot is unavailable. Please choose again.",
  },

  actions: {
    viewLog: "View log",
    risk: "Risk",
    arm: "Arm",
    disarm: "Disarm",
    pause: "Pause",
    start: "Start",

    startTitleNone: "Select a bot to start",
    startTitleNotArmed: "Arm the bot before starting",
    startTitleMarketClosed: "Market is closed. Start is blocked until open.",
    startTitleOk: "Start the bot",

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

  market: {
    openNow: "Open now",
  },

  modals: {
    arm: {
      title: "Arm bot",
      cancel: "Cancel",
      confirm: "Arm",
      botLabel: "Bot",
      modeLabel: "Mode",
      helper: "Arming means the bot is allowed to place orders once started (still guarded by risk checks).",
    },

    start: {
      title: "Start bot",
      cancel: "Cancel",
      confirm: "Start",
      botLabel: "Bot",
      modePrefix: "Mode:",
      helper: "Starting begins scanning and may place orders when risk checks pass.",
      notArmed: "This bot is not armed yet. Arm first to allow orders.",
      marketClosed: "Market appears closed. Start may be blocked until the next open.",
    },

    log: {
      title: "Recent bot events",
      close: "Close",
      loading: "Loading events…",
      empty: "No events yet.",
      updating: "Updating…",
      summary: {
        rawLog: "Raw log",
        level: "Level",
        event: "Event",
        message: "Message",
        payload: "Payload",
      },
      severity: { ok: "OK", warn: "WARN", error: "ERROR" },
      fallback: { update: "Update", event: "Event", dash: "—" },
      systemChip: "System",
    },

    risk: {
      title: "Risk settings",
      cancel: "Cancel",
      save: "Save",
      validationHint: "Fix the highlighted fields to save.",
      fields: {
        risk_per_trade: {
          label: "Risk per trade",
          placeholder: "e.g. 0.01",
        },
        max_trades_per_day: {
          label: "Max trades per day",
          placeholder: "e.g. 3",
        },
        min_confidence: {
          label: "Min confidence",
          placeholder: "e.g. 0.60",
        },
      },
    },
  },
} as const;