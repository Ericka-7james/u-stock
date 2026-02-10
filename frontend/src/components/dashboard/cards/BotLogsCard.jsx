// src/components/dashboard/cards/BotLogsCard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "../../common/Modal.jsx";
import "../../../css/dashboard/cards/BotLogsCard.css";

const CACHE_TTL_MS = 60_000;

const logsCache = {
  ts: 0,
  key: "",
  items: [],
};

function isFresh(ts) {
  return Date.now() - Number(ts || 0) < CACHE_TTL_MS;
}

async function apiGet(url, { signal } = {}) {
  const res = await fetch(url, { credentials: "include", signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Request failed");
  return data;
}

async function apiGetWithRetry(url, { signal } = {}) {
  try {
    return await apiGet(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    return await apiGet(url, { signal });
  }
}

function safeStr(x, fallback = "") {
  const s = String(x ?? "").trim();
  return s || fallback;
}

function fmtTime(epochSeconds) {
  const t = Number(epochSeconds);
  if (!Number.isFinite(t) || t <= 0) return "—";
  try {
    return new Date(t * 1000).toLocaleString();
  } catch {
    return "—";
  }
}

function dayKey(epochSeconds) {
  const t = Number(epochSeconds);
  if (!Number.isFinite(t) || t <= 0) return "";
  try {
    const d = new Date(t * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function isFailishLevel(level) {
  const l = String(level || "").toLowerCase();
  return l === "error" || l === "warn" || l === "warning";
}

function includesAny(haystack, needle) {
  const h = String(haystack || "").toLowerCase();
  const n = String(needle || "").toLowerCase().trim();
  if (!n) return true;
  return h.includes(n);
}

function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x ?? "");
  }
}

function normalizeEffective(x) {
  const v = String(x || "").toLowerCase();
  if (
    v === "waiting_for_market" ||
    v === "running" ||
    v === "paused" ||
    v === "starting" ||
    v === "stopping" ||
    v === "degraded" ||
    v === "error" ||
    v === "offline"
  ) {
    return v;
  }
  if (v === "stopped") return "paused";
  if (v === "failed") return "error";
  return "unknown";
}

function statusPill(effective) {
  if (effective === "running") return { label: "Live", cls: "blog-pill blog-pill--on" };
  if (effective === "waiting_for_market") return { label: "Waiting for market", cls: "blog-pill blog-pill--warn" };
  if (effective === "paused") return { label: "Paused", cls: "blog-pill blog-pill--paused" };
  if (effective === "offline") return { label: "Runner offline", cls: "blog-pill blog-pill--off" };
  if (effective === "error") return { label: "Error", cls: "blog-pill blog-pill--bad" };
  if (effective === "starting") return { label: "Starting…", cls: "blog-pill blog-pill--soft" };
  if (effective === "stopping") return { label: "Stopping…", cls: "blog-pill blog-pill--soft" };
  return { label: "Unknown", cls: "blog-pill blog-pill--soft" };
}

/**
 * ✅ Normalize backend rows into a unified shape for classifyLog().
 *
 * Backend /api/bots/log returns items like:
 *   { ts, level, event_type, symbol, event_id, payload }
 * There is NOT necessarily a row.message or row.meta.
 *
 * We synthesize:
 *   message: best-effort from payload.message / payload.last_error / event_type
 *   meta: payload (or relevant subset)
 */
function normalizeLogRow(row) {
  const ts = Number(row?.ts) || 0;
  const level = safeStr(row?.level, "info").toLowerCase();

  const eventType = safeStr(row?.event_type, "");
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : null;

  const pMessage = payload ? safeStr(payload.message, "") : "";
  const pErr = payload ? safeStr(payload.last_error, "") : "";
  const pReason = payload ? safeStr(payload.reason_code, "") : "";
  const pPausedReason = payload ? safeStr(payload.paused_reason, "") : "";
  const pNextOpen = payload ? payload.next_open_epoch ?? payload.nextOpenEpoch : null;

  // Create a stable “message” string for your classifier
  let message = pMessage;
  if (!message && pPausedReason) message = pPausedReason;
  if (!message && pReason) message = pReason;
  if (!message && pErr) message = pErr;
  if (!message && eventType) message = eventType;
  if (!message) message = "Update";

  // Provide meta for details view
  const meta = payload
    ? {
        ...payload,
        event_type: eventType || undefined,
        next_open_epoch: pNextOpen ?? payload.next_open_epoch ?? undefined,
      }
    : eventType
    ? { event_type: eventType }
    : null;

  return { ts, level, message, meta };
}

function classifyLog(row) {
  const levelRaw = String(row?.level || "info").toLowerCase();
  const isFail = isFailishLevel(levelRaw);

  const msg = safeStr(row?.message, "");
  const msgL = msg.toLowerCase();
  const meta = row?.meta || null;

  const hasAny = (...needles) => needles.some((n) => msgL.includes(String(n).toLowerCase()));

  let category = "System";
  if (hasAny("market", "session", "open", "closed", "next open")) category = "Market";
  if (hasAny("alpaca", "broker", "order", "submit", "fill", "filled", "position")) category = "Orders";
  if (hasAny("risk", "max trades", "min confidence", "risk_per_trade", "stop", "halt", "guard")) category = "Risk";
  if (hasAny("signal", "ema", "trend", "entry", "exit", "strategy", "setup")) category = "Strategy";
  if (hasAny("runner", "heartbeat", "loop", "engine", "orchestration")) category = "Runner";

  let headline = msg;
  let detail = "";
  let action = "Update";

  // ✅ Pull “waiting for market” signal from meta too
  const metaStr = meta ? safeJson(meta).toLowerCase() : "";
  const hasMetaAny = (...needles) => needles.some((n) => metaStr.includes(String(n).toLowerCase()));

  if (hasAny("waiting_for_market", "waiting for market") || hasMetaAny("waiting_for_market", "market_closed")) {
    action = "Waiting";
    headline = "Market is closed — bot is waiting";
    detail = "No trades will be placed until the next open.";
    category = "Market";
  } else if (hasAny("starting")) {
    action = "Starting";
    headline = "Bot is starting up";
    detail = "Loading config and checking market session.";
    category = category === "System" ? "Runner" : category;
  } else if (hasAny("running")) {
    action = "Running";
    headline = "Bot is running";
    detail = "Scanning for setups and evaluating signals.";
  } else if (hasAny("paused", "manual_pause", "intent_paused")) {
    action = "Paused";
    headline = "Bot is paused";
    detail = "Start the bot from the Dashboard to resume.";
    category = "System";
  } else if (hasAny("offline", "not heartbeating", "heartbeat")) {
    action = isFail ? "Offline" : "Runner";
    headline = isFail ? "Runner appears offline" : "Runner heartbeat received";
    detail = isFail
      ? "U-Stock runner is not reporting in. Check your runner host."
      : "Runner is online and reporting.";
    category = "Runner";
  } else if (hasAny("order") && hasAny("submit")) {
    action = "Order";
    headline = "Order submitted";
    detail = meta ? safeJson(meta) : "";
    category = "Orders";
  } else if (hasAny("filled", "fill")) {
    action = "Fill";
    headline = "Order filled";
    detail = meta ? safeJson(meta) : "";
    category = "Orders";
  } else if (hasAny("reject", "rejected")) {
    action = "Rejected";
    headline = "Order rejected";
    detail = meta ? safeJson(meta) : "";
    category = "Orders";
  } else if (hasAny("risk") && hasAny("block", "blocked", "halt", "gate")) {
    action = "Blocked";
    headline = "Risk controls blocked an action";
    detail = meta ? safeJson(meta) : "";
    category = "Risk";
  } else if (isFail) {
    action = "Issue";
    headline = msg || "Something needs attention";
    detail = meta ? safeJson(meta) : "";
  } else {
    const max = 84;
    if (msg.length > max) {
      headline = msg.slice(0, max).trim() + "…";
      detail = meta ? safeJson(meta) : msg;
    } else {
      detail = meta ? safeJson(meta) : "";
    }
  }

  const severity = isFail ? (levelRaw === "error" ? "error" : "warn") : "info";

  return {
    ts: row?.ts,
    category,
    action,
    severity,
    headline,
    detail,
    rawLevel: String(row?.level || "info").toUpperCase(),
    rawMessage: msg,
    rawMeta: meta,
  };
}

function effectiveExplainer(eff, nextOpenEpoch) {
  if (eff === "running") {
    return {
      tone: "ok",
      title: "Live: scanning for trades",
      body: "The bot is online and evaluating signals. Orders may be placed if risk checks pass.",
    };
  }
  if (eff === "waiting_for_market") {
    return {
      tone: "warn",
      title: "Waiting for market open",
      body: `The market is closed, so the bot is idle. Next open: ${nextOpenEpoch ? fmtTime(nextOpenEpoch) : "—"}.`,
    };
  }
  if (eff === "paused") {
    return { tone: "neutral", title: "Paused", body: "The bot is not trading right now. Start it from the Dashboard when you’re ready." };
  }
  if (eff === "starting") {
    return { tone: "neutral", title: "Starting up", body: "Loading configuration and checking connectivity." };
  }
  if (eff === "offline") {
    return { tone: "bad", title: "Runner offline", body: "U-Stock isn’t receiving runner heartbeats. Check your runner host and API connectivity." };
  }
  if (eff === "error") {
    return { tone: "bad", title: "Error state", body: "The bot reported an error. Review recent issues below and the raw details in “View all”." };
  }
  if (eff === "degraded") {
    return { tone: "warn", title: "Degraded", body: "The bot is running, but some dependencies may be failing (data/broker/session). Review recent issues." };
  }
  return { tone: "neutral", title: "Status unknown", body: "The bot status couldn’t be determined. Refresh and verify the runner is online." };
}

// YYYY-MM-DD -> epoch sec at local midnight (start) / end-of-day (end)
function dateStrToEpochSec(dateStr, { endOfDay = false } = {}) {
  const s = String(dateStr || "").trim();
  if (!s) return 0;

  // NOTE: this assumes the browser local timezone. That’s okay for UI filtering.
  // TODO: if you want strict UTC ranges, build Date via Date.UTC instead.
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;

  if (!endOfDay) return Math.floor(d.getTime() / 1000);

  d.setHours(23, 59, 59, 999);
  return Math.floor(d.getTime() / 1000);
}

export default function BotLogsCard({
  title = "Bot logs",
  subtitle = "Understand what the bot is doing — filter by day, outcome, and search terms.",
  defaultBotId = "ema_trend",
  maxPreview = 4,
  showQuickLink = true,

  timeframe = null,

  // ✅ NEW: mode (paper/live). If not provided, default to paper.
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

  // timeframe -> epoch bounds
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
        `/api/bots/log?bot_id=${encodeURIComponent(safeStr(botId, "ema_trend"))}` +
        `&mode=${encodeURIComponent(modeNorm)}` +
        `&limit=${encodeURIComponent(String(limit || 120))}` +
        (startTs ? `&start_ts=${encodeURIComponent(String(startTs))}` : "") +
        (endTs ? `&end_ts=${encodeURIComponent(String(endTs))}` : "");

      const data = await apiGetWithRetry(url, { signal: ac.signal });
      if (!aliveRef.current || ac.signal.aborted) return;

      const raw = Array.isArray(data?.items) ? data.items : [];

      // ✅ Normalize backend rows into {ts, level, message, meta}
      const normalized = raw
        .filter((x) => x && typeof x === "object")
        .map(normalizeLogRow)
        .filter((x) => Number(x.ts) > 0);

      // service returns descending; we keep it as-is (newest last in preview)
      setItems(normalized);

      logsCache.ts = Date.now();
      logsCache.key = cacheKey;
      logsCache.items = normalized;

      const dayList = normalized.map((r) => dayKey(r?.ts)).filter(Boolean);
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
      const s = await apiGetWithRetry(
        `/api/bots/status?bot_id=${encodeURIComponent(safeStr(botId, "ema_trend"))}`,
        { signal: ac.signal }
      );
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
    const fresh = isFresh(logsCache.ts) && logsCache.key === cacheKey;
    if (fresh) setItems(Array.isArray(logsCache.items) ? logsCache.items : []);
    else refresh();

    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, modeNorm, limit, startTs, endTs]);

  const availableDays = useMemo(() => {
    const dayList = (Array.isArray(items) ? items : []).map((r) => dayKey(r?.ts)).filter(Boolean);
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
      const d = dayKey(r?.ts);
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

  const eff = normalizeEffective(botStatus?.effective_state || botStatus?.state);
  const pill = statusPill(eff);

  // next open can exist in status OR inside recent heartbeat payloads
  const nextOpen = botStatus?.nextOpenEpoch || botStatus?.next_open_epoch || null;
  const explain = effectiveExplainer(eff, nextOpen);

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

  return (
    <>
      <section className="panel blog-card">
        <div className="card-header blog-header">
          <div className="card-header-left">
            <div className="blog-titleRow">
              <h2 className="blog-title">{title}</h2>

              <span className={pill.cls} title="Bot effective state">
                {pill.label}
              </span>

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

          {showQuickLink ? (
            <div className="blog-headerActions">
              <Link to="/connected-apps" className="back-link-pill">
                Connected apps →
              </Link>
            </div>
          ) : null}
        </div>

        <div className={`blog-statusBanner blog-statusBanner--${explain.tone}`}>
          <div className="blog-statusTitle">{explain.title}</div>
          <div className="blog-statusBody">{explain.body}</div>
          {eff === "waiting_for_market" && nextOpen ? (
            <div className="blog-statusMeta">Next open: {fmtTime(nextOpen)}</div>
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
              placeholder="Search events, categories, raw details…"
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

        {err ? (
          <div className="errorBanner" style={{ marginTop: 12 }}>
            <strong>Couldn’t load logs</strong>
            <div style={{ marginTop: 6 }}>{err}</div>
          </div>
        ) : null}

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
                      <span className="mMono">{fmtTime(r.ts)}</span>
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
        {err ? <div className="botError">{err}</div> : null}

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
                      <span className="mMono">{fmtTime(r.ts)}</span>
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

/**
 * TODOs / breakpoints:
 * - If backend changes bot_events schema, update normalizeLogRow() only (everything else stays stable).
 * - If you want strict UTC day buckets, compute dayKey() via UTC methods.
 * - If large accounts produce huge logs, add pagination via before_ts (like /events endpoint).
 */
