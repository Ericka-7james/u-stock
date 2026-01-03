import { useEffect, useState } from "react";

export function useAlpacaTrades(symbol, limit = 50) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(symbol));
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!symbol) return;

    async function run() {
      try {
        setLoading(true);
        const res = await fetch(`/api/market/us/trades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (alive) setData(json);
        setError(null);
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => { alive = false; };
  }, [symbol, limit]);

  return { data, loading, error };
}
