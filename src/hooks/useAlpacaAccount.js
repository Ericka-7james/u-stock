import { useEffect, useState } from "react";

export function useAlpacaAccount() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/alpaca/account", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.detail || json?.error || "Failed to load account");
        if (!alive) return;
        setData(json);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
        setData(null);
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
