// src/components/charts/CandlesPage.jsx
import { useMemo, useState, useEffect } from "react";
import AppShell from "../layout/AppShell";
import { usePollingCandles } from "../../hooks/usePollingCandles";
import { fetchLatestStocks, fetchLatestCrypto } from "../../lib/market/fetchLatest";
import CandleChart from "../charts/CandleChart";
import SearchableTickerDropdown from "../common/SearchableTickerDropdown";
import { useAuth } from "../../context/AuthContext";
import "../../css/charts/CandlesPage.css";

function LoadingBars({ label = "Loading" }) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
        {label}
      </div>
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
            <CandleChart candles={candlesForActive} />
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
  // Turn this to true later when you want polling back.
  const PAUSE_CANDLE_FETCHING = true;

  // (Keep these — we won’t delete your existing behavior)
  const [stockSymbols, setStockSymbols] = useState(["AAPL", "TSLA"]);
  const [cryptoSymbols, setCryptoSymbols] = useState(["BTC/USD", "ETH/USD"]);
  const [activeStock, setActiveStock] = useState("AAPL");
  const [activeCrypto, setActiveCrypto] = useState("BTC/USD");

  // “Any stock/crypto” via dropdown:
  // You can expand these lists later (from a JSON universe).
  const STOCK_UNIVERSE = useMemo(() => {
    // minimal starter list (add more anytime)
    return [
      "AAPL",
      "TSLA",
      "NVDA",
      "MSFT",
      "AMZN",
      "GOOGL",
      "META",
      "AMD",
      "NFLX",
      "SPY",
      "QQQ",
    ];
  }, []);

  const CRYPTO_UNIVERSE = useMemo(() => {
    return ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "AVAX/USD"];
  }, []);

  // If dropdown selects a new active symbol, ensure it exists in the list.
  useEffect(() => {
    if (!stockSymbols.includes(activeStock)) {
      setStockSymbols((prev) => [...prev, activeStock]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStock]);

  useEffect(() => {
    if (!cryptoSymbols.includes(activeCrypto)) {
      setCryptoSymbols((prev) => [...prev, activeCrypto]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCrypto]);

  // Fetchers (kept, but won’t run while paused)
  const stocksFetcher = useMemo(() => async (symbols) => {
    const res = await fetchLatestStocks(symbols);
    return { ticks: res.ticks };
  }, []);

  const cryptoFetcher = useMemo(() => async (symbols) => {
    const res = await fetchLatestCrypto(symbols, "us");
    return { ticks: res.ticks };
  }, []);

  // ✅ If paused, pass empty symbols so hooks don’t hit network
  // (also avoid console spam from fetcher errors)
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

  // Auth-aware gating
  const mustSignIn = !authLoading && !isAuthed;

  // While paused, we always show skeleton (no chart data)
  const showStocksLoading = PAUSE_CANDLE_FETCHING || stocks.loading;
  const showCryptoLoading = PAUSE_CANDLE_FETCHING || crypto.loading;

  // Status pills
  const stocksStatus = mustSignIn ? (
    <StatusPill kind="needs" text="Sign in required" />
  ) : PAUSE_CANDLE_FETCHING ? (
    <StatusPill kind="paused" text="Paused" />
  ) : stocks.error ? (
    <StatusPill kind="error" text="Error" />
  ) : (
    <StatusPill kind="live" text="Live" />
  );

  const cryptoStatus = mustSignIn ? (
    <StatusPill kind="needs" text="Sign in required" />
  ) : PAUSE_CANDLE_FETCHING ? (
    <StatusPill kind="paused" text="Paused" />
  ) : crypto.error ? (
    <StatusPill kind="error" text="Error" />
  ) : (
    <StatusPill kind="live" text="Live" />
  );

  // Last updated (when polling is enabled, you can wire actual timestamps from hook)
  const stocksUpdatedLabel = PAUSE_CANDLE_FETCHING ? "Not fetching" : "";
  const cryptoUpdatedLabel = PAUSE_CANDLE_FETCHING ? "Not fetching" : "";

  return (
    <AppShell>
      <div style={{ display: "grid", gap: 16 }}>
        {/* Simple top guard: don’t hammer APIs if not signed in */}
        {mustSignIn ? (
          <div className="errorBanner">
            You’re not signed in. Sign in to load candles.
          </div>
        ) : null}

        <CandleCard
          title="Stocks (1m candles)"
          subtitle="Stocks: requires Alpaca keys connected"
          status={stocksStatus}
          lastUpdatedLabel={stocksUpdatedLabel}
          showWow={false}
          allTickers={STOCK_UNIVERSE}
          activeSymbol={activeStock}
          onSelectSymbol={setActiveStock}
          candlesForActive={stocks.candles1m?.[activeStock] || []}
          isLoading={showStocksLoading}
          error={PAUSE_CANDLE_FETCHING ? null : stocks.error}
          childrenTopRight={
            <button
              type="button"
              className="miniActionBtn"
              onClick={() => {
                // later: route to Connected Apps
                alert("Connect Alpaca in Connected Apps to enable stocks candles.");
              }}
            >
              Connect Alpaca
            </button>
          }
        />

        <CandleCard
          title="Crypto (1m candles)"   // ✅ renamed
          subtitle="Crypto: demo-friendly once enabled"
          status={cryptoStatus}
          lastUpdatedLabel={cryptoUpdatedLabel}
          showWow={true}               // ✅ WOW sticker
          allTickers={CRYPTO_UNIVERSE}
          activeSymbol={activeCrypto}
          onSelectSymbol={setActiveCrypto}
          candlesForActive={crypto.candles1m?.[activeCrypto] || []}
          isLoading={showCryptoLoading}
          error={PAUSE_CANDLE_FETCHING ? null : crypto.error}
          childrenTopRight={
            <button
              type="button"
              className="miniActionBtn miniActionBtn--wow"
              onClick={() => {
                alert("Crypto candles will be enabled next (polling currently paused).");
              }}
            >
              Enable crypto candles
            </button>
          }
        />
      </div>
    </AppShell>
  );
}
