// frontend/src/components/dashboard/DashboardPage.jsx
import { useEffect, useMemo, useState } from "react";
import AppShell from "../layout/AppShell.jsx";

import PriceChartPanel from "./cards/PriceChartPanel.jsx";
import SentimentCard from "./cards/SentimentCard.jsx";
import TradePerformancePanel from "./cards/TradePerformancePanel.jsx";
import TopSignalsCard from "./cards/TopSignalsCard.jsx";

import { useAlpacaDailyBars } from "../../hooks/useAlpacaDailyBars.js";
import { useAlpacaTradeSummary } from "../../hooks/useAlpacaTradeSummary.js";
import { explainAnyError } from "../common/errorMessages.js";

// Styles
import "../../css/dashboard/DashboardPage.css";
import "../../css/dashboard/cards/ChartControls.css";
import "../../css/dashboard/cards/CardShared.css";

const LAST_TICKER_KEY = "ustock:last_ticker";

/**
 * Minimal fetch helper:
 * - Works locally with Vite proxy (/api -> backend)
 * - Works in production when frontend and backend are same origin
 * - Includes cookies for auth routes
 */
async function apiGet(path, { signal } = {}) {
  const res = await fetch(path, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.detail ||
      json?.error ||
      `Request failed (${res.status})`;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

function readIsDarkMode() {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  const body = document.body;

  const classDark =
    root?.classList?.contains("dark") || body?.classList?.contains("dark");
  const dataThemeDark =
    root?.getAttribute?.("data-theme") === "dark" ||
    body?.getAttribute?.("data-theme") === "dark";
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

function ErrorBanner({ title, body, debug }) {
  return (
    <div className="errorBanner" style={{ whiteSpace: "pre-wrap" }}>
      <strong>{title}</strong>
      <div style={{ marginTop: 6 }}>{body}</div>

      {import.meta.env.DEV && debug ? (
        <details style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          <summary>Debug info</summary>
          <pre style={{ overflowX: "auto" }}>{JSON.stringify(debug, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Top signals loader
 * Scalable: backend can change the source without breaking UI.
 *
 * Expected response shapes supported:
 * 1) { ok:true, signals:[...], meta:{...} }
 * 2) { ok:true, top_signals:[...], signals_meta:{...} }
 * 3) Fallback /api/opportunities: { symbols:[...], ... }  -> we show empty (since that's not ranked signals)
 */
function useTopSignals() {
  const [signals, setSignals] = useState([]);
  const [signalsMeta, setSignalsMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      setLoading(true);
      setError("");

      try {
        // Recommended endpoint (add later in backend if you want clean separation)
        // If it 404s, fall back.
        let json;
        try {
          json = await apiGet("/api/opportunities/signals/top", { signal: ac.signal });
        } catch (e) {
          if (e?.status === 404) {
            json = await apiGet("/api/opportunities", { signal: ac.signal });
          } else {
            throw e;
          }
        }

        if (!alive) return;

        const nextSignals =
          json?.signals ||
          json?.top_signals ||
          [];

        const nextMeta =
          json?.meta ||
          json?.signals_meta ||
          null;

        // If fallback is /api/opportunities and returns only symbols,
        // signals will be [] and TopSignalsCard will show its empty message.
        setSignals(Array.isArray(nextSignals) ? nextSignals : []);
        setSignalsMeta(nextMeta);
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
        setSignals([]);
        setSignalsMeta(null);
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

  return { signals, signalsMeta, loading, error };
}

export default function DashboardPage() {
  const [currentTicker, setCurrentTicker] = useState(() => loadLastTicker());

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

  // TradingView -> update ticker
  useEffect(() => {
    const handler = (e) => {
      const origin = String(e.origin || "");
      if (!origin.includes("tradingview.com")) return;

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
        msg?.data?.short_name ||
        msg?.data?.original_name ||
        msg?.data?.ticker ||
        msg?.data?.symbol ||
        "";

      const next = normalizeSymbol(raw);
      if (!next) return;

      setCurrentTicker((prev) => (prev === next ? prev : next));
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const { bars: alpacaBars, loading: alpacaLoading, error: alpacaError, meta: alpacaMeta } =
    useAlpacaDailyBars(currentTicker, 220);

  const alpacaHistoryBySymbol = useMemo(
    () => ({ [currentTicker]: alpacaBars || [] }),
    [currentTicker, alpacaBars]
  );

  const [tradePreset, setTradePreset] = useState("Week");
  const { data: tradePerfData, loading: tradePerfLoading, error: tradePerfError } =
    useAlpacaTradeSummary(tradePreset, { slippageBps: 0, feeBps: 0 });

  const tradeErrUI = tradePerfError ? explainAnyError(tradePerfError, { feature: "trade_summary" }) : null;
  const barsErrUI = alpacaError ? explainAnyError(alpacaError, { feature: "daily_bars" }) : null;

  const { signals, signalsMeta, loading: signalsLoading, error: signalsError } = useTopSignals();
  const signalsErrUI = signalsError ? explainAnyError(signalsError, { feature: "top_signals" }) : null;

  return (
    <AppShell>
      <main className="dashboard-main">
        <div className="dashboard-left">
          {tradeErrUI ? <ErrorBanner title={tradeErrUI.title} body={tradeErrUI.body} debug={tradeErrUI.debug} /> : null}

          <TradePerformancePanel
            data={tradePerfData || { start: "—", end: "—", trades: [] }}
            onChangeRange={(preset) => setTradePreset(preset)}
          />

          {tradePerfLoading ? (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Loading trade performance…</div>
          ) : null}

          {signalsErrUI ? (
            <ErrorBanner title={signalsErrUI.title} body={signalsErrUI.body} debug={signalsErrUI.debug} />
          ) : null}

          <TopSignalsCard
            signals={signals}
            signalsMeta={signalsMeta}
            currentTicker={currentTicker}
            onSelectTicker={(t) => {
              const clean = normalizeSymbol(t);
              if (clean) setCurrentTicker(clean);
            }}
            loading={signalsLoading}
          />
        </div>

        <div className="dashboard-right">
          <PriceChartPanel
            currentTicker={currentTicker}
            onSelectTicker={(next) => {
              const clean = normalizeSymbol(next);
              if (clean) setCurrentTicker(clean);
            }}
            isDarkMode={isDarkMode}
          />

          <section className="panel panel-sentiment">
            {barsErrUI ? <ErrorBanner title={barsErrUI.title} body={barsErrUI.body} debug={barsErrUI.debug} /> : null}

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
        </div>
      </main>
    </AppShell>
  );
}
