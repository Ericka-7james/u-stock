import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import AppShell from "../layout/AppShell";
import PageHeaderCard from "../common/PageHeaderCard";
import Modal from "../common/Modal.jsx";

import "../../css/pages/BacktestPracticePage.css";

import { BACKTEST_PRACTICE_PAGE_COPY } from "../../content/pages/backtestPracticePage.content.ts";

import {
  TF_OPTIONS,
  asInt,
  splitSymbols,
  todayISO,
  daysAgoISO,
  validateBacktestConfig,
} from "../../lib/backtests/backtestPracticeUtils.js";

const BT_LAST_DONE_DAY_KEY = "bt_practice_last_done_day";
const BT_LAST_DONE_JOB_KEY = "bt_practice_last_done_job";

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail =
      data?.detail ||
      data?.error?.message ||
      data?.message ||
      `Request failed (${res.status})`;
    throw new Error(String(detail));
  }

  return data;
}

function fmtMaybeCurrency(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `$${v}`;
}

function fmtMaybePctFromRatio(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Math.round(Number(v) * 1000) / 10}%`;
}

export default function BacktestPracticePage() {
  const c = BACKTEST_PRACTICE_PAGE_COPY;

  const [symbolsRaw, setSymbolsRaw] = useState("SPY,QQQ,AAPL,MSFT,NVDA");
  const [tfEntry, setTfEntry] = useState("5Min");
  const [tfBias, setTfBias] = useState("15Min");

  const [startDate, setStartDate] = useState(daysAgoISO(180));
  const [endDate, setEndDate] = useState(todayISO());

  const [warmup, setWarmup] = useState(320);
  const [steps, setSteps] = useState(200000);
  const [qty, setQty] = useState(1);

  const [job, setJob] = useState(null);
  const [latestCompletedJob, setLatestCompletedJob] = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);

  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);

  const pollRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const today = todayISO();
    const savedDay = window.localStorage.getItem(BT_LAST_DONE_DAY_KEY);
    const savedJobRaw = window.localStorage.getItem(BT_LAST_DONE_JOB_KEY);

    if (savedDay === today && savedJobRaw) {
      try {
        const parsed = JSON.parse(savedJobRaw);
        if (parsed?.status === "done") {
          setLatestCompletedJob(parsed);
        }
      } catch {
        window.localStorage.removeItem(BT_LAST_DONE_JOB_KEY);
      }
    } else {
      window.localStorage.removeItem(BT_LAST_DONE_DAY_KEY);
      window.localStorage.removeItem(BT_LAST_DONE_JOB_KEY);
    }

    return () => {
      isMountedRef.current = false;
      if (pollRef.current) {
        window.clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const symbols = useMemo(() => splitSymbols(symbolsRaw), [symbolsRaw]);

  const config = useMemo(() => {
    return {
      symbols,
      tf_entry: tfEntry,
      tf_bias: tfBias,
      start: startDate,
      end: endDate,
      warmup: asInt(warmup, 320),
      steps: asInt(steps, 200000),
      qty: asInt(qty, 1),
    };
  }, [symbols, tfEntry, tfBias, startDate, endDate, warmup, steps, qty]);

  const validation = useMemo(() => {
    return validateBacktestConfig({
      symbols,
      tfEntry,
      tfBias,
      startDate,
      endDate,
      warmup,
      steps,
      qty,
      tfOptions: TF_OPTIONS,
    });
  }, [symbols, tfEntry, tfBias, startDate, endDate, warmup, steps, qty]);

  const hasCompletedRunToday = Boolean(latestCompletedJob?.status === "done");

  const onReset = useCallback(() => {
    if (pollRef.current) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }

    setSymbolsRaw("SPY,QQQ,AAPL,MSFT,NVDA");
    setTfEntry("5Min");
    setTfBias("15Min");
    setStartDate(daysAgoISO(180));
    setEndDate(todayISO());
    setWarmup(320);
    setSteps(200000);
    setQty(1);
    setErr(null);
    setJob(null);
    setRunning(false);
  }, []);

  const pollJob = useCallback(async (jobId) => {
    try {
      const data = await apiJson(`/api/backtests/${jobId}`);

      if (!isMountedRef.current) return;

      setJob(data);

      if (data.status === "done") {
        setLatestCompletedJob(data);
        setRunning(false);
        setIsResultsModalOpen(true);

        window.localStorage.setItem(BT_LAST_DONE_DAY_KEY, todayISO());
        window.localStorage.setItem(BT_LAST_DONE_JOB_KEY, JSON.stringify(data));

        pollRef.current = null;
        return;
      }

      if (data.status === "failed") {
        setRunning(false);
        setErr({
          title: "Backtest failed",
          body:
            data?.error?.message ||
            data?.error?.stderr_tail ||
            "The backtest did not complete successfully.",
        });
        pollRef.current = null;
        return;
      }

      pollRef.current = window.setTimeout(() => {
        pollJob(jobId);
      }, 1500);
    } catch (e) {
      if (!isMountedRef.current) return;

      setRunning(false);
      setErr({
        title: "Unable to fetch backtest status",
        body: e?.message || "Polling failed.",
      });
      pollRef.current = null;
    }
  }, []);

  const onRun = useCallback(async () => {
    if (running) return;

    setErr(null);

    if (!validation.ok) {
      setErr({ title: c.errors.invalid.title, body: validation.issues.join(" ") });
      return;
    }

    try {
      setRunning(true);
      setIsResultsModalOpen(true);

      const res = await apiJson("/api/backtests/run", {
        method: "POST",
        body: JSON.stringify({
          kind: "ema_scan",
          config,
        }),
      });

      const nextJob = {
        id: res.job_id,
        status: "queued",
        createdAt: new Date().toISOString(),
        config,
      };
      setJob(nextJob);

      pollJob(res.job_id);
    } catch (e) {
      setRunning(false);
      setErr({
        title: "Unable to start backtest",
        body: e?.message || "Request failed.",
      });
    }
  }, [running, validation.ok, validation.issues, c.errors.invalid.title, config, pollJob]);

  const statusPill = useMemo(() => {
    const s = running ? job?.status || "queued" : latestCompletedJob?.status || job?.status || "idle";
    const map = {
      idle: { label: c.status.idle, cls: "pill idle" },
      queued: { label: c.status.queued, cls: "pill queued" },
      running: { label: c.status.running, cls: "pill running" },
      done: { label: c.status.done, cls: "pill done" },
      failed: { label: c.status.failed, cls: "pill failed" },
    };
    return map[s] || map.idle;
  }, [running, job?.status, latestCompletedJob?.status, c.status]);

  const renderResultsContent = (sourceJob) => {
    if (!sourceJob) {
      return (
        <div className="bt-empty">
          <div className="bt-emptyTitle">{c.empty.title}</div>
          <div className="muted small">{c.empty.body}</div>
        </div>
      );
    }

    if (sourceJob.status !== "done") {
      return (
        <div className="bt-progress">
          <div className="bt-progressTitle">{c.progress.title}</div>
          <div className="muted small">
            {c.progress.body} <span className="bt-mono">{sourceJob.id}</span>
          </div>
        </div>
      );
    }

    const result = sourceJob.result || {};
    const summary = result.summary || {};
    const artifacts = result.artifacts || result.downloads || {};
    const overview = result.overview || {};
    const configLine = overview.config_line || {};

    return (
      <div className="bt-resultsWrap">
        <div className="bt-resultsHeadline">{result.headline || "Backtest complete"}</div>

        <div className="bt-overviewCard">
          <div className="bt-overviewTitle">Run overview</div>

          <div className="bt-kv">
            <div className="bt-kv-row">
              <span className="k">Job</span>
              <span className="v bt-mono">{sourceJob.id || "—"}</span>
            </div>
            <div className="bt-kv-row">
              <span className="k">Universe</span>
              <span className="v">
                {Array.isArray(overview.universe) ? overview.universe.join(", ") : overview.universe || "—"}
              </span>
            </div>
            <div className="bt-kv-row">
              <span className="k">Timeframes</span>
              <span className="v">
                {configLine.tf_bias || "—"} → {configLine.tf_entry || "—"}
              </span>
            </div>
            <div className="bt-kv-row">
              <span className="k">Date range</span>
              <span className="v">
                {configLine.start || "—"} to {configLine.end || "—"}
              </span>
            </div>
            <div className="bt-kv-row">
              <span className="k">Feed</span>
              <span className="v">{configLine.feed || "None"}</span>
            </div>
            <div className="bt-kv-row">
              <span className="k">Errors</span>
              <span className="v">{overview.errors ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="bt-metrics">
          <div className="bt-metric">
            <div className="k">{c.metrics.trades}</div>
            <div className="v">{summary.trades ?? "—"}</div>
          </div>
          <div className="bt-metric">
            <div className="k">{c.metrics.winRate}</div>
            <div className="v">{fmtMaybePctFromRatio(summary.win_rate)}</div>
          </div>
          <div className="bt-metric">
            <div className="k">{c.metrics.pnl}</div>
            <div className="v">{fmtMaybeCurrency(summary.pnl)}</div>
          </div>
          <div className="bt-metric">
            <div className="k">{c.metrics.maxDD}</div>
            <div className="v">{fmtMaybePctFromRatio(summary.max_drawdown)}</div>
          </div>
          <div className="bt-metric">
            <div className="k">{c.metrics.avgTrade}</div>
            <div className="v">{fmtMaybeCurrency(summary.avg_trade)}</div>
          </div>
          <div className="bt-metric">
            <div className="k">{c.metrics.exposure}</div>
            <div className="v">{fmtMaybePctFromRatio(summary.exposure)}</div>
          </div>
        </div>

        {Array.isArray(overview.top_intents) && overview.top_intents.length > 0 ? (
          <div className="bt-block">
            <div className="bt-blockTitle">Top 5 best intents</div>
            <pre className="bt-pre">{overview.top_intents.join("\n")}</pre>
          </div>
        ) : null}

        {Array.isArray(overview.summary_lines) && overview.summary_lines.length > 0 ? (
          <div className="bt-block">
            <div className="bt-blockTitle">Summary tail</div>
            <pre className="bt-pre">{overview.summary_lines.join("\n")}</pre>
          </div>
        ) : null}

        {Array.isArray(overview.confidence_breakdown) && overview.confidence_breakdown.length > 0 ? (
          <div className="bt-block">
            <div className="bt-blockTitle">Confidence breakdown</div>
            <pre className="bt-pre">{overview.confidence_breakdown.join("\n")}</pre>
          </div>
        ) : null}

        <div className="bt-notes">
          {Array.isArray(result.notes)
            ? result.notes.map((n) => (
                <p className="muted small" key={n} style={{ margin: "8px 0 0" }}>
                  {n}
                </p>
              ))
            : null}
        </div>

        <div className="bt-artifacts">
          <div className="bt-artifactsTitle">{c.artifacts.title}</div>
          <div className="bt-artifactsBtns">
            <a className="bt-btn" href={artifacts.report_txt || "#"} aria-disabled={!artifacts.report_txt}>
              {c.artifacts.report}
            </a>
            <a className="bt-btn" href={artifacts.run_json_gz || "#"} aria-disabled={!artifacts.run_json_gz}>
              {c.artifacts.json}
            </a>
          </div>
          <div className="muted small">{c.artifacts.note}</div>
        </div>
      </div>
    );
  };

  const canReopenResults = hasCompletedRunToday;

  return (
    <AppShell>
      <div className="bt-practice-page">
        <div className="bt-headerLane">
          <PageHeaderCard
            title={c.header.title}
            subtitle={<span className="bt-tagline">{c.header.tagline}</span>}
            right={
              <div className="bt-heroRight">
                <div className={statusPill.cls}>{statusPill.label}</div>
                <div className="bt-heroHint">{c.header.hint}</div>
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
        </div>

        <section className="bt-grid">
          <article className="bt-card bt-card-config bt-span2">
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
                <div className="bt-label">
                  <label htmlFor="bt-symbols">{c.fields.symbols.label}</label>
                  <input
                    id="bt-symbols"
                    className="bt-input"
                    value={symbolsRaw}
                    onChange={(e) => setSymbolsRaw(e.target.value)}
                    placeholder={c.fields.symbols.placeholder}
                    spellCheck={false}
                  />
                  <div className="bt-help">{c.fields.symbols.help}</div>
                </div>
              </div>

              <div className="bt-row bt-row-3">
                <div className="bt-label">
                  <label htmlFor="bt-tf-entry">{c.fields.tfEntry.label}</label>
                  <select
                    id="bt-tf-entry"
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
                </div>

                <div className="bt-label">
                  <label htmlFor="bt-tf-bias">{c.fields.tfBias.label}</label>
                  <select
                    id="bt-tf-bias"
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
                </div>

                <div className="bt-label">
                  <label htmlFor="bt-qty">{c.fields.qty.label}</label>
                  <input
                    id="bt-qty"
                    className="bt-input"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    inputMode="numeric"
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="bt-row bt-row-4">
                <div className="bt-label">
                  <label htmlFor="bt-start">{c.fields.start.label}</label>
                  <input
                    id="bt-start"
                    className="bt-input"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="bt-label">
                  <label htmlFor="bt-end">{c.fields.end.label}</label>
                  <input
                    id="bt-end"
                    className="bt-input"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className="bt-label">
                  <label htmlFor="bt-warmup">{c.fields.warmup.label}</label>
                  <input
                    id="bt-warmup"
                    className="bt-input"
                    value={warmup}
                    onChange={(e) => setWarmup(e.target.value)}
                    inputMode="numeric"
                    placeholder="320"
                  />
                </div>

                <div className="bt-label">
                  <label htmlFor="bt-steps">{c.fields.steps.label}</label>
                  <input
                    id="bt-steps"
                    className="bt-input"
                    value={steps}
                    onChange={(e) => setSteps(e.target.value)}
                    inputMode="numeric"
                    placeholder="200000"
                  />
                </div>
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

                {canReopenResults ? (
                  <button
                    className="bt-btn secondary"
                    type="button"
                    onClick={() => setIsResultsModalOpen(true)}
                  >
                    Reopen latest results
                  </button>
                ) : null}

                <div className="bt-actionsNote muted small">{c.sections.config.note}</div>
              </div>
            </div>
          </article>

          <article className="bt-card bt-card-preview bt-span2">
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

          <article className="bt-card bt-card-safety bt-span4">
            <h2>{c.sections.safety.title}</h2>
            <ul className="bt-list">
              {c.sections.safety.items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </article>
        </section>

        <Modal
          open={isResultsModalOpen}
          title={c.sections.results.title}
          onClose={() => setIsResultsModalOpen(false)}
          footer={
            <button className="mBtn" type="button" onClick={() => setIsResultsModalOpen(false)}>
              Close
            </button>
          }
        >
          {running || (job && job.status !== "done")
            ? renderResultsContent(job)
            : renderResultsContent(latestCompletedJob)}
        </Modal>
      </div>
    </AppShell>
  );
}