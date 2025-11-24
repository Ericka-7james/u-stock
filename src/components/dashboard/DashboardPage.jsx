// src/components/dashboard/DashboardPage.jsx
import { useEffect, useMemo, useState } from "react";

import AppShell from "../layout/AppShell";
import StatSummary from "./StatSummary";
import PriceChart from "./PriceChart";

import { useSignalsSnapshot } from "../../hooks/raw/useSignalsSnapshot";
import { useDailyPricesHistory } from "../../hooks/raw/useDailyPricesHistory";

import "./DashboardPage.css";

export default function DashboardPage() {
  // Ranked signals from your Python signal_engine
  const {
    data: signals,
    meta: signalsMeta,
    loading: signalsLoading,
  } = useSignalsSnapshot();

  // Daily OHLCV history (from prices-raw.json)
  const {
    historyBySymbol,
    symbols: priceSymbols,
    meta: pricesMeta,
    loading: pricesLoading,
  } = useDailyPricesHistory();

  const [selectedTicker, setSelectedTicker] = useState("");

  // Default ticker = top-ranked from signals, or first in priceSymbols
  useEffect(() => {
    if (!selectedTicker) {
      if (signals && signals.length > 0) {
        setSelectedTicker(signals[0].ticker);
      } else if (priceSymbols && priceSymbols.length > 0) {
        setSelectedTicker(priceSymbols[0]);
      }
    }
  }, [selectedTicker, signals, priceSymbols]);

  const currentSeries = useMemo(() => {
    if (!selectedTicker) return [];
    return historyBySymbol[selectedTicker] || [];
  }, [historyBySymbol, selectedTicker]);

  const combinedLoading = signalsLoading || pricesLoading;

  const topFiveSignals = useMemo(() => {
    if (!signals || signals.length === 0) return [];
    return signals.slice(0, 5);
  }, [signals]);

  return (
    <AppShell>
      <div className="dashboard">
        {/* Top stats row – now uses your own signals/prices */}
        <StatSummary
          signalsMeta={signalsMeta}
          signalsData={signals}
          pricesMeta={pricesMeta}
        />

        <main className="dashboard-main">
          {/* LEFT column – about + top signals */}
          <section className="panel panel-filters">
            {/* About card */}
            <div className="filters-card filters-card--filters">
              <h3 className="panel-title">About this dashboard</h3>
              <p className="muted">
                This is a personal prototype of my u-Stock day-trading
                intelligence bot. The backend Python pipeline fetches real
                market data (prices, intraday bars, and fundamentals), computes
                multi-horizon indicators, and ranks tickers by a combined
                &quot;in-play&quot; score. This page visualizes the latest
                snapshot.
              </p>
              <p className="muted">
                Under the hood: Python, pandas, yahooquery, Parquet storage,
                and a React + Vite frontend.
              </p>
            </div>

            {/* Top signals table */}
            <div className="filters-card filters-card--index">
              <div className="filters-card-header">
                <h3 className="panel-title">Top signals (today)</h3>
              </div>

              {combinedLoading ? (
                <p className="muted">Loading signals…</p>
              ) : topFiveSignals.length === 0 ? (
                <p className="muted">
                  No signals available. Run your fetchers and indicator scripts
                  to generate a new snapshot.
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
                              row.ticker === selectedTicker
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
                    ? new Date(
                        signalsMeta.generatedAt,
                      ).toLocaleString()
                    : "—"}
                </li>
                <li>
                  <strong>Prices:</strong>{" "}
                  {pricesMeta?.generatedAt
                    ? new Date(
                        pricesMeta.generatedAt,
                      ).toLocaleString()
                    : "—"}
                </li>
                <li>
                  <strong>Universe size:</strong>{" "}
                  {signalsMeta?.universe?.length ?? "---"}
                </li>
              </ul>
            </div>
          </section>

          {/* RIGHT column – price chart + ticker selector */}
          <section className="panel panel-chart">
            <div className="card-main-chart">
              <div className="card-header">
                <div>
                  <h2>Price action viewer</h2>
                  <p className="card-subtitle">
                    Select a ticker to see recent daily price action,
                    powered by your u-Stock data-bot fetchers.
                  </p>
                </div>

                <div className="chart-controls">
                  <label className="chart-controls-label">
                    Ticker
                    <select
                      className="chart-select"
                      value={selectedTicker || ""}
                      onChange={(e) => setSelectedTicker(e.target.value)}
                    >
                      <option value="" disabled>
                        Select…
                      </option>
                      {signals.map((row) => (
                        <option key={row.ticker} value={row.ticker}>
                          {row.ticker}
                        </option>
                      ))}
                      {/* fallback: if for some reason signals are empty but prices exist */}
                      {signals.length === 0 &&
                        priceSymbols.map((sym) => (
                          <option key={sym} value={sym}>
                            {sym}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>

              <PriceChart
                ticker={selectedTicker}
                data={currentSeries}
                loading={combinedLoading}
              />
            </div>
          </section>
        </main>

        {signalsMeta?.generatedAt && (
          <div className="dashboard-last-updated">
            Last updated:{" "}
            {new Date(signalsMeta.generatedAt).toLocaleString()}
          </div>
        )}
      </div>
    </AppShell>
  );
}
