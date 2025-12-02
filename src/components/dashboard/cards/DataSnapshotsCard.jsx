// src/components/dashboard/cards/DataSnapshotsCard.jsx

export default function DataSnapshotsCard({ signalsMeta, pricesMeta, priceSymbols }) {
  const signalsGenerated =
    signalsMeta?.generatedAt
      ? new Date(signalsMeta.generatedAt).toLocaleString()
      : "—";

  const pricesGenerated =
    pricesMeta?.generatedAt
      ? new Date(pricesMeta.generatedAt).toLocaleString()
      : "—";

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
