import { useEffect, useState } from "react";

function extractBotIds(availablePayload) {
  if (!availablePayload || typeof availablePayload !== "object") return [];

  const list =
    availablePayload.items ||
    availablePayload.bots ||
    availablePayload.available ||
    availablePayload.data ||
    [];

  if (!Array.isArray(list)) return [];

  const ids = list
    .map((x) => (x && typeof x === "object" ? x.bot_id : null))
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => v.trim());

  return Array.from(new Set(ids));
}

// Conservative detector: treat presence of runner/heartbeat markers as “connected”
function statusLooksConnected(st) {
  if (!st || typeof st !== "object") return false;

  // Common fields your BotService likely returns on status
  const runnerId = String(st.runner_id || "").trim();
  const online = st.online === true || st.connected === true || st.runnerOnline === true;

  const hb = Number(st.lastHeartbeatAt || st.last_heartbeat_at || 0);
  const seen = Number(st.lastSeenAt || st.last_seen_at || 0);

  return Boolean(runnerId) || online || hb > 0 || seen > 0;
}

export default function useAnyBotConnected({ enabled, authFetch }) {
  const [out, setOut] = useState({
    loading: false,
    checked: false,
    connected: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled || typeof authFetch !== "function") return;

    let alive = true;

    (async () => {
      setOut({ loading: true, checked: false, connected: false, error: null });

      try {
        // 1) bot catalog
        const rAvail = await authFetch("bots/available", { method: "GET" });
        const avail = await rAvail.json().catch(() => ({}));
        const botIds = extractBotIds(avail);

        if (!botIds.length) {
          if (!alive) return;
          setOut({ loading: false, checked: true, connected: false, error: null });
          return;
        }

        // 2) per-bot status (cookie-auth)
        const statuses = await Promise.all(
          botIds.map(async (bid) => {
            const r = await authFetch(`bots/status?bot_id=${encodeURIComponent(bid)}`, { method: "GET" });
            return r.json().catch(() => ({}));
          })
        );

        const connected = statuses.some(statusLooksConnected);

        if (!alive) return;
        setOut({ loading: false, checked: true, connected, error: null });
      } catch (e) {
        if (!alive) return;
        // fail-soft: don’t block dashboard, but don’t spam modal either
        setOut({
          loading: false,
          checked: true,
          connected: true, // treat unknown as connected so modal doesn’t show incorrectly
          error: e ? String(e) : "UnknownError",
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [enabled, authFetch]);

  return out;
}