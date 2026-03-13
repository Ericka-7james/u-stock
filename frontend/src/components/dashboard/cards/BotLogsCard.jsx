// frontend/src/components/dashboard/cards/BotLogsCard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "../../common/Modal.jsx";
import ErrorBanner from "../../common/ErrorBanner.jsx";
import HelpTooltip from "../../common/HelpTooltip.jsx";

import { apiGetWithRetry } from "../../../lib/api/http.js";
import { createSWRCache, isFresh } from "../../../lib/cache/swrCache.js";
import { safeStr, safeJson, includesAny } from "../../../lib/format/safe.js";
import { fmtEpochSeconds, dayKeyFromEpochSeconds, dateStrToEpochSec } from "../../../lib/format/datetime.js";

import "../../../css/dashboard/cards/BotLogsCard.css";

const CACHE_TTL_MS = 60_000;
const logsCache = { ...createSWRCache([]), key: "" };

function isFailishLevel(level) {
  const l = String(level || "").toLowerCase();
  return l === "error" || l === "warn" || l === "warning";
}

function normalizeEffective(x, desiredState = "") {
  const v = String(x || "").toLowerCase();
  const desired = String(desiredState || "").toLowerCase();

  if (v === "running" || v === "starting" || v === "stopping" || v === "offline" || v === "errored") {
    return v;
  }
  if (v === "error" || v === "failed") return "errored";
  if (v === "stopped" || v === "idle" || v === "paused") {
    return desired === "running" ? "offline" : "stopped";
  }
  return "unknown";
}

function statusPill(effective, pausedReason = "", desiredState = "") {
  const desired = String(desiredState || "").toLowerCase();

  if (effective === "running" && pausedReason) {
    return { label: "Paused by condition", cls: "blog-pill blog-pill--warn" };
  }
  if (effective === "running") return { label: "Live", cls: "blog-pill blog-pill--on" };
  if (effective === "starting") return { label: "Starting…", cls: "blog-pill blog-pill--soft" };
  if (effective === "stopping") return { label: "Stopping…", cls: "blog-pill blog-pill--soft" };
  if (effective === "offline" && desired === "stopped") {
    return { label: "Stopped", cls: "blog-pill blog-pill--paused" };
  }
  if (effective === "offline") return { label: "Runner offline", cls: "blog-pill blog-pill--off" };
  if (effective === "stopped") return { label: "Stopped", cls: "blog-pill blog-pill--paused" };
  if (effective === "errored") return { label: "Error", cls: "blog-pill blog-pill--bad" };
  return { label: "Unknown", cls: "blog-pill blog-pill--soft" };
}

function normalizeLogRow(row) {
  const ts = Number(row?.ts) || 0;
  const level = safeStr(row?.level || row?.status, "info").toLowerCase();
  const source = safeStr(row?.source, "system").toLowerCase();
  const action = safeStr(row?.action || row?.event_type, "log").toLowerCase();
  const status = safeStr(row?.status, "").toLowerCase();
  const details = row?.details && typeof row.details === "object" ? row.details : {};

  const userMessage = safeStr(row?.user_message, "");
  const message = safeStr(row?.message, "");
  const technicalMessage = safeStr(row?.technical_message, "");
  const preferredMessage =
    userMessage ||
    message ||
    technicalMessage ||
    safeStr(details?.message, "") ||
    action.replaceAll("_", " ") ||
    "Update";

  return {
    ts,
    level,
    source,
    action,
    status,
    message: preferredMessage,
    user_message: userMessage,
    technical_message: technicalMessage,
    request_id: safeStr(row?.request_id, ""),
    runner_id: safeStr(row?.runner_id, ""),
    desired_state: safeStr(row?.desired_state, ""),
    runtime_state: safeStr(row?.runtime_state, ""),
    visible_to_user: Boolean(row?.visible_to_user),
    details,
  };
}

