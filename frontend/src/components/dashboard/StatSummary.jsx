// frontend/src/components/dashboard/StatSummary.jsx
import "../../css/dashboard/cards/StatSummary.css";

import { maxDate, toValidDate, fmtTimeHHMM, fmtDateShort } from "../../lib/format/datetime.js";

export default function StatSummary({ signalsMeta, signalsData, pricesMeta, priceSymbols = [] }) {
  const signalsList = Array.isArray(signalsData) ? signalsData : [];

  // 1) How many symbols are in your ranked signal snapshot
  const signalsUniverseSize = Array.isArray(signalsMeta?.universe) ? signalsMeta.universe.length : signalsList.length;

  // 2) How many symbols you actually have price data for
  const pricesUniverseSize = Array.isArray(pricesMeta?.universe)
    ? pricesMeta.universe.length
    : Array.isArray(priceSymbols)
    ? priceSymbols.length
    : 0;

  // 3) Latest snapshot time across signals + prices
  const lastRun = maxDate([toValidDate(signalsMeta?.generatedAt), toValidDate(pricesMeta?.generatedAt)]);

  return (
    <div className="stat-row">
      <div className="panel stat-card stat-card--accent-blue">
        <div className="stat-label">Signals universe</div>
        <div className="stat-value">{signalsUniverseSize}</div>
        <div className="stat-caption">Tickers currently ranked by your signal engine</div>
      </div>

      <div className="panel stat-card stat-card--accent-orange">
        <div className="stat-label">Price coverage</div>
        <div className="stat-value">{pricesUniverseSize}</div>
        <div className="stat-caption">Tickers with daily OHLCV in prices-raw.json</div>
      </div>

      <div className="panel stat-card stat-card--accent-teal">
        <div className="stat-label">Last data refresh</div>
        <div className="stat-value">{lastRun ? fmtTimeHHMM(lastRun) : "—"}</div>
        <div className="stat-caption">{lastRun ? fmtDateShort(lastRun) : "Run fetchers + indicators"}</div>
      </div>
    </div>
  );
}