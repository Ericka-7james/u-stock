// src/components/charts/CandlesPage.jsx
import { useMemo, useState, useEffect } from "react";
import AppShell from "../layout/AppShell";
import { usePollingCandles } from "../../hooks/usePollingCandles";
import { fetchLatestStocks, fetchLatestCrypto } from "../../lib/market/fetchLatest";
import CandleChart from "../charts/CandleChart";
import SearchableTickerDropdown from "../common/SearchableTickerDropdown";
import { useAuth } from "../../context/AuthContext";
import "../../css/charts/CandlesPage.css";
import TradingViewEmbed from "../charts/TradingViewEmbed";

function LoadingBars({ label = "Loading" }) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>{label}</div>
      <div className="loadingBars">
        <div className="loadingBar" />
        <div className="loadingBar" />
        <div className="loadingBar" />
      </div>
    </div>
  );
}

function StatusPill({ kind, text }) {
  // kind: "live" | "needs" | "error" | "paused"
  const cls =
    "statusPill " +
    (kind === "live"
      ? "statusPill--live"
      : kind === "needs"
      ? "statusPill--needs"
      : kind === "error"
      ? "statusPill--error"
      : "statusPill--paused");

  return <span className={cls}>{text}</span>;
}

function WowSticker() {
  return <span className="wowSticker">WOW</span>;
}

function toTradingViewSymbolStocks(sym) {
  // Conservative default: most of your list is NASDAQ.
  // You can improve later by mapping per ticker.
  return `NASDAQ:${sym}`;
}

