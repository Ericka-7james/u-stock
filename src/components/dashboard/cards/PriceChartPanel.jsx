// src/components/dashboard/cards/PriceChartPanel.jsx
import SearchableTickerDropdown from "../../common/SearchableTickerDropdown.jsx";
import HelpTooltip from "../../common/HelpTooltip.jsx";
import PriceChart from "./PriceChart.jsx";

export default function PriceChartPanel({
  allTickers,
  currentTicker,
  onSelectTicker,
  currentSeries,
  loading,
  pricesMeta,
}) {
  return (
    <section className="panel panel-chart">
      <div className="card-main-chart">
        <div className="card-header">
          <div className="card-header-left">
            <div className="card-title-row">
              <h2 className="card-title-text">Price action viewer</h2>
              <HelpTooltip title="What is the Price action viewer?">
                <p>
                  This chart shows the daily close price for the selected ticker
                  based on your <code>prices-raw.json</code> snapshot.
                </p>
                <ul>
                  <li>
                    <strong>X-axis:</strong> trading days from your latest
                    snapshot window.
                  </li>
                  <li>
                    <strong>Y-axis:</strong> adjusted close price.
                  </li>
                  <li>
                    Use the ticker dropdown to switch symbols. Data refresh times
                    appear in the dashboard header.
                  </li>
                </ul>
                <p className="help-popover__note">
                  This is a visualization of historical prices only and is not
                  investment advice.
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
                onChange={onSelectTicker}
              />
            </label>
          </div>
        </div>

        <PriceChart
          ticker={currentTicker}
          data={currentSeries}
          loading={loading}
          pricesMeta={pricesMeta}
        />
      </div>
    </section>
  );
}
