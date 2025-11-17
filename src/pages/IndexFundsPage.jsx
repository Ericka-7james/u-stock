// src/pages/IndexFundsPage.jsx
import { useState } from "react";
import { Link } from "react-router-dom";

const INDEX_FUNDS = [
  {
    ticker: "VTI",
    name: "Vanguard Total Stock Market ETF",
    subs: ["Bogleheads", "personalfinance"],
    blurb: "Tracks the entire U.S. stock market with very low fees.",
  },
  {
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    subs: ["Bogleheads", "investing"],
    blurb: "Follows the S&P 500; classic diversified U.S. large-cap exposure.",
  },
  {
    ticker: "VTSAX",
    name: "Vanguard Total Stock Market Index Fund Admiral Shares",
    subs: ["Bogleheads"],
    blurb: "Mutual fund version of VTI; Boglehead favorite for ‘own the market’.",
  },
  {
    ticker: "FXAIX",
    name: "Fidelity 500 Index Fund",
    subs: ["Bogleheads", "Fidelity"],
    blurb: "Fidelity’s S&P 500 index fund with rock-bottom expense ratio.",
  },
  {
    ticker: "SWTSX",
    name: "Schwab Total Stock Market Index Fund",
    subs: ["Bogleheads", "Schwab"],
    blurb: "Schwab’s low-cost total U.S. market index alternative.",
  },
];

export default function IndexFundsPage() {
  const [activeTab, setActiveTab] = useState("about"); // "about" | "funds"

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Index Funds Radar</h1>
          <p className="muted">
            Learn what index funds are and see popular picks from Reddit
            communities.
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
          Top index funds by subreddit
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
            U-Stock&apos;s index funds view is meant to give you a quick sense
            of which broad, diversified funds Reddit communities talk about the
            most—not to serve as financial advice.
          </p>
        </section>
      ) : (
        <section className="panel">
          <h3>Popular index funds mentioned on Reddit</h3>
          <p className="muted">
            These are well-known index funds that frequently show up in
            long-term investing discussions on subreddits like{" "}
            <code>r/Bogleheads</code>, <code>r/personalfinance</code>, and{" "}
            <code>r/investing</code>.
          </p>

          <div className="fund-grid">
            {INDEX_FUNDS.map((fund) => (
              <article key={fund.ticker} className="fund-card">
                <header className="fund-card-header">
                  <div>
                    <div className="fund-ticker">{fund.ticker}</div>
                    <div className="fund-name">{fund.name}</div>
                  </div>
                </header>
                <p className="fund-blurb">{fund.blurb}</p>
                <div className="fund-subreddits">
                  <span className="fund-subreddits-label">
                    Seen in subreddits:
                  </span>
                  {fund.subs.map((sub) => (
                    <span key={sub} className="fund-subreddit-pill">
                      r/{sub}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
