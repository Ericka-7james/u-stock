import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useRedditMentions } from "../../hooks/useRedditMentions";
import StatSummary from "./StatSummary";
import RedditMentionsChart from "../RedditMentionsChart";

const INDEX_FUNDS = [
  {
    ticker: "VTI",
    name: "Vanguard Total Stock Market ETF",
  },
  {
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
  },
  {
    ticker: "VTSAX",
    name: "Vanguard Total Stock Market Index Fund Admiral Shares",
  },
  {
    ticker: "FXAIX",
    name: "Fidelity 500 Index Fund",
  },
  {
    ticker: "SWTSX",
    name: "Schwab Total Stock Market Index Fund",
  },
];

export default function DashboardPage() {
  const { rawData, meta, loading } = useRedditMentions();

  // rawData is [{ ticker, count }, ...]
  const mentionMap = useMemo(() => {
    const map = {};
    for (const item of rawData) {
      map[item.ticker.toUpperCase()] = item.count;
    }
    return map;
  }, [rawData]);

  const topIndexFund = useMemo(() => {
    let best = null;

    for (const fund of INDEX_FUNDS) {
      const t = fund.ticker.toUpperCase();
      const mentions = mentionMap[t] || 0;

      if (!best || mentions > best.mentions) {
        best = { ...fund, mentions };
      }
    }

    // If literally all are 0, return null so we can show a fallback
    if (best && best.mentions > 0) return best;
    return null;
  }, [mentionMap]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>U-Stock Radar</h1>
          <p className="muted">
            Live Reddit discussion snapshot for your watchlist and the wider
            market.
          </p>
        </div>
        {meta && (
          <div className="dashboard-header-meta">
            Last updated:{" "}
            <span>
              {new Date(meta.generatedAt).toLocaleString()}
            </span>
          </div>
        )}
      </header>

      <StatSummary meta={meta} rawData={rawData} />

      <main className="dashboard-main">
        <section className="panel panel-filters">
          {/* First card: Filters info */}
          <div className="filters-card">
            <h3>Filters (coming soon)</h3>
            <p className="muted">
              Here you’ll be able to filter by subreddit, minimum mentions, and
              watchlists.
            </p>
          </div>

          {/* Second card: Explore index funds with top fund spotlight */}
          <div className="filters-card filters-card--index">
            <div className="filters-card-header">
              <h3>Explore index funds</h3>
            </div>

            {loading ? (
              <p className="muted">Loading index fund mentions…</p>
            ) : topIndexFund ? (
              <>
                <div className="index-spotlight">
                  <div className="index-spotlight-ticker">
                    {topIndexFund.ticker}
                  </div>
                  <div className="index-spotlight-name">
                    {topIndexFund.name}
                  </div>
                  <div className="index-spotlight-mentions">
                    {topIndexFund.mentions} mentions in this snapshot
                  </div>
                </div>
                <Link to="/index-funds" className="panel-link">
                  See more →
                </Link>
              </>
            ) : (
              <>
                <p className="muted">
                  No index fund tickers detected in this snapshot yet.
                </p>
                <Link to="/index-funds" className="panel-link">
                  See more →
                </Link>
              </>
            )}
          </div>
        </section>

        <section className="panel panel-chart">
          <RedditMentionsChart rawData={rawData} loading={loading} />
        </section>
      </main>
    </div>
  );
}
