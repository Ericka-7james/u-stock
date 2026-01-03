// src/hooks/raw/useSentimentSnapshot.js
import { useEffect, useState } from "react";

export function useSentimentSnapshot() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSnapshot() {
      setLoading(true);
      try {
        const res = await fetch("/data/sentiment-snapshot.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();

        if (!cancelled) {
          setData(payload.data || []);
          setMeta(payload.meta || null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSnapshot();
    return () => { cancelled = true };
  }, []);

  return { data, meta, loading, error };
}
