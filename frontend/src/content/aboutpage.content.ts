// src/content/aboutpage.content.ts
export const ABOUT_PAGE_COPY = {
  header: {
    title: "About Lucent Financial",
    tagline: "Access to smarter financial decisions.",
  },

  intro: {
    primary:
      "Lucent Financial is a financial intelligence dashboard that organizes market data into a clear, explainable decision workflow: discover what’s moving, understand context, and translate signals into action.",
    secondary:
      "Transparency is the product. Signals are labeled, sources are visible, and the system separates analysis (what it thinks) from execution (what it trades). The goal is consistency and control, not hype.",
    tertiary:
      "Paper trading is supported by default, with live execution available through connected brokers.",
  },

  sections: {
    howItWorks: {
      title: "How it works",
      items: [
        "Dashboard UI for discovery, charting, and quick context",
        "Backend APIs for market data, integrations, and bot runtime status",
        "Runner loop that produces intents and routes execution",
        "Execution engine that records transaction events",
      ],
    },

    transparency: {
      title: "Designed to be transparent",
      body:
        "Every output should be inspectable: what moved, why a symbol is ranked, and what a bot is trying to do. “Waiting for market” is treated as a healthy state, not a failure.",
      note:
        "Clear separation between ideas and actions helps keep automation safe and understandable.",
    },

    coreFeatures: {
      title: "Core features",
      items: [
        "Market leaders + opportunities with labeling",
        "Chart-first workflow (click a symbol and load context)",
        "Bot status controls + runner health model",
        "Intent feed: a visible log of strategy suggestions",
      ],
    },

    techStack: {
      title: "Tech stack",
      items: [
        "React",
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
        "Market leaders + movers with clean formatting and strict symbol validation",
        "Bot “intents” (suggestions) that can be reviewed before execution",
        "Runner health status model (Running, Armed/Waiting, Paused, Offline)",
        "Paper vs live execution routing with transaction events tracked end-to-end",
      ],
    },

    defaults: {
      title: "Defaults",
      kv: [
        { k: "Default mode", v: "Paper" },
        { k: "Data sources", v: "APIs + pipelines" },
        { k: "Focus", v: "Transparency + control" },
      ],
    },

    builder: {
      title: "About the builder",
      bio:
        "Built by Ericka James (Software Engineer). Focused on clean UX, transparent automation, and production-grade workflows.",
      links: [
        {
          label: "GitHub → ericka-7james",
          href: "https://github.com/ericka-7james",
        },
        {
          label: "LinkedIn → erickasmileyjames",
          href: "https://www.linkedin.com/in/erickasmileyjames",
        },
      ],
    },
  },
} as const;
