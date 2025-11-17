// src/hooks/useRedditMentions.js
import { useEffect, useState } from "react";

export function useRedditMentions() {
  const [rawData, setRawData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/reddit-mentions.json");
        if (!res.ok) {
          console.error("Failed to load reddit-mentions.json");
          setLoading(false);
          return;
        }
        const json = await res.json();
        setMeta({
          generatedAt: json.generatedAt,
          subreddits: json.subreddits,
          totalPosts: json.totalPosts,
        });
        setRawData(json.mentions || []);
      } catch (err) {
        console.error("Error loading reddit-mentions.json:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return { rawData, meta, loading };
}