function classifyLog(row) {
  const levelRaw = String(row?.level || "info").toLowerCase();
  const isFail = isFailishLevel(levelRaw);

  const msg = safeStr(row?.message, "");
  const userMessage = safeStr(row?.user_message, "");
  const technicalMessage = safeStr(row?.technical_message, "");
  const details = row?.details || {};
  const action = safeStr(row?.action, "log").toLowerCase();
  const source = safeStr(row?.source, "system").toLowerCase();
  const runtimeState = safeStr(row?.runtime_state, "").toLowerCase();
  const desiredState = safeStr(row?.desired_state, "").toLowerCase();

  const detailsStr = details ? safeJson(details).toLowerCase() : "";
  const textBlob = `${msg.toLowerCase()} ${action} ${source} ${detailsStr}`.trim();

  const hasAny = (...needles) => needles.some((n) => textBlob.includes(String(n).toLowerCase()));

  let category = "System";
  if (hasAny("market", "session", "open", "closed", "next_open_epoch", "market_closed")) category = "Market";
  else if (hasAny("order", "fill", "filled", "broker", "alpaca", "position")) category = "Orders";
  else if (hasAny("risk", "max trades", "min confidence", "blocked", "halt", "guard")) category = "Risk";
  else if (hasAny("signal", "strategy", "ema", "trend", "entry", "exit")) category = "Strategy";
  else if (hasAny("runner", "heartbeat", "offline", "starting", "stopping")) category = "Runner";

  let headline = userMessage || msg || "Update";
  let detail = "";
  let actionLabel = action ? action.replaceAll("_", " ") : "Update";

  if (action === "request_start") {
    actionLabel = "Start";
    headline = "Start requested";
    detail = "The control plane asked the runner to start the bot.";
    category = "System";
  } else if (action === "request_stop") {
    actionLabel = "Stop";
    headline = "Stop requested";
    detail = "The control plane asked the runner to stop the bot.";
    category = "System";
  } else if (action === "request_arm") {
    actionLabel = "Arm";
    headline = "Bot armed";
    detail = "The bot is armed and allowed to start.";
    category = "System";
  } else if (action === "request_disarm") {
    actionLabel = "Disarm";
    headline = "Bot disarmed";
    detail = "The bot is disarmed and cannot start until armed again.";
    category = "System";
  } else if (action === "config_loaded") {
    actionLabel = "Config";
    headline = "Configuration updated";
    detail = "Bot configuration was saved successfully.";
    category = "System";
  } else if (action === "heartbeat") {
    actionLabel = "Heartbeat";

    if (details?.reason_code === "market_closed") {
      headline = "Waiting for market open";
      detail = technicalMessage || "The runner is healthy, but trading is paused until the market opens.";
      category = "Market";
    } else if (runtimeState === "running") {
      headline = "Runner heartbeat received";
      detail = technicalMessage || "Runner is online and scanning for setups.";
      category = "Runner";
    } else if (runtimeState === "starting") {
      headline = "Bot is starting";
      detail = technicalMessage || "Runner is initializing the bot.";
      category = "Runner";
    } else if (runtimeState === "stopping") {
      headline = "Bot is stopping";
      detail = technicalMessage || "Runner is shutting the bot down.";
      category = "Runner";
    } else if (runtimeState === "offline") {
      headline = desiredState === "stopped" ? "Bot is stopped" : "Runner reports bot offline";
      detail =
        technicalMessage ||
        (desiredState === "stopped"
          ? "The bot is intentionally not running."
          : "The bot is currently not running.");
      category = "Runner";
    } else {
      headline = userMessage || "Runner heartbeat received";
      detail = technicalMessage || "";
      category = "Runner";
    }
  } else if (action === "error") {
    actionLabel = "Error";
    headline = userMessage || "Bot reported an error";
    detail = technicalMessage || safeJson(details);
    category = "Runner";
  } else if (action === "log" && (hasAny("intent", "preview") || Array.isArray(details?.preview))) {
    actionLabel = "Intent";
    headline = userMessage || "Runner submitted intents";
    detail = details?.count ? `Submitted ${details.count} intents.` : "";
    category = "Strategy";
  } else {
    if (technicalMessage) {
      detail = technicalMessage;
    } else if (Object.keys(details).length) {
      detail = safeJson(details);
    }
  }

  const severity = isFail ? (levelRaw === "error" ? "error" : "warn") : "info";

  return {
    ts: row?.ts,
    category,
    action: actionLabel,
    severity,
    headline,
    detail,
    rawLevel: String(row?.level || row?.status || "info").toUpperCase(),
    rawMessage: msg,
    rawMeta: {
      source: row?.source || null,
      action: row?.action || null,
      request_id: row?.request_id || null,
      runner_id: row?.runner_id || null,
      desired_state: row?.desired_state || null,
      runtime_state: row?.runtime_state || null,
      visible_to_user: row?.visible_to_user ?? null,
      details: row?.details || {},
    },
  };
}

