// frontend/src/hooks/bots/useBotIntents.js
import { useCallback, useEffect, useRef, useState } from "react";

function safeStr(x, fallback = "") {
  const s = String(x ?? "").trim();
  return s || fallback;
}

/**
 * Fetch + poll bot intents for a bot.
 *
 * Usage:
 * const { items, ts, busy, err, refresh } = useBotIntents({
 *   botId,
 *   enabled: shouldPoll,
 *   limit: 10,
 *   pollMs: 7000,
 * });
 */
export default function useBotIntents({
  botId,
  enabled = true,
  limit = 10,
  pollMs = 7000,
} = {}) {
  const id = safeStr(botId, "");

  const [items, setItems] = useState([]);
  const [ts, setTs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const lastBotIdRef = useRef("");

  const refresh = useCallback(async () => {
    const bid = safeStr(id, "");
    if (!bid) return;

    setErr("");
    setBusy(true);

    try {
      const qs = new URLSearchParams({
        bot_id: bid,
        limit: String(Number(limit) || 10),
      });

      const res = await fetch(`/api/bots/intents?${qs.toString()}`, {
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = safeStr(data?.detail, "");
        throw new Error(detail || "Failed to load intents");
      }

      const list = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      setTs(Number(data?.ts) || 0);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [id, limit]);

  useEffect(() => {
    const bid = safeStr(id, "");

    // reset when no bot
    if (!bid) {
      setItems([]);
      setTs(0);
      setErr("");
      lastBotIdRef.current = "";
      return;
    }

    // if bot changed, clear old rows so UI doesn't “flash stale”
    if (lastBotIdRef.current && lastBotIdRef.current !== bid) {
      setItems([]);
      setTs(0);
      setErr("");
    }
    lastBotIdRef.current = bid;

    // always do an initial fetch
    refresh();

    // optionally poll
    if (!enabled) return;

    const t = setInterval(() => refresh(), Number(pollMs) || 7000);
    return () => clearInterval(t);
  }, [id, enabled, pollMs, refresh]);

  return { items, ts, busy, err, refresh };
}