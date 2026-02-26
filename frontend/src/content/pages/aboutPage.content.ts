// frontend/src/content/pages/aboutPage.content.ts

export const ABOUT_PAGE_COPY = {
  header: {
    title: "About Lucent Financial",
    tagline: "Market clarity with risk-first guardrails.",
  },

  intro: {
    primary:
      "Lucent Financial (aka U-Stock) is a market intelligence workspace designed to turn noisy price action into a clean decision workflow: discover what’s moving, add context, then act with intent.",
    secondary:
      "The priority is inspectability. Signals and states are readable, sources are visible, and automation is designed to be supervised instead of “hands-off.”",
    tertiary:
      "Paper trading is the default. Live execution only happens when you explicitly connect a broker and enable a strategy.",
  },

  sections: {
    howItWorks: {
      title: "How it works",
      items: [
        "A chart-first dashboard for discovery, context, and quick inspection",
        "Backend APIs for market data, integrations, and runtime status",
        "A runner loop that produces intents and applies safety gates",
        "An execution path that logs events end-to-end for auditability",
      ],
    },

    transparency: {
      title: "Designed to be inspectable",
      body:
        "Lucent treats “doing nothing” as a valid output. Waiting for the market is a healthy state, not a failure. Every suggestion should be reviewable: what changed, what triggered it, and what the bot would do next.",
      note:
        "Keeping analysis separate from execution makes automation safer and easier to trust.",
    },

    coreFeatures: {
      title: "Core features",
      items: [
        "Market leaders and movers with strict symbol validation",
        "Fast chart + context workflow (select a symbol, inspect instantly)",
        "Bot control surface + runner health/status states",
        "Intent-first automation: suggestions you can audit before action",
      ],
    },

    safety: {
      title: "Risk-first defaults",
      items: [
        "Paper-first progression (learn, test, then scale responsibly)",
        "Guardrails before automation (sizing, gates, and explicit enablement)",
        "Clear states (Running, Waiting, Paused, Offline) instead of silent failure",
      ],
    },

    techStack: {
      title: "Tech stack",
      items: [
        "React (Vite)",
        "Python (FastAPI)",
        "Runner loop + execution engine",
        "APIs + data pipelines",
        "Vitest + Pytest",
        "GitHub + Vercel",
      ],
    },

    provides: {
      title: "What Lucent provides",
      items: [
        "A clean, explainable view of market movement and context",
        "Bot intents (suggestions) before execution, not mystery trades",
        "Observable runner states and logs you can inspect",
        "Paper vs live routing with events tracked from signal to outcome",
      ],
    },

    defaults: {
      title: "Defaults",
      kv: [
        { k: "Default mode", v: "Paper trading" },
        { k: "Automation style", v: "Intent-first and reviewable" },
        { k: "Design goal", v: "Clarity over hype" },
      ],
    },

    builder: {
      title: "About the builder",
      bio:
        "Built by Ericka James (Software Engineer). Focused on clear UX, transparent automation, and production-grade workflows in risk-aware environments.",
      links: [
        { label: "GitHub → ericka-7james", href: "https://github.com/ericka-7james" },
        { label: "LinkedIn → erickasmileyjames", href: "https://www.linkedin.com/in/erickasmileyjames" },
      ],
    },
  },
} as const;
