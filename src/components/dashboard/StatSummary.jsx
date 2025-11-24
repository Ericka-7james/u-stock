// src/components/dashboard/StatSummary.jsx
export default function StatSummary({ signalsMeta, signalsData, pricesMeta }) {
  const list = Array.isArray(signalsData) ? signalsData : [];
  const totalTickers = list.length;

  const top = list[0];
  const topTicker = top?.ticker ?? "—";
  const topScore =
    typeof top?.score === "number" ? top.score.toFixed(2) : "—";

  const lastRun =
    signalsMeta?.generatedAt || pricesMeta?.generatedAt || null;

  return (
    <div className="stat-row">
      <div className="stat-card stat-card--accent-blue">
        <div className="stat-label">Universe size</div>
        <div className="stat-value">{totalTickers}</div>
        <div className="stat-caption">
          Tickers ranked by your data-bot pipeline
        </div>
      </div>

      <div className="stat-card stat-card--accent-orange">
        <div className="stat-label">Top in-play ticker</div>
        <div className="stat-value">{topTicker}</div>
        <div className="stat-caption">
          Score: {topScore !== "NaN" ? topScore : "—"}
        </div>
      </div>

      <div className="stat-card stat-card--accent-teal">
        <div className="stat-label">Last data refresh</div>
        <div className="stat-value">
          {lastRun
            ? new Date(lastRun).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </div>
        <div className="stat-caption">
          {lastRun
            ? new Date(lastRun).toLocaleDateString()
            : "Run fetch + indicators"}
        </div>
      </div>
    </div>
  );
}
