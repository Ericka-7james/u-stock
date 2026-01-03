import { useEffect, useState } from "react";

export function useAlpacaQuotes(symbols = [], pollMs = 3000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(symbols?.length));
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!symbols?.length) return;

    async function tick() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        symbols.forEach((s) => params.append("symbols", s));
        const res = await fetch(`/api/market/us/quotes/latest?${params.toString()}`);
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

    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbols.join(","), pollMs]);

  return { data, loading, error };
}
