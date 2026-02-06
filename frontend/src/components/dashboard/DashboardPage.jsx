// frontend/src/components/dashboard/DashboardPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../layout/AppShell.jsx";
import { useAuth } from "../../context/AuthContext";

import PriceChartPanel from "./cards/PriceChartPanel.jsx";
import SentimentCard from "./cards/SentimentCard.jsx";
import MacroCard from "./cards/MacroCard.jsx";
import TradePerformancePanel from "./cards/TradePerformancePanel.jsx";
import MarketLeadersCard from "./cards/MarketLeadersCard.jsx";

import { useAlpacaDailyBars } from "../../hooks/useAlpacaDailyBars.js";
import { useAlpacaTradeSummary } from "../../hooks/useAlpacaTradeSummary.js";
import { explainAnyError } from "../common/errorMessages.js";

import "../../css/dashboard/DashboardPage.css";
import "../../css/dashboard/cards/ChartControls.css";
import "../../css/dashboard/cards/CardShared.css";

const LAST_TICKER_KEY = "ustock:last_ticker";

// -------- Small in-memory caches (stale-while-revalidate) --------
const CACHE_TTL_MS = 60_000;

const oppCache = {
  ts: 0,
  data: { crypto: [], stocks: [], funds: [] },
};

const leadersCache = {
  ts: 0,
  data: null, // { ok, items, meta, asOf, ... }
};

function isFresh(ts) {
  return Date.now() - Number(ts || 0) < CACHE_TTL_MS;
}

function toError(e) {
  if (e instanceof Error) return e;
  const msg = typeof e === "string" ? e : e?.message ? String(e.message) : JSON.stringify(e);
  return new Error(msg);
}

async function apiGet(path, { signal } = {}) {
  const res = await fetch(path, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });

  const ct = res.headers.get("content-type") || "";
  const json = ct.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => "");

  if (!res.ok) {
    const detail =
      typeof json === "object" && json?.detail
        ? json.detail
        : typeof json === "string"
        ? json
        : null;
    const code = typeof json === "object" && json?.code ? json.code : null;

    const msg =
      (typeof detail === "string" && detail) ||
      (typeof json === "object" && (json?.error || json?.message)) ||
      `Request failed (${res.status})`;

    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.code = code || null;
    err.detail = detail || null;
    err.payload = typeof json === "object" ? json : { raw: json };
    throw err;
  }

  return typeof json === "object" ? json : { ok: true, raw: json };
}

