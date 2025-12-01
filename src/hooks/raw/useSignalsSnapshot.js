// src/hooks/raw/useSignalsSnapshot.js
import { useEffect, useState } from "react";

export function useSignalsSnapshot() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        // Hard cache-bust so we always see the latest final-signals.json
        const url = `/data/signals/final-signals.json?ts=${Date.now()}`;
        const res = await fetch(url, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (cancelled) return;

        // Expecting shape (but we’ll be flexible):
        // {
        //   generatedAt | generated_at: "...",
        //   rankingDescription: "...",
        //   universe: [...],           // optional
        //   symbols: [...],            // optional alternative
        //   data: [ { ticker, score, components: { daily, intraday, multiday } }, ... ]
        // }

        const list = Array.isArray(json.data) ? json.data : [];

        // sort by score desc just in case
        const sorted = [...list].sort(
          (a, b) => (b.score ?? 0) - (a.score ?? 0)
        );

        const generatedAt =
          json.generated_at ?? json.generatedAt ?? null;

        const universe =
          Array.isArray(json.universe) && json.universe.length > 0
            ? json.universe
            : Array.isArray(json.symbols) && json.symbols.length > 0
            ? json.symbols
            : sorted.map((r) => r.ticker);

        setData(sorted);
        setMeta({
          generatedAt,
          rankingDescription: json.rankingDescription ?? null,
          universe,
        });
      } catch (err) {
        console.error("Failed to load signals snapshot:", err);
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

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, meta, loading, error };
}
