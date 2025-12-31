// src/components/dashboard/cards/PriceChartPanel.jsx
import { useMemo } from "react";
import SearchableTickerDropdown from "../../common/SearchableTickerDropdown.jsx";
import HelpTooltip from "../../common/HelpTooltip.jsx";
import TradingViewEmbed from "../../charts/TradingViewEmbed.jsx";

function toTradingViewSymbol(ticker) {
  const t = String(ticker || "").toUpperCase().trim();
  if (!t) return "NASDAQ:AAPL";

  // If already prefixed, keep it (ex: "NYSE:IBM")
  if (t.includes(":")) return t;

  // Common ETFs + exchange nuances
  const known = {
    SPY: "AMEX:SPY",
    IWM: "AMEX:IWM",
    DIA: "AMEX:DIA",
    VTI: "AMEX:VTI",
    QQQ: "NASDAQ:QQQ",
  };
  if (known[t]) return known[t];

  // Default guess: NASDAQ (works for most tech tickers)
  return `NASDAQ:${t}`;
}

export default function PriceChartPanel({
  allTickers,
  currentTicker,
  onSelectTicker,
  currentSeries, // kept for compatibility (unused now)
  loading,
  pricesMeta, // kept for compatibility (unused now)
}) {
  const tvSymbol = useMemo(() => toTradingViewSymbol(currentTicker), [currentTicker]);

  // Dashboard is usually daily; change to "1" if you want 1-minute.
  const interval = "D";
  const theme = "light";

  return (
    <section className="panel panel-chart">
      <div className="card-main-chart">
        <div className="card-header">
          <div className="card-header-left">
            <div className="card-title-row">
              <h2 className="card-title-text">Price action viewer</h2>
              <HelpTooltip title="What is the Price action viewer?">
                <p>
                  This panel now uses a <strong>TradingView embedded chart</strong> for the selected ticker.
                </p>
                <ul>
                  <li>
                    Use the ticker dropdown to switch symbols.
                  </li>
                  <li>
                    This is a chart embed only (no alerts / no trading).
                  </li>
                </ul>
                <p className="help-popover__note">
                  This is a visualization tool only and is not investment advice.
                </p>
              </HelpTooltip>
            </div>
            <p className="card-subtitle">Select a ticker or type to filter the universe.</p>
          </div>

          <div className="chart-controls">
            <label className="chart-controls-label">
              Ticker
              <SearchableTickerDropdown
                allTickers={allTickers}
                currentTicker={currentTicker}
                onChange={onSelectTicker}
              />
            </label>
          </div>
        </div>

        <div style={{ height: 420 }}>
          {loading ? (
            <div style={{ padding: 12, fontSize: 12, opacity: 0.8 }}>Loading…</div>
          ) : (
            <TradingViewEmbed
              symbol={tvSymbol}
              interval={interval}
              theme={theme}
              height={420}
            />
          )}
        </div>
      </div>
    </section>
  );
}
