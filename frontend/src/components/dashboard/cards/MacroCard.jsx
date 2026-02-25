// frontend/src/components/dashboard/cards/MacroCard.jsx
import { useEffect, useMemo, useState } from "react";
import HelpTooltip from "../../common/HelpTooltip.jsx";

import { getJson } from "../../../lib/api/json.js";
import { fmtPct2, fmtRate2 } from "../../../lib/format/number.js";

import { MACRO_CARD_COPY as COPY } from "../../../content/dashboard/cards/macroCard.content.ts";

import "../../../css/dashboard/cards/MacroCard.css";

function safeRiskClass(risk) {
  const r = String(risk || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "");
  return r || "unknown";
}

function RiskPill({ risk }) {
  const cls = useMemo(() => safeRiskClass(risk), [risk]);
  return <span className={`macro-pill macro-pill--${cls}`}>{risk || COPY.pill.unknown}</span>;
}

// Backend envelope: { ok, as_of, source, ttl_seconds, data: {...} }
function normalizeMacroEnvelope(json) {
  if (!json || typeof json !== "object") return null;

  const data = json?.data && typeof json.data === "object" ? json.data : null;
  if (!data) return null;

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
  if (!Number.isFinite(s) || s <= 0) return COPY.footer.cacheFallback;
  const m = Math.max(1, Math.round(s / 60));
  return `${COPY.footer.cachePrefix}${m}${COPY.footer.cacheSuffix}`;
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

        const json = await getJson("/api/macro/summary", { signal: ctrl.signal });

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
          <span>{COPY.title}</span>

          <HelpTooltip title={COPY.tooltip.title}>{COPY.tooltip.body}</HelpTooltip>
        </div>

        <RiskPill risk={risk} />
      </div>

      {err ? <div className="macro-error">{err}</div> : null}
      {loading && !data ? (
        <div className="macro-error" style={{ opacity: 0.7 }}>
          {COPY.states.loading}
        </div>
      ) : null}

      <div className="macro-grid">
        <div className="macro-metric">
          <div className="macro-label">{COPY.labels.fedFunds}</div>
          <div className="macro-value">{fmtRate2(data?.data?.rates?.fed_funds)}</div>
        </div>

        <div className="macro-metric">
          <div className="macro-label">{COPY.labels.tenYear}</div>
          <div className="macro-value">{fmtRate2(data?.data?.rates?.ten_year)}</div>
        </div>

        <div className="macro-metric">
          <div className="macro-label">{COPY.labels.cpiYoY}</div>
          <div className="macro-value">{fmtPct2(data?.data?.inflation?.cpi_yoy)}</div>
        </div>

        <div className="macro-metric">
          <div className="macro-label">{COPY.labels.unemployment}</div>
          <div className="macro-value">{fmtPct2(data?.data?.labor?.unemployment)}</div>
        </div>
      </div>

      <div className="macro-footnote">
        {COPY.footer.sourcePrefix} {data?.source || COPY.footer.sourceFallback}
        {COPY.footer.dot}
        {cacheLabelFromTtlSeconds(ttlSeconds)}
      </div>
    </div>
  );
}