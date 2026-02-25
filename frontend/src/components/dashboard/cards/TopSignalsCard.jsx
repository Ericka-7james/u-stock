// frontend/src/components/dashboard/cards/TopSignalsCard.jsx
import { useEffect, useMemo, useRef } from "react";
import HelpTooltip from "../../common/HelpTooltip";
import "../../../css/dashboard/cards/TopSignalsCard.css";

import DashboardCard from "./shared/DashboardCard.jsx";

import { nOrNull } from "../../../lib/format/marketFormat.js";
import { fmtPct1FromRatio } from "../../../lib/format/number.js";

import { TOP_SIGNALS_CARD_COPY as COPY } from "../../../content/dashboard/cards/topSignalsCard.content.ts";

function normalizeSignalRow(row) {
  // Supports either:
  // { ticker, score, components:{daily,intraday,multiday} }
  // or custom shapes like { symbol, score, ... }
  const ticker = String(row?.ticker || row?.symbol || "").trim().toUpperCase();
  if (!ticker) return null;

  const score = nOrNull(row?.score);

  const daily = row?.components?.daily || row?.daily || {};
  const intraday = row?.components?.intraday || row?.intraday || {};
  const multiday = row?.components?.multiday || row?.multiday || {};

  return {
    ticker,
    score,
    components: {
      daily: {
        close_return_1d: nOrNull(daily?.close_return_1d ?? daily?.return_1d ?? daily?.r1d),
      },
      intraday: {
        intraday_return: nOrNull(intraday?.intraday_return ?? intraday?.return_intraday ?? intraday?.rintra),
      },
      multiday: {
        return_5d: nOrNull(multiday?.return_5d ?? multiday?.close_return_5d ?? multiday?.r5d),
      },
    },
  };
}

export default function TopSignalsCard({
  signals,
  signalsMeta,
  currentTicker,
  onSelectTicker,
  loading,
}) {
  const lastLogKeyRef = useRef("");

  const rows = useMemo(() => {
    const arr = Array.isArray(signals) ? signals : [];
    const normalized = [];
    for (const r of arr) {
      const n = normalizeSignalRow(r);
      if (n) normalized.push(n);
    }
    return normalized;
  }, [signals]);

  const topFiveSignals = useMemo(() => rows.slice(0, 5), [rows]);

  // ---- Logging (non-spam) ----
  useEffect(() => {
    const key = loading ? "loading" : topFiveSignals.length === 0 ? "empty" : `ok:${topFiveSignals.length}`;
    if (key === lastLogKeyRef.current) return;
    lastLogKeyRef.current = key;

    if (loading) {
      console.log("[top-signals] loading…");
    } else if (topFiveSignals.length === 0) {
      console.log("[top-signals] empty → no ranked signals returned yet (this is normal if pipeline/endpoint not ready).");
    } else {
      console.log("[top-signals] ok → got", topFiveSignals.length, "rows. top =", topFiveSignals[0]?.ticker);
    }
  }, [loading, topFiveSignals]);

  return (
    <DashboardCard className="top-signals-card">
      <header className="card-header top-signals-card__header">
        <div className="card-header-left">
          <h3 className="panel-title">{COPY.title}</h3>
        </div>

        <div className="card-header-right">
          <HelpTooltip title={COPY.tooltip.title}>
            <p>{COPY.tooltip.intro}</p>

            <ul>
              {COPY.tooltip.bullets.map((b) => (
                <li key={b.label}>
                  <strong>{b.label}:</strong> {b.text}
                </li>
              ))}
            </ul>

            <p className="muted">{COPY.tooltip.footer}</p>
          </HelpTooltip>
        </div>
      </header>

      {loading ? (
        <p className="muted">{COPY.states.loading}</p>
      ) : topFiveSignals.length === 0 ? (
        <p className="muted">
          {COPY.states.empty.line1}
          <br />
          {COPY.states.empty.line2}
        </p>
      ) : (
        <>
          <table className="mini-table">
            <thead>
              <tr>
                <th>{COPY.table.headers.ticker}</th>
                <th>{COPY.table.headers.score}</th>
                <th>{COPY.table.headers.d1}</th>
                <th>{COPY.table.headers.intraday}</th>
                <th>{COPY.table.headers.d5}</th>
              </tr>
            </thead>
            <tbody>
              {topFiveSignals.map((row) => {
                const daily = row.components?.daily ?? {};
                const intraday = row.components?.intraday ?? {};
                const multiday = row.components?.multiday ?? {};

                return (
                  <tr
                    key={row.ticker}
                    className={row.ticker === currentTicker ? "mini-table-row--active" : ""}
                    onClick={() => onSelectTicker?.(row.ticker)}
                    style={{ cursor: "pointer" }}
                    title={COPY.table.rowTitle}
                  >
                    <td>{row.ticker}</td>
                    <td>{row.score != null ? row.score.toFixed(2) : "—"}</td>
                    <td>{fmtPct1FromRatio(daily.close_return_1d)}</td>
                    <td>{fmtPct1FromRatio(intraday.intraday_return)}</td>
                    <td>{fmtPct1FromRatio(multiday.return_5d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {signalsMeta?.rankingDescription ? (
            <p className="mini-table-caption muted">{signalsMeta.rankingDescription}</p>
          ) : null}
        </>
      )}
    </DashboardCard>
  );
}