function effectiveExplainer(eff, nextOpenEpoch, pausedReason = "", desiredState = "") {
  const desired = String(desiredState || "").toLowerCase();

  if (eff === "running" && pausedReason) {
    return {
      tone: "warn",
      title: "Runner is healthy, but work is paused",
      body: pausedReason,
    };
  }
  if (eff === "running") {
    return {
      tone: "ok",
      title: "Live: scanning for trades",
      body: "The bot is online and evaluating signals. Orders may be placed if risk checks pass.",
    };
  }
  if (eff === "starting") {
    return {
      tone: "neutral",
      title: "Starting up",
      body: "Loading configuration and checking connectivity.",
    };
  }
  if (eff === "stopping") {
    return {
      tone: "neutral",
      title: "Stopping",
      body: "The runner is shutting the bot down.",
    };
  }
  if (eff === "offline" && desired === "stopped") {
    return {
      tone: "neutral",
      title: "Stopped",
      body: "The bot is intentionally not running right now.",
    };
  }
  if (eff === "offline") {
    return {
      tone: "bad",
      title: "Runner offline",
      body: "U-Stock isn’t receiving live runtime updates from the runner right now.",
    };
  }
  if (eff === "stopped") {
    return {
      tone: "neutral",
      title: "Stopped",
      body: "The bot is currently not running.",
    };
  }
  if (eff === "errored") {
    return {
      tone: "bad",
      title: "Error state",
      body: "The bot reported an error. Review recent issues below and inspect the raw details.",
    };
  }
  return {
    tone: "neutral",
    title: "Status unknown",
    body: "The bot status couldn’t be determined. Refresh and verify the runner is online.",
  };
}