// Retry once for transient failures (but never retry aborts)
async function apiGetWithRetry(path, { signal } = {}) {
  try {
    return await apiGet(path, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    return await apiGet(path, { signal });
  }
}

function readIsDarkMode() {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  const body = document.body;

  const classDark = root?.classList?.contains("dark") || body?.classList?.contains("dark");
  const dataThemeDark =
    root?.getAttribute?.("data-theme") === "dark" || body?.getAttribute?.("data-theme") === "dark";
  return Boolean(classDark || dataThemeDark);
}

function loadLastTicker() {
  try {
    const v = localStorage.getItem(LAST_TICKER_KEY);
    const s = String(v || "").trim().toUpperCase();
    return s || "AAPL";
  } catch {
    return "AAPL";
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
  return /^[A-Z]+$/.test(s); // rejects VLN.WS, BRK.B, etc.
}

function isTradingViewOrigin(origin) {
  // allow https://*.tradingview.com only
  try {
    const u = new URL(String(origin || ""));
    if (u.protocol !== "https:") return false;
    const host = (u.hostname || "").toLowerCase();
    return host === "tradingview.com" || host.endsWith(".tradingview.com");
  } catch {
    return false;
  }
}

function BodyWithInlineAction({ body, action, onAction }) {
  const text = String(body || "");
  const label = action?.label ? String(action.label) : "";
  const canInline = Boolean(label && text.includes(label) && typeof onAction === "function");
  const lines = text.split("\n");

  const renderLine = (line, lineIdx) => {
    if (!canInline) return <span key={`l-${lineIdx}`}>{line}</span>;

    const parts = line.split(label);
    if (parts.length === 1) return <span key={`l-${lineIdx}`}>{line}</span>;

    return (
      <span key={`l-${lineIdx}`}>
        {parts.map((p, i) => (
          <span key={`p-${lineIdx}-${i}`}>
            {p}
            {i < parts.length - 1 ? (
              <button
                type="button"
                onClick={onAction}
                style={{
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  fontWeight: 800,
                  textDecoration: "underline",
                  cursor: "pointer",
                  color: "#2563eb",
                }}
                aria-label={label}
                title={label}
              >
                {label}
              </button>
            ) : null}
          </span>
        ))}
      </span>
    );
  };

  return (
    <span>
      {lines.map((line, idx) => (
        <span key={`line-${idx}`}>
          {renderLine(line, idx)}
          {idx < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </span>
  );
}

function ErrorBanner({ title, body, debug, action, onAction }) {
  return (
    <div className="errorBanner">
      <strong>{title}</strong>

      <div style={{ marginTop: 6 }}>
        <BodyWithInlineAction body={body} action={action} onAction={onAction} />
      </div>

      {import.meta.env.DEV && debug ? (
        <details style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          <summary>Debug info</summary>
          <pre style={{ overflowX: "auto" }}>{JSON.stringify(debug, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

/** Bot Opportunities (internal) */
function useBotOpportunities() {
  const [data, setData] = useState(() =>
    isFresh(oppCache.ts) ? oppCache.data : { crypto: [], stocks: [], funds: [] }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      const hasFresh = isFresh(oppCache.ts) && oppCache.data;
      if (!hasFresh) setLoading(true);
      setError(null);

      try {
        const json = await apiGetWithRetry("/api/opportunities/bot/top?limit=8", { signal: ac.signal });
        if (!alive) return;

        const next = json || { crypto: [], stocks: [], funds: [] };
        setData(next);

        oppCache.ts = Date.now();
        oppCache.data = next;
      } catch (e) {
        if (!alive) return;
        if (ac.signal.aborted) return;

        const err = toError(e);
        setError(err);

        if (!data) setData({ crypto: [], stocks: [], funds: [] });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error };
}

/** Market leaders (Alpaca movers) */
function useMarketLeaders({ direction = "up", limit = 10 } = {}) {
  const [data, setData] = useState(() => (isFresh(leadersCache.ts) ? leadersCache.data : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      const hasFresh = isFresh(leadersCache.ts) && leadersCache.data;
      if (!hasFresh) setLoading(true);
      setError(null);

      const qs = new URLSearchParams({
        market: "stocks",
        direction,
        limit: String(limit),
      });

      try {
        const json = await apiGetWithRetry(`/api/market/leaders?${qs.toString()}`, { signal: ac.signal });
        if (!alive) return;

        setData(json || null);
        leadersCache.ts = Date.now();
        leadersCache.data = json || null;
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

    const t = window.setInterval(run, 20_000);
    return () => {
      alive = false;
      ac.abort();
      window.clearInterval(t);
    };
  }, [direction, limit]);

  return { data, loading, error };
}

/* ------------------------------------------------------------------
   ✅ BOT STATUS WIRING FOR TradePerformancePanel
   ------------------------------------------------------------------ */

const BOT_OPTIONS = [
  { id: "ema_trend", name: "EMA Trend" },
  { id: "orb", name: "ORB Breakout" },
  { id: "mean_revert", name: "Mean Reversion" },
];

function normalizeEffectiveState(x) {
  const v = String(x || "").trim().toLowerCase();
  const ok = new Set([
    "running",
    "waiting_for_market",
    "starting",
    "paused",
    "stopped",
    "offline",
    "error",
    "degraded",
  ]);
  return ok.has(v) ? v : v || "stopped";
}

function useBotStatuses(botOptions) {
  const botIds = useMemo(
    () => (Array.isArray(botOptions) ? botOptions.map((b) => b.id).filter(Boolean) : []),
    [botOptions]
  );

  const [botStatuses, setBotStatuses] = useState(() => ({}));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!botIds.length) return;

    const ac = new AbortController();
    let alive = true;

    async function run() {
      setError(null);
      setLoading(false);

      try {
        const results = await Promise.all(
          botIds.map(async (id) => {
            const json = await apiGetWithRetry(`/api/bots/status?bot_id=${encodeURIComponent(id)}`, {
              signal: ac.signal,
            });
            return [id, json];
          })
        );

        if (!alive) return;

        const next = {};
        for (const [id, json] of results) {
          const eff = normalizeEffectiveState(json?.effective_state || json?.effectiveState || json?.state);
          next[id] = { ...json, effective_state: eff };
        }

        setBotStatuses(next);
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
    const t = window.setInterval(run, 10_000);

    return () => {
      alive = false;
      ac.abort();
      window.clearInterval(t);
    };
  }, [botIds]);

  return { botStatuses, loading, error };
}

/* ------------------------------------------------------------------
   ✅ Timeframe display + TradingView interval mapping (interval-only)
   ------------------------------------------------------------------ */

function parseDateLoose(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d?.getTime?.()) ? d : null;
}

function computeInclusiveDays(start, end) {
  const a = parseDateLoose(start);
  const b = parseDateLoose(end);
  if (!a || !b) return null;

  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / 86400000) + 1;
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

function computeRangeDaysLabel(timeframe) {
  // default “Past week” if timeframe is null/empty
  if (!timeframe) return { days: 7, label: "7 days" };

  const start = timeframe?.start ?? timeframe?.from ?? timeframe?.date_from ?? timeframe?.time_min;
  const end = timeframe?.end ?? timeframe?.to ?? timeframe?.date_to ?? timeframe?.time_max;

  const d = timeframe?.days ?? computeInclusiveDays(start, end);
  if (d !== null) return { days: d, label: `${d} day${d === 1 ? "" : "s"}` };

  return { days: null, label: "—" };
}

function computeTimeframeLabel(timeframe) {
  if (!timeframe) return "Past week";
  const label = timeframe?.label || timeframe?.preset || timeframe?.name || timeframe?.title || timeframe?.key || "";
  const s = String(label || "").trim();
  return s || "Custom";
}

// ✅ your rule
function mapDaysToTvInterval(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return "60";
  if (d <= 2) return "15";
  if (d <= 10) return "60";
  if (d <= 45) return "240";
  if (d <= 180) return "D";
  return "W";
}

export default function DashboardPage() {
  const { isAuthed, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [currentTicker, setCurrentTicker] = useState(() => loadLastTicker());

  // ✅ default behavior: null means "user has not chosen" -> treat as Past week
  const [timeframe, setTimeframe] = useState(null);

  if (authLoading) return null;
  if (!isAuthed) return null;

  useEffect(() => {
    try {
      if (currentTicker) localStorage.setItem(LAST_TICKER_KEY, currentTicker);
    } catch {}
  }, [currentTicker]);

  const [isDarkMode, setIsDarkMode] = useState(() => readIsDarkMode());

  useEffect(() => {
    if (typeof document === "undefined") return;

    const update = () => setIsDarkMode(readIsDarkMode());
    update();

    const obs = new MutationObserver(() => update());
    const root = document.documentElement;
    const body = document.body;

    if (root) obs.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    if (body) obs.observe(body, { attributes: true, attributeFilter: ["class", "data-theme"] });

    return () => obs.disconnect();
  }, []);

  // Update ticker when user searches inside TradingView widget
  useEffect(() => {
    const handler = (e) => {
      if (!isTradingViewOrigin(e?.origin)) return;

      let msg = e.data;
      if (typeof msg === "string") {
        try {
          msg = JSON.parse(msg);
        } catch {
          return;
        }
      }
      if (!msg || typeof msg !== "object") return;
      if (msg.name !== "quoteUpdate") return;

      const raw =
        msg?.data?.short_name || msg?.data?.original_name || msg?.data?.ticker || msg?.data?.symbol || "";

      const next = normalizeSymbol(raw);
      if (!next) return;

      setCurrentTicker((prev) => (prev === next ? prev : next));
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const { bars: alpacaBars, loading: alpacaLoading, error: alpacaError, meta: alpacaMeta } =
    useAlpacaDailyBars(currentTicker, 220);

  const alpacaHistoryBySymbol = useMemo(() => ({ [currentTicker]: alpacaBars || [] }), [currentTicker, alpacaBars]);

  const [tradePreset, setTradePreset] = useState("Week");
  const { data: tradePerfData, loading: tradePerfLoading, error: tradePerfError } = useAlpacaTradeSummary(
    tradePreset,
    { slippageBps: 0, feeBps: 0 }
  );

  const tradeErrUI = tradePerfError ? explainAnyError(tradePerfError, { feature: "trade_summary" }) : null;
  const barsErrUI = alpacaError ? explainAnyError(alpacaError, { feature: "daily_bars" }) : null;

  const { data: oppData, loading: oppLoading, error: oppError } = useBotOpportunities();
  const oppErrUI = oppError ? explainAnyError(oppError, { feature: "bot_opportunities" }) : null;

  const { data: leadersResp, loading: leadersLoading, error: leadersError } = useMarketLeaders({
    direction: "up",
    limit: 10,
  });
  const leadersErrUI = leadersError ? explainAnyError(leadersError, { feature: "market_leaders" }) : null;

  const leadersItems = useMemo(() => (Array.isArray(leadersResp?.items) ? leadersResp.items : []), [leadersResp]);

  const leadersMeta = useMemo(() => {
    const meta = leadersResp?.meta && typeof leadersResp.meta === "object" ? leadersResp.meta : {};
    return {
      ...meta,
      source_label: meta?.source_label || leadersResp?.meta?.source_label,
      source: leadersResp?.source || meta?.source || "ALPACA",
      asOf: leadersResp?.asOf || meta?.asOf || null,
    };
  }, [leadersResp]);

  const onPickSymbol = (sym) => {
    const clean = normalizeSymbol(sym);
    if (!clean) return;
    if (!isTvSafe(clean)) return;
    setCurrentTicker(clean);
  };

  const { botStatuses } = useBotStatuses(BOT_OPTIONS);

  const activeBots = useMemo(() => {
    return BOT_OPTIONS.filter((b) => {
      const s = botStatuses?.[b.id];
      if (!s) return false;

      const intent = String(s.intent || "").toLowerCase();
      const eff = normalizeEffectiveState(s.effective_state || s.effectiveState || s.state);

      // Bot is considered "active" if user intent exists,
      // even if runner is offline
      return intent === "running" || eff === "running" || eff === "waiting_for_market" || eff === "offline";
    });
  }, [botStatuses]);

  const activeBotId = activeBots?.[0]?.id || null;

  const activeBot = useMemo(() => {
    if (!activeBotId) return null;
    return BOT_OPTIONS.find((b) => b.id === activeBotId) || null;
  }, [activeBotId]);


  // ✅ Display labels
  const tfLabel = useMemo(() => computeTimeframeLabel(timeframe), [timeframe]);
  const tfRangeLabel = useMemo(() => computeRangeDaysLabel(timeframe)?.label || "—", [timeframe]);

  // ✅ TradingView interval (interval-only) — default Past week unless user explicitly changes timeframe
  const tvInterval = useMemo(() => {
    if (!timeframe) return "60"; // Past week default => 1h candles
    if (timeframe?.tvInterval) return String(timeframe.tvInterval);
    const days = timeframe?.days ?? computeRangeDaysLabel(timeframe)?.days ?? 7;
    return mapDaysToTvInterval(days);
  }, [timeframe]);

  return (
    <AppShell>
      <main className="dashboard-main">
        <div className="dashboard-left">
          {tradeErrUI ? (
            <ErrorBanner
              title={tradeErrUI.title}
              body={tradeErrUI.body}
              debug={tradeErrUI.debug}
              action={tradeErrUI.action}
              onAction={() => {
                const href = tradeErrUI?.action?.href;
                if (href) navigate(href);
              }}
            />
          ) : null}

          <TradePerformancePanel
            data={tradePerfData || { start: "—", end: "—", trades: [] }}
            opportunities={oppData}
            leaders={leadersItems}
            onPickSymbol={onPickSymbol}
            activeBot={activeBot}
            activeBotId={activeBot?.id || null}
            botStatuses={botStatuses}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            onChangeRange={(preset) => setTradePreset(preset)}
          />

          {tradePerfLoading ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Loading…</div> : null}
          {oppLoading ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Loading…</div> : null}
          {leadersLoading ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Loading leaders…</div> : null}

          {oppErrUI ? (
            <ErrorBanner
              title={oppErrUI.title}
              body={oppErrUI.body}
              debug={oppErrUI.debug}
              action={oppErrUI.action}
              onAction={() => {
                const href = oppErrUI?.action?.href;
                if (href) navigate(href);
              }}
            />
          ) : null}

          {leadersErrUI ? (
            <ErrorBanner
              title={leadersErrUI.title}
              body={leadersErrUI.body}
              debug={leadersErrUI.debug}
              action={leadersErrUI.action}
              onAction={() => {
                const href = leadersErrUI?.action?.href;
                if (href) navigate(href);
              }}
            />
          ) : null}
        </div>

        <div className="dashboard-right">
          <PriceChartPanel
            currentTicker={currentTicker}
            onSelectTicker={onPickSymbol}
            isDarkMode={isDarkMode}
            timeframeLabel={tfLabel}
            // we keep this as a hint only; we are NOT claiming we control the window
            activeRangeLabel={timeframe ? `Selected range: ${tfRangeLabel}` : ""}
            interval={tvInterval}
          />

          <section className="panel panel-sentiment">
            {barsErrUI ? (
              <ErrorBanner
                title={barsErrUI.title}
                body={barsErrUI.body}
                debug={barsErrUI.debug}
                action={barsErrUI.action}
                onAction={() => {
                  const href = barsErrUI?.action?.href;
                  if (href) navigate(href);
                }}
              />
            ) : null}

            <SentimentCard
              symbol={currentTicker}
              historyBySymbol={alpacaHistoryBySymbol}
              loading={alpacaLoading}
              backendSnapshot={null}
            />

            {alpacaMeta?.fetchedAt ? (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                Alpaca fetched: {new Date(alpacaMeta.fetchedAt).toLocaleString()}
              </div>
            ) : null}
          </section>

          <MarketLeadersCard items={leadersItems} meta={leadersMeta} loading={leadersLoading} onSelectSymbol={onPickSymbol} />

          <MacroCard />
        </div>
      </main>
    </AppShell>
  );
}
