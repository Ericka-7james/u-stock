// src/components/pages/DatasourcesPage.jsx
import { Link } from "react-router-dom";
import AppShell from "../layout/AppShell";
import "../../css/pages/DatasourcesPage.css";

/**
 * NOTE (2026):
 * This page used to import legacy "raw" config lists (trackedTickers, sources).
 * Those files are no longer part of the current U-Stock frontend.
 *
 * For now, keep this page build-safe and aligned with the current direction:
 * - Document the active data layer at a high level
 * - Avoid importing stale config that breaks Vite builds
 * - Provide links to the core dashboard + connected apps
 */

const DATA_SOURCES = [
  {
    title: "Market data (prices & bars)",
    description:
      "Real-time and historical market data used to power charts, market leaders, and bot decisions.",
    items: [
      {
        name: "Alpaca",
        role: "Broker + market data",
        notes:
          "Primary integration for account connectivity, quotes/bars, and trade execution (paper/live depending on mode).",
      },
      {
        name: "TradingView",
        role: "Charting UI",
        notes:
          "Embedded charting for visualization and quick symbol inspection (UI-only; not a source of truth).",
      },
    ],
  },
  {
    title: "Signals & indicators (computed)",
    description:
      "Derived features computed in U-Stock (not purchased feeds): EMA trend logic, ATR risk sizing, chop filters, and confidence scoring.",
    items: [
      {
        name: "EMA / bias + entry timeframes",
        role: "Trend direction + entry conditions",
        notes:
          "EMA bias on higher timeframe; entry conditions on lower timeframe; filters block choppy regimes.",
      },
      {
        name: "ATR + risk bounds",
        role: "Risk guardrails",
        notes:
          "ATR-based stop placement with min/max risk percent constraints; ensures consistent stop sanity.",
      },
      {
        name: "Weighted confidence",
        role: "Ranking",
        notes:
          "Scores signals using a weighted breakdown (ATR, risk, confirmation) and clamps output to 0..1.",
      },
    ],
  },
  {
    title: "Persistence & telemetry",
    description:
      "Operational event tracking for bot execution and system debugging.",
    items: [
      {
        name: "Supabase",
        role: "Event store",
        notes:
          "Uploads transaction events only (idempotent event_id, batching, retries, deadletter on failure).",
      },
      {
        name: "NDJSON Journal",
        role: "Local audit trail",
        notes:
          "Append-only journal for intents/orders/exits designed to be best-effort and never crash the runner.",
      },
    ],
  },
];

export default function DatasourcesPage() {
  return (
    <AppShell>
      {/* HERO */}
      <header className="data-hero">
        <div className="data-hero-text">
          <h1 className="page-title">Data sources & pipeline</h1>
          <p className="muted">
            This page documents the current U-Stock data layer: where market data
            comes from, what is computed internally, and how execution events
            are logged for visibility. Older prototype config imports were
            removed so this page stays aligned with the current app.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
          <Link to="/connected-apps" className="back-link-pill">
            Connected apps →
          </Link>
        </div>
      </header>

      {/* SUMMARY CARD */}
      <section className="data-summary-card">
        <h2>Configuration at a glance</h2>
        <p className="muted">
          U-Stock treats strategy as{" "}
          <strong>signal generation</strong> (TradeIntents) and keeps{" "}
          <strong>execution</strong> separate (paper/live modes). Market data is
          pulled through broker/data integrations, indicators are computed
          internally, and transaction events are persisted for auditing and
          performance tracking.
        </p>
      </section>

      {/* GRID OF SOURCE CATEGORIES */}
      <section className="data-section-grid">
        {DATA_SOURCES.map((block) => (
          <article className="data-card" key={block.title}>
            <h3>{block.title}</h3>
            <p className="muted small">{block.description}</p>

            <ul className="data-list">
              {block.items.map((src) => (
                <li key={`${block.title}-${src.name}`}>
                  <div className="data-item-title">
                    {src.name}
                    {src.role && <span className="data-pill">{src.role}</span>}
                  </div>
                  {src.notes && <p className="data-item-notes">{src.notes}</p>}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      {/* FOOTNOTE */}
      <section className="data-summary-card" style={{ marginTop: 18 }}>
        <h2>Why this page exists</h2>
        <p className="muted">
          When U-Stock evolves, this page is the “single source of truth” for
          what feeds the system. Keeping it accurate prevents stale prototype
          config (like tracked tickers lists) from drifting and breaking builds.
        </p>
      </section>
    </AppShell>
  );
}
