// src/components/dashboard/PriceChart.jsx
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function PriceChart({ ticker, data, loading, pricesMeta }) {
  if (loading) {
    return <p className="muted">Loading price history…</p>;
  }

  if (!ticker || !data || data.length === 0) {
    return <p className="muted">No price history available.</p>;
  }

  const snapshotTime = pricesMeta?.generatedAt
    ? new Date(pricesMeta.generatedAt)
    : null;

  return (
    <div className="chart-wrapper">
      <div className="card-header">
        <div>
          <h2>{ticker} price action (daily)</h2>
          <p className="card-subtitle">
            Close price over time using your u-Stock data bot&apos;s daily OHLCV
            snapshot.
          </p>
          {snapshotTime && (
            <p className="card-subtitle muted">
              Snapshot as of{" "}
              {snapshotTime.toLocaleString(undefined, {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="dateLabel"
            minTickGap={16}
            tickFormatter={(v) => v?.slice(5) ?? v} // show MM-DD
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(v) => v.toFixed(0)}
          />
          <Tooltip
            formatter={(value) =>
              typeof value === "number" ? value.toFixed(2) : value
            }
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="close"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
