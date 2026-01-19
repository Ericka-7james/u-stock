// src/components/charts/CandlesPage.jsx
import { useMemo, useState } from "react";
import AppShell from "../layout/AppShell";
import SearchableTickerDropdown from "../common/SearchableTickerDropdown";
import TradingViewEmbed from "../charts/TradingViewEmbed";
import "../../css/charts/CandlesPage.css";

/**
 * CandlesPage (Current U-Stock)
 * --------------------------------------------
 * This page is now "embed-first" and does NOT import legacy polling hooks
 * or old market fetch utilities. This keeps the page production-safe and
 * lets you delete old candle polling code without breaking builds.
 *
 * Later, when you're ready to re-enable native candles:
 * - add a feature flag
 * - reintroduce a candles hook that reads from your backend /api/market/us/bars
 * - keep TradingView as a fallback
 */

function StatusPill({ kind, text }) {
  // kind: "live" | "paused" | "error"
  const cls =
    "statusPill " +
    (kind === "live"
      ? "statusPill--live"
      : kind === "error"
      ? "statusPill--error"
      : "statusPill--paused");

  return <span className={cls}>{text}</span>;
}

function WowSticker() {
  return <span className="wowSticker">WOW</span>;
}

function toTradingViewSymbolStocks(sym) {
  // Conservative default (most tracked tickers are NASDAQ)
  const s = String(sym || "").trim().toUpperCase();
  if (!s) return "NASDAQ:AAPL";
  // If user passes an exchange-qualified symbol already, keep it
  if (s.includes(":")) return s;
  return `NASDAQ:${s}`;
}

function toTradingViewSymbolCrypto(sym) {
  // Convert "BTC/USD" -> "COINBASE:BTCUSD"
  const cleaned = String(sym || "").replace("/", "").trim().toUpperCase();
  if (!cleaned) return "COINBASE:BTCUSD";
  // If already qualified (e.g. BINANCE:BTCUSDT), keep it
  if (cleaned.includes(":")) return cleaned;
  return `COINBASE:${cleaned}`;
}

function CandleCard({
  title,
  subtitle,
  status,
  lastUpdatedLabel,
  showWow,
  allTickers,
  activeSymbol,
  onSelectSymbol,
  childrenTopRight,
  chartBody,
}) {
  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
            {showWow ? <WowSticker /> : null}
            {status}
          </div>

          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
            {subtitle}
            {lastUpdatedLabel ? (
              <span style={{ marginLeft: 10, opacity: 0.8 }}>
                • {lastUpdatedLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {childrenTopRight}
          <SearchableTickerDropdown
            allTickers={allTickers}
            currentTicker={activeSymbol}
            onChange={onSelectSymbol}
          />
        </div>
      </div>

      <div className="cardBody">
        <div style={{ marginBottom: 12 }}>{chartBody}</div>
      </div>
    </div>
  );
}

export default function CandlesPage() {
  // Embed mode only (no polling)
  const EMBED_MODE = true;

  // Keep small, curated universes; expand later when you introduce a backend-driven universe.
  const STOCK_UNIVERSE = useMemo(
    () => ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "AMD", "NFLX", "SPY", "QQQ"],
    []
  );

  const CRYPTO_UNIVERSE = useMemo(
    () => ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "AVAX/USD"],
    []
  );

  const [activeStock, setActiveStock] = useState("AAPL");
  const [activeCrypto, setActiveCrypto] = useState("BTC/USD");

  // TradingView embed config
  // If you later have theme context, wire this to your app theme.
  const tvTheme = "light";
  const tvInterval = "1"; // 1 minute candles

  const stockTvSymbol = toTradingViewSymbolStocks(activeStock);
  const cryptoTvSymbol = toTradingViewSymbolCrypto(activeCrypto);

  const stocksStatus = EMBED_MODE ? (
    <StatusPill kind="paused" text="Embed mode" />
  ) : (
    <StatusPill kind="live" text="Live" />
  );

  const cryptoStatus = EMBED_MODE ? (
    <StatusPill kind="paused" text="Embed mode" />
  ) : (
    <StatusPill kind="live" text="Live" />
  );

  return (
    <AppShell>
      <div style={{ display: "grid", gap: 16 }}>
        <CandleCard
          title="Stocks (1m candles)"
          subtitle="TradingView embed (frontend-safe, no polling)"
          status={stocksStatus}
          lastUpdatedLabel="TradingView chart"
          showWow={false}
          allTickers={STOCK_UNIVERSE}
          activeSymbol={activeStock}
          onSelectSymbol={setActiveStock}
          childrenTopRight={
            <button
              type="button"
              className="miniActionBtn"
              onClick={() =>
                alert("Alpaca integration is used elsewhere; this page is embed-only for now.")
              }
            >
              Connected apps
            </button>
          }
          chartBody={
            <TradingViewEmbed
              symbol={stockTvSymbol}
              interval={tvInterval}
              theme={tvTheme}
              height={420}
            />
          }
        />

        <CandleCard
          title="Crypto (1m candles)"
          subtitle="TradingView embed (demo-friendly)"
          status={cryptoStatus}
          lastUpdatedLabel="TradingView chart"
          showWow={true}
          allTickers={CRYPTO_UNIVERSE}
          activeSymbol={activeCrypto}
          onSelectSymbol={setActiveCrypto}
          childrenTopRight={
            <button
              type="button"
              className="miniActionBtn miniActionBtn--wow"
              onClick={() => alert("Crypto is displayed via TradingView embed for now.")}
            >
              Crypto notes
            </button>
          }
          chartBody={
            <TradingViewEmbed
              symbol={cryptoTvSymbol}
              interval={tvInterval}
              theme={tvTheme}
              height={420}
            />
          }
        />
      </div>
    </AppShell>
  );
}
