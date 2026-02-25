// src/charts/PriceChart.jsx
import TradingViewEmbed from "./TradingViewEmbed.jsx";
import {
  toTradingViewSymbol,
  clampHeight,
  normalizeTheme,
} from "./priceChart.utils.js";

export default function PriceChart({
  ticker,
  loading = false,
  interval = "1",
  theme = "light",
  height = 360,
}) {
  if (loading) {
    return (
      <p className="muted" role="status" aria-live="polite">
        Loading chart…
      </p>
    );
  }

  const symbol = toTradingViewSymbol(ticker);
  const safeTheme = normalizeTheme(theme);
  const safeHeight = clampHeight(height);

  return (
    <div className="chart-wrapper" style={{ width: "100%" }}>
      <TradingViewEmbed
        symbol={symbol}
        interval={String(interval)}
        theme={safeTheme}
        height={safeHeight}
      />
    </div>
  );
}