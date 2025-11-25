// src/components/RedditMentionsChart.jsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { useMemo } from "react";

const BAR_COLORS = [
  "#b86b6b", // rose clay
  "#c49a6c", // warm gold
  "#4e9ad8", // soft blue
  "#3fb8a5", // soft teal
  "#f18b42", // orange
  "#8c6f52", // cocoa brown
];

export default function RedditMentionsChart({ rawData, loading }) {
  // rawData should be the `data` array from reddit-mentions.json
  const displayData = useMemo(() => {
    const data = Array.isArray(rawData) ? rawData : [];
    // Just take the top 20 tickers from the snapshot
    return data.slice(0, 20);
  }, [rawData]);

  if (loading) {
    return <p className="muted">Loading Reddit mentions…</p>;
  }

  if (!loading && displayData.length === 0) {
    return (
      <p className="muted">
        No ticker mentions were found in the latest snapshot.
        <br />
        Make sure the data scout pipeline ran successfully, for example:
        <br />
        <code>PYTHONPATH=src python -m data_scout.reddit</code> or{" "}
        <code>PYTHONPATH=src python -m data_scout.run_all</code>.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
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
        <Bar dataKey="count">
          {displayData.map((entry, index) => (
            <Cell
              key={entry.ticker ?? index}
              fill={BAR_COLORS[index % BAR_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
