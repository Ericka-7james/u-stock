// frontend/src/content/pages/aboutPage.content.ts

export const ABOUT_PAGE_COPY = {
  header: {
    title: "About Lucent Financial",
    tagline: "Transparent automation. Community-centered access.",
  },

  intro: {
    primary:
      "Lucent Financial (formerly U-Stock) is a transparent market intelligence and automation workspace built to give everyday investors clearer control over their money — especially those historically excluded from institutional tools.",
    secondary:
      "The platform separates analysis from execution. Strategies generate intents first. You inspect them. You decide whether to route to paper or live. No mystery trades. No hidden automation.",
    tertiary:
      "Lucent is designed for hands-on learning and hands-off scaling — but always with visibility, audit trails, and guardrails first.",
  },

  sections: {
    mission: {
      title: "Why Lucent exists",
      body:
        "Access to automation shouldn’t require institutional capital or blind trust. Many communities — especially people of color — have been excluded from transparent financial tooling or pushed toward high-risk speculation without context.",
      note:
        "Lucent is built to close that gap: clear signals, readable states, supervised automation, and infrastructure you can actually understand.",
    },

    howItWorks: {
      title: "How it works",
      items: [
        "Chart-first discovery with strict symbol validation",
        "Backend APIs serving market data, runtime health, and strategy state",
        "A modular runner loop that produces trade intents — not direct orders",
        "Execution routing (paper or live) with event logging end-to-end",
      ],
    },

    transparency: {
      title: "Designed to be inspectable",
      body:
        "Lucent treats waiting as a valid output. If the correct action is to do nothing, the system says so. Signals are traceable. Strategy states are visible. Logs are readable.",
      note:
        "Automation is supervised by design. Analysis and execution are intentionally separated to reduce risk and increase trust.",
    },

    coreFeatures: {
      title: "Core features",
      items: [
        "Intent-first strategy architecture (suggestions before execution)",
        "Backtesting infrastructure with historical replay support",
        "Observable runner states (Running, Waiting, Paused, Offline)",
        "Strict input validation and safety gates before automation",
      ],
    },

    safety: {
      title: "Risk-first defaults",
      items: [
        "Paper trading as the default mode",
        "Explicit broker connection required for live routing",
        "Sizing gates and configurable safeguards",
        "Clear system states instead of silent failures",
      ],
    },

    techStack: {
      title: "Tech stack",
      items: [
        "React (Vite) frontend with modular UI architecture",
        "Python (FastAPI) backend services",
        "Strategy runner + execution engine (intent-driven design)",
        "Market data integrations and structured logging",
        "Vitest + Pytest with coverage thresholds",
        "GitHub Actions CI + Vercel deployment",
      ],
    },

    provides: {
      title: "What Lucent provides",
      items: [
        "Transparent strategy outputs you can audit before acting",
        "Clear separation between strategy logic and order execution",
        "Paper-first learning progression before scaling capital",
        "End-to-end observability from signal to trade event",
      ],
    },

    defaults: {
      title: "Defaults",
      kv: [
        { k: "Default mode", v: "Paper trading" },
        { k: "Automation style", v: "Intent-first and supervised" },
        { k: "Primary value", v: "Transparency over speculation" },
      ],
    },

    builder: {
      title: "About the builder",
      bio:
        "Ericka James is a Software Engineer with experience building production-grade systems in regulated financial environments. Her background spans backend services, automation pipelines, API design, testing infrastructure, and risk-aware system architecture.",
      extended:
        "Lucent Financial is an independent build focused on modular strategy design, historical backtesting infrastructure, observable automation states, and community-centered access to financial tooling. The goal is to make automation understandable — not mysterious — and to create infrastructure that empowers individuals to participate confidently in markets.",
      links: [
        { label: "GitHub → ericka-7james", href: "https://github.com/ericka-7james" },
        { label: "LinkedIn → erickasmileyjames", href: "https://www.linkedin.com/in/erickasmileyjames" },
      ],
    },
  },
} as const;