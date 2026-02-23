// frontend/src/content/pages/aboutPage.content.ts
export const ABOUT_PAGE_COPY = {
  header: {
    title: "About Lucent Financial",
    tagline: "Transparent market intelligence, built for control.",
  },

  intro: {
    primary:
      "Lucent Financial is a market intelligence dashboard that turns noisy market data into a clear decision workflow: find what’s moving, add context, then act with intent.",
    secondary:
      "The priority is explainability. Signals are labeled, sources are visible, and automation is separated into two layers: analysis (what it thinks) and execution (what it trades).",
    tertiary:
      "Paper trading is the default. Live execution only happens when you explicitly connect a broker and enable a strategy.",
  },

  sections: {
    howItWorks: {
      title: "How it works",
      items: [
        "Dashboard UI for discovery, charting, and quick context",
        "Backend APIs for market data, integrations, and bot runtime status",
        "Runner loop that produces intents and applies risk gates",
        "Execution engine that records trade events end-to-end",
      ],
    },

    transparency: {
      title: "Designed to be inspectable",
      body:
        "Lucent treats “doing nothing” as a valid output. If the system is waiting for the market, that’s a healthy state, not a failure. Every suggestion should be reviewable: what changed, what triggered it, and what the bot would do next.",
      note:
        "Keeping ideas separate from actions makes automation safer and easier to trust.",
    },

    coreFeatures: {
      title: "Core features",
      items: [
        "Market leaders and movers with strict symbol validation",
        "Chart-first workflow (select a symbol, load context instantly)",
        "Bot controls + runner health status model",
        "Intent feed: strategy suggestions you can audit",
      ],
    },

    techStack: {
      title: "Tech stack",
      items: [
        "React (Vite)",
        "Python (FastAPI)",
        "Runner + execution engine",
        "APIs + data pipelines",
        "Pytest",
        "Vercel + GitHub",
      ],
    },

    provides: {
      title: "What Lucent provides",
      items: [
        "A clean, explainable view of market movement and context",
        "Bot intents (suggestions) before execution, not magic trades",
        "Runner health states (Running, Armed/Waiting, Paused, Offline)",
        "Paper vs live routing with events tracked from signal to fill",
      ],
    },

    defaults: {
      title: "Defaults",
      kv: [
        { k: "Default mode", v: "Paper trading" },
        { k: "Automation style", v: "Intent-first, reviewable" },
        { k: "Design goal", v: "Clarity over hype" },
      ],
    },

    builder: {
      title: "About the builder",
      bio:
        "Built by Ericka James (Software Engineer). Focused on clean UX, transparent automation, and production-grade workflows.",
      links: [
        { label: "GitHub → ericka-7james", href: "https://github.com/ericka-7james" },
        { label: "LinkedIn → erickasmileyjames", href: "https://www.linkedin.com/in/erickasmileyjames" },
      ],
    },
  },
} as const;