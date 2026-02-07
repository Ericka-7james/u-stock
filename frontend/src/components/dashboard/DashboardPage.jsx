// frontend/src/components/dashboard/DashboardPage.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
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

// ✅ UI component (modal)
import ErrorModal from "../common/ErrorMessages.jsx";
import { explainAnyError } from "../../lib/errorMessages.jsx";

import { DASHBOARD_PAGE_COPY as COPY } from "../../content/dashboard.content.js";

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
  data: null,
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
    const msg =
      (typeof json === "object" && (json?.detail || json?.error || json?.message)) ||
      `Request failed (${res.status})`;

    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return typeof json === "object" ? json : { ok: true, raw: json };
}

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
  return (
    root?.classList?.contains("dark") ||
    body?.classList?.contains("dark") ||
    root?.getAttribute("data-theme") === "dark"
  );
}

function loadLastTicker() {
  try {
    const v = localStorage.getItem(LAST_TICKER_KEY);
    const s = String(v || "").trim().toUpperCase();
    return s || COPY.defaults.fallbackTicker;
  } catch {
    return COPY.defaults.fallbackTicker;
  }
}

function normalizeSymbol(sym) {
  const s = String(sym || "").trim();
  if (!s) return "";
  return s.includes(":") ? s.split(":").pop().toUpperCase() : s.toUpperCase();
}

function isTvSafe(sym) {
  return /^[A-Z]+$/.test(String(sym || "").toUpperCase());
}

function isTradingViewOrigin(origin) {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && (u.hostname === "tradingview.com" || u.hostname.endsWith(".tradingview.com"));
  } catch {
    return false;
  }
}

function ErrorBanner({ title, body }) {
  return (
    <div className="errorBanner">
      <strong>{title}</strong>
      <div style={{ marginTop: 6, whiteSpace: "pre-line" }}>{body}</div>
    </div>
  );
}

/* ---------------- Bot Opportunities ---------------- */

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
      if (!isFresh(oppCache.ts)) setLoading(true);
      setError(null);

      try {
        const json = await apiGetWithRetry("/api/opportunities/bot/top?limit=8", { signal: ac.signal });
        if (!alive) return;
        setData(json || { crypto: [], stocks: [], funds: [] });
        oppCache.ts = Date.now();
        oppCache.data = json;
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
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

  return { data, loading, error };
}

/* ---------------- Market Leaders ---------------- */

function useMarketLeaders({ direction = "up", limit = 10 } = {}) {
  const [data, setData] = useState(() => (isFresh(leadersCache.ts) ? leadersCache.data : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      if (!isFresh(leadersCache.ts)) setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams({ market: "stocks", direction, limit: String(limit) });
        const json = await apiGetWithRetry(`/api/market/leaders?${qs}`, { signal: ac.signal });
        if (!alive) return;
        setData(json || null);
        leadersCache.ts = Date.now();
        leadersCache.data = json;
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
        setError(toError(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    const t = setInterval(run, 20_000);
    return () => {
      alive = false;
      ac.abort();
      clearInterval(t);
    };
  }, [direction, limit]);

  return { data, loading, error };
}

/* ---------------- Dashboard ---------------- */

export default function DashboardPage() {
  const { isAuthed, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [currentTicker, setCurrentTicker] = useState(loadLastTicker);
  const [timeframe, setTimeframe] = useState(null);

  const [errOpen, setErrOpen] = useState(false);
  const [errPayload, setErrPayload] = useState(null);

  const closeErr = () => {
    setErrOpen(false);
    setErrPayload(null);
  };

  const showErr = (uiErr) => {
    setErrPayload(uiErr);
    setErrOpen(true);
  };

  if (authLoading || !isAuthed) return null;

  useEffect(() => {
    try {
      localStorage.setItem(LAST_TICKER_KEY, currentTicker);
    } catch {}
  }, [currentTicker]);

  const [isDarkMode, setIsDarkMode] = useState(readIsDarkMode);

  useEffect(() => {
    const obs = new MutationObserver(() => setIsDarkMode(readIsDarkMode()));
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  const { bars, loading: alpacaLoading, error: alpacaError, meta: alpacaMeta } =
    useAlpacaDailyBars(currentTicker, 220);

  const historyBySymbol = useMemo(() => ({ [currentTicker]: bars || [] }), [bars, currentTicker]);

  const { data: tradePerfData, loading: tradePerfLoading, error: tradePerfError } =
    useAlpacaTradeSummary("Week", {});

  const tradeErrUI = tradePerfError ? explainAnyError(tradePerfError) : null;
  const barsErrUI = alpacaError ? explainAnyError(alpacaError) : null;

  const { data: oppData, loading: oppLoading, error: oppError } = useBotOpportunities();
  const oppErrUI = oppError ? explainAnyError(oppError) : null;

  const { data: leadersResp, loading: leadersLoading, error: leadersError } = useMarketLeaders();
  const leadersErrUI = leadersError ? explainAnyError(leadersError) : null;

  const leadersItems = useMemo(() => leadersResp?.items || [], [leadersResp]);

  return (
    <AppShell>
      <ErrorModal open={errOpen} error={errPayload} onClose={closeErr} />

      {/* ✅ NEW: centered lane wrapper so both columns share the same left/right gutters (desktop + mobile) */}
      <div className="dashboard-page-wrap">
        <main className="dashboard-main">
          <div className="dashboard-left">
            <TradePerformancePanel
              data={tradePerfData || { trades: [] }}
              opportunities={oppData}
              leaders={leadersItems}
              onPickSymbol={(s) => isTvSafe(s) && setCurrentTicker(normalizeSymbol(s))}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
            />

            {tradePerfLoading && <div className="muted">{COPY.loading.generic}</div>}
            {oppLoading && <div className="muted">{COPY.loading.generic}</div>}
            {leadersLoading && <div className="muted">{COPY.loading.leaders}</div>}

            {tradeErrUI && <ErrorBanner title={tradeErrUI.title} body={tradeErrUI.body} />}
            {oppErrUI && <ErrorBanner title={oppErrUI.title} body={oppErrUI.body} />}
            {leadersErrUI && <ErrorBanner title={leadersErrUI.title} body={leadersErrUI.body} />}
          </div>

          <div className="dashboard-right">
            <PriceChartPanel
              currentTicker={currentTicker}
              onSelectTicker={setCurrentTicker}
              isDarkMode={isDarkMode}
              timeframeLabel={timeframe?.label}
            />

            <section className="panel">
              {barsErrUI ? <ErrorBanner title={barsErrUI.title} body={barsErrUI.body} /> : null}

              <SentimentCard symbol={currentTicker} historyBySymbol={historyBySymbol} loading={alpacaLoading} />

              {alpacaMeta?.fetchedAt ? (
                <div className="muted">
                  {COPY.labels.alpacaFetchedPrefix} {new Date(alpacaMeta.fetchedAt).toLocaleString()}
                </div>
              ) : null}
            </section>

            <MarketLeadersCard
              items={leadersItems}
              loading={leadersLoading}
              onSelectSymbol={(s) => isTvSafe(s) && setCurrentTicker(normalizeSymbol(s))}
            />

            <MacroCard />
          </div>
        </main>
      </div>
    </AppShell>
  );
}
