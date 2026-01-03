import { useEffect, useState } from "react";

export function useAlpacaPositions() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/alpaca/positions", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.detail || json?.error || "Failed to load positions");
        if (!alive) return;
        setData(Array.isArray(json?.positions) ? json.positions : Array.isArray(json) ? json : []);
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
  }, []);

  return { data, loading, error };
}
