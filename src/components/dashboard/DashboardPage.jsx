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

function readIsDarkMode() {
  if (typeof document === "undefined") return false;

  // Support the most common theme patterns:
  // 1) <html class="dark">
  // 2) <body class="dark">
  // 3) <html data-theme="dark"> or <body data-theme="dark">
  const root = document.documentElement;
  const body = document.body;

  const classDark =
    root?.classList?.contains("dark") || body?.classList?.contains("dark");

  const dataThemeDark =
    root?.getAttribute?.("data-theme") === "dark" ||
    body?.getAttribute?.("data-theme") === "dark";

  return Boolean(classDark || dataThemeDark);
}

export default function DashboardPage() {
  const [currentTicker, setCurrentTicker] = useState("AAPL");

  // ✅ Reactive dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => readIsDarkMode());

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const body = document.body;

    const update = () => setIsDarkMode(readIsDarkMode());

    // Run once on mount (in case theme is set after initial render)
    update();

    // Observe class/data-theme changes (most theme toggles do this)
    const obs = new MutationObserver(() => update());

    if (root) {
      obs.observe(root, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
    }
    if (body) {
      obs.observe(body, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
    }

    return () => obs.disconnect();
  }, []);

  // ✅ Alpaca-backed daily history for SentimentCard fallback computation
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
        {/* 1) CHART (TradingView owns symbol search) */}
        <PriceChartPanel
          currentTicker={currentTicker}
          onSelectTicker={setCurrentTicker}
          isDarkMode={isDarkMode}
        />

        {/* 2) SENTIMENT (Alpaca history) */}
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

        {/* 3) BOT-FIRST PANELS (placeholders) */}
        <section className="panel panel-filters" style={{ display: "grid", gap: 12 }}>
          <div className="card">
            <div className="cardHeader">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <h2 style={{ margin: 0 }}>Bot status</h2>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Coming next</span>
              </div>
            </div>
            <div className="cardBody" style={{ fontSize: 13, opacity: 0.85 }}>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Running / Paused</li>
                <li>Paper vs Live</li>
                <li>Current strategy + risk mode</li>
                <li>Last decision + confidence</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <h2 style={{ margin: 0 }}>Positions & Orders</h2>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Coming next</span>
              </div>
            </div>
            <div className="cardBody" style={{ fontSize: 13, opacity: 0.85 }}>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Open positions + unrealized P/L</li>
                <li>Open orders (limit/stop) + statuses</li>
                <li>Exposure summary</li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <h2 style={{ margin: 0 }}>Predictions & Reasoning log</h2>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Coming next</span>
              </div>
            </div>
            <div className="cardBody" style={{ fontSize: 13, opacity: 0.85 }}>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Timestamp + ticker</li>
                <li>Action (buy/sell/hold) + confidence</li>
                <li>Reasoning summary</li>
                <li>Outcome tracking</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
