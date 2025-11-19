// src/pages/IndexFundsPage.jsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRedditMentions } from "../hooks/useRedditMentions";
import { useFundamentalsSnapshot } from "../hooks/useFundamentalsSnapshot";
import AppShell from "../components/layout/AppShell";
import "../components/dashboard/DashboardPage.css";
import "./IndexFundsPage.css";

const INDEX_FUNDS = [
  {
    ticker: "VTI",
    name: "Vanguard Total Stock Market ETF",
    blurb: "Tracks the entire U.S. stock market with very low fees.",
  },
  {
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    blurb: "Follows the S&P 500; classic diversified U.S. large-cap exposure.",
  },
  {
    ticker: "VTSAX",
    name: "Vanguard Total Stock Market Index Fund Admiral Shares",
    blurb: "Mutual fund version of VTI; Boglehead favorite for ‘own the market’.",
  },
  {
    ticker: "FXAIX",
    name: "Fidelity 500 Index Fund",
    blurb: "Fidelity’s S&P 500 index fund with rock-bottom expense ratio.",
  },
  {
    ticker: "SWTSX",
    name: "Schwab Total Stock Market Index Fund",
    blurb: "Schwab’s low-cost total U.S. market index alternative.",
  },
];

function formatMarketCap(value) {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  return n.toLocaleString();
}

export default function IndexFundsPage() {
  const [activeTab, setActiveTab] = useState("about"); // "about" | "funds"

  const { rawData, meta, loading } = useRedditMentions();
  const {
    data: fundamentalsData,
    loading: fundamentalsLoading,
  } = useFundamentalsSnapshot();

  // Map: ticker -> reddit mention count
  const mentionMap = useMemo(() => {
    const map = {};
    const data = Array.isArray(rawData) ? rawData : [];
    for (const item of data) {
      if (!item?.ticker) continue;
      map[item.ticker.toUpperCase()] = item.count;
    }
    return map;
  }, [rawData]);

  // Map: ticker -> fundamentals object
  const fundamentalsMap = useMemo(() => {
    const map = {};
    const data = Array.isArray(fundamentalsData) ? fundamentalsData : [];
    for (const f of data) {
      if (!f?.ticker) continue;
      map[f.ticker.toUpperCase()] = f;
    }
    return map;
  }, [fundamentalsData]);

  // Merge: index fund base info + mentions + fundamentals
  const fundsWithData = useMemo(
    () =>
      INDEX_FUNDS.map((fund) => {
        const tickerKey = fund.ticker.toUpperCase();
        return {
          ...fund,
          mentions: mentionMap[tickerKey] || 0,
          fundamentals: fundamentalsMap[tickerKey] || null,
        };
      }),
    [mentionMap, fundamentalsMap]
  );

  return (
    <AppShell>
      <div className="dashboard index-funds-page">
        {/* Hero card */}
        <header className="index-hero">
          <div className="index-hero-text">
            <h1 className="page-title">Index Funds Radar</h1>
            <p className="muted">
              Learn how broad index funds work and see how often the big
              tickers show up in your Reddit snapshot.
            </p>
            {meta && (
              <p className="index-hero-meta">
                Snapshot window:{" "}
                <span>{meta.windowDescription ?? "Latest pull"}</span>
              </p>
            )}
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
              className={
                "tab-btn " + (activeTab === "about" ? "tab-btn--active" : "")
              }
              onClick={() => setActiveTab("about")}
            >
              What are index funds?
            </button>
            <button
              type="button"
              className={
                "tab-btn " + (activeTab === "funds" ? "tab-btn--active" : "")
              }
              onClick={() => setActiveTab("funds")}
            >
              Top funds in this snapshot
            </button>
          </div>
        </div>

        {/* Content below tabs */}
        {activeTab === "about" ? (
            <>
              {/* CARD 1 — How index funds work */}
              <section className="panel index-about-panel">
                <h3>How index funds work</h3>
                <p className="muted">
                  An index fund is a basket of stocks that tracks a specific market index
                  like the S&amp;P 500 or total U.S. stock market. Instead of picking
                  individual winners, you buy a slice of the entire market.
                </p>

                <ul className="about-list">
                  <li><strong>Passive investing:</strong> the fund mirrors an index.</li>
                  <li><strong>Low costs:</strong> fewer trades and research.</li>
                  <li><strong>Diversification:</strong> a single fund holds hundreds or thousands of companies.</li>
                  <li><strong>Boglehead investing:</strong> simple long-term index portfolios.</li>
                </ul>

                <p className="muted">
                  Below is a fundamentals guide explaining PE ratios and market caps—
                  two metrics used to understand what’s inside an index.
                </p>
              </section>

              {/* CARD 2 — NEW FUNDAMENTALS GUIDE */}
              <section className="panel index-about-panel">
                <h3 className="fundamentals-title">Understanding PE & Market Cap</h3>

                <div className="fundamentals-explain">
                  <p>
                    <span className="metric-heading">PE Ratio (Price-to-Earnings):</span>
                    &nbsp;shows how much investors pay for $1 of company earnings.
                  </p>
                  <ul className="metrics-list">
                    <li>High PE → high expectations or possibly overvalued.</li>
                    <li>Low PE → undervalued or slower-growth companies.</li>
                  </ul>

                  <p>
                    <span className="metric-heading">Market Cap:</span>
                    &nbsp;the total value of a company based on its share price.
                  </p>
                  <ul className="metrics-list">
                    <li>Large caps → stable, blue-chip companies.</li>
                    <li>Small caps → higher volatility and hype-sensitive.</li>
                  </ul>

                  <p className="muted">
                    U-Stock uses these fundamentals to give extra context beyond Reddit hype,
                    showing whether buzz is landing on mega-caps, growth names, or riskier
                    small caps.
                  </p>
                </div>
              </section>
            </>
          ) : (
          <section className="panel">
            {loading ? (
              <p className="muted">Loading live mention counts…</p>
            ) : (
              <>
                {fundamentalsLoading && (
                  <p className="muted">
                    Loading fundamentals snapshot (PE, market cap)…
                  </p>
                )}

                <div className="fund-grid">
                  {fundsWithData.map((fund) => (
                    <article key={fund.ticker} className="fund-card">
                      <header className="fund-card-header">
                        <div>
                          <div className="fund-ticker">{fund.ticker}</div>
                          <div className="fund-name">{fund.name}</div>
                        </div>
                        <div className="fund-mentions">
                          <span className="fund-mentions-count">
                            {fund.mentions}
                          </span>
                          <span className="fund-mentions-label">mentions</span>
                        </div>
                      </header>

                      <p className="fund-blurb">{fund.blurb}</p>

                      <div className="fund-metrics-row">
                        <div className="fund-metric">
                          <span className="fund-metric-label">PE:</span>
                          <span className="fund-metric-value">
                            {fund.fundamentals?.pe != null &&
                            Number.isFinite(Number(fund.fundamentals.pe))
                              ? Number(fund.fundamentals.pe).toFixed(1)
                              : "N/A"}
                          </span>
                        </div>

                        <div className="fund-metric">
                          <span className="fund-metric-label">Market Cap:</span>
                          <span className="fund-metric-value">
                            {fund.fundamentals?.marketCap != null
                              ? formatMarketCap(fund.fundamentals.marketCap)
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
