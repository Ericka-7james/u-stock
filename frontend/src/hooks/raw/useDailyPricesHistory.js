// src/hooks/raw/useDailyPricesHistory.js
import { useEffect, useState } from "react";

export function useDailyPricesHistory() {
  const [historyBySymbol, setHistoryBySymbol] = useState({});
  const [symbols, setSymbols] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        // Hard cache-bust so we definitely see the latest prices-raw.json
        const url = `/data/fetched/prices-raw.json?ts=${Date.now()}`;
        const res = await fetch(url, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();

        if (cancelled) return;

        // Shape from fetch_prices_json:
        // {
        //   "generated_at": "...",
        //   "symbols": [...],
        //   "prices": { "AAPL": [ {...}, ... ], ... }
        // }
        const prices = json.prices || {};
        const symbolList = Object.keys(prices || {});
        const mapped = {};

        for (const symbol of symbolList) {
          const rows = Array.isArray(prices[symbol]) ? prices[symbol] : [];

          // Normalize / sort and shape for chart
          const series = rows
            .map((row) => ({
              date: row.date,
              dateLabel: row.date?.slice(0, 10) ?? "",
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              volume: row.volume,
            }))
            .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

          mapped[symbol] = series;
        }

        setHistoryBySymbol(mapped);
        setSymbols(symbolList);

        setMeta({
          generatedAt: json.generated_at ?? json.generatedAt ?? null,
          // Prefer explicit symbols array from backend if present
          universe: Array.isArray(json.symbols) ? json.symbols : symbolList,
        });
      } catch (err) {
        console.error("Failed to load daily prices history:", err);
        if (!cancelled) {
          setError(err);
          setHistoryBySymbol({});
          setSymbols([]);
          setMeta(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { historyBySymbol, symbols, meta, loading, error };
}
