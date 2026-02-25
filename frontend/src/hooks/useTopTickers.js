// frontend/src/hooks/useTopTickers.js
import { useEffect, useState } from "react";

async function apiGet(path, { signal } = {}) {
  const res = await fetch(path, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.detail || json?.error || `Request failed (${res.status})`;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

function toNum(x) {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(row) {
  const symbol = String(row?.symbol || "").trim().toUpperCase();
  if (!symbol) return null;

  return {
    symbol,
    price: toNum(row?.price),
    changePct: toNum(row?.changePct),
    volume: toNum(row?.volume),
    name: row?.name ? String(row.name) : null,
  };
}

export function useTopTickers(list = "most_active", limit = 10) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const url = `/api/market/us/top-tickers?list=${encodeURIComponent(
          list
        )}&limit=${encodeURIComponent(limit)}`;

        const json = await apiGet(url, { signal: ac.signal });
        if (!alive) return;

        const items = Array.isArray(json?.items) ? json.items : [];
        setData({
          ...json,
          items: items.map(normalizeRow).filter(Boolean),
        });
      } catch (e) {
        if (!alive) return;
        setError(e);
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [list, limit]);

  return { data, loading, error };
}