// src/charts/PriceChart.jsx
import TradingViewEmbed from "../components/charts/TradingViewEmbed.jsx";

function toTradingViewSymbol(ticker) {
  const t = String(ticker || "").trim();
  if (!t) return "NASDAQ:AAPL";

  // Already a full TradingView symbol like "NASDAQ:AAPL"
  if (t.includes(":")) return t.toUpperCase();

  // Crypto pairs like "BTC/USD" or "btc-usd" -> default exchange mapping
  // NOTE: This is a sensible default, not guaranteed. Keep it stable & predictable.
  const normalized = t.replace("-", "/");
  if (normalized.includes("/")) {
    const [base, quote] = normalized
      .split("/")
      .map((s) => String(s || "").toUpperCase().trim());

    if (base && quote) return `BITSTAMP:${base}${quote}`;
  }

  // Plain equity ticker (best-effort default)
  return `NASDAQ:${t.toUpperCase()}`;
}

function clampHeight(h, fallback = 360) {
  const n = Number(h);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(180, Math.min(1200, Math.floor(n)));
}

function normalizeTheme(theme) {
  const t = String(theme || "").toLowerCase().trim();
  return t === "dark" ? "dark" : "light";
}

export default function PriceChart({
  ticker,
  loading = false,
  interval = "1", // TradingView interval string (e.g. "1", "5", "15", "D")
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

// (Optional) exported for unit tests if you want to test symbol mapping directly
export { toTradingViewSymbol };
