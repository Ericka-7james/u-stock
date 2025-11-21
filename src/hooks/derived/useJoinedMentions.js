// src/hooks/useJoinedMentions.js
import { useEffect, useState } from "react";

export function useJoinedMentions() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // 1) Try joined mentions first
        const joinedRes = await fetch("/data/mentions-joined.json");
        let joined = null;
        if (joinedRes.ok) {
          joined = await joinedRes.json();
        }

        const joinedRows = Array.isArray(joined?.data) ? joined.data : [];

        // 2) If joined has enough tickers, use it
        const MIN_TICKERS = 20;
        if (joined && joinedRows.length >= MIN_TICKERS) {
          if (cancelled) return;
          setData(joinedRows);
          setMeta({
            ...joined,
            source: "joined",
            reason: `Joined mentions across Reddit + news (>= ${MIN_TICKERS} tickers)`,
          });
          setLoading(false);
          return;
        }

        // 3) Otherwise, fall back to Reddit-only
        const redditRes = await fetch("/data/reddit-mentions.json");
        const reddit = redditRes.ok ? await redditRes.json() : null;
        const redditRows = Array.isArray(reddit?.data) ? reddit.data : [];

        if (cancelled) return;
        setData(redditRows);
        setMeta({
          ...reddit,
          source: joined ? "fallback:reddit" : "reddit",
          reason: joined
            ? `Joined mentions had only ${joinedRows.length} tickers; fell back to Reddit-only snapshot`
            : "Reddit mentions snapshot",
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[useJoinedMentions] error", err);
        setData([]);
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

  return { rawData: data, meta, loading };
}
