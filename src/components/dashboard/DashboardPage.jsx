// src/components/dashboard/DashboardPage.jsx
import { useEffect, useMemo, useState } from "react";
import AppShell from "../layout/AppShell.jsx";

import PriceChartPanel from "./cards/PriceChartPanel.jsx";
import SentimentCard from "./cards/SentimentCard.jsx";

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

export default function DashboardPage() {
  console.log("✅ DashboardPage LOADED", new Date().toISOString());

  const [currentTicker, setCurrentTicker] = useState(() => loadLastTicker());

  // persist ticker
  useEffect(() => {
    try {
      if (currentTicker) localStorage.setItem(LAST_TICKER_KEY, currentTicker);
    } catch {}
  }, [currentTicker]);

  // debug when ticker changes
  useEffect(() => {
    console.log("📌 Dashboard currentTicker changed =>", currentTicker);
  }, [currentTicker]);

  // Reactive dark mode state
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

  /**
   * ✅ TradingView FREE embed symbol detection (postMessage)
   * This is the only reliable method for the free widget.
   */
  useEffect(() => {
    console.log("✅ TradingView message listener ATTACHED");

    const handler = (e) => {
      const origin = String(e.origin || "");
      // be flexible: TradingView can come from s.tradingview.com, www.tradingview.com, etc.
      if (!origin.includes("tradingview.com")) return;

      let msg = e.data;

      // sometimes messages arrive as JSON strings
      if (typeof msg === "string") {
        try {
          msg = JSON.parse(msg);
        } catch {
          // ignore non-JSON strings
          return;
        }
      }

      if (!msg || typeof msg !== "object") return;

      // Debug: log ANY TradingView messages (comment out later)
      // console.log("TV raw message:", origin, msg);

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

  return (
    <AppShell>
      <main className="dashboard-main">
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
                Tip: Make sure you’re signed in and Alpaca keys are saved in Connected Apps.
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

        {/* your other panels unchanged */}
      </main>
    </AppShell>
  );
}
