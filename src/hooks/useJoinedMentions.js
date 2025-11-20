// src/hooks/useJoinedMentions.js
import { useEffect, useState } from "react";

export function useJoinedMentions() {
  const [rawData, setRawData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/data/mentions-joined.json", {
          cache: "no-cache",
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (cancelled) return;

        // Snapshot schema from joined_mentions.py:
        // {
        //   generatedAt: "...",
        //   sources: ["reddit", "news"],
        //   data: [
        //     { ticker, redditCount, newsCount, totalMentions },
        //     ...
        //   ]
        // }

        const data = Array.isArray(json.data) ? json.data : [];

        setRawData(
          data.map((row) => ({
            ticker: row.ticker,
            // Align with old reddit snapshot: single "count" field for chart
            count: row.totalMentions ?? row.redditCount ?? 0,
            redditCount: row.redditCount ?? 0,
            newsCount: row.newsCount ?? 0,
          }))
        );

        setMeta({
          generatedAt: json.generatedAt || null,
          windowDescription:
            "Joined mentions across Reddit + news (latest snapshot)",
          sources: json.sources || [],
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[useJoinedMentions] Failed to load joined mentions", err);
        setError(err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { rawData, meta, loading, error };
}
