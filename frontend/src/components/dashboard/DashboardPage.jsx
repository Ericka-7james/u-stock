// frontend/src/components/dashboard/DashboardPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../layout/AppShell.jsx";

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

const leadersCache = {
  ts: 0,
  items: [],
  meta: { source: "alpaca_movers" },
};

const oppCache = {
  ts: 0,
  data: { crypto: [], stocks: [], funds: [] },
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
    // one quick retry
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

/** Market Leaders */
function useMarketLeaders() {
  const [items, setItems] = useState(() => (isFresh(leadersCache.ts) ? leadersCache.items : []));
  const [meta, setMeta] = useState(() => (isFresh(leadersCache.ts) ? leadersCache.meta : { source: "alpaca_movers" }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // Error | null

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      // show loading only if we don't already have fresh data
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
          source: json?.source || { code: "alpaca_movers", label: "Alpaca market movers (today)" },
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

        const err = toError(e);
        setError(err);

        // keep cached/previous items if we have them; do not hard wipe unless none
        if (!Array.isArray(items) || items.length === 0) setItems([]);
        setMeta((m) => m || { source: "alpaca_movers" });
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

  return { items, meta, loading, error };
}

/** Bot Opportunities (internal) */
function useBotOpportunities() {
  const [data, setData] = useState(() => (isFresh(oppCache.ts) ? oppCache.data : { crypto: [], stocks: [], funds: [] }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // Error | null

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

        // keep cached/previous data if present
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

export default function DashboardPage() {
  const navigate = useNavigate();

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

  const { items: leaders, meta: leadersMeta, loading: leadersLoading, error: leadersError } = useMarketLeaders();
  const leadersErrUI = leadersError ? explainAnyError(leadersError, { feature: "market_leaders" }) : null;

  const { data: oppData, loading: oppLoading, error: oppError } = useBotOpportunities();
  const oppErrUI = oppError ? explainAnyError(oppError, { feature: "bot_opportunities" }) : null;

  // ✅ stub for now — later we’ll wire this to runner telemetry
  const activeBot = { running: false, name: "" };

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
            onChangeRange={(preset) => setTradePreset(preset)}
            opportunities={oppData}
            leaders={leaders}
            activeBot={activeBot}
            onPickSymbol={(sym) => {
              const clean = normalizeSymbol(sym);
              if (!clean) return;
              if (!isTvSafe(clean)) return;
              setCurrentTicker(clean);
            }}
          />

          {tradePerfLoading ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Loading…</div> : null}
          {oppLoading ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Loading…</div> : null}
          {leadersLoading ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Loading…</div> : null}

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

          <MarketLeadersCard
            title="Market leaders"
            subtitle="Top movers from Alpaca (today). Click one to load the chart."
            items={leaders}
            meta={leadersMeta}
            loading={leadersLoading}
            onSelectSymbol={(sym) => {
              const clean = normalizeSymbol(sym);
              if (!clean) return;
              if (!isTvSafe(clean)) return; // blocks VLN.WS, BRK.B, etc.
              setCurrentTicker(clean);
            }}
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

            <div style={{ marginTop: 12 }}>
              <MacroCard />
            </div>

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