function toTradingViewSymbolCrypto(sym) {
  // Convert "BTC/USD" -> "COINBASE:BTCUSD" (good default feed)
  const cleaned = String(sym || "").replace("/", "").toUpperCase(); // BTCUSD
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
  candlesForActive,
  isLoading,
  error,
  childrenTopRight,
  // NEW: allow swapping chart body
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
              <span style={{ marginLeft: 10, opacity: 0.8 }}>• {lastUpdatedLabel}</span>
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
        {error ? (
          <div className="errorCard">
            <div className="errorCardTitle">Couldn’t load candles</div>
            <div className="errorCardBody">{error}</div>
          </div>
        ) : null}

        {isLoading ? (
          <LoadingBars label="Loading" />
        ) : (
          <div style={{ marginBottom: 12 }}>
            {chartBody ? chartBody : <CandleChart candles={candlesForActive} />}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CandlesPage() {
  const { isAuthed, loading: authLoading } = useAuth();

  // -------------------------
  // ✅ GLOBAL "PAUSE FETCHING"
  // -------------------------
  // Since you’re starting simple with TradingView embeds:
  // Keep this true for now so nothing polls your APIs.
  const PAUSE_CANDLE_FETCHING = true;

  // (Keep these — we won’t delete your existing behavior)
  const [stockSymbols, setStockSymbols] = useState(["AAPL", "TSLA"]);
  const [cryptoSymbols, setCryptoSymbols] = useState(["BTC/USD", "ETH/USD"]);
  const [activeStock, setActiveStock] = useState("AAPL");
  const [activeCrypto, setActiveCrypto] = useState("BTC/USD");

  // You can expand these lists later (from a JSON universe).
  const STOCK_UNIVERSE = useMemo(() => {
    return ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "AMD", "NFLX", "SPY", "QQQ"];
  }, []);

  const CRYPTO_UNIVERSE = useMemo(() => {
    return ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "AVAX/USD"];
  }, []);

  // If dropdown selects a new active symbol, ensure it exists in the list.
  useEffect(() => {
    if (!stockSymbols.includes(activeStock)) setStockSymbols((prev) => [...prev, activeStock]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStock]);

  useEffect(() => {
    if (!cryptoSymbols.includes(activeCrypto)) setCryptoSymbols((prev) => [...prev, activeCrypto]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCrypto]);

  // Fetchers (kept, but won’t run while paused)
  const stocksFetcher = useMemo(
    () => async (symbols) => {
      const res = await fetchLatestStocks(symbols);
      return { ticks: res.ticks };
    },
    []
  );

  const cryptoFetcher = useMemo(
    () => async (symbols) => {
      const res = await fetchLatestCrypto(symbols, "us");
      return { ticks: res.ticks };
    },
    []
  );

  // ✅ If paused, pass empty symbols so hooks don’t hit network
  const stocks = usePollingCandles({
    symbols: PAUSE_CANDLE_FETCHING ? [] : stockSymbols,
    fetcher: stocksFetcher,
    enable1s: false,
    maxSymbols: 10,
    pollIntervalMs: 2500,
  });

  const crypto = usePollingCandles({
    symbols: PAUSE_CANDLE_FETCHING ? [] : cryptoSymbols,
    fetcher: cryptoFetcher,
    enable1s: false,
    maxSymbols: 10,
    pollIntervalMs: 1500,
  });

  // Auth-aware gating (you can remove later if you want embeds available to everyone)
  const mustSignIn = !authLoading && !isAuthed;

  // While paused, we show TradingView embeds instead of CandleChart data
  const showStocksLoading = false;
  const showCryptoLoading = false;

  // Status pills
  const stocksStatus = mustSignIn ? (
    <StatusPill kind="needs" text="Sign in required" />
  ) : PAUSE_CANDLE_FETCHING ? (
    <StatusPill kind="paused" text="Embed mode" />
  ) : stocks.error ? (
    <StatusPill kind="error" text="Error" />
  ) : (
    <StatusPill kind="live" text="Live" />
  );

  const cryptoStatus = mustSignIn ? (
    <StatusPill kind="needs" text="Sign in required" />
  ) : PAUSE_CANDLE_FETCHING ? (
    <StatusPill kind="paused" text="Embed mode" />
  ) : crypto.error ? (
    <StatusPill kind="error" text="Error" />
  ) : (
    <StatusPill kind="live" text="Live" />
  );

  const stocksUpdatedLabel = PAUSE_CANDLE_FETCHING ? "TradingView chart" : "";
  const cryptoUpdatedLabel = PAUSE_CANDLE_FETCHING ? "TradingView chart" : "";

  // TradingView embed config
  const tvTheme = "light"; // change to "dark" if your site is dark
  const tvInterval = "1";  // 1 minute

  const stockTvSymbol = toTradingViewSymbolStocks(activeStock);
  const cryptoTvSymbol = toTradingViewSymbolCrypto(activeCrypto);

  return (
    <AppShell>
      <div style={{ display: "grid", gap: 16 }}>
        {mustSignIn ? (
          <div className="errorBanner">You’re not signed in. Sign in to continue.</div>
        ) : null}

        <CandleCard
          title="Stocks (1m candles)"
          subtitle="Stocks: TradingView embed (no polling yet)"
          status={stocksStatus}
          lastUpdatedLabel={stocksUpdatedLabel}
          showWow={false}
          allTickers={STOCK_UNIVERSE}
          activeSymbol={activeStock}
          onSelectSymbol={setActiveStock}
          candlesForActive={stocks.candles1m?.[activeStock] || []}
          isLoading={showStocksLoading}
          error={null}
          childrenTopRight={
            <button
              type="button"
              className="miniActionBtn"
              onClick={() => alert("Alpaca connection will be used later for live candles & trading.")}
            >
              Connect Alpaca
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
          subtitle="Crypto: TradingView embed (demo-friendly)"
          status={cryptoStatus}
          lastUpdatedLabel={cryptoUpdatedLabel}
          showWow={true}
          allTickers={CRYPTO_UNIVERSE}
          activeSymbol={activeCrypto}
          onSelectSymbol={setActiveCrypto}
          candlesForActive={crypto.candles1m?.[activeCrypto] || []}
          isLoading={showCryptoLoading}
          error={null}
          childrenTopRight={
            <button
              type="button"
              className="miniActionBtn miniActionBtn--wow"
              onClick={() => alert("Crypto candles are shown via TradingView embed for now.")}
            >
              Enable crypto candles
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
