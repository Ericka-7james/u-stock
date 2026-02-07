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
  return <span className={`macro-pill macro-pill--${cls}`}>{risk || "Unknown"}</span>;
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

// Backend envelope: { ok, as_of, source, ttl_seconds, data: {...} }
function normalizeMacroEnvelope(json) {
  if (!json || typeof json !== "object") return null;

  const data = json?.data && typeof json.data === "object" ? json.data : null;
  if (!data) return null;

  // Support a few likely shapes from fred_client.get_macro_summary():
  // Preferred (what UI wants): data = { risk, rates:{fed_funds,ten_year}, inflation:{cpi_yoy}, labor:{unemployment} }
  // Accept alternates: data may be flat or use common FRED series codes.
  const rates = data.rates || data.rate || data.yields || {};
  const inflation = data.inflation || data.prices || {};
  const labor = data.labor || data.jobs || {};

  const fedFunds =
    rates.fed_funds ??
    rates.fedFunds ??
    rates.dff ??
    rates.DFF ??
    data.fed_funds ??
    data.fedFunds ??
    data.dff ??
    data.DFF ??
    null;

  const tenYear =
    rates.ten_year ??
    rates.tenYear ??
    rates.dgs10 ??
    rates.DGS10 ??
    data.ten_year ??
    data.tenYear ??
    data.dgs10 ??
    data.DGS10 ??
    null;

  const cpiYoY =
    inflation.cpi_yoy ??
    inflation.cpiYoY ??
    inflation.CPI_YOY ??
    data.cpi_yoy ??
    data.cpiYoY ??
    data.CPI_YOY ??
    null;

  const unemployment =
    labor.unemployment ??
    labor.unrate ??
    labor.UNRATE ??
    data.unemployment ??
    data.unrate ??
    data.UNRATE ??
    null;

  const risk = data.risk ?? data.risk_signal ?? data.riskSignal ?? null;

  return {
    ok: Boolean(json?.ok),
    as_of: json?.as_of ?? null,
    source: json?.source ?? "fred",
    ttl_seconds: json?.ttl_seconds ?? null,
    data: {
      risk,
      rates: { fed_funds: fedFunds, ten_year: tenYear },
      inflation: { cpi_yoy: cpiYoY },
      labor: { unemployment },
    },
  };
}

function cacheLabelFromTtlSeconds(ttlSeconds) {
  const s = Number(ttlSeconds);
  if (!Number.isFinite(s) || s <= 0) return "cached 10m";
  const m = Math.max(1, Math.round(s / 60));
  return `cached ${m}m`;
}

export default function MacroCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setErr("");
        setLoading(true);

        const res = await fetch("/api/macro/summary", {
          credentials: "include",
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });

        const json = await safeReadJson(res);

        // Backend error detail is an object: { code, message }
        const detail =
          json?.detail?.message ||
          json?.detail ||
          (res.ok ? null : `Failed to load macro (${res.status})`);

        if (!res.ok) throw new Error(typeof detail === "string" ? detail : "Failed to load macro");

        const normalized = normalizeMacroEnvelope(json);
        if (!normalized) {
          throw new Error("Macro payload missing expected envelope keys: { data, ttl_seconds, source }");
        }

        if (alive) setData(normalized);
      } catch (e) {
        if (!alive) return;
        if (e?.name === "AbortError") return;
        setErr(String(e?.message || e));
      } finally {
        if (!alive) return;
        setLoading(false);
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

  const risk = data?.data?.risk ?? null;
  const ttlSeconds = data?.ttl_seconds ?? null;

  return (
    <div className="macro-card">
      <div className="macro-header">
        <div className="macro-title">
          <span>Macro</span>

          <HelpTooltip title="Macro help">
            US macro snapshot (FRED): rates, inflation (CPI YoY), labor, and a simple risk signal.
          </HelpTooltip>
        </div>

        <RiskPill risk={risk} />
      </div>

      {err ? <div className="macro-error">{err}</div> : null}
      {loading && !data ? <div className="macro-error" style={{ opacity: 0.7 }}>Loading…</div> : null}

      <div className="macro-grid">
        <div className="macro-metric">
          <div className="macro-label">Fed Funds (DFF)</div>
          <div className="macro-value">{fmtRate(data?.data?.rates?.fed_funds)}</div>
        </div>

        <div className="macro-metric">
          <div className="macro-label">10Y Yield (DGS10)</div>
          <div className="macro-value">{fmtRate(data?.data?.rates?.ten_year)}</div>
        </div>

        <div className="macro-metric">
          <div className="macro-label">CPI YoY</div>
          <div className="macro-value">{fmtPct(data?.data?.inflation?.cpi_yoy)}</div>
        </div>

        <div className="macro-metric">
          <div className="macro-label">Unemployment (UNRATE)</div>
          <div className="macro-value">{fmtPct(data?.data?.labor?.unemployment)}</div>
        </div>
      </div>

      <div className="macro-footnote">
        Source: {data?.source || "—"} · {cacheLabelFromTtlSeconds(ttlSeconds)}
      </div>
    </div>
  );
}
