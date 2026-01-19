// src/components/dashboard/cards/MacroCard.jsx
import { useEffect, useMemo, useState } from "react";
import HelpTooltip from "../../common/HelpTooltip.jsx";
import "../../../css/dashboard/cards/MacroCard.css";

function fmtPct(x) {
  const n = Number(x);
  if (x === null || x === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function fmtRate(x) {
  const n = Number(x);
  if (x === null || x === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function safeRiskClass(risk) {
  const r = String(risk || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "");
  return r || "unknown";
}

function RiskPill({ risk }) {
  const cls = useMemo(() => safeRiskClass(risk), [risk]);
  return (
    <span className={`macro-pill macro-pill--${cls}`}>
      {risk || "Unknown"}
    </span>
  );
}

async function safeReadJson(res) {
  const ct = res?.headers?.get?.("content-type") || "";
  if (!ct.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function MacroCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setErr("");

        const res = await fetch("/api/macro/summary", {
          credentials: "include",
          signal: ctrl.signal,
        });

        const json = await safeReadJson(res);
        const detail =
          json?.detail ||
          (res.ok ? null : `Failed to load macro (${res.status})`);

        if (!res.ok) throw new Error(detail || "Failed to load macro");

        if (alive) setData(json);
      } catch (e) {
        if (!alive) return;
        if (e?.name === "AbortError") return;
        setErr(String(e?.message || e));
      }
    }

    run();
    const t = setInterval(run, 60_000);

    return () => {
      alive = false;
      clearInterval(t);
      ctrl.abort();
    };
  }, []);

  return (
    <div className="macro-card">
      <div className="macro-header">
        <div className="macro-title">
          <span>Macro</span>

          <HelpTooltip title="Macro help">
            US macro snapshot (FRED): rates, inflation (CPI YoY), labor, and a
            simple risk signal.
          </HelpTooltip>
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
