import { useEffect, useState } from "react";
import HelpTooltip from "../../common/HelpTooltip.jsx";
import "../../../css/dashboard/cards/MacroCard.css";

function fmtPct(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "—";
  return `${Number(x).toFixed(2)}%`;
}

function fmtRate(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "—";
  return `${Number(x).toFixed(2)}%`;
}

function RiskPill({ risk }) {
  const r = (risk || "").toLowerCase();
  return (
    <span className={`macro-pill macro-pill--${r || "unknown"}`}>
      {risk || "Unknown"}
    </span>
  );
}

export default function MacroCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        setErr("");
        const res = await fetch("/api/macro/summary", { credentials: "include" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.detail || "Failed to load macro");
        if (alive) setData(json);
      } catch (e) {
        if (alive) setErr(String(e?.message || e));
      }
    }

    run();
    const t = setInterval(run, 60_000); // refresh 1/min (backend cached anyway)
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="macro-card">
      <div className="macro-header">
        <div className="macro-title">
          <span>Macro</span>
          <HelpTooltip text="US macro snapshot (FRED): rates, inflation (CPI YoY), labor, and a simple risk signal." />
        </div>
        <RiskPill risk={data?.risk} />
      </div>

      {err ? <div className="macro-error">{err}</div> : null}

      <div className="macro-grid">
        <div className="macro-metric">
          <div className="macro-label">Fed Funds (DFF)</div>
          <div className="macro-value">{fmtRate(data?.rates?.fed_funds)}</div>
        </div>

        <div className="macro-metric">
          <div className="macro-label">10Y Yield (DGS10)</div>
          <div className="macro-value">{fmtRate(data?.rates?.ten_year)}</div>
        </div>

        <div className="macro-metric">
          <div className="macro-label">CPI YoY</div>
          <div className="macro-value">{fmtPct(data?.inflation?.cpi_yoy)}</div>
        </div>

        <div className="macro-metric">
          <div className="macro-label">Unemployment (UNRATE)</div>
          <div className="macro-value">{fmtPct(data?.labor?.unemployment)}</div>
        </div>
      </div>

      <div className="macro-footnote">
        Source: {data?.source || "—"} · cached 10m
      </div>
    </div>
  );
}
