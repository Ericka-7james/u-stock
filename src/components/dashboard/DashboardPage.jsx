// src/components/dashboard/DashboardPage.jsx
import { useMemo, useState } from "react";

import AppShell from "../layout/AppShell";
import StatSummary from "./StatSummary";
import PriceChart from "./PriceChart";

import { useSignalsSnapshot } from "../../hooks/raw/useSignalsSnapshot";
import { useDailyPricesHistory } from "../../hooks/raw/useDailyPricesHistory";
import { useSentimentSnapshot } from "../../hooks/raw/useSentimentSnapshot";

import "./DashboardPage.css";

import SentimentCard from "./SentimentCard";

const MAX_VISIBLE_OPTIONS = 300;

// --- Custom searchable dropdown just for tickers -----------------------------

function SearchableTickerDropdown({ allTickers, currentTicker, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filteredTickers = useMemo(() => {
    const universe = Array.isArray(allTickers) ? allTickers : [];
    if (!filter.trim()) return universe;

    const q = filter.trim().toUpperCase();
    return universe.filter((sym) => sym.toUpperCase().startsWith(q));
  }, [allTickers, filter]);

  const optionsTickers = useMemo(() => {
    const universe = filteredTickers;
    // When searching, don't inject the "current" ticker back at the top.
    // Just show the filtered list in sorted order.
    const list = [...universe];
    return list.slice(0, MAX_VISIBLE_OPTIONS);
  }, [filteredTickers]);

  const label = currentTicker || "Select…";

  const handleSelect = (sym) => {
    onChange(sym);
    setIsOpen(false);
    setFilter("");
  };

  return (
    <div className="chart-search-dropdown">
      {/* Fake "select" button – looks like the original dropdown */}
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

  /**
   * All tickers available for charting:
   *  - union of signal tickers and tickers in prices-raw.json
   */
  const allTickers = useMemo(() => {
    const fromSignals = signals.map((row) => row.ticker).filter(Boolean);
    const merged = new Set([...fromSignals, ...priceSymbols]);
    return Array.from(merged).sort();
  }, [signals, priceSymbols]);

  /**
   * Default ticker:
   * 1. First ranked signal
   * 2. Else first available price symbol
   */
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

  // Sentiment coverage: how many tickers have any sentiment row
  const sentimentUniverseSize = useMemo(() => {
    if (Array.isArray(sentimentMeta?.universe)) {
      return sentimentMeta.universe.length;
    }
    if (Array.isArray(sentimentData)) {
      const set = new Set(
        sentimentData.map((row) => row.ticker).filter(Boolean)
      );
      return set.size;
    }
    return 0;
  }, [sentimentMeta, sentimentData]);

  const sentimentLastUpdated = sentimentMeta?.generatedAt
    ? new Date(sentimentMeta.generatedAt)
    : null;

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
        {/* LEFT column: filters + top signals */}
        <section className="panel panel-filters">
          {/* Top signals table */}
          <div className="filters-card filters-card--index">
            <div className="filters-card-header">
              <h3 className="panel-title">Top signals (today)</h3>
            </div>

            {combinedLoading ? (
              <p className="muted">Loading signals…</p>
            ) : topFiveSignals.length === 0 ? (
              <p className="muted">
                No signals available. Run your fetchers + indicator scripts.
              </p>
            ) : (
              <>
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Score</th>
                      <th>1d</th>
                      <th>Intraday</th>
                      <th>5d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topFiveSignals.map((row) => {
                      const daily = row.components?.daily ?? {};
                      const intraday = row.components?.intraday ?? {};
                      const multiday = row.components?.multiday ?? {};

                      return (
                        <tr
                          key={row.ticker}
                          className={
                            row.ticker === currentTicker
                              ? "mini-table-row--active"
                              : ""
                          }
                          onClick={() => setSelectedTicker(row.ticker)}
                        >
                          <td>{row.ticker}</td>
                          <td>{row.score?.toFixed(2) ?? "—"}</td>
                          <td>
                            {daily.close_return_1d != null
                              ? (daily.close_return_1d * 100).toFixed(1) + "%"
                              : "—"}
                          </td>
                          <td>
                            {intraday.intraday_return != null
                              ? (intraday.intraday_return * 100).toFixed(1) +
                                "%"
                              : "—"}
                          </td>
                          <td>
                            {multiday.return_5d != null
                              ? (multiday.return_5d * 100).toFixed(1) + "%"
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {signalsMeta?.rankingDescription && (
                  <p className="mini-table-caption muted">
                    {signalsMeta.rankingDescription}
                  </p>
                )}
              </>
            )}
          </div>

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

        {/* RIGHT column: price chart + sentiment card */}
        <section className="panel panel-chart">
          <div className="card-main-chart">
            <div className="card-header">
              <div>
                <h2>Price action viewer</h2>
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

        <section>
            <SentimentCard
              symbol={currentTicker}
              historyBySymbol={historyBySymbol}
              loading={pricesLoading}
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
