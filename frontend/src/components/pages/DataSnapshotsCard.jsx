// frontend/src/components/dashboard/cards/DataSnapshotsCard.jsx
import { fmtIsoDateTime } from "../../../lib/format/datetime.js";
import { DASHBOARD_PAGE_COPY as COPY } from "../../../content/dashboardpage.content.ts";

export default function DataSnapshotsCard({ signalsMeta, pricesMeta, priceSymbols }) {
  const empty = COPY.dataSnapshots.empty;

  const signalsGenerated = signalsMeta?.generatedAt ? fmtIsoDateTime(signalsMeta.generatedAt) : empty;
  const pricesGenerated = pricesMeta?.generatedAt ? fmtIsoDateTime(pricesMeta.generatedAt) : empty;

  const universeSize = Array.isArray(pricesMeta?.universe)
    ? pricesMeta.universe.length
    : Array.isArray(priceSymbols)
    ? priceSymbols.length
    : COPY.dataSnapshots.emptyUniverse;

  return (
    <div className="panel filters-card filters-card--macro">
      <div className="filters-card-header">
        <h3 className="panel-title">{COPY.dataSnapshots.title}</h3>
      </div>

      <ul className="muted mini-list">
        <li>
          <strong>{COPY.dataSnapshots.signalsLabel}</strong> {signalsGenerated}
        </li>
        <li>
          <strong>{COPY.dataSnapshots.pricesLabel}</strong> {pricesGenerated}
        </li>
        <li>
          <strong>{COPY.dataSnapshots.universeLabel}</strong> {universeSize}
        </li>
      </ul>
    </div>
  );
}