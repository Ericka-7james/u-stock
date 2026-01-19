// src/components/pages/DatasourcesPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AppShell from "../layout/AppShell";
import Modal from "../common/Modal.jsx";
import MarketLeadersCard from "../dashboard/cards/MarketLeadersCard.jsx";

import "../../css/pages/DatasourcesPage.css";
import "../../css/dashboard/cards/CardShared.css";
import "../../css/dashboard/cards/BotControlCard.css";

// -------- Small in-memory cache (stale-while-revalidate) --------
const CACHE_TTL_MS = 60_000;

const leadersCache = {
  ts: 0,
  items: [],
  meta: { source: "alpaca_movers" },
};

const logsCache = {
  ts: 0,
  key: "",
  items: [],
};

function isFresh(ts) {
  return Date.now() - Number(ts || 0) < CACHE_TTL_MS;
}

function toError(e) {
  if (e instanceof Error) return e;
  const msg = typeof e === "string" ? e : e?.message ? String(e.message) : JSON.stringify(e);
  return new Error(msg);
}

async function apiGet(url, { signal } = {}) {
  const res = await fetch(url, { credentials: "include", signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Request failed");
  return data;
}

// Retry once (never retry aborts)
async function apiGetWithRetry(url, { signal } = {}) {
  try {
    return await apiGet(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    return await apiGet(url, { signal });
  }
}

function normalizeSymbol(sym) {
  const s = String(sym || "").trim();
  if (!s) return "";
  const last = s.includes(":") ? s.split(":").pop() : s;
  return last.toUpperCase();
}

function isTvSafe(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return /^[A-Z]+$/.test(s);
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

function safeStr(x, fallback = "") {
  const s = String(x ?? "").trim();
  return s || fallback;
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

// --------------------
// Market Leaders hook
// --------------------
function useMarketLeaders() {
  const [items, setItems] = useState(() => (isFresh(leadersCache.ts) ? leadersCache.items : []));
  const [meta, setMeta] = useState(() =>
    isFresh(leadersCache.ts) ? leadersCache.meta : { source: "alpaca_movers" }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      const hasFresh = isFresh(leadersCache.ts) && Array.isArray(leadersCache.items);
      if (!hasFresh) setLoading(true);
      setError(null);

      try {
        const json = await apiGetWithRetry(
          "/api/market/leaders?market=stocks&direction=up&limit=8",
          { signal: ac.signal }
        );
        if (!alive) return;

        const nextItems = Array.isArray(json?.items) ? json.items : [];
        const nextMeta = {
          source:
            json?.source || {
              code: "alpaca_movers",
              label: "Alpaca market movers (today)",
            },
          asOf: json?.asOf || null,
        };

        setItems(nextItems);
        setMeta(nextMeta);

        leadersCache.ts = Date.now();
        leadersCache.items = nextItems;
        leadersCache.meta = nextMeta;
      } catch (e) {
        if (!alive) return;
        if (ac.signal.aborted) return;
        setError(toError(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
      ac.abort();
    };
  }, []);

  return { items, meta, loading, error };
}

// --------------------
// Bot Logs Card
// - Shows max 3 entries in-card
// - "View all" opens modal w/ scroll
// --------------------
function BotLogsCard({ defaultBotId = "ema_trend", maxPreview = 3 }) {
  const [botId, setBotId] = useState(defaultBotId);
  const [limit, setLimit] = useState(240);

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // all | success | fail
  const [selectedDay, setSelectedDay] = useState(""); // YYYY-MM-DD

  // Modal
  const [open, setOpen] = useState(false);

  const cacheKey = `${botId}|${limit}`;

  async function refresh() {
    setErr("");
    setBusy(true);

    const ac = new AbortController();
    try {
      const url = `/api/bots/log?bot_id=${encodeURIComponent(
        safeStr(botId, "ema_trend")
      )}&limit=${encodeURIComponent(String(limit || 120))}`;

      const data = await apiGetWithRetry(url, { signal: ac.signal });
      const raw = Array.isArray(data?.items) ? data.items : [];

      // newest at bottom
      const ordered = raw.slice().reverse();

      setItems(ordered);
      logsCache.ts = Date.now();
      logsCache.key = cacheKey;
      logsCache.items = ordered;

      const dayList = ordered.map((r) => dayKey(r?.ts)).filter(Boolean);
      const uniq = Array.from(new Set(dayList)).sort();
      if (!selectedDay && uniq.length) setSelectedDay(uniq[uniq.length - 1]);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const fresh = isFresh(logsCache.ts) && logsCache.key === cacheKey;
    if (fresh) {
      setItems(Array.isArray(logsCache.items) ? logsCache.items : []);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, limit]);

  const availableDays = useMemo(() => {
    const dayList = (Array.isArray(items) ? items : [])
      .map((r) => dayKey(r?.ts))
      .filter(Boolean);

    const uniq = Array.from(new Set(dayList));
    uniq.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    if (selectedDay && !uniq.includes(selectedDay)) uniq.push(selectedDay);
    return uniq;
  }, [items, selectedDay]);

  const filtered = useMemo(() => {
    const list = Array.isArray(items) ? items : [];

    return list.filter((r) => {
      const d = dayKey(r?.ts);
      if (selectedDay && d && d !== selectedDay) return false;

      if (status !== "all") {
        const failish = isFailishLevel(r?.level);
        if (status === "fail" && !failish) return false;
        if (status === "success" && failish) return false;
      }

      if (q.trim()) {
        const blob =
          `${safeStr(r?.message)} ${safeStr(r?.level)} ${safeStr(r?.bot_id)} ` +
          (r?.meta ? safeJson(r.meta) : "");
        if (!includesAny(blob, q)) return false;
      }

      return true;
    });
  }, [items, selectedDay, status, q]);

  const preview = useMemo(() => {
    const list = Array.isArray(filtered) ? filtered : [];
    return list.slice(Math.max(0, list.length - maxPreview));
  }, [filtered, maxPreview]);

  return (
    <>
      <section className="panel ds-panel ds-botlogs">
        <div className="ds-card-header">
          <div className="ds-card-header-left">
            <div className="ds-title-row">
              <h2 className="ds-card-title">Bot Logs</h2>
            </div>
            <p className="ds-card-subtitle">
              Filter bot activity by day, status, and search terms. Preview shows the latest {maxPreview} entries.
            </p>
          </div>

          <div className="ds-card-header-actions">
            <Link to="/connected-apps" className="back-link-pill">
              Connected apps →
            </Link>
          </div>
        </div>

        <div className="ds-controls">
          <label className="ds-field">
            <span className="ds-label">Bot</span>
            <select
              value={botId}
              onChange={(e) => {
                setBotId(e.target.value);
                setSelectedDay("");
              }}
              className="ds-input"
              disabled={busy}
            >
              <option value="ema_trend">ema_trend</option>
            </select>
          </label>

          <label className="ds-field ds-field-day">
            <span className="ds-label">Day</span>
            <select
              value={selectedDay || ""}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="ds-input"
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

          <label className="ds-field">
            <span className="ds-label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="ds-input">
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="fail">Fail</option>
            </select>
          </label>

          <label className="ds-field ds-field-search">
            <span className="ds-label">Search</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search message/meta…"
              className="ds-input"
              disabled={busy}
            />
          </label>

          <label className="ds-field">
            <span className="ds-label">Limit</span>
            <select
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="ds-input"
              disabled={busy}
            >
              <option value="120">120</option>
              <option value="240">240</option>
              <option value="480">480</option>
            </select>
          </label>

          <button type="button" className="ds-btn ds-btn-primary" onClick={refresh} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>

          <button
            type="button"
            className="ds-btn ds-btn-secondary"
            onClick={() => setOpen(true)}
            disabled={busy || (!filtered?.length && !items?.length)}
          >
            View all
          </button>
        </div>

        {err ? (
          <div className="errorBanner" style={{ marginTop: 12 }}>
            <strong>Couldn’t load log</strong>
            <div style={{ marginTop: 6 }}>{err}</div>
          </div>
        ) : null}

        <div className="ds-log-list">
          {busy && !items.length ? (
            <div style={{ opacity: 0.75, fontWeight: 800 }}>Loading log…</div>
          ) : preview.length ? (
            preview.map((r, idx) => {
              const level = safeStr(r.level, "info").toUpperCase();
              const msg = safeStr(r.message, "");
              const isFail = isFailishLevel(r?.level);
              return (
                <div key={`${idx}-${r.ts}`} className={`ds-log-row ${isFail ? "ds-log-row--fail" : ""}`}>
                  <div className="mMono ds-log-meta">
                    <span>{fmtTime(r.ts)}</span>
                    <span>·</span>
                    <span>{level}</span>
                  </div>

                  <div className="ds-log-msg">{msg}</div>

                  {r.meta ? <pre className="mMono ds-log-pre">{safeJson(r.meta)}</pre> : null}
                </div>
              );
            })
          ) : (
            <div style={{ opacity: 0.75, fontWeight: 800 }}>No log entries match these filters yet.</div>
          )}
        </div>
      </section>

      <Modal
        open={open}
        title={`Bot log · ${botId}${selectedDay ? ` · ${selectedDay}` : ""}`}
        onClose={() => setOpen(false)}
        footer={
          <button className="mBtn" type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        }
      >
        {err ? <div className="botError">{err}</div> : null}

        {busy && !items.length ? (
          <div style={{ opacity: 0.75, fontWeight: 800 }}>Loading log…</div>
        ) : filtered.length ? (
          <div style={{ display: "grid", gap: 10, maxHeight: "62vh", overflow: "auto", paddingRight: 6 }}>
            {filtered.map((r, idx) => {
              const isFail = isFailishLevel(r?.level);
              return (
                <div key={`${idx}-${r.ts}`} className={`ds-log-row ${isFail ? "ds-log-row--fail" : ""}`}>
                  <div className="mMono ds-log-meta">
                    {fmtTime(r.ts)} · {String(r.level || "info").toUpperCase()}
                  </div>
                  <div className="ds-log-msg">{String(r.message || "")}</div>
                  {r.meta ? <pre className="mMono ds-log-pre">{safeJson(r.meta)}</pre> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ opacity: 0.75, fontWeight: 800 }}>No log entries match these filters yet.</div>
        )}
      </Modal>
    </>
  );
}

export default function DatasourcesPage() {
  const navigate = useNavigate();
  const { items: leaders, meta: leadersMeta, loading: leadersLoading } = useMarketLeaders();

  return (
    <AppShell>
      {/* HERO */}
      <header className="data-hero">
        <div className="data-hero-text">
          <h1 className="page-title">Market Leaders & Bot Logs</h1>
          <p className="muted">
            See today’s top movers and review bot activity in one place. Use this page to quickly pick a ticker,
            then jump back to the dashboard chart, or search logs to debug success/fail behavior by day.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
          <Link to="/connected-apps" className="back-link-pill">
            Connected apps →
          </Link>
        </div>
      </header>

      {/* ✅ 2-up on large screens, stacked on small */}
      <main className="ds-main">
        <div className="ds-left">
          <MarketLeadersCard
            title="Market leaders"
            subtitle="Top movers from Alpaca (today). Click one to load the chart."
            items={leaders}
            meta={leadersMeta}
            loading={leadersLoading}
            onSelectSymbol={(sym) => {
              const clean = normalizeSymbol(sym);
              if (!clean) return;
              if (!isTvSafe(clean)) return;

              try {
                localStorage.setItem("ustock:last_ticker", clean);
              } catch {}

              // Most reliable: dashboard can read query or localStorage
              navigate(`/?ticker=${encodeURIComponent(clean)}`);
            }}
          />
        </div>

        <div className="ds-right">
          <BotLogsCard defaultBotId="ema_trend" maxPreview={3} />
        </div>
      </main>
    </AppShell>
  );
}
