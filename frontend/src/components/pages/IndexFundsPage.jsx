// src/components/pages/IndexFundsPage.jsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AppShell from "../layout/AppShell";
import "../../css/pages/IndexFundsPage.css";

/**
 * Market Baselines (Lucent Financial)
 * -----------------------------------
 * This page is intentionally docs-first.
 * It explains how Lucent uses broad-market ETFs as context inputs for:
 * - regime detection (trend vs range)
 * - risk-on vs risk-off behavior
 * - volatility awareness and safer automation defaults
 *
 * Later upgrade path:
 * - Add /api/market/baselines endpoint returning latest bars + simple computed stats
 * - Render compact baseline tiles + “today’s regime” summary
 */

const BASELINES = [
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
];

export default function IndexFundsPage() {
  const [activeTab, setActiveTab] = useState("baselines"); // "baselines" | "universe"

  const baselines = useMemo(() => BASELINES, []);

  return (
    <AppShell>
      <div className="index-funds-page">
        {/* Hero */}
        <header className="panel index-hero">
          <div className="index-hero-text">
            <h1 className="page-title">Market Baselines</h1>
            <p className="muted">
              These ETFs act as Lucent’s “system context.” They don’t pick trades by themselves — they help interpret
              the environment: risk-on vs risk-off, trend vs range, and volatility.
            </p>

            <div className="index-hero-meta">
              Status: <span>docs-first</span> (live baseline tiles can be added after the API endpoint is finalized)
            </div>
          </div>

          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
        </header>

        {/* Tabs */}
        <div className="index-tabs-row">
          <div className="tabs">
            <button
              type="button"
              className={"tab-btn " + (activeTab === "baselines" ? "tab-btn--active" : "")}
              onClick={() => setActiveTab("baselines")}
            >
              How Lucent uses baselines
            </button>

            <button
              type="button"
              className={"tab-btn " + (activeTab === "universe" ? "tab-btn--active" : "")}
              onClick={() => setActiveTab("universe")}
            >
              Baseline universe
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === "baselines" ? (
          <>
            <section className="panel index-about-panel">
              <h3>What “baseline context” means</h3>
              <p className="muted">
                Lucent treats broad-market ETFs as a reference layer for decision-making. If the overall market is
                trending cleanly, strategies behave differently than they would in choppy range conditions.
              </p>

              <ul className="about-list">
                <li>
                  <strong>Regime detection:</strong> trend vs range helps select safer behavior (or pause automation).
                </li>
                <li>
                  <strong>Risk-on vs risk-off:</strong> small caps and growth strength often signals higher risk appetite.
                </li>
                <li>
                  <strong>Volatility awareness:</strong> wider ranges can require smaller sizing or stricter gating rules.
                </li>
                <li>
                  <strong>Context for rankings:</strong> a stock moving “with the market” is different from moving on its own.
                </li>
              </ul>
            </section>

            <section className="panel index-about-panel">
              <h3 className="fundamentals-title">How this connects to bots + runner states</h3>
              <div className="fundamentals-explain">
                <p className="muted">
                  Lucent’s direction is “transparent automation.” Strategies can generate <strong>intents</strong>, but
                  execution is gated and observable.
                </p>

                <ul className="metrics-list">
                  <li>
                    <strong>Strategy layer:</strong> a bot reads bars/indicators and emits TradeIntents (entry/stop/TP).
                  </li>
                  <li>
                    <strong>Runner layer:</strong> applies gating rules like market hours, risk caps, and “wait states.”
                  </li>
                  <li>
                    <strong>Execution layer:</strong> routes paper vs live and records transaction events end-to-end.
                  </li>
                  <li>
                    <strong>Baseline layer:</strong> provides environment context to inform gating (ex: “chop day → reduce activity”).
                  </li>
                </ul>

                <p className="muted">
                  This page defines the baseline layer so your UI has a clean explanation before you wire in live data.
                </p>
              </div>
            </section>
          </>
        ) : (
          <section className="panel">
            <div className="fund-grid">
              {baselines.map((b) => (
                <article key={b.ticker} className="fund-card">
                  <header className="fund-card-header">
                    <div>
                      <div className="fund-ticker">{b.ticker}</div>
                      <div className="fund-name">{b.name}</div>
                    </div>
                  </header>

                  <p className="fund-blurb">{b.blurb}</p>

                  <div className="fund-metrics-row">
                    <div className="fund-metric">
                      <span className="fund-metric-label">Role:</span>
                      <span className="fund-metric-value">System context</span>
                    </div>

                    <div className="fund-metric">
                      <span className="fund-metric-label">Used for:</span>
                      <span className="fund-metric-value">{b.use.join(" • ")}</span>
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
