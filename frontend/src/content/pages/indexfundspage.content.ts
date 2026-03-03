// src/content/indexfundspage.content.ts

export const INDEX_FUNDS_PAGE_COPY = {
  header: {
    title: "Market Context",
    subtitle: "Lucent’s home base is the U.S. stock market, with risk-first learning built in.",
    body:
      "Lucent is built for supervised automation in U.S. equities. This page explains how Lucent uses market context today and gives you a learning runway: strategies to study, how to practice safely, and what to track so you can get better on purpose.",
    heroAlt: "Lucent Financial market context mascot",
    metaPrefix: "Status:",
    metaStatus: "launch-ready",
    metaSuffix: "(education-first; expands as strategy features ship)",
    backLabel: "← Back to dashboard",
  },

  tabs: {
    ariaLabel: "Market context tabs",
    defaultKey: "baselines",
    keys: {
      baselines: "baselines",
      universe: "universe",
    },
    labels: {
      baselines: "How Lucent uses context",
      universe: "Learn day trading + strategies",
    },
  },

  sections: {
    whatMeans: {
      title: 'What “market context” means',
      body:
        "Context is the backdrop behind every chart. A setup that looks clean in a trend can fail instantly in chop. Lucent uses a small set of U.S. market baselines to label the environment so strategies can behave more safely and predictably.",
      bullets: [
        {
          strong: "Trend vs chop:",
          text: "if the market is ranging, Lucent can reduce activity, tighten gates, or keep the runner in a wait state.",
        },
        {
          strong: "Risk appetite:",
          text: "growth and small caps often lead on risk-on days; bonds and defensives may lead when markets get cautious.",
        },
        {
          strong: "Volatility awareness:",
          text: "wide ranges can require smaller sizing, fewer attempts, or stricter risk caps.",
        },
        {
          strong: "Relative strength:",
          text: "a mover outperforming the market is different from a mover simply moving with the tape.",
        },
      ],
    },

    connects: {
      title: "How this connects to backtests, scans, and runner states",
      lead:
        "Lucent’s direction is supervised automation. Strategies generate intents first, and the runner applies gates before anything can execute.",
      boldWord: "intents",
      bullets: [
        {
          strong: "Scan layer:",
          text: "find what’s moving, then score whether it’s leading or just following the market.",
        },
        {
          strong: "Backtest layer:",
          text: "replay signals with context so results reflect real environments (trend days vs chop days).",
        },
        {
          strong: "Runner layer:",
          text: "use context to pick safer defaults (pause, wait, reduce activity, tighten risk caps).",
        },
        {
          strong: "Execution layer:",
          text: "paper vs live stays explicit, observable, and logged end-to-end.",
        },
      ],
      tail:
        "This page explains the ‘why’ now, so when live context tiles ship later, the UI already makes sense.",
    },

    learn: {
      title: "Learn day trading + strategies",
      body:
        "You don’t need ten strategies. You need one or two that you can explain, test, and repeat. Below are study cards you can use alongside Lucent while you learn the U.S. stock market.",
      cards: [
        {
          title: "Understand market structure first",
          blurb:
            "Focus on basics that show up in every chart: support/resistance, trend structure (higher highs/lows), volume, and liquidity. Most losses come from misreading the environment, not the entry signal.",
          bullets: [
            "Learn premarket vs regular hours behavior",
            "Know the difference between trending and ranging days",
            "Watch volume and how price reacts at key levels",
          ],
          tag: "Foundations",
        },
        {
          title: "Start with paper trading and a rulebook",
          blurb:
            "Treat paper like real money. Make a simple rulebook and follow it for 20 to 30 trades. The goal is consistency and review, not speed.",
          bullets: [
            "Define entry, stop, take-profit before clicking",
            "Risk a fixed amount per trade (even in paper)",
            "Write 1 sentence: why this trade exists",
          ],
          tag: "Practice",
        },
        {
          title: "Three starter strategies to study (pick one)",
          blurb:
            "These are common, teachable, and easy to test. Pick ONE and learn when it works, when it fails, and what the market looks like in both cases.",
          bullets: [
            "Trend pullback (EMA/VWAP pullback with structure)",
            "Breakout + retest (level breaks, then confirms)",
            "Mean reversion (range days, fading extremes with tight risk)",
          ],
          tag: "Strategy",
        },
        {
          title: "Risk management is the strategy",
          blurb:
            "Most accounts don’t blow up from one bad trade. They blow up from inconsistent risk. Your max loss rules matter more than your win rate.",
          bullets: [
            "Set a daily max loss and stop trading when hit",
            "Avoid revenge trading after a loss",
            "Size down when volatility expands",
          ],
          tag: "Risk",
        },
        {
          title: "Keep a trade journal Lucent-style",
          blurb:
            "Lucent is built around inspectability. Your learning should be, too. Journal like an engineer: inputs, decisions, outputs.",
          bullets: [
            "Screenshot before + after with notes",
            "Track setup type and market context",
            "Review weekly: what patterns repeat?",
          ],
          tag: "Review",
        },
        {
          title: "How Lucent fits into your learning",
          blurb:
            "Use Lucent to reduce noise: validate symbols, inspect context, review runner states, and test strategy behavior before you scale into automation.",
          bullets: [
            "Scan, then inspect what’s leading vs following",
            "Backtest ideas before believing them",
            "Keep execution supervised until you trust results",
          ],
          tag: "Lucent Workflow",
        },
      ],
    },
  },

  universeCard: {
    // This section is now "learning cards" but we keep naming to avoid touching CSS.
    labels: {
      role: "Focus:",
      usedFor: "Key takeaways:",
    },
    values: {
      role: "U.S. stock market",
    },
    useJoiner: " • ",
  },

  baselines: [
    {
      ticker: "SPY",
      name: "S&P 500 (U.S. large caps)",
      blurb: "Broad market tape reference used for context and relative strength.",
      use: ["Trend vs chop read", "Relative strength", "Risk appetite baseline"],
    },
    {
      ticker: "QQQ",
      name: "Nasdaq 100 (growth / tech)",
      blurb: "Risk appetite proxy that often leads momentum regimes.",
      use: ["Momentum regime", "Risk-on confirmation", "Volatility sensitivity"],
    },
    {
      ticker: "IWM",
      name: "Russell 2000 (small caps)",
      blurb: "Breadth and rotation proxy for risk appetite shifts.",
      use: ["Breadth check", "Rotation signal", "Risk appetite read"],
    },
    {
      ticker: "VTI",
      name: "Total U.S. stock market",
      blurb: "Wider baseline for longer-horizon drift and broad exposure.",
      use: ["Macro baseline", "Beta reference", "System drift"],
    },
    {
      ticker: "TLT",
      name: "Long-duration U.S. treasuries",
      blurb: "Rates-sensitive, risk-off context for stress regimes.",
      use: ["Risk-off lens", "Macro stress", "Defensive regime check"],
    },
  ],
} as const;