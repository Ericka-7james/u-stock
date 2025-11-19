import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRedditMentions } from "../../hooks/useRedditMentions";
import StatSummary from "./StatSummary";
import RedditMentionsChart from "../RedditMentionsChart";
import AppShell from "../layout/AppShell";  // ⬅ new import
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
  const { rawData, meta, loading } = useRedditMentions();

  // chart state (unchanged)
  const [tickerMode, setTickerMode] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTickers, setSelectedTickers] = useState([]);

  const mentionMap = useMemo(() => {
    const map = {};
    const data = Array.isArray(rawData) ? rawData : [];
    for (const item of data) {
      if (!item?.ticker) continue;
      map[item.ticker.toUpperCase()] = item.count;
    }
    return map;
  }, [rawData]);

  const allTickers = useMemo(() => {
    const data = Array.isArray(rawData) ? rawData : [];
    const set = new Set();
    for (const item of data) {
      if (!item?.ticker) continue;
      set.add(item.ticker.toUpperCase());
    }
    return Array.from(set).sort();
  }, [rawData]);

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
    return data;
  }, [rawData, tickerMode, selectedTickers]);

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
        <StatSummary meta={meta} rawData={rawData} />

        <main className="dashboard-main">
          {/* LEFT column – filters + index funds */}
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
          </section>

          {/* RIGHT column – chart */}
          <section className="panel panel-chart">
            <div className="card-main-chart">
              <div className="card-header">
                <div>
                  <h2>Reddit mentions over time</h2>
                  <p className="card-subtitle">
                    High-signal tickers from the latest pull.
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
