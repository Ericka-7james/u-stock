// frontend/src/hooks/useAlpacaTradeSummary.js
import { useEffect, useState } from "react";

export function useAlpacaTradeSummary(preset = "Week", { slippageBps = 0, feeBps = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError("");

      try {
        const qs = new URLSearchParams({
          preset: preset || "Week",
          slippage_bps: String(slippageBps ?? 0),
          fee_bps: String(feeBps ?? 0),
        });

        const res = await fetch(`/api/alpaca/trading/summary?${qs.toString()}`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.detail || `Trade summary failed (${res.status})`);
        }

        if (!alive) return;
        setData(json);
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
        setData(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [preset, slippageBps, feeBps]);

  return { data, loading, error };
}
