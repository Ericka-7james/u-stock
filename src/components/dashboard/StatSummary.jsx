// src/components/dashboard/StatSummary.jsx
import { Link } from "react-router-dom";

export default function StatSummary({ meta, rawData }) {
  const totalMentions = rawData.reduce((sum, item) => sum + item.count, 0);
  const topTicker = rawData[0]?.ticker ?? "—";
  const topTickerCount = rawData[0]?.count ?? 0;

  return (
    <div className="stat-row">
      <div className="stat-card stat-card--accent-blue">
        <div className="stat-label">Total Mentions</div>
        <div className="stat-value">{totalMentions.toLocaleString()}</div>
        <div className="stat-caption">Across all scanned posts</div>
      </div>

      <div className="stat-card stat-card--accent-orange">
        <div className="stat-label">Top Ticker</div>
        <div className="stat-value">{topTicker}</div>
        <div className="stat-caption">
          {topTickerCount > 0
            ? `${topTickerCount} mentions`
            : "No mentions this run"}
        </div>
      </div>

      <Link to="/subreddits" className="stat-card stat-card--accent-teal stat-card--clickable">
        <div className="stat-label">Subreddits</div>
        <div className="stat-value">{meta?.subreddits?.length ?? 0}</div>
        <div className="stat-caption">See more details →</div>
      </Link>

    </div>
  );
}
