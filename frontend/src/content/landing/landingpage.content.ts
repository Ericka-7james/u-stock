// frontend/src/content/landing/landingPage.content.ts

import heroIllustration from "../../assets/images/LandingPageIcon_v2.png";
import visionImage from "../../assets/images/companyHope.png";

export const LANDING_PAGE_CONTENT = {
  assets: {
    heroIllustration,
    visionImage,
  },
  copy: {
    hero: {
      kicker: "Beginner-friendly • Risk-first • Transparent by design",
      titleLines: ["Trading clarity for people", "who don’t want to guess."],
      subtitle:
        "U-Stock helps everyday users trade and invest with structure — not hype. You get a clean workspace for charts, context, and risk controls, plus an explainable “what happened / why” trail so you can learn, stay consistent, and build confidence over time.",
      ctas: {
        primary: "Sign in / Sign up",
        secondary: "Learn more",
      },
      metrics: [
        { top: "Made for beginners", bottom: "Start guided + paper first" },
        { top: "Risk-first", bottom: "Guardrails before automation" },
        { top: "Explainable", bottom: "Clarity without exposing IP" },
      ],
    },

    why: {
      title: "Why U-Stock?",
      body:
        "Most people aren’t trying to become full-time day traders — they just want a real edge: a system that reduces guesswork, keeps risk visible, and teaches better decision-making. U-Stock is built for that: a clear cockpit you can understand, monitor, and improve — whether you’re investing, swing trading, or learning intraday.",
      cards: [
        {
          tag: "Clarity",
          title: "Clarity you can understand",
          body:
            "Clear status, readable workflows, and decision breadcrumbs so users can learn what changed and why — without needing “trader jargon.”",
        },
        {
          tag: "Risk-first",
          title: "Risk controls by default",
          body:
            "U-Stock emphasizes guardrails: position sizing, safety gates, and “paper-first” progression so users build confidence responsibly.",
        },
        {
          tag: "Transparency",
          title: "Transparency without oversharing",
          body:
            "You get explainability and accountability without exposing proprietary internals. The goal is trust and supervision — not reverse-engineering.",
        },
      ],
    },

    bigCard: {
      eyebrow: "Where this is going",
      titleLines: ["Level up your investments with", "Smart Financial Insights"],
      subtitle:
        "U-Stock is built for everyday users who want clearer decisions — with transparent signals, visible risk, and a guided path from learning → paper → supervised automation.",
      roadmap: [
        { label: "Now", text: "Charts, market snapshots, bot status + logs, and a decision-ready cockpit." },
        { label: "Next", text: "Paper trading + journaling (wins/losses, R-multiples, screenshots, notes)." },
        { label: "Soon", text: "Guided automation: scanning + broker execution with strict safety gates." },
      ],
      ctas: {
        primary: "Get Started",
        roadmap: "Roadmap",
      },
    },

    modal: {
      title: "U-Stock Roadmap",
      blocks: [
        {
          pill: "Now",
          text: "Charts, market snapshots, bot status + logs, and a decision-ready cockpit focused on clarity.",
        },
        {
          pill: "Next",
          text:
            "Paper trading + journaling: wins/losses, R-multiples, screenshots, notes, and “what happened / why” playback to help users improve.",
        },
        {
          pill: "Soon",
          text:
            "Guided automation: scanning + broker execution with strict safety gates, monitoring, and transparent decision trails — built for trust and supervision.",
        },
      ],
      note: "Interested in partnerships, pilots, or investment? The roadmap is intentionally production-first.",
      footer: {
        close: "Close",
        earlyAccess: "Get early access",
      },
    },
  },
} as const;
