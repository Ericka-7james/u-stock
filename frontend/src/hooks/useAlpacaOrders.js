import { useEffect, useState } from "react";

export function useAlpacaOrders({ status = "open", limit = 10 } = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({ status, limit: String(limit) });
        const res = await fetch(`/api/alpaca/orders?${qs.toString()}`, {
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.detail || json?.error || "Failed to load orders");
        if (!alive) return;
        setData(Array.isArray(json?.orders) ? json.orders : Array.isArray(json) ? json : []);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
        setData([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [status, limit]);

  return { data, loading, error };
}
