// frontend/src/hooks/useAlpacaDailyBars.js
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/apiFetch";

export function useAlpacaDailyBars(symbol, limit = 200) {
  const [bars, setBars] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const url = useMemo(() => {
    const s = (symbol || "").trim();
    if (!s) return "";
    const qs = new URLSearchParams({
      symbol: s,
      limit: String(limit ?? 200),
    });
    return `/api/alpaca/bars/daily?${qs.toString()}`;
  }, [symbol, limit]);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      if (!url) {
        setBars([]);
        setMeta(null);
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const data = await apiFetch(url, {
          method: "GET",
          signal: controller.signal,
        });

        setBars(Array.isArray(data?.bars) ? data.bars : []);
        setMeta(data?.meta ?? null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e?.message || String(e));
        setBars([]);
        setMeta(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [url]);

  return { bars, meta, loading, error };
}
