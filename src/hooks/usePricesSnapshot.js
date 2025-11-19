// src/hooks/usePricesSnapshot.js
import { useEffect, useState } from "react";

export function usePricesSnapshot() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const resp = await fetch("/data/prices.json", { cache: "no-store" });
        if (!resp.ok) {
          throw new Error(`Failed to load prices.json (${resp.status})`);
        }

        const json = await resp.json();
        if (cancelled) return;

        const rows = Array.isArray(json.data) ? json.data : [];

        setData(rows);
        setMeta({
          generatedAt: json.generatedAt ?? null,
          universe: Array.isArray(json.universe) ? json.universe : [],
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("[usePricesSnapshot] error:", err);
        setError(err);
        setData([]);
        setMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, meta, loading, error };
}
