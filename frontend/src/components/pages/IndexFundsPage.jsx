// src/components/pages/IndexFundsPage.jsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AppShell from "../layout/AppShell";
import "../../css/pages/IndexFundsPage.css";

/**
 * IndexFundsPage (Current U-Stock)
 * --------------------------------------------
 * This page used to depend on a legacy fundamentals snapshot hook.
 * That hook/file path is no longer part of the current app direction.
 *
 * For now this page is "docs-first":
 * - No legacy imports
 * - No API calls
 * - Explains how index funds fit into U-Stock’s strategy + bot pipeline
 *
 * Later, if you want live data:
 * - Add a backend endpoint for ETF fundamentals (or reuse your market data provider)
 * - Reintroduce a small hook under src/hooks/ that calls /api/... with AuthContext authFetch
 */

const INDEX_FUNDS = [
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF", blurb: "Total U.S. stock market exposure." },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", blurb: "S&P 500 exposure; large-cap U.S. baseline." },
  { ticker: "QQQ", name: "Invesco QQQ Trust", blurb: "NASDAQ-100 exposure; growth/tech-heavy proxy." },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", blurb: "Highly liquid S&P 500 tracker (popular for trading)." },
  { ticker: "IWM", name: "iShares Russell 2000 ETF", blurb: "Small-cap U.S. exposure; risk-on proxy." },
];

export default function IndexFundsPage() {
  const [activeTab, setActiveTab] = useState("about"); // "about" | "funds"

  const funds = useMemo(() => INDEX_FUNDS, []);

  return (
    <AppShell>
      <div className="index-funds-page">
        {/* Hero card */}
        <header className="panel index-hero">
          <div className="index-hero-text">
            <h1 className="page-title">Index Funds & System Baselines</h1>
            <p className="muted">
              Index ETFs are the “baseline” of the market. In U-Stock terms, they’re useful for:
              (1) understanding what the market is doing overall, and (2) giving your bots context
              for trend, volatility, and risk-on vs risk-off days.
            </p>
            <p className="muted" style={{ marginTop: 8 }}>
              This page is currently documentation-only while the frontend is being modernized and tested.
              Live ETF fundamentals can be added back once the backend endpoint is finalized.
            </p>
          </div>

          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
        </header>

        {/* Tabs row */}
        <div className="index-tabs-row">
          <div className="tabs">
            <button
              type="button"
              className={"tab-btn " + (activeTab === "about" ? "tab-btn--active" : "")}
              onClick={() => setActiveTab("about")}
            >
              Why index funds matter
            </button>
            <button
              type="button"
              className={"tab-btn " + (activeTab === "funds" ? "tab-btn--active" : "")}
              onClick={() => setActiveTab("funds")}
            >
              Index universe (starter)
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === "about" ? (
          <>
            <section className="panel index-about-panel">
              <h3>What index funds are</h3>
              <p className="muted">
                An index fund (or ETF) holds a basket of stocks to track an index (like the S&P 500).
                Instead of picking individual winners, you’re buying broad exposure.
              </p>

              <ul className="about-list">
                <li>
                  <strong>Market baseline (beta):</strong> helpful reference for “is it just the market moving?”
                </li>
                <li>
                  <strong>Liquidity + structure:</strong> many are highly liquid and trade cleanly intraday.
                </li>
                <li>
                  <strong>Risk context:</strong> SPY/QQQ strength or weakness often predicts how stocks behave that day.
                </li>
                <li>
                  <strong>Regime detection:</strong> trend/range conditions on major ETFs can help select bot behavior later.
                </li>
              </ul>
            </section>

            <section className="panel index-about-panel">
              <h3 className="fundamentals-title">How this ties into U-Stock</h3>
              <div className="fundamentals-explain">
                <p>
                  U-Stock is evolving into a multi-bot system where strategy creates <strong>TradeIntents</strong> and
                  the runner/engine handles <strong>execution</strong>.
                </p>

                <ul className="metrics-list">
                  <li>
                    <strong>Signal generation:</strong> bots (like EMA Trend) read prices/bars, compute indicators,
                    and produce intents (entry/stop/take-profit + confidence).
                  </li>
                  <li>
                    <strong>Execution separation:</strong> paper/live executors place bracket orders and emit transaction events.
                  </li>
                  <li>
                    <strong>Telemetry:</strong> transaction events can be uploaded to Supabase (tx-only, idempotent event_id).
                  </li>
                  <li>
                    <strong>Next upgrade:</strong> use index ETFs as “market state” inputs to choose bots dynamically.
                  </li>
                </ul>

                <p className="muted">
                  The goal is not a single magical indicator. It’s clean inputs, stable risk rules, and consistent
                  decision-making that can scale.
                </p>
              </div>
            </section>
          </>
        ) : (
          <section className="panel">
            <div className="fund-grid">
              {funds.map((fund) => (
                <article key={fund.ticker} className="fund-card">
                  <header className="fund-card-header">
                    <div>
                      <div className="fund-ticker">{fund.ticker}</div>
                      <div className="fund-name">{fund.name}</div>
                    </div>
                  </header>

                  <p className="fund-blurb">{fund.blurb}</p>

                  <div className="fund-metrics-row">
                    <div className="fund-metric">
                      <span className="fund-metric-label">Role:</span>
                      <span className="fund-metric-value">Baseline / regime context</span>
                    </div>
                    <div className="fund-metric">
                      <span className="fund-metric-label">Data:</span>
                      <span className="fund-metric-value">Embed/UI now, API later</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
