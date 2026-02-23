// frontend/src/hooks/dashboard/useBotOpportunities.js
import { useEffect, useState } from "react";
import { apiGetWithRetry, toError } from "../../lib/api/http.js";
import { createSWRCache, isFresh } from "../../lib/cache/swrCache.js";

const CACHE_TTL_MS = 60_000;
const oppCache = createSWRCache({ crypto: [], stocks: [], funds: [] });

export default function useBotOpportunities() {
  const [data, setData] = useState(() =>
    isFresh(oppCache.ts, CACHE_TTL_MS) ? oppCache.data : { crypto: [], stocks: [], funds: [] }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      if (!isFresh(oppCache.ts, CACHE_TTL_MS)) setLoading(true);
      setError(null);

      try {
        const json = await apiGetWithRetry("/api/opportunities/bot/top?limit=8", { signal: ac.signal });
        if (!alive) return;
        setData(json || { crypto: [], stocks: [], funds: [] });
        oppCache.ts = Date.now();
        oppCache.data = json;
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
        setError(toError(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
      ac.abort();
    };
  }, []);

  return { data, loading, error };
}