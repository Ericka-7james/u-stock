// src/components/dashboard/DashboardPage.jsx
import { useMemo, useState, useRef, useEffect } from "react";

import AppShell from "../layout/AppShell";
import StatSummary from "./cards/StatSummary.jsx";
import PriceChart from "./cards/PriceChart.jsx";
import SentimentCard from "./cards/SentimentCard.jsx";

import TopSignalsCard from "./cards/TopSignalsCard";

import { useSignalsSnapshot } from "../../hooks/raw/useSignalsSnapshot";
import { useDailyPricesHistory } from "../../hooks/raw/useDailyPricesHistory";
import { useSentimentSnapshot } from "../../hooks/raw/useSentimentSnapshot";

import "./DashboardPage.css";
import "./cards/ChartControls.css";
import "./cards/CardShared.css";

import HelpTooltip from '../common/HelpTooltip'

const MAX_VISIBLE_OPTIONS = 300;

// --- Custom searchable dropdown just for tickers -----------------------------

function SearchableTickerDropdown({ allTickers, currentTicker, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const dropdownRef = useRef(null);

  // Close dropdown when clicking anywhere outside it
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  const filteredTickers = useMemo(() => {
    const universe = Array.isArray(allTickers) ? allTickers : [];
    if (!filter.trim()) return universe;

    const q = filter.trim().toUpperCase();
    return universe.filter((sym) => sym.toUpperCase().startsWith(q));
  }, [allTickers, filter]);

  const optionsTickers = useMemo(() => {
    const list = [...filteredTickers];
    return list.slice(0, MAX_VISIBLE_OPTIONS);
  }, [filteredTickers]);

  const label = currentTicker || "Select…";

  const handleSelect = (sym) => {
    onChange(sym);
    setIsOpen(false);
    setFilter("");
  };

  return (
    <div className="chart-search-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="chart-select chart-select--button"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="chart-select-label">{label}</span>
        <span className="chart-select-caret">▾</span>
      </button>

      {isOpen && (
        <div className="chart-select-menu">
          <input
            autoFocus
            className="chart-search-input"
            placeholder="Type to filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          <ul className="chart-select-options">
            {optionsTickers.length === 0 ? (
              <li className="chart-select-option chart-select-option--empty">
                No matches
              </li>
            ) : (
              optionsTickers.map((sym) => (
                <li
                  key={sym}
                  className={
                    "chart-select-option" +
                    (sym === currentTicker
                      ? " chart-select-option--active"
                      : "")
                  }
                  onClick={() => handleSelect(sym)}
                >
                  {sym}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Main dashboard ----------------------------------------------------------

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
  const [showPriceHelp, setShowPriceHelp] = useState(false);

  // All tickers available for charting
  const allTickers = useMemo(() => {
    const fromSignals = signals.map((row) => row.ticker).filter(Boolean);
    const merged = new Set([...fromSignals, ...priceSymbols]);
    return Array.from(merged).sort();
  }, [signals, priceSymbols]);

  // Default ticker
  const defaultTicker = useMemo(() => {
    if (signals.length > 0) return signals[0].ticker;
    if (priceSymbols.length > 0) return priceSymbols[0];
    return "";
  }, [signals, priceSymbols]);

  // The actual ticker to use in UI
  const currentTicker = selectedTicker || defaultTicker;

  const currentSeries = useMemo(() => {
    if (!currentTicker) return [];
    return historyBySymbol[currentTicker] || [];
  }, [historyBySymbol, currentTicker]);

  const combinedLoading = signalsLoading || pricesLoading;

  const topFiveSignals = useMemo(() => {
    if (!signals || signals.length === 0) return [];
    return signals.slice(0, 5);
  }, [signals]);

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
        <section className="panel panel-chart">
          <div className="card-main-chart">
            <div className="card-header">
              <div className="card-header-left">
                <div className="card-title-row">
                  <h2 className="card-title-text">Price action viewer</h2>
                  <HelpTooltip title="What is the Price action viewer?">
                    <p>
                      This chart shows the daily close price for the selected ticker based on
                      your <code>prices-raw.json</code> snapshot.
                    </p>
                    <ul>
                      <li>
                        <strong>X-axis:</strong> trading days from your latest snapshot window.
                      </li>
                      <li>
                        <strong>Y-axis:</strong> adjusted close price.
                      </li>
                      <li>
                        Use the ticker dropdown to switch symbols. Data refresh times appear in
                        the dashboard header.
                      </li>
                    </ul>
                    <p className="help-popover__note">
                      This is a visualization of historical prices only and is not investment
                      advice.
                    </p>
                  </HelpTooltip>
                </div>
                <p className="card-subtitle">
                  Select a ticker or type to filter the universe.
                </p>
              </div>

              <div className="chart-controls">
                <label className="chart-controls-label">
                  Ticker
                  <SearchableTickerDropdown
                    allTickers={allTickers}
                    currentTicker={currentTicker}
                    onChange={setSelectedTicker}
                  />
                </label>
              </div>
            </div>

            {/* Chart body */}
            <PriceChart
              ticker={currentTicker}
              data={currentSeries}
              loading={combinedLoading}
              pricesMeta={pricesMeta}
            />
          </div>
        </section>

        {/* SENTIMENT panel – directly under chart */}
        <section className="panel panel-sentiment">
          <SentimentCard
            symbol={currentTicker}
            historyBySymbol={historyBySymbol}
            loading={combinedLoading || sentimentLoading}
            backendSnapshot={currentSentimentRow}
          />
        </section>

        <section className="panel panel-filters">
          <TopSignalsCard
            signals={signals}
            signalsMeta={signalsMeta}
            currentTicker={currentTicker}
            onSelectTicker={setSelectedTicker}
            loading={combinedLoading}
          />

          {/* Snapshot info card */}
          <div className="filters-card filters-card--macro">
            <div className="filters-card-header">
              <h3 className="panel-title">Data snapshots</h3>
            </div>

            <ul className="muted mini-list">
              <li>
                <strong>Signals:</strong>{" "}
                {signalsMeta?.generatedAt
                  ? new Date(signalsMeta.generatedAt).toLocaleString()
                  : "—"}
              </li>
              <li>
                <strong>Prices:</strong>{" "}
                {pricesMeta?.generatedAt
                  ? new Date(pricesMeta.generatedAt).toLocaleString()
                  : "—"}
              </li>
              <li>
                <strong>Universe size (prices):</strong>{" "}
                {Array.isArray(pricesMeta?.universe)
                  ? pricesMeta.universe.length
                  : Array.isArray(priceSymbols)
                  ? priceSymbols.length
                  : "---"}
              </li>
            </ul>
          </div>
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
