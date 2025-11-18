// src/pages/IndexFundsPage.jsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRedditMentions } from "../hooks/useRedditMentions";
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

export default function IndexFundsPage() {
  const [activeTab, setActiveTab] = useState("about"); // "about" | "funds"
  const { rawData, meta, loading } = useRedditMentions();

  // Build a map from ticker → mention count from reddit-mentions.json
  const mentionMap = useMemo(() => {
    const map = {};
    for (const item of rawData) {
      // rawData item: { ticker, count }
      map[item.ticker.toUpperCase()] = item.count;
    }
    return map;
  }, [rawData]);

  const fundsWithCounts = useMemo(
    () =>
      INDEX_FUNDS.map((fund) => ({
        ...fund,
        mentions: mentionMap[fund.ticker.toUpperCase()] || 0,
      })),
    [mentionMap]
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="page-title">Index Funds Radar</h1>
          <p className="muted">
            Learn what index funds are and see how often they appear in Reddit
            investing discussions.
          </p>
        </div>
        <Link to="/" className="back-link">
          ← Back to dashboard
        </Link>
      </header>

      {/* Tabs */}
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
          Top index funds by mentions
        </button>
      </div>

      {activeTab === "about" ? (
        <section className="panel">
          <h3>How index funds work</h3>
          <p className="muted">
            An index fund is a basket of stocks that aims to track a specific
            market index, like the S&amp;P 500 or the total U.S. stock market.
            Instead of trying to pick individual winners, you buy a slice of the
            entire index.
          </p>
          <ul className="about-list">
            <li>
              <strong>Passive approach:</strong> the fund simply mirrors an
              index instead of trying to beat it.
            </li>
            <li>
              <strong>Low costs:</strong> because there is less trading and
              research, expense ratios are usually very low.
            </li>
            <li>
              <strong>Diversification:</strong> one fund can hold hundreds or
              thousands of companies.
            </li>
            <li>
              <strong>Boglehead-style investing:</strong> communities like{" "}
              <code>r/Bogleheads</code> often recommend simple portfolios built
              mostly from broad index funds.
            </li>
          </ul>
          <p className="muted">
            This page uses the same Reddit snapshot as your main U-Stock radar
            to show which broad index funds come up most often in discussions.
          </p>
        </section>
      ) : (
        <section className="panel">
          <h3>Popular index funds in this Reddit snapshot</h3>

          {loading ? (
            <p className="muted">Loading live mention counts…</p>
          ) : (
            <>
              <p className="muted">
                Counts below are based on the most recent Reddit data pulled for
                your radar. They reflect how many post titles/descriptions
                mention each ticker across the configured subreddits.
              </p>

              <div className="fund-grid">
                {fundsWithCounts.map((fund) => (
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
                        <span className="fund-mentions-label">
                          mentions
                        </span>
                      </div>
                    </header>
                    <p className="fund-blurb">{fund.blurb}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
