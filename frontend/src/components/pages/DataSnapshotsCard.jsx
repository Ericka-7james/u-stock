// frontend/src/components/dashboard/cards/DataSnapshotsCard.jsx
import { fmtIsoDateTime } from "../../../lib/format/datetime.js";

export default function DataSnapshotsCard({ signalsMeta, pricesMeta, priceSymbols }) {
  const signalsGenerated = signalsMeta?.generatedAt ? fmtIsoDateTime(signalsMeta.generatedAt) : "—";
  const pricesGenerated = pricesMeta?.generatedAt ? fmtIsoDateTime(pricesMeta.generatedAt) : "—";

  const universeSize = Array.isArray(pricesMeta?.universe)
    ? pricesMeta.universe.length
    : Array.isArray(priceSymbols)
    ? priceSymbols.length
    : "---";

  return (
    <div className="panel filters-card filters-card--macro">
      <div className="filters-card-header">
        <h3 className="panel-title">Data snapshots</h3>
      </div>

      <ul className="muted mini-list">
        <li>
          <strong>Signals:</strong> {signalsGenerated}
        </li>
        <li>
          <strong>Prices:</strong> {pricesGenerated}
        </li>
        <li>
          <strong>Universe size (prices):</strong> {universeSize}
        </li>
      </ul>
    </div>
  );
}