// src/components/dashboard/DashboardPage.jsx
import { useEffect, useMemo, useState } from "react";
import AppShell from "../layout/AppShell.jsx";

import PriceChartPanel from "./cards/PriceChartPanel.jsx";
import SentimentCard from "./cards/SentimentCard.jsx";
import TradePerformancePanel from "./cards/TradePerformancePanel.jsx";

import { useAlpacaDailyBars } from "../../hooks/useAlpacaDailyBars.js";

// Styles
import "../../css/dashboard/DashboardPage.css";
import "../../css/dashboard/cards/ChartControls.css";
import "../../css/dashboard/cards/CardShared.css";

const LAST_TICKER_KEY = "ustock:last_ticker";

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

/**
 * ✅ TEMP: stub summary (so the panel renders now)
 * Later we will replace this with Alpaca paper fills / DB summary.
 */
function makeStubTradeSummary() {
  return {
    start: "Jan 3, 2022",
    end: "Jan 7, 2022",
    trades: [
      { symbol: "AAPL", pnl: 4.5, strategy: "breakout", openedAt: "2022-01-03T10:00:00Z", closedAt: "2022-01-03T15:30:00Z" },
      { symbol: "TSLA", pnl: -2.88, strategy: "mean_reversion", openedAt: "2022-01-04T10:00:00Z", closedAt: "2022-01-04T13:00:00Z" },
      { symbol: "AMD", pnl: 3.79, strategy: "breakout", openedAt: "2022-01-05T11:10:00Z", closedAt: "2022-01-05T15:55:00Z" },
      { symbol: "SPY", pnl: 3.12, strategy: "trend", openedAt: "2022-01-06T10:05:00Z", closedAt: "2022-01-06T12:45:00Z" },
      { symbol: "UAA", pnl: 3.12, strategy: "trend", openedAt: "2022-01-07T09:40:00Z", closedAt: "2022-01-07T11:10:00Z" },
      { symbol: "EBAY", pnl: -2.88, strategy: "mean_reversion", openedAt: "2022-01-05T13:20:00Z", closedAt: "2022-01-05T14:10:00Z" },
      { symbol: "TWTR", pnl: -2.53, strategy: "news", openedAt: "2022-01-06T13:00:00Z", closedAt: "2022-01-06T15:10:00Z" },
      { symbol: "M", pnl: -2.53, strategy: "news", openedAt: "2022-01-07T12:05:00Z", closedAt: "2022-01-07T14:25:00Z" },
    ],
  };
}

export default function DashboardPage() {
  console.log("✅ DashboardPage LOADED", new Date().toISOString());

  const [currentTicker, setCurrentTicker] = useState(() => loadLastTicker());

  useEffect(() => {
    try {
      if (currentTicker) localStorage.setItem(LAST_TICKER_KEY, currentTicker);
    } catch {}
  }, [currentTicker]);

  useEffect(() => {
    console.log("📌 Dashboard currentTicker changed =>", currentTicker);
  }, [currentTicker]);

  const [isDarkMode, setIsDarkMode] = useState(() => readIsDarkMode());

  useEffect(() => {
    if (typeof document === "undefined") return;

    const update = () => setIsDarkMode(readIsDarkMode());

    update();

    const obs = new MutationObserver(() => update());
    const root = document.documentElement;
    const body = document.body;

    if (root)
      obs.observe(root, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
    if (body)
      obs.observe(body, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    console.log("✅ TradingView message listener ATTACHED");

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

      setCurrentTicker((prev) => {
        if (prev === next) return prev;
        console.log("✅ TradingView detected ticker =>", next);
        return next;
      });
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Alpaca-backed daily history
  const {
    bars: alpacaBars,
    loading: alpacaLoading,
    error: alpacaError,
    meta: alpacaMeta,
  } = useAlpacaDailyBars(currentTicker, 220);

  const alpacaHistoryBySymbol = useMemo(() => {
    return { [currentTicker]: alpacaBars || [] };
  }, [currentTicker, alpacaBars]);

  const [tradePreset, setTradePreset] = useState("Week");

  const tradePerfData = useMemo(() => {
    const d = makeStubTradeSummary();
    return { ...d, preset: tradePreset };
  }, [tradePreset]);

  return (
    <AppShell>
      <main className="dashboard-main">
        {/* LEFT COLUMN: trade cards only */}
        <div className="dashboard-left">
          <TradePerformancePanel
            data={tradePerfData}
            onChangeRange={(preset) => {
              console.log("📊 TradePerformance range =>", preset);
              setTradePreset(preset);
            }}
          />
        </div>

        {/* RIGHT COLUMN: PriceChart THEN Sentiment (always this order) */}
        <div className="dashboard-right">
          <PriceChartPanel
            currentTicker={currentTicker}
            onSelectTicker={(next) => {
              const clean = normalizeSymbol(next);
              if (!clean) return;
              console.log("📥 Chart requested ticker =>", clean);
              setCurrentTicker(clean);
            }}
            isDarkMode={isDarkMode}
          />

          <section className="panel panel-sentiment">
            {alpacaError ? (
              <div className="errorBanner">
                Alpaca daily bars failed: {alpacaError}
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                  Tip: Make sure you’re signed in and Alpaca keys are saved in
                  Connected Apps.
                </div>
              </div>
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
        </div>
      </main>
    </AppShell>
  );
}
