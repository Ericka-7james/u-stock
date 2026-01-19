// frontend/src/components/dashboard/cards/TopSignalsCard.jsx
import { useEffect, useMemo, useRef } from "react";
import HelpTooltip from "../../common/HelpTooltip";
import "../../../css/dashboard/cards/TopSignalsCard.css";

function toNum(x) {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeSignalRow(row) {
  // Supports either:
  // { ticker, score, components:{daily,intraday,multiday} }
  // or custom shapes like { symbol, score, ... }
  const ticker = String(row?.ticker || row?.symbol || "").trim().toUpperCase();
  if (!ticker) return null;

  const score = toNum(row?.score);

  const daily = row?.components?.daily || row?.daily || {};
  const intraday = row?.components?.intraday || row?.intraday || {};
  const multiday = row?.components?.multiday || row?.multiday || {};

  return {
    ticker,
    score,
    components: {
      daily: {
        close_return_1d: toNum(daily?.close_return_1d ?? daily?.return_1d ?? daily?.r1d),
      },
      intraday: {
        intraday_return: toNum(intraday?.intraday_return ?? intraday?.return_intraday ?? intraday?.rintra),
      },
      multiday: {
        return_5d: toNum(multiday?.return_5d ?? multiday?.close_return_5d ?? multiday?.r5d),
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
    // build a small "state key" so we log only when it changes
    const key = loading
      ? "loading"
      : topFiveSignals.length === 0
      ? "empty"
      : `ok:${topFiveSignals.length}`;

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
    <div className="panel filters-card filters-card--index">
      <div className="filters-card-header">
        <h3 className="panel-title">Top signals</h3>

        <HelpTooltip title="How are top signals ranked?">
          <p>
            These signals come from your processed datasets (or your backend ranking endpoint).
            They combine daily, intraday, and multiday indicators to score each ticker.
          </p>

          <ul>
            <li><strong>Score:</strong> Combined signal strength.</li>
            <li><strong>1d:</strong> Daily return factor.</li>
            <li><strong>Intraday:</strong> Short-term momentum.</li>
            <li><strong>5d:</strong> Multiday trend strength.</li>
          </ul>

          <p className="muted">
            Scores are recalculated each time your data pipeline runs.
          </p>
        </HelpTooltip>
      </div>

      {loading ? (
        <p className="muted">Loading signals…</p>
      ) : topFiveSignals.length === 0 ? (
        <p className="muted">
          No signals available yet.
          <br />
          If this is unexpected: start your backend ranking endpoint or run your pipeline.
        </p>
      ) : (
        <>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Score</th>
                <th>1d</th>
                <th>Intraday</th>
                <th>5d</th>
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
                    title="Click to load this ticker"
                  >
                    <td>{row.ticker}</td>
                    <td>{row.score != null ? row.score.toFixed(2) : "—"}</td>
                    <td>
                      {daily.close_return_1d != null
                        ? (daily.close_return_1d * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                    <td>
                      {intraday.intraday_return != null
                        ? (intraday.intraday_return * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                    <td>
                      {multiday.return_5d != null
                        ? (multiday.return_5d * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {signalsMeta?.rankingDescription ? (
            <p className="mini-table-caption muted">
              {signalsMeta.rankingDescription}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
