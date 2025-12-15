import { useMemo, useState } from "react";
import AppShell from "../layout/AppShell";
import { usePollingCandles } from "../../hooks/usePollingCandles";
import { fetchLatestStocks, fetchLatestCrypto } from "../../lib/market/fetchLatest";
import CandleChart from "../charts/CandleChart";


function CandleCard({
  title,
  subtitle,
  symbols,
  onAddSymbol,
  onRemoveSymbol,
  candles1m,
}) {
  const [activeStock, setActiveStock] = useState("AAPL");
  const [activeCrypto, setActiveCrypto] = useState("BTC/USD");


  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>

          {subtitle && (
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        <div className="chipRow">
          {symbols.map((s) => (
            <button
              key={s}
              className="chip"
              onClick={() => onRemoveSymbol(s)}
              title="Remove"
            >
              {s} ✕
            </button>
          ))}
        </div>
      </div>

      <div className="cardBody">
        <AddSymbolRow onAdd={onAddSymbol} />

        <div className="miniGrid">
          {symbols.map((s) => (
            <MiniCandlePreview
              key={s}
              symbol={s}
              candles={candles1m[s] || []}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AddSymbolRow({ onAdd }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Add symbol (AAPL or BTC/USD)"
        style={{ flex: 1 }}
      />
      <button
        onClick={() => {
          const s = val.trim().toUpperCase();
          if (s) onAdd(s);
          setVal("");
        }}
      >
        Add
      </button>
    </div>
  );
}

function MiniCandlePreview({ symbol, candles }) {
  const last = candles[candles.length - 1];
  return (
    <div className="miniTile">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <b>{symbol}</b>
        <span style={{ opacity: 0.7 }}>{candles.length ? "1m" : "—"}</span>
      </div>
      {last ? (
        <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12 }}>
          <div>O {last.o.toFixed(2)}</div>
          <div>H {last.h.toFixed(2)}</div>
          <div>L {last.l.toFixed(2)}</div>
          <div>C {last.c.toFixed(2)}</div>
        </div>
      ) : (
        <div style={{ marginTop: 8, opacity: 0.7 }}>Waiting for ticks…</div>
      )}
    </div>
  );
}

export default function CandlesPage() {
  // defaults
  const [stockSymbols, setStockSymbols] = useState(["AAPL", "TSLA"]);
  const [cryptoSymbols, setCryptoSymbols] = useState(["BTC/USD", "ETH/USD"]);

  const stocksFetcher = useMemo(() => async (symbols) => {
    const res = await fetchLatestStocks(symbols);
    return { ticks: res.ticks };
  }, []);

  const cryptoFetcher = useMemo(() => async (symbols) => {
    const res = await fetchLatestCrypto(symbols, "us");
    return { ticks: res.ticks };
  }, []);

  // Two independent pipelines
  const stocks = usePollingCandles({
    symbols: stockSymbols,
    fetcher: stocksFetcher,
    enable1s: false,      // keep off until websockets
    maxSymbols: 10,
    pollIntervalMs: 2500, // stocks: slightly slower is fine on free
  });

  const crypto = usePollingCandles({
    symbols: cryptoSymbols,
    fetcher: cryptoFetcher,
    enable1s: false,     // later, websockets -> you can consider true
    maxSymbols: 10,
    pollIntervalMs: 1500 // crypto: faster polling makes it feel “live”
  });

  return (
    <AppShell>
      <div style={{ display: "grid", gap: 16 }}>
        <CandleCard
          title="Stocks (1m candles)"
          subtitle="Stocks: IEX-only on Free"
          symbols={stockSymbols}
          onAddSymbol={(s) =>
            setStockSymbols((prev) => (prev.includes(s) ? prev : [...prev, s]))
          }
          onRemoveSymbol={(s) =>
            setStockSymbols((prev) => prev.filter((x) => x !== s))
          }
          candles1m={stocks.candles1m[activeStock] || []}
        />

        <CandleCard
          title="Crypto (1m candles — demo-friendly)"
          subtitle="Crypto: real-time feed; best demo"
          symbols={cryptoSymbols}
          onAddSymbol={(s) =>
            setCryptoSymbols((prev) => (prev.includes(s) ? prev : [...prev, s]))
          }
          onRemoveSymbol={(s) =>
            setCryptoSymbols((prev) => prev.filter((x) => x !== s))
          }
          candles1m={crypto.candles1m[activeCrypto] || []}
        />
      </div>
    </AppShell>
  );
}
