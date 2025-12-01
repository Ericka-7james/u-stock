// src/components/dashboard/StatSummary.jsx
export default function StatSummary({
  signalsMeta,
  signalsData,
  pricesMeta,
  priceSymbols = [],
}) {
  const signalsList = Array.isArray(signalsData) ? signalsData : [];

  // 1) How many symbols are in your ranked signal snapshot
  const signalsUniverseSize = Array.isArray(signalsMeta?.universe)
    ? signalsMeta.universe.length
    : signalsList.length;

  // 2) How many symbols you actually have price data for
  const pricesUniverseSize = Array.isArray(pricesMeta?.universe)
    ? pricesMeta.universe.length
    : Array.isArray(priceSymbols)
    ? priceSymbols.length
    : 0;

  // Top in-play ticker from signals
  const top = signalsList[0];
  const topTicker = top?.ticker ?? "—";
  const topScore =
    typeof top?.score === "number" ? top.score.toFixed(2) : "—";

  // 3) Latest snapshot time across signals + prices
  let lastRun = null;
  const times = [];
  if (signalsMeta?.generatedAt) {
    times.push(new Date(signalsMeta.generatedAt));
  }
  if (pricesMeta?.generatedAt) {
    times.push(new Date(pricesMeta.generatedAt));
  }
  if (times.length > 0) {
    const maxTs = new Date(Math.max(...times.map((t) => t.getTime())));
    lastRun = maxTs;
  }

  return (
    <div className="stat-row">
      {/* Card 1: signals universe (ranked tickers) */}
      <div className="stat-card stat-card--accent-blue">
        <div className="stat-label">Signals universe</div>
        <div className="stat-value">{signalsUniverseSize}</div>
        <div className="stat-caption">
          Tickers currently ranked by your signal engine
        </div>
      </div>

      {/* Card 2: price coverage */}
      <div className="stat-card stat-card--accent-orange">
        <div className="stat-label">Price coverage</div>
        <div className="stat-value">{pricesUniverseSize}</div>
        <div className="stat-caption">
          Tickers with daily OHLCV in prices-raw.json
        </div>
      </div>

      {/* Card 3: last time *any* dataset was refreshed */}
      <div className="stat-card stat-card--accent-teal">
        <div className="stat-label">Last data refresh</div>
        <div className="stat-value">
          {lastRun
            ? lastRun.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </div>
        <div className="stat-caption">
          {lastRun
            ? lastRun.toLocaleDateString()
            : "Run fetchers + indicators"}
        </div>
      </div>
    </div>
  );
}
