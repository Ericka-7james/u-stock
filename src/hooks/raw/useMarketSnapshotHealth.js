// src/hooks/raw/useMarketSnapshotHealth.js
import { useCallback, useEffect, useRef, useState } from "react";

export function useMarketSnapshotHealth({ intervalMs = 30000 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const aliveRef = useRef(true);

  const fetchHealth = useCallback(async () => {
    try {
      setError(null);

      const res = await fetch(`/api/health/market-snapshot?t=${Date.now()}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Health fetch failed: ${res.status}`);
      }

      const json = await res.json();
      if (aliveRef.current) setData(json);
    } catch (e) {
      if (aliveRef.current) {
        setData(null);
        setError(e?.message ? String(e.message) : String(e));
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);

    fetchHealth();
    const id = setInterval(fetchHealth, intervalMs);

    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
  }, [fetchHealth, intervalMs]);

  return { data, loading, error, refetch: fetchHealth };
}
