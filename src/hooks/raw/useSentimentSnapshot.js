import { useEffect, useState } from "react";

export function useSentimentSnapshot() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/data/fetched/sentiment-slim.json", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (cancelled) return;

        const rows = Array.isArray(json.data) ? json.data : [];
        setData(rows);
        setMeta({
          generatedAt: json.generatedAt ?? null,
          universe: Array.isArray(json.universe) ? json.universe : [],
        });
      } catch (err) {
        if (!cancelled) {
          console.error("[useSentimentSnapshot] error:", err);
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
