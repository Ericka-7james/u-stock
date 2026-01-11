// frontend/src/components/dashboard/cards/TopDayTradesCard.jsx
import { useMemo } from "react";

function fmtPct(x) {
  if (x == null) return "—";
  return `${x.toFixed(2)}%`;
}

function fmtPrice(x) {
  if (x == null) return "—";
  return `$${x.toFixed(2)}`;
}

function fmtInt(x) {
  if (x == null) return "—";
  try {
    return Intl.NumberFormat().format(Math.round(x));
  } catch {
    return String(x);
  }
}

export default function TopDayTradesCard({
  title = "Top Day Trades",
  subtitle = "Live from Alpaca screener",
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
          Most Active
        </button>
        <button
          type="button"
          onClick={() => onChangeList?.("top_gainers")}
          style={list === "top_gainers" ? activeStyle : idleStyle}
        >
          Top Gainers
        </button>
      </div>
    );
  }, [list, onChangeList]);

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
          <div style={{ fontSize: 13, opacity: 0.75 }}>Loading top tickers…</div>
        ) : !items || items.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            No results yet.
            <br />
            If Alpaca isn’t connected, reconnect in Connected Apps.
          </div>
        ) : (
          <table className="mini-table" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>Chg%</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 10).map((r) => (
                <tr key={r.symbol}>
                  <td style={{ fontWeight: 700 }}>{r.symbol}</td>
                  <td>{fmtPrice(r.price)}</td>
                  <td>{fmtPct(r.changePct)}</td>
                  <td>{fmtInt(r.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
