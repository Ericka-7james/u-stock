// frontend/src/components/dashboard/cards/DataSnapshotsCard.jsx
import React from "react";
import DashboardCard from "./shared/DashboardCard.jsx";

import { fmtEpochSeconds } from "../../../lib/format/datetime.js";
import { nOrNull } from "../../../lib/format/marketFormat.js";

import { DATA_SNAPSHOTS_CARD_COPY as COPY } from "../../../content/dashboard/cards/dataSnapshotsCard.content.ts";

function fmtGeneratedAt(generatedAt) {
  // generatedAt is likely ISO string. Convert to epoch seconds, then format via shared helper.
  const ms = generatedAt ? new Date(generatedAt).getTime() : NaN;
  const sec = Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  return sec ? fmtEpochSeconds(sec) : COPY.fallback.datetime;
}

export default function DataSnapshotsCard({ signalsMeta, pricesMeta, priceSymbols }) {
  const signalsGenerated = fmtGeneratedAt(signalsMeta?.generatedAt);
  const pricesGenerated = fmtGeneratedAt(pricesMeta?.generatedAt);

  const universeSize = Array.isArray(pricesMeta?.universe)
    ? pricesMeta.universe.length
    : Array.isArray(priceSymbols)
    ? priceSymbols.length
    : null;

  const universeSizeText =
    nOrNull(universeSize) === null ? COPY.fallback.universeSize : String(universeSize);

  return (
    <DashboardCard
      as="div"
      className="panel filters-card filters-card--macro"
      headerClassName="filters-card-header"
      titleTag="h3"
      titleClassName="panel-title"
      title={COPY.title}
      subtitle={null}
    >
      <ul className="muted mini-list">
        <li>
          <strong>{COPY.rows.signals}</strong> {signalsGenerated}
        </li>
        <li>
          <strong>{COPY.rows.prices}</strong> {pricesGenerated}
        </li>
        <li>
          <strong>{COPY.rows.universe}</strong> {universeSizeText}
        </li>
      </ul>
    </DashboardCard>
  );
}