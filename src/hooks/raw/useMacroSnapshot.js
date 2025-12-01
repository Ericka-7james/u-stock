// src/hooks/useMacroSnapshot.js
import { useEffect, useState } from "react";

export function useMacroSnapshot() {
  const [series, setSeries] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const resp = await fetch("/data/macro.json", { cache: "no-store" });
        if (!resp.ok) {
          throw new Error(`Failed to load macro.json (${resp.status})`);
        }

        const json = await resp.json();
        if (cancelled) return;

        const rows = Array.isArray(json.series) ? json.series : [];

        setSeries(rows);
        setMeta({
          generatedAt: json.generated_at ?? json.generatedAt ?? null,
          error: json.error ?? null,
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("[useMacroSnapshot] error:", err);
        setError(err);
        setSeries([]);
        setMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { series, meta, loading, error };
}
