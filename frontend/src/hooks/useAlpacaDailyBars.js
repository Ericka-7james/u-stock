// frontend/src/hooks/useAlpacaDailyBars.js
import { useEffect, useState } from "react";

/**
 * Read JSON safely (do NOT throw)
 */
async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Standardize API errors into an Error object
 * that preserves: status, code, detail, payload
 */
async function throwApiError(res, feature = "alpaca_daily_bars") {
  const status = res?.status || 0;
  const ct = res?.headers?.get?.("content-type") || "";
  const isJson = ct.includes("application/json");

  const data = isJson ? await safeJson(res) : null;
  const text = !isJson ? await res.text().catch(() => "") : "";

  // FastAPI may return:
  // { detail: "..." } OR { detail: { code, message, ... } }
  const detail = data?.detail ?? (text || null);

  let code = null;
  let message = null;

  if (detail && typeof detail === "object") {
    code = detail.code || data?.code || null;
    message = detail.message || detail.detail || data?.message || null;
  } else {
    code = data?.code || null;
    message = typeof detail === "string" ? detail : null;
  }

  const err = new Error(message || `Request failed (${status})`);
  err.status = status;
  err.code = code;
  err.detail = detail;
  err.payload = data || { raw: text };
  err.feature = feature;

  throw err;
}

export function useAlpacaDailyBars(symbol, limit = 220) {
  const [bars, setBars] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  // IMPORTANT: store the error object (not a string)
  const [error, setError] = useState(null);

  useEffect(() => {
    const sym = String(symbol || "").trim().toUpperCase();
    if (!sym) {
      setBars([]);
      setMeta(null);
      setError(null);
      return;
    }

    const ac = new AbortController();
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const url = `/api/alpaca/bars/daily?symbol=${encodeURIComponent(sym)}&limit=${encodeURIComponent(
          String(limit || 220)
        )}`;

        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });

        if (!res.ok) {
          await throwApiError(res, "daily_bars");
        }

        const json = (await safeJson(res)) || {};

        if (!alive) return;

        setBars(Array.isArray(json?.bars) ? json.bars : []);
        setMeta(json?.meta || null);
      } catch (e) {
        if (!alive) return;
        if (e?.name === "AbortError") return;

        setBars([]);
        setMeta(null);

        // store the full error object so explainAnyError can see code/detail
        setError(e);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [symbol, limit]);

  return { bars, meta, loading, error };
}
