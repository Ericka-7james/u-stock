// src/charts/PriceChart.jsx
import TradingViewEmbed from "../components/charts/TradingViewEmbed.jsx";

function toTradingViewSymbol(ticker) {
  const t = (ticker || "").trim();
  if (!t) return "NASDAQ:AAPL";

  // Already a full TradingView symbol
  if (t.includes(":")) return t;

  // If user passes crypto like "BTC/USD" -> "BITSTAMP:BTCUSD" (simple default)
  if (t.includes("/")) {
    const [base, quote] = t.split("/").map((s) => (s || "").toUpperCase().trim());
    if (base && quote) return `BITSTAMP:${base}${quote}`;
  }

  // Default stocks to NASDAQ (you can improve mapping later)
  return `NASDAQ:${t.toUpperCase()}`;
}

export default function PriceChart({
  ticker,
  loading = false,
  interval = "1", // "1" = 1m
  theme = "light",
  height = 360,
}) {
  if (loading) {
    return <p className="muted">Loading chart…</p>;
  }

  const symbol = toTradingViewSymbol(ticker);

  return (
    <div className="chart-wrapper" style={{ width: "100%" }}>
      <TradingViewEmbed
        symbol={symbol}
        interval={interval}
        theme={theme}
        height={height}
      />
    </div>
  );
}
