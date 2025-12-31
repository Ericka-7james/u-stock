import { useEffect, useState } from "react";

export function useAlpacaDailyBars(symbol, limit = 200) {
  const [bars, setBars] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      const s = (symbol || "").trim();
      if (!s) {
        setBars([]);
        setMeta(null);
        setError("");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/alpaca/bars/daily?symbol=${encodeURIComponent(s)}&limit=${limit}`, {
          credentials: "include",
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg =
            data?.error ||                // <- from your exception handler
            data?.detail ||               // <- normal fastapi http errors
            `Request failed (${res.status})`;
          throw new Error(msg);
        }

        if (!alive) return;

        setBars(data.bars || []);
        setMeta(data.meta || null);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
        setBars([]);
        setMeta(null);
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [symbol, limit]);

  console.log("alpaca bars", symbol, bars?.length, bars?.[0]);

  return { bars, meta, loading, error };
}
