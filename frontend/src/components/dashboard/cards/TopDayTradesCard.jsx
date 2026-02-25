// frontend/src/components/dashboard/cards/TopDayTradesCard.jsx
import { useMemo } from "react";

import { fmtMoney } from "../../../lib/format/marketFormat.js";
import { fmtPct2, fmtInt0 } from "../../../lib/format/number.js";

import { TOP_DAY_TRADES_CARD_COPY as COPY } from "../../../content/dashboard/cards/topDayTradesCard.content.ts";

export default function TopDayTradesCard({
  title = COPY.header.title,
  subtitle = COPY.header.subtitle,
  list = "most_active",
  items = [],
  loading = false,
  onChangeList,
}) {
  const headerRight = useMemo(() => {
    const activeStyle = {
      fontWeight: 700,
      border: "1px solid rgba(0,0,0,0.15)",
      padding: "6px 10px",
      borderRadius: 999,
      background: "white",
    };
    const idleStyle = {
      fontWeight: 600,
      border: "1px solid rgba(0,0,0,0.10)",
      padding: "6px 10px",
      borderRadius: 999,
      background: "transparent",
      opacity: 0.85,
    };

    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onChangeList?.("most_active")}
          style={list === "most_active" ? activeStyle : idleStyle}
        >
          {COPY.tabs.mostActive}
        </button>

        <button
          type="button"
          onClick={() => onChangeList?.("top_gainers")}
          style={list === "top_gainers" ? activeStyle : idleStyle}
        >
          {COPY.tabs.topGainers}
        </button>
      </div>
    );
  }, [list, onChangeList]);

  const rows = Array.isArray(items) ? items : [];
  const hasRows = rows.length > 0;

  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h3 className="panel-title" style={{ marginBottom: 4 }}>
            {title}
          </h3>
          <div style={{ fontSize: 13, opacity: 0.75 }}>{subtitle}</div>
        </div>

        {headerRight}
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>{COPY.states.loading}</div>
        ) : !hasRows ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            {COPY.states.empty.line1}
            <br />
            {COPY.states.empty.line2}
          </div>
        ) : (
          <table className="mini-table" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th>{COPY.table.columns.symbol}</th>
                <th>{COPY.table.columns.price}</th>
                <th>{COPY.table.columns.chgPct}</th>
                <th>{COPY.table.columns.volume}</th>
              </tr>
            </thead>

            <tbody>
              {rows.slice(0, COPY.limits.maxRows).map((r) => (
                <tr key={r.symbol}>
                  <td style={{ fontWeight: 700 }}>{r.symbol}</td>
                  <td>{fmtMoney(r.price)}</td>
                  <td>{fmtPct2(r.changePct)}</td>
                  <td>{fmtInt0(r.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}