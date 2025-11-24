// src/components/pages/SubredditsPage.jsx
import { Link } from "react-router-dom";

import AppShell from "../layout/AppShell";
import "./SubredditsPage.css";

import { PRICE_SOURCES } from "../../config/raw/pricesSources";
import { FUNDAMENTAL_SOURCES } from "../../config/raw/fundamentalsSources";
import { MACRO_SOURCES } from "../../config/raw/macroSources";
import { REDDIT_SOURCES } from "../../config/raw/redditSources";
import { TRACKED_TICKERS } from "../../config/raw/trackedTickers";

export default function SubredditsPage() {
  const totalPriceSources = PRICE_SOURCES?.length ?? 0;
  const totalFundamentalSources = FUNDAMENTAL_SOURCES?.length ?? 0;
  const totalMacroSources = MACRO_SOURCES?.length ?? 0;
  const totalRedditCommunities = REDDIT_SOURCES?.length ?? 0;
  const totalTrackedTickers = TRACKED_TICKERS?.length ?? 0;

  return (
    <AppShell>
      <div className="dashboard data-sources-page">
        {/* HERO */}
        <header className="data-hero">
          <div className="data-hero-text">
            <h1 className="page-title">Data sources & quant pipeline</h1>
            <p className="muted">
              This page documents the core inputs behind the u-Stock prototype:
              market prices, fundamentals, and macro data, plus the future
              sentiment layer. It&apos;s modeled after how real quant teams
              think about building a clean, explainable data pipeline before
              ranking opportunities.
            </p>
          </div>

          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
        </header>

        {/* SUMMARY CARD */}
        <section className="data-summary-card">
          <h2>Configuration at a glance</h2>
          <p className="muted">
            Right now this demo tracks{" "}
            <strong>{totalTrackedTickers}</strong> core tickers using{" "}
            <strong>{totalPriceSources}</strong> price feeds,{" "}
            <strong>{totalFundamentalSources}</strong> fundamentals APIs, and{" "}
            <strong>{totalMacroSources}</strong> macroeconomic sources.
            The Reddit/alt-data layer is designed but intentionally paused so
            the focus stays on the core trading pipeline.
          </p>
        </section>

        {/* GRID OF SOURCE CATEGORIES */}
        <section className="data-section-grid">
          {/* Prices */}
          <article className="data-card">
            <h3>Market prices</h3>
            <p className="muted small">
              Daily and intraday OHLCV data used for trend, volatility,
              in-play scores, and intraday range metrics in the dashboard.
            </p>
            <ul className="data-list">
              {PRICE_SOURCES.map((src) => (
                <li key={src.id || src.name}>
                  <div className="data-item-title">
                    {src.name || src.label}
                    {src.role && (
                      <span className="data-pill">{src.role}</span>
                    )}
                  </div>
                  {src.notes && (
                    <p className="data-item-notes">{src.notes}</p>
                  )}
                  {src.url && (
                    <a
                      href={src.url}
                      className="data-item-link"
                      target="_blank"
                      rel="noreferrer"
                    >
                      API docs →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </article>

          {/* Fundamentals */}
          <article className="data-card">
            <h3>Fundamentals</h3>
            <p className="muted small">
              Valuation, profitability, leverage, and ownership metrics used to
              give context to price action and to build richer ranking features.
            </p>
            <ul className="data-list">
              {FUNDAMENTAL_SOURCES.map((src) => (
                <li key={src.id || src.name}>
                  <div className="data-item-title">
                    {src.name || src.label}
                    {src.role && (
                      <span className="data-pill">{src.role}</span>
                    )}
                  </div>
                  {src.notes && (
                    <p className="data-item-notes">{src.notes}</p>
                  )}
                  {src.url && (
                    <a
                      href={src.url}
                      className="data-item-link"
                      target="_blank"
                      rel="noreferrer"
                    >
                      API docs →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </article>

          {/* Macro */}
          <article className="data-card">
            <h3>Macro & state of the economy</h3>
            <p className="muted small">
              Inflation, interest rates, unemployment, and growth data that help
              explain why entire markets, sectors, or factors move together.
            </p>
            <ul className="data-list">
              {MACRO_SOURCES.map((src) => (
                <li key={src.id || src.name}>
                  <div className="data-item-title">
                    {src.name || src.label}
                    {src.role && (
                      <span className="data-pill">{src.role}</span>
                    )}
                  </div>
                  {src.notes && (
                    <p className="data-item-notes">{src.notes}</p>
                  )}
                  {src.url && (
                    <a
                      href={src.url}
                      className="data-item-link"
                      target="_blank"
                      rel="noreferrer"
                    >
                      API docs →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
