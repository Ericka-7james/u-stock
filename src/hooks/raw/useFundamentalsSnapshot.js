// src/hooks/raw/useFundamentalsSnapshot.js
import { useEffect, useState } from "react";

export function useFundamentalsSnapshot() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // New slim fundamentals snapshot from fetch_fundamentals.py
        // Path: src/public/data/fetched/fundamentals-slim.json
        const res = await fetch("/data/fetched/fundamentals-slim.json", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`Failed to load fundamentals-slim.json (${res.status})`);
        }

        const json = await res.json();
        if (cancelled) return;

        // Expected shape:
        // {
        //   "symbols": [...],
        //   "data": {
        //     "AAPL": {
        //       "company_profile": {...},
        //       "key_stats": {...},
        //       "financial_data": {...},
        //       "dividends": {...},
        //       "trading_snapshot": {...},
        //       "institution_ownership": [...]
        //     },
        //     ...
        //   }
        // }
        const bySymbol = json.data || {};
        const symbols = Array.isArray(json.symbols)
          ? json.symbols
          : Object.keys(bySymbol);

        const rows = symbols.map((sym) => ({
          symbol: sym,
          ...(bySymbol[sym] || {}),
        }));

        setData(rows);
        setMeta({
          generatedAt: json.generated_at ?? json.generatedAt ?? null,
          universe: symbols,
        });
      } catch (err) {
        console.error("Error loading fundamentals:", err);
        if (!cancelled) {
          setError(err);
          setData([]);
          setMeta(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, meta, loading, error };
}
