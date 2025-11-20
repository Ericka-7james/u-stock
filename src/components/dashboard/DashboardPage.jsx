// src/components/dashboard/DashboardPage.jsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRedditMentions } from "../../hooks/useRedditMentions";
import { usePricesSnapshot } from "../../hooks/usePricesSnapshot";
import { useMacroSnapshot } from "../../hooks/useMacroSnapshot";
import StatSummary from "./StatSummary";
import RedditMentionsChart from "../RedditMentionsChart";
import AppShell from "../layout/AppShell";
import "./DashboardPage.css";

const INDEX_FUNDS = [
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF" },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF" },
  {
    ticker: "VTSAX",
    name: "Vanguard Total Stock Market Index Fund Admiral Shares",
  },
  { ticker: "FXAIX", name: "Fidelity 500 Index Fund" },
  { ticker: "SWTSX", name: "Schwab Total Stock Market Index Fund" },
];

export default function DashboardPage() {
  // Reddit snapshot (existing)
  const { rawData, meta, loading } = useRedditMentions();

  // NEW: prices + macro snapshots
  const {
    data: priceRows,
    meta: pricesMeta,
    loading: pricesLoading,
  } = usePricesSnapshot();

  const {
    series: macroSeries,
    loading: macroLoading,
  } = useMacroSnapshot();

  // chart state
  const [tickerMode, setTickerMode] = useState("all"); // "all" | "track" | "choose"
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTickers, setSelectedTickers] = useState([]);

  // Map ticker -> mentions from snapshot.data
  const mentionMap = useMemo(() => {
    const map = {};
    const data = Array.isArray(rawData) ? rawData : [];
    for (const item of data) {
      if (!item?.ticker) continue;
      map[item.ticker.toUpperCase()] = item.count;
    }
    return map;
  }, [rawData]);

  // All tickers in this snapshot (for autocomplete)
  const allTickers = useMemo(() => {
    const data = Array.isArray(rawData) ? rawData : [];
    const set = new Set();
    for (const item of data) {
      if (!item?.ticker) continue;
      set.add(item.ticker.toUpperCase());
    }
    return Array.from(set).sort();
  }, [rawData]);

  // Suggestions for "choose" mode
  const suggestions = useMemo(() => {
    const term = searchTerm.trim().toUpperCase();
    if (!term) return [];
    return allTickers
      .filter((t) => t.includes(term) && !selectedTickers.includes(t))
      .slice(0, 8);
  }, [searchTerm, allTickers, selectedTickers]);

  const addTicker = (value) => {
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    if (!allTickers.includes(ticker)) return;
    if (selectedTickers.includes(ticker)) return;
    setSelectedTickers([...selectedTickers, ticker]);
    setSearchTerm("");
  };

  // Data that actually gets graphed
  const filteredRawData = useMemo(() => {
    const data = Array.isArray(rawData) ? rawData : [];

    if (tickerMode === "choose" && selectedTickers.length > 0) {
      const selectedSet = new Set(
        selectedTickers.map((t) => t.toUpperCase().trim())
      );
      return data.filter((item) =>
        selectedSet.has(item.ticker.toUpperCase())
      );
    }

    // For now, "all" and "track" behave the same (you can customize later)
    return data;
  }, [rawData, tickerMode, selectedTickers]);

  // Spotlight: which of your index funds has the most mentions?
  const topIndexFund = useMemo(() => {
    let best = null;
    for (const fund of INDEX_FUNDS) {
      const t = fund.ticker.toUpperCase();
      const mentions = mentionMap[t] || 0;
      if (!best || mentions > best.mentions) {
        best = { ...fund, mentions };
      }
    }
    if (best && best.mentions > 0) return best;
    return null;
  }, [mentionMap]);

  // Macro helpers – quick lookup by id
  const macroById = useMemo(() => {
    const map = {};
    const list = Array.isArray(macroSeries) ? macroSeries : [];
    for (const s of list) {
      if (!s?.id) continue;
      map[s.id] = s;
    }
    return map;
  }, [macroSeries]);

  const cpi = macroById["CPIAUCSL"];
  const unrate = macroById["UNRATE"];
  const fedFunds = macroById["DFF"];

  const handleModeChange = (e) => {
    setTickerMode(e.target.value);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    addTicker(searchTerm);
  };

  const removeTicker = (ticker) => {
    setSelectedTickers(selectedTickers.filter((t) => t !== ticker));
  };

  return (
    <AppShell>
      <div className="dashboard">
        <StatSummary meta={meta} rawData={Array.isArray(rawData) ? rawData : []} />

        <main className="dashboard-main">
          {/* LEFT column – filters + index funds + prices + macro */}
          <section className="panel panel-filters">
            <div className="filters-card filters-card--filters">
              <h3 className="panel-title">Filters (coming soon)</h3>
              <p className="muted">
                Soon you’ll be able to filter by subreddit, minimum mentions,
                and custom watchlists.
              </p>
            </div>

            <div className="filters-card filters-card--index">
              <div className="filters-card-header">
                <h3 className="panel-title">Explore index funds</h3>
              </div>

              {loading ? (
                <p className="muted">Loading index fund mentions…</p>
              ) : topIndexFund ? (
                <>
                  <div className="index-spotlight">
                    <div className="index-spotlight-ticker">
                      {topIndexFund.ticker}
                    </div>
                    <div className="index-spotlight-name">
                      {topIndexFund.name}
                    </div>
                    <div className="index-spotlight-mentions">
                      {topIndexFund.mentions} mentions in this snapshot
                    </div>
                  </div>
                  <Link to="/index-funds" className="panel-link">
                    See more →
                  </Link>
                </>
              ) : (
                <>
                  <p className="muted">
                    No index fund tickers detected in this snapshot yet.
                  </p>
                  <Link to="/index-funds" className="panel-link">
                    See more →
                  </Link>
                </>
              )}
            </div>

            {/* NEW: Prices mini-table */}
            <div className="filters-card filters-card--prices">
              <div className="filters-card-header">
                <h3 className="panel-title">Live prices (snapshot)</h3>
              </div>

              {pricesLoading ? (
                <p className="muted">Loading prices…</p>
              ) : priceRows.length === 0 ? (
                <p className="muted">
                  No price data yet. Try running{" "}
                  <code>PYTHONPATH=src python -m data_scout.prices</code>.
                </p>
              ) : (
                <>
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceRows.map((row) => (
                        <tr key={row.ticker}>
                          <td>{row.ticker}</td>
                          <td>
                            {row.price != null ? row.price.toFixed(2) : "—"}{" "}
                            {row.currency || "USD"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <button
                type="button"
                className="panel-link macro-link-btn"
                disabled
              >
                View details → (soon)
              </button>
              
                  {pricesMeta?.generatedAt && (
                    <p className="mini-table-caption muted">
                      Snapshot:{" "}
                      {new Date(pricesMeta.generatedAt).toLocaleString()}
                    </p>
                  )}
                </>
              )}

            </div>

            {/* NEW: Macro snapshot tile */}
            <div className="filters-card filters-card--macro">
              <div className="filters-card-header">
                <h3 className="panel-title">Macro snapshot</h3>
              </div>

              {macroLoading ? (
                <p className="muted">Loading macro data…</p>
              ) : (
                <>
                  <div className="macro-grid">
                    <div className="macro-pill">
                      <div className="macro-label">CPI (All items)</div>
                      <div className="macro-value">
                        {cpi?.latest != null ? cpi.latest.toFixed(1) : "—"}
                      </div>
                      <div className="macro-meta">
                        {cpi?.lastUpdated ?? "No date"}
                      </div>
                    </div>

                    <div className="macro-pill">
                      <div className="macro-label">Unemployment rate</div>
                      <div className="macro-value">
                        {unrate?.latest != null ? `${unrate.latest.toFixed(1)}%` : "—"}
                      </div>
                      <div className="macro-meta">
                        {unrate?.lastUpdated ?? "No date"}
                      </div>
                    </div>

                    <div className="macro-pill">
                      <div className="macro-label">Fed funds rate</div>
                      <div className="macro-value">
                        {fedFunds?.latest != null ? fedFunds.latest.toFixed(2) : "—"}
                      </div>
                      <div className="macro-meta">
                        {fedFunds?.lastUpdated ?? "No date"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="panel-link macro-link-btn"
                    disabled
                  >
                    View details → (soon)
                  </button>
                </>
              )}
            </div>
          </section>

          {/* RIGHT column – chart */}
          <section className="panel panel-chart">
            <div className="card-main-chart">
              <div className="card-header">
                <div>
                  <h2>Reddit mentions over time</h2>
                  <p className="card-subtitle">
                    High-signal tickers from the latest U-Stock data scout pull.
                  </p>
                </div>

                <div className="chart-controls">
                  <label className="chart-controls-label">
                    View
                    <select
                      className="chart-select"
                      value={tickerMode}
                      onChange={handleModeChange}
                    >
                      <option value="all">All</option>
                      <option value="track">Track (coming soon)</option>
                      <option value="choose">Choose…</option>
                    </select>
                  </label>
                </div>
              </div>

              {tickerMode === "choose" && (
                <div className="ticker-choose-row">
                  <div className="ticker-input-group">
                    <input
                      type="text"
                      className="ticker-input"
                      placeholder="Type a ticker from this snapshot (e.g. TSLA) and press Enter"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                    />

                    {suggestions.length > 0 && (
                      <ul className="ticker-suggestions">
                        {suggestions.map((t) => (
                          <li key={t}>
                            <button
                              type="button"
                              className="ticker-suggestion-item"
                              onClick={() => addTicker(t)}
                            >
                              {t}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <small className="ticker-input-help">
                      Available from this snapshot:{" "}
                      {allTickers.slice(0, 8).join(", ")}
                      {allTickers.length > 8 ? ", …" : ""}
                    </small>
                  </div>

                  {selectedTickers.length > 0 && (
                    <div className="ticker-chip-row">
                      {selectedTickers.map((ticker) => (
                        <button
                          key={ticker}
                          type="button"
                          className="ticker-chip"
                          onClick={() => removeTicker(ticker)}
                        >
                          {ticker}
                          <span className="ticker-chip-close">×</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="chart-wrapper">
                <RedditMentionsChart
                  rawData={filteredRawData}
                  loading={loading}
                />
              </div>

              {meta && (
                <div className="chart-meta">
                  Snapshot window: {meta.windowDescription ?? "Latest pull"}
                </div>
              )}
            </div>
          </section>
        </main>

        {meta && (
          <div className="dashboard-last-updated">
            Last updated: {new Date(meta.generatedAt).toLocaleString()}
          </div>
        )}
      </div>
    </AppShell>
  );
}
