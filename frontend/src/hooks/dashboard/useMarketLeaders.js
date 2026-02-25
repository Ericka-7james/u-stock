// frontend/src/hooks/dashboard/useMarketLeaders.js
import { useEffect, useState } from "react";
import { apiGetWithRetry, toError } from "../../lib/api/http.js";
import { createSWRCache, isFresh } from "../../lib/cache/swrCache.js";

const CACHE_TTL_MS = 60_000;
const leadersCache = createSWRCache(null);

export default function useMarketLeaders({ direction = "up", limit = 10 } = {}) {
  const [data, setData] = useState(() =>
    isFresh(leadersCache.ts, CACHE_TTL_MS) ? leadersCache.data : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      if (!isFresh(leadersCache.ts, CACHE_TTL_MS)) setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams({
          market: "stocks",
          direction,
          limit: String(limit),
        });

        const json = await apiGetWithRetry(`/api/market/leaders?${qs.toString()}`, {
          signal: ac.signal,
        });

        if (!alive) return;

        setData(json || null);
        leadersCache.ts = Date.now();
        leadersCache.data = json;
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
        setError(toError(e));
      } finally {
        // ✅ Fix: no return inside finally
        if (alive) {
          setLoading(false);
        }
      }
    }

    run();
    const t = setInterval(run, 20_000);

    return () => {
      alive = false;
      ac.abort();
      clearInterval(t);
    };
  }, [direction, limit]);

  return { data, loading, error };
}