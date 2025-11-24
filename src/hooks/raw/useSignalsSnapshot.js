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
        const res = await fetch("/data/signals/final-signals.json");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();

        if (cancelled) return;

        // Expecting shape:
        // {
        //   generatedAt: "...",
        //   rankingDescription: "...",
        //   universe: [...],
        //   data: [ { ticker, score, components: { daily, intraday, multiday } }, ... ]
        // }
        const list = Array.isArray(json.data) ? json.data : [];

        // sort by score desc just in case
        const sorted = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

        setData(sorted);
        setMeta({
          generatedAt: json.generatedAt,
          rankingDescription: json.rankingDescription,
          universe: json.universe ?? sorted.map((r) => r.ticker),
        });
      } catch (err) {
        console.error("Failed to load signals snapshot:", err);
        if (!cancelled) {
          setError(err);
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
