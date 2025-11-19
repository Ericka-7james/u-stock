// src/pages/SubredditsPage.jsx
import { Link } from "react-router-dom";
import { useRedditMentions } from "../hooks/useRedditMentions";
import AppShell from "../components/layout/AppShell";
import "./SubredditsPage.css";

// Config-driven sources
import { PRICE_SOURCES } from "../config/pricesSources";
import { FUNDAMENTAL_SOURCES } from "../config/fundamentalsSources";
import { MACRO_SOURCES } from "../config/macroSources";
import { REDDIT_SOURCES } from "../config/redditSources";
import { TRACKED_TICKERS } from "../config/trackedTickers";

export default function SubredditsPage() {
  const { meta, loading } = useRedditMentions();

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
            <h1 className="page-title">Data sources & communities</h1>
            <p className="muted">
              These APIs, macro feeds, and Reddit communities power your current
              U-Stock radar snapshot and Data Scout bot.
            </p>
            {meta && (
              <p className="data-hero-meta">
                Snapshot window:{" "}
                <span>{meta.windowDescription ?? "Latest pull"}</span>
              </p>
            )}
          </div>

          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
        </header>

        {/* SUMMARY CARD */}
        <section className="data-summary-card">
          <h2>Configuration at a glance</h2>
          <p className="muted">
            Right now U-Stock is configured to watch{" "}
            <strong>{totalTrackedTickers}</strong> core tickers across{" "}
            <strong>{totalRedditCommunities}</strong> Reddit communities, using
            data from <strong>{totalPriceSources}</strong> price feeds,{" "}
            <strong>{totalFundamentalSources}</strong> fundamentals APIs, and{" "}
            <strong>{totalMacroSources}</strong> macroeconomic sources.
          </p>
        </section>

        {/* GRID OF SOURCE CATEGORIES */}
        {loading && (
          <p className="muted loading-note">
            Loading live snapshot metadata from Reddit…
          </p>
        )}

        <section className="data-section-grid">
          {/* Prices */}
          <article className="data-card">
            <h3>Market prices</h3>
            <p className="muted small">
              Real-time & end-of-day price data used to build radar charts,
              watchlists, and historical trend views.
            </p>
            <ul className="data-list">
              {PRICE_SOURCES.map((src) => (
                <li key={src.id || src.name}>
                  <div className="data-item-title">
                    {src.name || src.label}
                    {src.role && (
                      <span className="data-pill">
                        {src.role}
                      </span>
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
              Statements, ratios, valuations, and company-quality metrics used
              for deeper signal, not just price action.
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
              Inflation, rates, labor and growth data to give context to
              sentiment and price movements.
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

          {/* Reddit communities */}
          <article className="data-card">
            <h3>Reddit communities</h3>
            <p className="muted small">
              High-signal subreddits feeding the behavior, narrative, and buzz
              layer of your U-Stock radar.
            </p>
            <ul className="data-list">
              {REDDIT_SOURCES.map((sub) => {
                const name =
                  sub.subreddit ||
                  sub.name ||
                  sub.id ||
                  sub; // support simple string or object
                return (
                  <li key={name}>
                    <div className="data-item-title">
                      r/{name.replace(/^r\//i, "")}
                      {sub.tier && (
                        <span className="data-pill data-pill--outline">
                          {sub.tier}
                        </span>
                      )}
                    </div>
                    {sub.notes && (
                      <p className="data-item-notes">{sub.notes}</p>
                    )}
                    <a
                      href={`https://www.reddit.com/r/${name.replace(
                        /^r\//i,
                        ""
                      )}/`}
                      className="data-item-link"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open subreddit →
                    </a>
                  </li>
                );
              })}
            </ul>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
