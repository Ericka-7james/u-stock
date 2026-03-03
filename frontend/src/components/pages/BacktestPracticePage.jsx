// frontend/src/components/pages/BacktestPracticePage.jsx
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AppShell from "../layout/AppShell";
import PageHeaderCard from "../common/PageHeaderCard";

import "../../css/pages/BacktestPracticePage.css";

// content moved out (same pattern as AboutPage)
import { BACKTEST_PRACTICE_PAGE_COPY } from "../../content/pages/backtestPracticePage.content.ts";

// Optional: if you have a page mascot asset, wire it here later
// import PracticeSquirrel from "../../assets/pages/PracticeSquirrel.png";

const TF_OPTIONS = ["1Min", "5Min", "15Min", "30Min", "1Hour", "1Day"];

function _asStr(x) {
  return String(x ?? "").trim();
}

function _asInt(x, fallback) {
  const n = Number.parseInt(String(x ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function _splitSymbols(raw) {
  return _asStr(raw)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 25); // UI guardrail (backend should enforce too)
}

function _todayISO() {
  // Date input needs YYYY-MM-DD in local tz
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function _daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function BacktestPracticePage() {
  const c = BACKTEST_PRACTICE_PAGE_COPY;

  // ---------- form state ----------
  const [symbolsRaw, setSymbolsRaw] = useState("SPY,QQQ,AAPL,MSFT,NVDA");
  const [tfEntry, setTfEntry] = useState("5Min");
  const [tfBias, setTfBias] = useState("15Min");

  const [startDate, setStartDate] = useState(_daysAgoISO(180));
  const [endDate, setEndDate] = useState(_todayISO());

  const [warmup, setWarmup] = useState(320);
  const [steps, setSteps] = useState(200000);
  const [qty, setQty] = useState(1);

  // ---------- run state (frontend-only stub for now) ----------
  const [job, setJob] = useState(null); // {id, status, createdAt, config, result?}
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);

  const symbols = useMemo(() => _splitSymbols(symbolsRaw), [symbolsRaw]);

  const config = useMemo(() => {
    return {
      symbols,
      tf_entry: tfEntry,
      tf_bias: tfBias,
      start: startDate,
      end: endDate,
      warmup: _asInt(warmup, 320),
      steps: _asInt(steps, 200000),
      qty: _asInt(qty, 1),
    };
  }, [symbols, tfEntry, tfBias, startDate, endDate, warmup, steps, qty]);

  const validation = useMemo(() => {
    const issues = [];
    if (symbols.length === 0) issues.push("Add at least one symbol.");
    if (!TF_OPTIONS.includes(tfEntry)) issues.push("Entry timeframe is invalid.");
    if (!TF_OPTIONS.includes(tfBias)) issues.push("Bias timeframe is invalid.");

    // Simple date guard
    if (_asStr(startDate) === "" || _asStr(endDate) === "") {
      issues.push("Start and end dates are required.");
    } else if (startDate > endDate) {
      issues.push("Start date must be before end date.");
    }

    // Simple numeric guard
    if (_asInt(warmup, 0) < 0) issues.push("Warmup must be 0 or greater.");
    if (_asInt(steps, 0) <= 0) issues.push("Steps must be greater than 0.");
    if (_asInt(qty, 0) <= 0) issues.push("Qty must be greater than 0.");

    return { ok: issues.length === 0, issues };
  }, [symbols, tfEntry, tfBias, startDate, endDate, warmup, steps, qty]);

  const onReset = useCallback(() => {
    setSymbolsRaw("SPY,QQQ,AAPL,MSFT,NVDA");
    setTfEntry("5Min");
    setTfBias("15Min");
    setStartDate(_daysAgoISO(180));
    setEndDate(_todayISO());
    setWarmup(320);
    setSteps(200000);
    setQty(1);
    setErr(null);
    setJob(null);
    setRunning(false);
  }, []);

  const onRun = useCallback(async () => {
    setErr(null);

    if (!validation.ok) {
      setErr({ title: c.errors.invalid.title, body: validation.issues.join(" ") });
      return;
    }

    // Frontend-only stub:
    // Later this becomes POST /api/backtests/run and returns job_id.
    setRunning(true);

    const newJob = {
      id: `local_${Date.now()}`,
      status: "queued",
      createdAt: new Date().toISOString(),
      config,
    };
    setJob(newJob);

    // Fake a job lifecycle (so UI is wired and feels real)
    setTimeout(() => {
      setJob((prev) => (prev ? { ...prev, status: "running" } : prev));
    }, 450);

    setTimeout(() => {
      setJob((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "done",
          result: {
            headline: "Mock backtest complete (frontend stub)",
            summary: {
              trades: 42,
              win_rate: 0.57,
              pnl: 812.35,
              max_drawdown: -0.043,
              avg_trade: 19.34,
              exposure: 0.28,
            },
            notes: [
              "This is placeholder data until the backend job runner is connected.",
              "Next: wire POST /api/backtests/run + polling GET /api/backtests/{job_id}.",
            ],
            artifacts: {
              report_txt: null,
              run_json: null,
              trades_csv: null,
            },
          },
        };
      });
      setRunning(false);
    }, 1450);
  }, [c.errors.invalid.title, config, validation.ok, validation.issues, c.errors.invalid.body]);

  const statusPill = useMemo(() => {
    const s = job?.status || "idle";
    const map = {
      idle: { label: c.status.idle, cls: "pill idle" },
      queued: { label: c.status.queued, cls: "pill queued" },
      running: { label: c.status.running, cls: "pill running" },
      done: { label: c.status.done, cls: "pill done" },
      failed: { label: c.status.failed, cls: "pill failed" },
    };
    return map[s] || map.idle;
  }, [job?.status, c.status]);

  return (
    <AppShell>
      <div className="bt-practice-page">
        <PageHeaderCard
          title={c.header.title}
          subtitle={<span className="bt-tagline">{c.header.tagline}</span>}
          right={
            <div className="bt-heroRight">
              <div className={statusPill.cls}>{statusPill.label}</div>
              <div className="bt-heroHint">{c.header.hint}</div>
              {/* If you want an image later, drop it here like AboutPage */}
              {/* <img src={PracticeSquirrel} alt="Practice mascot" className="bt-heroLogo" /> */}
            </div>
          }
        >
          <p className="muted">{c.intro.primary}</p>
          <p className="muted small">{c.intro.secondary}</p>

          <div className="bt-headerLinks">
            <Link to="/" className="back-link-pill">
              ← Back to dashboard
            </Link>
          </div>
        </PageHeaderCard>

        {/* ✅ Lane wrapper (matches .ds-page-wrap behavior) */}
        <div className="bt-page-wrap">
          <section className="bt-grid">
            <article className="bt-card bt-span2">
              <h2>{c.sections.config.title}</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                {c.sections.config.subtitle}
              </p>

              {err ? (
                <div className="bt-inlineError" role="alert">
                  <div className="bt-inlineError-title">{err.title}</div>
                  <div className="bt-inlineError-body">{err.body}</div>
                </div>
              ) : null}

              <div className="bt-form">
                <div className="bt-row">
                  <label className="bt-label">
                    {c.fields.symbols.label}
                    <input
                      className="bt-input"
                      value={symbolsRaw}
                      onChange={(e) => setSymbolsRaw(e.target.value)}
                      placeholder={c.fields.symbols.placeholder}
                      spellCheck={false}
                    />
                    <div className="bt-help">{c.fields.symbols.help}</div>
                  </label>
                </div>

                <div className="bt-row bt-row-3">
                  <label className="bt-label">
                    {c.fields.tfEntry.label}
                    <select
                      className="bt-input"
                      value={tfEntry}
                      onChange={(e) => setTfEntry(e.target.value)}
                    >
                      {TF_OPTIONS.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="bt-label">
                    {c.fields.tfBias.label}
                    <select
                      className="bt-input"
                      value={tfBias}
                      onChange={(e) => setTfBias(e.target.value)}
                    >
                      {TF_OPTIONS.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="bt-label">
                    {c.fields.qty.label}
                    <input
                      className="bt-input"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      inputMode="numeric"
                      placeholder="1"
                    />
                  </label>
                </div>

                <div className="bt-row bt-row-4">
                  <label className="bt-label">
                    {c.fields.start.label}
                    <input
                      className="bt-input"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </label>

                  <label className="bt-label">
                    {c.fields.end.label}
                    <input
                      className="bt-input"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </label>

                  <label className="bt-label">
                    {c.fields.warmup.label}
                    <input
                      className="bt-input"
                      value={warmup}
                      onChange={(e) => setWarmup(e.target.value)}
                      inputMode="numeric"
                      placeholder="320"
                    />
                  </label>

                  <label className="bt-label">
                    {c.fields.steps.label}
                    <input
                      className="bt-input"
                      value={steps}
                      onChange={(e) => setSteps(e.target.value)}
                      inputMode="numeric"
                      placeholder="200000"
                    />
                  </label>
                </div>

                <div className="bt-actions">
                  <button
                    className="bt-btn primary"
                    onClick={onRun}
                    disabled={running}
                    type="button"
                  >
                    {running ? c.buttons.running : c.buttons.run}
                  </button>

                  <button className="bt-btn" onClick={onReset} type="button" disabled={running}>
                    {c.buttons.reset}
                  </button>

                  <div className="bt-actionsNote muted small">{c.sections.config.note}</div>
                </div>
              </div>
            </article>

            <article className="bt-card">
              <h2>{c.sections.preview.title}</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                {c.sections.preview.subtitle}
              </p>

              <div className="bt-kv">
                <div className="bt-kv-row">
                  <span className="k">{c.kv.symbols}</span>
                  <span className="v">{symbols.join(", ") || "—"}</span>
                </div>
                <div className="bt-kv-row">
                  <span className="k">{c.kv.timeframes}</span>
                  <span className="v">
                    {tfBias} → {tfEntry}
                  </span>
                </div>
                <div className="bt-kv-row">
                  <span className="k">{c.kv.range}</span>
                  <span className="v">
                    {startDate} to {endDate}
                  </span>
                </div>
                <div className="bt-kv-row">
                  <span className="k">{c.kv.params}</span>
                  <span className="v">
                    warmup {String(warmup)}, steps {String(steps)}, qty {String(qty)}
                  </span>
                </div>
              </div>

              {!validation.ok ? (
                <div className="bt-softWarn">
                  <div className="bt-softWarn-title">{c.validation.title}</div>
                  <ul className="bt-softWarn-list">
                    {validation.issues.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="bt-softOk">{c.validation.ok}</div>
              )}
            </article>

            <article className="bt-card bt-span2">
              <h2>{c.sections.results.title}</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                {c.sections.results.subtitle}
              </p>

              {!job ? (
                <div className="bt-empty">
                  <div className="bt-emptyTitle">{c.empty.title}</div>
                  <div className="muted small">{c.empty.body}</div>
                </div>
              ) : job.status !== "done" ? (
                <div className="bt-progress">
                  <div className="bt-progressTitle">{c.progress.title}</div>
                  <div className="muted small">
                    {c.progress.body} <span className="bt-mono">{job.id}</span>
                  </div>
                </div>
              ) : (
                <div className="bt-resultsWrap">
                  <div className="bt-resultsHeadline">{job.result?.headline}</div>

                  <div className="bt-metrics">
                    <div className="bt-metric">
                      <div className="k">{c.metrics.trades}</div>
                      <div className="v">{job.result?.summary?.trades ?? "—"}</div>
                    </div>
                    <div className="bt-metric">
                      <div className="k">{c.metrics.winRate}</div>
                      <div className="v">
                        {job.result?.summary?.win_rate != null
                          ? `${Math.round(job.result.summary.win_rate * 100)}%`
                          : "—"}
                      </div>
                    </div>
                    <div className="bt-metric">
                      <div className="k">{c.metrics.pnl}</div>
                      <div className="v">
                        {job.result?.summary?.pnl != null ? `$${job.result.summary.pnl}` : "—"}
                      </div>
                    </div>
                    <div className="bt-metric">
                      <div className="k">{c.metrics.maxDD}</div>
                      <div className="v">
                        {job.result?.summary?.max_drawdown != null
                          ? `${Math.round(job.result.summary.max_drawdown * 1000) / 10}%`
                          : "—"}
                      </div>
                    </div>
                    <div className="bt-metric">
                      <div className="k">{c.metrics.avgTrade}</div>
                      <div className="v">
                        {job.result?.summary?.avg_trade != null
                          ? `$${job.result.summary.avg_trade}`
                          : "—"}
                      </div>
                    </div>
                    <div className="bt-metric">
                      <div className="k">{c.metrics.exposure}</div>
                      <div className="v">
                        {job.result?.summary?.exposure != null
                          ? `${Math.round(job.result.summary.exposure * 100)}%`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="bt-notes">
                    {Array.isArray(job.result?.notes)
                      ? job.result.notes.map((n) => (
                          <p className="muted small" key={n} style={{ margin: "8px 0 0" }}>
                            {n}
                          </p>
                        ))
                      : null}
                  </div>

                  <div className="bt-artifacts">
                    <div className="bt-artifactsTitle">{c.artifacts.title}</div>
                    <div className="bt-artifactsBtns">
                      <button className="bt-btn" type="button" disabled>
                        {c.artifacts.report}
                      </button>
                      <button className="bt-btn" type="button" disabled>
                        {c.artifacts.json}
                      </button>
                      <button className="bt-btn" type="button" disabled>
                        {c.artifacts.csv}
                      </button>
                    </div>
                    <div className="muted small">{c.artifacts.note}</div>
                  </div>
                </div>
              )}
            </article>

            <article className="bt-card">
              <h2>{c.sections.safety.title}</h2>
              <ul className="bt-list">
                {c.sections.safety.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </article>
          </section>
        </div>
      </div>
    </AppShell>
  );
}