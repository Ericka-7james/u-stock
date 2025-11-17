import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TRACKED_TICKERS } from "../config/trackedTickers";
import { useMemo, useState } from "react";

export default function RedditMentionsChart({ rawData, loading }) {
  const [viewMode, setViewMode] = useState("all"); // "all" | "tracked";

  const displayData = useMemo(() => {
    let data = [...rawData];

    if (viewMode === "tracked") {
      const trackedSet = new Set(TRACKED_TICKERS.map((t) => t.toUpperCase()));
      data = data.filter((item) => trackedSet.has(item.ticker.toUpperCase()));
    }

    const limit = viewMode === "all" ? 20 : 30; // fewer labels for "all"
    return data.slice(0, limit);
  }, [rawData, viewMode]);

  return (
    <div className="card-main-chart">
      <div className="card-header">
        <h2>Reddit Ticker Mentions (Top 20 / 30)</h2>

        <div className="toggle-group">
          <button
            type="button"
            className={
              "toggle-btn " + (viewMode === "all" ? "toggle-btn--active" : "")
            }
            onClick={() => setViewMode("all")}
          >
            All
          </button>
          <button
            type="button"
            className={
              "toggle-btn " +
              (viewMode === "tracked" ? "toggle-btn--active" : "")
            }
            onClick={() => setViewMode("tracked")}
          >
            Tracked only
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading Reddit mentions…</p>
      ) : displayData.length === 0 ? (
        <p className="muted">
          No data for this view. Try switching modes or run{" "}
          <code>npm run fetch:reddit-mentions</code>.
        </p>
      ) : (
        <div className="chart-wrapper">
          <ResponsiveContainer>
            <BarChart
              data={displayData}
              margin={{ top: 20, right: 20, left: 0, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="ticker"
                angle={-45}
                textAnchor="end"
                interval={0}
                minTickGap={10}
              />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
