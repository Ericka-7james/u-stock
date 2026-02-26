// src/content/indexfundspage.content.ts

export const INDEX_FUNDS_PAGE_COPY = {
  header: {
    title: "Market Baselines",
    subtitle: "Baseline ETFs give Lucent context: risk-on vs risk-off, trend vs range, and volatility.",
    body:
      "These ETFs act as Lucent’s system context layer. They don’t generate trades on their own — they help interpret the environment so strategies can behave more safely and consistently.",
    heroAlt: "Lucent Financial market baselines mascot",
    metaPrefix: "Status:",
    metaStatus: "docs-first",
    metaSuffix: "(live baseline tiles can be added after the API endpoint is finalized)",
    backLabel: "← Back to dashboard",
  },

  tabs: {
    ariaLabel: "Market baselines tabs",

    defaultKey: "baselines",

    keys: {
      baselines: "baselines",
      universe: "universe",
    },

    labels: {
      baselines: "How Lucent uses baselines",
      universe: "Baseline universe",
    },
  },

  sections: {
    whatMeans: {
      title: 'What “baseline context” means',
      body:
        "Lucent treats broad-market ETFs as a reference layer for decision-making. If the overall market is trending cleanly, strategies behave differently than they would in choppy range conditions.",
      bullets: [
        {
          strong: "Regime detection:",
          text: "trend vs range helps select safer behavior (or pause automation).",
        },
        {
          strong: "Risk-on vs risk-off:",
          text: "small caps and growth strength often signals higher risk appetite.",
        },
        {
          strong: "Volatility awareness:",
          text: "wider ranges can require smaller sizing or stricter gating rules.",
        },
        {
          strong: "Context for rankings:",
          text: "a stock moving “with the market” is different from moving on its own.",
        },
      ],
    },

    connects: {
      title: "How this connects to bots + runner states",
      lead:
        "Lucent’s direction is transparent automation. Strategies can generate intents, but execution is gated and observable.",
      boldWord: "intents",
      bullets: [
        {
          strong: "Strategy layer:",
          text: "a bot reads bars/indicators and emits TradeIntents (entry/stop/TP).",
        },
        {
          strong: "Runner layer:",
          text: "applies gating rules like market hours, risk caps, and wait states.",
        },
        {
          strong: "Execution layer:",
          text: "routes paper vs live and records transaction events end-to-end.",
        },
        {
          strong: "Baseline layer:",
          text: "provides context to inform gating (ex: chop day → reduce activity).",
        },
      ],
      tail:
        "This page defines the baseline layer so your UI has a clean explanation before you wire in live data.",
    },
  },

  universeCard: {
    labels: {
      role: "Role:",
      usedFor: "Used for:",
    },
    values: {
      role: "System context",
    },
    useJoiner: " • ",
  },

  baselines: [
    {
      ticker: "SPY",
      name: "SPDR S&P 500 ETF Trust",
      blurb: "Large-cap market baseline and broad risk gauge.",
      use: ["Market breadth proxy", "Trend/range regime", "Index-relative moves"],
    },
    {
      ticker: "QQQ",
      name: "Invesco QQQ Trust",
      blurb: "Growth/tech-heavy proxy; often leads momentum days.",
      use: ["Risk-on appetite", "Momentum regime", "Volatility sensitivity"],
    },
    {
      ticker: "IWM",
      name: "iShares Russell 2000 ETF",
      blurb: "Small-cap proxy; helpful for risk-on vs risk-off read.",
      use: ["Risk appetite", "Breadth confirmation", "Rotation signal"],
    },
    {
      ticker: "VTI",
      name: "Vanguard Total Stock Market ETF",
      blurb: "Total U.S. market exposure; longer-horizon baseline.",
      use: ["Macro baseline", "Beta reference", "System-wide drift"],
    },
    {
      ticker: "TLT",
      name: "iShares 20+ Year Treasury Bond ETF",
      blurb: "Rates-sensitive risk-off baseline (optional but useful).",
      use: ["Risk-off confirmation", "Macro stress signal", "Hedge context"],
    },
  ],
} as const;