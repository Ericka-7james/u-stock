// src/components/pages/IndexFundsPage.jsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AppShell from "../layout/AppShell";
import PageHeaderCard from "../common/PageHeaderCard";
import "../../css/pages/IndexFundsPage.css";

import MarketBaselinesSquirrel from "../../assets/pages/MarketBaselinesSquirrel.png";

import { INDEX_FUNDS_PAGE_COPY } from "../../content/indexfundspage.content.ts";

/**
 * Market Baselines (Lucent Financial)
 * Docs-first page that explains how broad-market ETFs provide context:
 * - regime detection (trend vs range)
 * - risk-on vs risk-off behavior
 * - volatility awareness and safer automation defaults
 */

export default function IndexFundsPage() {
  const copy = INDEX_FUNDS_PAGE_COPY;

  const [activeTab, setActiveTab] = useState("baselines"); // "baselines" | "universe"
  const baselines = useMemo(() => copy.baselines, [copy.baselines]);

  return (
    <AppShell>
      <div className="app-page index-funds-page">
        <PageHeaderCard
          title={copy.header.title}
          subtitle={<span className="index-tagline">{copy.header.subtitle}</span>}
          right={<img src={MarketBaselinesSquirrel} alt="Lucent Financial logo" className="index-hero-logo" />}
        >
          <p className="muted">
            These ETFs act as Lucent’s “system context.” They don’t pick trades by themselves — they help interpret the
            environment so bots can behave more safely.
          </p>

          <div className="index-hero-meta">
            {copy.header.metaPrefix} <span>{copy.header.metaStatus}</span> {copy.header.metaSuffix}
          </div>

          <Link to="/" className="back-link-pill">
            {copy.header.backLabel}
          </Link>
        </PageHeaderCard>

        {/* Tabs */}
        <div className="index-tabs-row">
          <div className="tabs" role="tablist" aria-label={copy.tabs.ariaLabel}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "baselines"}
              className={"tab-btn " + (activeTab === "baselines" ? "tab-btn--active" : "")}
              onClick={() => setActiveTab("baselines")}
            >
              {copy.tabs.baselines}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "universe"}
              className={"tab-btn " + (activeTab === "universe" ? "tab-btn--active" : "")}
              onClick={() => setActiveTab("universe")}
            >
              {copy.tabs.universe}
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === "baselines" ? (
          <>
            <section className="panel index-about-panel">
              <h3>{copy.sections.whatMeans.title}</h3>
              <p className="muted">{copy.sections.whatMeans.body}</p>

              <ul className="about-list">
                {copy.sections.whatMeans.bullets.map((b) => (
                  <li key={b.strong}>
                    <strong>{b.strong}</strong> {b.text}
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel index-about-panel">
              <h3 className="fundamentals-title">{copy.sections.connects.title}</h3>

              <div className="fundamentals-explain">
                <p className="muted">
                  {copy.sections.connects.lead.split("intents").map((part, i, arr) =>
                    i < arr.length - 1 ? (
                      <span key={i}>
                        {part}
                        <strong>intents</strong>
                      </span>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </p>

                <ul className="metrics-list">
                  {copy.sections.connects.bullets.map((b) => (
                    <li key={b.strong}>
                      <strong>{b.strong}</strong> {b.text}
                    </li>
                  ))}
                </ul>

                <p className="muted">{copy.sections.connects.tail}</p>
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
