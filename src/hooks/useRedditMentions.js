// src/hooks/useRedditMentions.js
import { useEffect, useState } from "react";

/**
 * Reads /data/reddit-mentions.json and normalizes it into:
 *   - rawData: [{ ticker, count }, ...]
 *   - meta: { generatedAt, windowDescription, subreddits }
 *   - loading, error
 *
 * Works with both:
 *   1) Old shape: [ { ticker, count }, ... ]
 *   2) New Data Scout shape:
 *      {
 *        "generatedAt": "...",
 *        "windowDescription": "...",
 *        "subreddits": [...],
 *        "data": [ { "ticker": "AAPL", "count": 10 }, ... ]
 *      }
 */
export function useRedditMentions() {
  const [rawData, setRawData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/data/reddit-mentions.json");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} while fetching reddit-mentions.json`);
        }

        const json = await res.json();

        let nextRaw = [];
        let nextMeta = null;

        if (Array.isArray(json)) {
          // Old format: just an array of { ticker, count }
          nextRaw = json;
        } else if (json && Array.isArray(json.data)) {
          // New Data Scout shape
          nextRaw = json.data;
          nextMeta = {
            generatedAt: json.generatedAt || null,
            windowDescription: json.windowDescription || "Latest U-Stock data scout pull",
            subreddits: json.subreddits || [],
          };
        }

        if (!cancelled) {
          setRawData(nextRaw);
          setMeta(nextMeta);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[useRedditMentions] Failed to load reddit-mentions.json", err);
          setRawData([]);
          setMeta(null);
          setError(err);
        }
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
