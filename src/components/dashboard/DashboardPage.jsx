// src/components/dashboard/DashboardPage.jsx
import { useRedditMentions } from "../../hooks/useRedditMentions";
import StatSummary from "./StatSummary";
import RedditMentionsChart from "../RedditMentionsChart";

export default function DashboardPage() {
  const { rawData, meta, loading } = useRedditMentions();

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
          <h3>Filters (coming soon)</h3>
          <p className="muted">
            Here you’ll be able to filter by subreddit, minimum mentions, and
            watchlists.
          </p>
        </section>

        <section className="panel panel-chart">
          <RedditMentionsChart rawData={rawData} loading={loading} />
        </section>
      </main>
    </div>
  );
}
