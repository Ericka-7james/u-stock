// src/components/pages/IndexFundsPage.jsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AppShell from "../layout/AppShell";
import PageHeaderCard from "../common/PageHeaderCard";
import "../../css/pages/IndexFundsPage.css";

import MarketBaselinesSquirrel from "../../assets/pages/MarketBaselinesSquirrel.png";

import { INDEX_FUNDS_PAGE_COPY } from "../../content/pages/indexfundspage.content.ts";

export default function IndexFundsPage() {
  const copy = INDEX_FUNDS_PAGE_COPY;

  const [activeTab, setActiveTab] = useState(copy.tabs.defaultKey); // "baselines" | "universe"
  const baselines = useMemo(() => copy.baselines, [copy.baselines]);

  const isBaselines = activeTab === copy.tabs.keys.baselines;
  const isUniverse = activeTab === copy.tabs.keys.universe;

  return (
    <AppShell>
      <div className="index-funds-page">
        <PageHeaderCard
          title={copy.header.title}
          subtitle={<span className="index-tagline">{copy.header.subtitle}</span>}
          right={<img src={MarketBaselinesSquirrel} alt={copy.header.heroAlt} className="index-hero-logo" />}
        >
          <p className="muted">{copy.header.body}</p>

          <div className="index-hero-meta">
            {copy.header.metaPrefix} <span>{copy.header.metaStatus}</span> {copy.header.metaSuffix}
          </div>

          <Link to="/" className="back-link-pill">
            {copy.header.backLabel}
          </Link>
        </PageHeaderCard>

        <div className="index-page-wrap">
          {/* Tabs */}
          <div className="index-tabs-row">
            <div className="tabs" role="tablist" aria-label={copy.tabs.ariaLabel}>
              <button
                type="button"
                role="tab"
                aria-selected={isBaselines}
                className={"tab-btn " + (isBaselines ? "tab-btn--active" : "")}
                onClick={() => setActiveTab(copy.tabs.keys.baselines)}
              >
                {copy.tabs.labels.baselines}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={isUniverse}
                className={"tab-btn " + (isUniverse ? "tab-btn--active" : "")}
                onClick={() => setActiveTab(copy.tabs.keys.universe)}
              >
                {copy.tabs.labels.universe}
              </button>
            </div>
          </div>

          {/* Content */}
          {isBaselines ? (
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
                    {copy.sections.connects.lead.split(copy.sections.connects.boldWord).map((part, i, arr) =>
                      i < arr.length - 1 ? (
                        <span key={i}>
                          {part}
                          <strong>{copy.sections.connects.boldWord}</strong>
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
                {copy.sections.learn.cards.map((c) => (
                  <article key={c.title} className="fund-card">
                    <header className="fund-card-header">
                      <div>
                        <div className="fund-ticker">{c.title}</div>
                        <div className="fund-name">{c.tag}</div>
                      </div>
                    </header>

                    <p className="fund-blurb">{c.blurb}</p>

                    <div className="fund-metrics-row">
                      <div className="fund-metric">
                        <span className="fund-metric-label">{copy.universeCard.labels.role}</span>
                        <span className="fund-metric-value">{copy.universeCard.values.role}</span>
                      </div>

                      <div className="fund-metric">
                        <span className="fund-metric-label">{copy.universeCard.labels.usedFor}</span>
                        <span className="fund-metric-value">{c.bullets.join(copy.universeCard.useJoiner)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}