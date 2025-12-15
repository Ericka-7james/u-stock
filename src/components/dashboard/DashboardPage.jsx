// src/components/dashboard/DashboardPage.jsx
import { useMemo, useState } from "react";

import AppShell from "../layout/AppShell.jsx";

// Dashboard cards
import StatSummary from "./cards/StatSummary.jsx";
import PriceChartPanel from "./cards/PriceChartPanel.jsx";
import SentimentCard from "./cards/SentimentCard.jsx";
import TopSignalsCard from "./cards/TopSignalsCard.jsx";
import DataSnapshotsCard from "./cards/DataSnapshotsCard.jsx";

// Data hooks
import { useSignalsSnapshot } from "../../hooks/raw/useSignalsSnapshot.js";
import { useDailyPricesHistory } from "../../hooks/raw/useDailyPricesHistory.js";
import { useSentimentSnapshot } from "../../hooks/raw/useSentimentSnapshot.js";

// Styles
import "../../css/dashboard/DashboardPage.css";
import "../../css/dashboard/cards/ChartControls.css";
import "../../css/dashboard/cards/CardShared.css";

export default function DashboardPage() {
  // Ranked signals from your Python signal_engine
  const {
    data: signals = [],
    meta: signalsMeta,
    loading: signalsLoading,
  } = useSignalsSnapshot();

  // Daily OHLCV history (from prices-raw.json)
  const {
    historyBySymbol = {},
    symbols: priceSymbols = [],
    meta: pricesMeta,
    loading: pricesLoading,
  } = useDailyPricesHistory();

  // Slim per-ticker sentiment snapshot
  const {
    data: sentimentData = [],
    meta: sentimentMeta,
    loading: sentimentLoading,
  } = useSentimentSnapshot();

  const [selectedTicker, setSelectedTicker] = useState("");

  // All tickers available for charting
  const allTickers = useMemo(() => {
    const fromSignals = signals.map((row) => row.ticker).filter(Boolean);
    const merged = new Set([...fromSignals, ...priceSymbols]);
    return Array.from(merged).sort();
  }, [signals, priceSymbols]);

  // Default ticker: first ranked signal, else first price symbol
  const defaultTicker = useMemo(() => {
    if (signals.length > 0) return signals[0].ticker;
    if (priceSymbols.length > 0) return priceSymbols[0];
    return "";
  }, [signals, priceSymbols]);

  // The actual ticker to use in UI
  const currentTicker = selectedTicker || defaultTicker;

  // Current OHLCV series for price chart
  const currentSeries = useMemo(() => {
    if (!currentTicker) return [];
    return historyBySymbol[currentTicker] || [];
  }, [historyBySymbol, currentTicker]);

  const combinedLoading = signalsLoading || pricesLoading;

  // Latest data refresh across signals + prices (for footer)
  const lastUpdated = useMemo(() => {
    const times = [];
    if (signalsMeta?.generatedAt) {
      times.push(new Date(signalsMeta.generatedAt));
    }
    if (pricesMeta?.generatedAt) {
      times.push(new Date(pricesMeta.generatedAt));
    }
    if (times.length === 0) return null;
    return new Date(Math.max(...times.map((t) => t.getTime())));
  }, [signalsMeta, pricesMeta]);

  // Current sentiment row for selected ticker
  const currentSentimentRow = useMemo(() => {
    if (!currentTicker || !Array.isArray(sentimentData)) return null;
    return sentimentData.find((row) => row.ticker === currentTicker) || null;
  }, [currentTicker, sentimentData]);

  return (
    <AppShell>
      {/* Top stats row */}
      <StatSummary
        signalsMeta={signalsMeta}
        signalsData={signals}
        pricesMeta={pricesMeta}
        priceSymbols={priceSymbols}
      />

      <main className="dashboard-main">
        {/* PRICE CHART panel */}
        <PriceChartPanel
          allTickers={allTickers}
          currentTicker={currentTicker}
          onSelectTicker={setSelectedTicker}
          currentSeries={currentSeries}
          loading={combinedLoading}
          pricesMeta={pricesMeta}
        />

        {/* SENTIMENT panel – directly under chart */}
        <section className="panel panel-sentiment">
          <SentimentCard
            symbol={currentTicker}
            historyBySymbol={historyBySymbol}
            loading={combinedLoading || sentimentLoading}
            backendSnapshot={currentSentimentRow}
          />
        </section>

        {/* Filters + snapshots panel */}
        <section className="panel panel-filters">
          <TopSignalsCard
            signals={signals}
            signalsMeta={signalsMeta}
            currentTicker={currentTicker}
            onSelectTicker={setSelectedTicker}
            loading={combinedLoading}
          />

          <DataSnapshotsCard
            signalsMeta={signalsMeta}
            pricesMeta={pricesMeta}
            priceSymbols={priceSymbols}
          />
        </section>
      </main>

      {lastUpdated && (
        <div className="dashboard-last-updated">
          Last updated: {lastUpdated.toLocaleString()}
        </div>
      )}
    </AppShell>
  );
}