export default function BotLogsCard({
  title = "System logs",
  subtitle = "Filter by day, status, and search terms. Logs help you validate bot actions, runner state, and strategy behavior.",
  defaultBotId = "ema_trend",
  maxPreview = 4,
  timeframe = null,
  mode = "paper",
}) {
  const [botId, setBotId] = useState(defaultBotId);
  const [limit, setLimit] = useState(240);

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [botStatus, setBotStatus] = useState(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedDay, setSelectedDay] = useState("");

  const [open, setOpen] = useState(false);

  const modeNorm = String(mode || "paper").toLowerCase() === "live" ? "live" : "paper";

  const startTs = useMemo(() => dateStrToEpochSec(timeframe?.start || "", { endOfDay: false }), [timeframe]);
  const endTs = useMemo(() => dateStrToEpochSec(timeframe?.end || "", { endOfDay: true }), [timeframe]);

  const cacheKey = `${botId}|${modeNorm}|${limit}|${startTs}|${endTs}`;

  const aliveRef = useRef(true);
  const inflightRef = useRef({ log: null, status: null });

  function abortInflight(key) {
    const cur = inflightRef.current?.[key];
    if (cur) cur.abort();
    inflightRef.current[key] = null;
  }

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      abortInflight("log");
      abortInflight("status");
    };
  }, []);

  async function refresh() {
    setErr("");
    setBusy(true);

    abortInflight("log");
    const ac = new AbortController();
    inflightRef.current.log = ac;

    try {
      const url =
        `/api/bots/events?bot_id=${encodeURIComponent(safeStr(botId, "ema_trend"))}` +
        `&mode=${encodeURIComponent(modeNorm)}` +
        `&limit=${encodeURIComponent(String(limit || 120))}` +
        (startTs ? `&start_ts=${encodeURIComponent(String(startTs))}` : "") +
        (endTs ? `&end_ts=${encodeURIComponent(String(endTs))}` : "");

      const data = await apiGetWithRetry(url, { signal: ac.signal });
      if (!aliveRef.current || ac.signal.aborted) return;

      const raw = Array.isArray(data?.items) ? data.items : [];
      const normalized = raw
        .filter((x) => x && typeof x === "object")
        .map(normalizeLogRow)
        .filter((x) => Number(x.ts) > 0);

      setItems(normalized);

      logsCache.ts = Date.now();
      logsCache.key = cacheKey;
      logsCache.data = normalized;

      const dayList = normalized.map((r) => dayKeyFromEpochSeconds(r?.ts)).filter(Boolean);
      const uniq = Array.from(new Set(dayList)).sort();
      if (!selectedDay && uniq.length) setSelectedDay(uniq[uniq.length - 1]);
    } catch (e) {
      if (!aliveRef.current || ac.signal.aborted) return;
      setErr(String(e?.message || e));
    } finally {
      if (inflightRef.current.log === ac) inflightRef.current.log = null;
      if (aliveRef.current) setBusy(false);
    }
  }

  async function refreshStatus() {
    abortInflight("status");
    const ac = new AbortController();
    inflightRef.current.status = ac;

    try {
      const s = await apiGetWithRetry(`/api/bots/status?bot_id=${encodeURIComponent(safeStr(botId, "ema_trend"))}`, {
        signal: ac.signal,
      });
      if (!aliveRef.current || ac.signal.aborted) return;
      setBotStatus(s);
    } catch {
      if (!aliveRef.current || ac.signal.aborted) return;
      setBotStatus(null);
    } finally {
      if (inflightRef.current.status === ac) inflightRef.current.status = null;
    }
  }

  useEffect(() => {
    const fresh = isFresh(logsCache.ts, CACHE_TTL_MS) && logsCache.key === cacheKey;
    if (fresh) {
      setItems(Array.isArray(logsCache.data) ? logsCache.data : []);
    } else {
      refresh();
    }

    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, modeNorm, limit, startTs, endTs]);

  const availableDays = useMemo(() => {
    const dayList = (Array.isArray(items) ? items : []).map((r) => dayKeyFromEpochSeconds(r?.ts)).filter(Boolean);
    const uniq = Array.from(new Set(dayList)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (selectedDay && !uniq.includes(selectedDay)) uniq.push(selectedDay);
    return uniq;
  }, [items, selectedDay]);

  const friendly = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    return list.map(classifyLog);
  }, [items]);

  const filtered = useMemo(() => {
    const list = Array.isArray(friendly) ? friendly : [];

    return list.filter((r) => {
      const d = dayKeyFromEpochSeconds(r?.ts);
      if (selectedDay && d && d !== selectedDay) return false;

      if (status !== "all") {
        const isIssue = r.severity === "warn" || r.severity === "error";
        if (status === "issues" && !isIssue) return false;
        if (status === "good" && isIssue) return false;
      }

      if (q.trim()) {
        const blob =
          `${safeStr(r?.headline)} ${safeStr(r?.category)} ${safeStr(r?.action)} ${safeStr(r?.rawLevel)} ` +
          (r?.rawMeta ? safeJson(r.rawMeta) : safeStr(r?.rawMessage));
        if (!includesAny(blob, q)) return false;
      }

      return true;
    });
  }, [friendly, selectedDay, status, q]);

  const preview = useMemo(() => {
    const list = Array.isArray(filtered) ? filtered : [];
    return list.slice(Math.max(0, list.length - maxPreview));
  }, [filtered, maxPreview]);

  const desiredState = safeStr(botStatus?.desired_state || botStatus?.intent, "");
  const eff = normalizeEffective(botStatus?.effective_state || botStatus?.state, desiredState);
  const pausedReason = safeStr(botStatus?.pausedReason || botStatus?.paused_reason, "");
  const pill = statusPill(eff, pausedReason, desiredState);

  const nextOpen =
    botStatus?.nextOpenEpoch ||
    botStatus?.next_open_epoch ||
    botStatus?.market?.next_open_epoch ||
    null;

  const explain = effectiveExplainer(eff, nextOpen, pausedReason, desiredState);

  const counts = useMemo(() => {
    const list = Array.isArray(filtered) ? filtered : [];
    const issues = list.filter((x) => x.severity === "warn" || x.severity === "error").length;
    return { total: list.length, issues };
  }, [filtered]);

  function toneClass(sev) {
    if (sev === "error") return "blog-evt blog-evt--error";
    if (sev === "warn") return "blog-evt blog-evt--warn";
    return "blog-evt";
  }

  const statusNode =
    eff === "offline" && desiredState !== "stopped" ? (
      <Link to="/connected-apps" className={`${pill.cls} blog-pillLink`} title="Runner offline — open Connected apps">
        {pill.label}
      </Link>
    ) : (
      <span className={pill.cls} title="Bot effective state">
        {pill.label}
      </span>
    );

  return (
    <>
      <section className="panel blog-card">
        <div className="card-header blog-header">
          <div className="card-header-left">
            <div className="blog-titleRow">
              <div className="blog-titleGroup">
                <h2 className="blog-title">{title}</h2>

                <span className="blog-help">
                  <HelpTooltip title="System logs help">
                    <div style={{ display: "grid", gap: 10 }}>
                      <div>
                        <b>Status pill</b>: live runner state from the backend.
                      </div>
                      <div>
                        <b>Events</b>: filtered activity feed rows.
                      </div>
                      <div>
                        <b>Issues</b>: warnings/errors in the filtered range.
                      </div>
                      <div style={{ opacity: 0.9 }}>
                        Tip: set Outcome to “Issues”, then search “risk”, “heartbeat”, “market”, or “error”.
                      </div>
                    </div>
                  </HelpTooltip>
                </span>

                {statusNode}
              </div>
            </div>

            <div className="blog-metricsRow" aria-label="Log counts">
              <span className="blog-chip" title="Filtered events">
                {counts.total} events
              </span>

              {counts.issues ? (
                <span className="blog-chip blog-chip--warn" title="Warnings/errors in filtered range">
                  {counts.issues} issues
                </span>
              ) : (
                <span className="blog-chip blog-chip--ok" title="No warnings/errors in filtered range">
                  0 issues
                </span>
              )}
            </div>

            <p className="card-subtitle blog-subtitle">{subtitle}</p>
          </div>
        </div>

        <div className={`blog-statusBanner blog-statusBanner--${explain.tone}`}>
          <div className="blog-statusTitle">{explain.title}</div>
          <div className="blog-statusBody">{explain.body}</div>
          {pausedReason ? <div className="blog-statusMeta">{pausedReason}</div> : null}
          {nextOpen && pausedReason.toLowerCase().includes("market") ? (
            <div className="blog-statusMeta">Next open: {fmtEpochSeconds(nextOpen)}</div>
          ) : null}
        </div>

        <div className="blog-controls">
          <label className="blog-field">
            <span className="blog-label">Bot</span>
            <select
              value={botId}
              onChange={(e) => {
                setBotId(e.target.value);
                setSelectedDay("");
              }}
              className="blog-input"
              disabled={busy}
            >
              <option value="ema_trend">ema_trend</option>
            </select>
          </label>

          <label className="blog-field">
            <span className="blog-label">Day</span>
            <select
              value={selectedDay || ""}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="blog-input"
              disabled={busy}
            >
              {availableDays.length ? (
                availableDays.map((d) => (
                  <option key={d} value={d}>
                    • {d}
                  </option>
                ))
              ) : (
                <option value="">{busy ? "Loading…" : "No days yet"}</option>
              )}
            </select>
          </label>

          <label className="blog-field">
            <span className="blog-label">Outcome</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="blog-input">
              <option value="all">All</option>
              <option value="good">Normal</option>
              <option value="issues">Issues</option>
            </select>
          </label>

          <label className="blog-field blog-field-search">
            <span className="blog-label">Search</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search events, actions, runner details…"
              className="blog-input"
              disabled={busy}
            />
          </label>

          <label className="blog-field">
            <span className="blog-label">Limit</span>
            <select
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="blog-input"
              disabled={busy}
            >
              <option value="120">120</option>
              <option value="240">240</option>
              <option value="480">480</option>
            </select>
          </label>

          <div className="blog-controlActions">
            <button
              type="button"
              className="mBtn mBtnPrimary"
              onClick={() => {
                refresh();
                refreshStatus();
              }}
              disabled={busy}
            >
              {busy ? "Refreshing…" : "Refresh"}
            </button>

            <button
              type="button"
              className="mBtn"
              onClick={() => setOpen(true)}
              disabled={busy || (!filtered?.length && !items?.length)}
            >
              View all
            </button>
          </div>
        </div>

        {err ? <ErrorBanner title="Couldn’t load logs" body={err} /> : null}

        <div className="blog-list">
          {busy && !items.length ? (
            <div className="blog-empty">Loading events…</div>
          ) : preview.length ? (
            preview.map((r, idx) => (
              <div key={`${idx}-${r.ts}`} className={toneClass(r.severity)}>
                <div className="blog-evtTop">
                  <div className="blog-evtLeft">
                    <div className="blog-evtTitle">{r.headline}</div>
                    <div className="blog-evtSub">
                      <span className="blog-evtChip">{r.category}</span>
                      <span className="blog-evtDot">•</span>
                      <span className="blog-evtChip blog-evtChip--soft">{r.action}</span>
                      <span className="blog-evtDot">•</span>
                      <span className="mMono">{fmtEpochSeconds(r.ts)}</span>
                    </div>
                  </div>

                  <div className="blog-evtRight">
                    <span className={`blog-level blog-level--${r.severity}`}>
                      {r.severity === "info" ? "OK" : r.severity === "warn" ? "WARN" : "ERROR"}
                    </span>
                  </div>
                </div>

                {r.detail ? (
                  <div className="blog-evtDetails">
                    <details>
                      <summary>Details</summary>
                      <pre className="mMono blog-pre">{r.detail}</pre>
                    </details>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="blog-empty">No events match these filters yet.</div>
          )}
        </div>
      </section>

      <Modal
        open={open}
        title={`Bot events · ${botId}${selectedDay ? ` · ${selectedDay}` : ""}`}
        onClose={() => setOpen(false)}
        footer={
          <button className="mBtn" type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        }
      >
        {err ? <ErrorBanner title="Couldn’t load logs" body={err} /> : null}

        {busy && !items.length ? (
          <div style={{ opacity: 0.75, fontWeight: 800 }}>Loading events…</div>
        ) : filtered.length ? (
          <div style={{ display: "grid", gap: 10, maxHeight: "62vh", overflow: "auto", paddingRight: 6 }}>
            {filtered.map((r, idx) => (
              <div key={`${idx}-${r.ts}`} className={toneClass(r.severity)}>
                <div className="blog-evtTop">
                  <div className="blog-evtLeft">
                    <div className="blog-evtTitle">{r.headline}</div>
                    <div className="blog-evtSub">
                      <span className="blog-evtChip">{r.category}</span>
                      <span className="blog-evtDot">•</span>
                      <span className="blog-evtChip blog-evtChip--soft">{r.action}</span>
                      <span className="blog-evtDot">•</span>
                      <span className="mMono">{fmtEpochSeconds(r.ts)}</span>
                    </div>
                  </div>

                  <div className="blog-evtRight">
                    <span className={`blog-level blog-level--${r.severity}`}>
                      {r.severity === "info" ? "OK" : r.severity === "warn" ? "WARN" : "ERROR"}
                    </span>
                  </div>
                </div>

                <div className="blog-evtDetails">
                  <details open={false}>
                    <summary>Raw log</summary>
                    <div className="blog-rawGrid">
                      <div className="blog-rawLabel">Level</div>
                      <div className="mMono">{r.rawLevel}</div>

                      <div className="blog-rawLabel">Message</div>
                      <div>{r.rawMessage || "—"}</div>

                      <div className="blog-rawLabel">Meta</div>
                      <pre className="mMono blog-pre">{r.rawMeta ? safeJson(r.rawMeta) : "—"}</pre>
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ opacity: 0.75, fontWeight: 800 }}>No events match these filters yet.</div>
        )}
      </Modal>
    </>
  );
}