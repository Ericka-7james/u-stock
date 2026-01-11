// frontend/src/hooks/useAlpacaTradeSummary.js
import { useEffect, useState } from "react";

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function throwApiError(res, feature = "alpaca_trade_summary") {
  const status = res?.status || 0;
  const ct = res?.headers?.get?.("content-type") || "";
  const isJson = ct.includes("application/json");

  const data = isJson ? await safeJson(res) : null;
  const text = !isJson ? await res.text().catch(() => "") : "";

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

export function useAlpacaTradeSummary(preset = "Week", { slippageBps = 0, feeBps = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // IMPORTANT: store error object
  const [error, setError] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams();
        qs.set("preset", String(preset || "Week"));
        qs.set("slippage_bps", String(slippageBps ?? 0));
        qs.set("fee_bps", String(feeBps ?? 0));

        const url = `/api/alpaca/trading/summary?${qs.toString()}`;

        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });

        if (!res.ok) {
          await throwApiError(res, "trade_summary");
        }

        const json = (await safeJson(res)) || {};

        if (!alive) return;
        setData(json);
      } catch (e) {
        if (!alive) return;
        if (e?.name === "AbortError") return;

        setData(null);
        setError(e); // keep structured error
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
  }, [preset, slippageBps, feeBps]);

  return { data, loading, error };
}
