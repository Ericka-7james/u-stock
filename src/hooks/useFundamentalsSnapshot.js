import { useEffect, useState } from "react";

export function useFundamentalsSnapshot() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/data/fundamentals.json");
        const json = await res.json();

        setMeta({
          generatedAt: json.generatedAt,
          universe: json.universe || [],
        });

        setData(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        console.error("Error loading fundamentals:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { data, meta, loading };
}
