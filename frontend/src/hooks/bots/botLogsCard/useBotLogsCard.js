import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { apiGetWithRetry } from "../../../lib/api/http.js";
import { safeJson, safeStr, includesAny } from "../../../lib/format/safe.js";
import { dateStrToEpochSec, dayKeyFromEpochSeconds } from "../../../lib/format/datetime.js";
import {
  buildLogsCacheKey,
  getCachedLogs,
  setCachedLogs,
  normalizeEffective,
  statusPill,
  normalizeLogRow,
  classifyLog,
  effectiveExplainer,
} from "../../../lib/bots/botLogsCardUtils.js";

const DEFAULT_LIMIT = 240;

/**
 * Returns a status pill node for the current bot state.
 *
 * @param {Object} params Pill params.
 * @param {{label: string, cls: string}} params.pill Status pill definition.
 * @param {string} params.effective Effective state.
 * @param {string} params.desiredState Desired state.
 * @returns {JSX.Element} Status node.
 */
function renderStatusNode({ pill, effective, desiredState }) {
  if (effective === "offline" && desiredState !== "stopped") {
    return (
      <Link
        to="/connected-apps"
        className={`${pill.cls} blog-pillLink`}
        title="Runner offline — open Connected apps"
      >
        {pill.label}
      </Link>
    );
  }

  return (
    <span className={pill.cls} title="Bot effective state">
      {pill.label}
    </span>
  );
}

/**
 * Custom hook for BotLogsCard state, fetching, caching, and derived view data.
 *
 * @param {Object} params Hook params.
 * @param {string} params.defaultBotId Default bot id.
 * @param {number} params.maxPreview Preview item count.
 * @param {{start?: string, end?: string} | null} params.timeframe Optional timeframe.
 * @param {string} params.mode Trading mode.
 * @returns {Object} View model for the card.
 */
export default function useBotLogsCard({
  defaultBotId = "ema_trend",
  maxPreview = 4,
  timeframe = null,
  mode = "paper",
}) {
  const [botId, setBotId] = useState(defaultBotId);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [botStatus, setBotStatus] = useState(null);

  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [status, setStatus] = useState("all");
  const [selectedDay, setSelectedDay] = useState("");

  const modeNorm = String(mode || "paper").toLowerCase() === "live" ? "live" : "paper";

  const startTs = useMemo(
    () => dateStrToEpochSec(timeframe?.start || "", { endOfDay: false }),
    [timeframe],
  );

  const endTs = useMemo(
    () => dateStrToEpochSec(timeframe?.end || "", { endOfDay: true }),
    [timeframe],
  );

  const cacheKey = useMemo(
    () => buildLogsCacheKey({ botId, modeNorm, limit, startTs, endTs }),
    [botId, modeNorm, limit, startTs, endTs],
  );

  const aliveRef = useRef(true);
  const inflightRef = useRef({ logs: null, status: null });

  /**
   * Aborts any in-flight request for the given key.
   *
   * @param {"logs" | "status"} key Request key.
   * @returns {void}
   */
  const abortInflight = useCallback((key) => {
    const current = inflightRef.current[key];
    if (current) {
      current.abort();
      inflightRef.current[key] = null;
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
      abortInflight("logs");
      abortInflight("status");
    };
  }, [abortInflight]);

  /**
   * Loads event rows for the current bot and filters.
   *
   * @returns {Promise<void>}
   */
  const refreshLogs = useCallback(async () => {
    setErr("");
    setBusy(true);

    abortInflight("logs");
    const controller = new AbortController();
    inflightRef.current.logs = controller;

    try {
      const url =
        `/api/bots/events?bot_id=${encodeURIComponent(safeStr(botId, "ema_trend"))}` +
        `&mode=${encodeURIComponent(modeNorm)}` +
        `&limit=${encodeURIComponent(String(limit || DEFAULT_LIMIT))}` +
        (startTs ? `&start_ts=${encodeURIComponent(String(startTs))}` : "") +
        (endTs ? `&end_ts=${encodeURIComponent(String(endTs))}` : "");

      const data = await apiGetWithRetry(url, { signal: controller.signal });
      if (!aliveRef.current || controller.signal.aborted) return;

      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const normalized = rawItems
        .filter((row) => row && typeof row === "object")
        .map(normalizeLogRow)
        .filter((row) => Number(row.ts) > 0);

      setItems(normalized);
      setCachedLogs(cacheKey, normalized);

      const uniqueDays = Array.from(
        new Set(normalized.map((row) => dayKeyFromEpochSeconds(row.ts)).filter(Boolean)),
      ).sort();

      setSelectedDay((current) => {
        if (current) return current;
        return uniqueDays.length ? uniqueDays[uniqueDays.length - 1] : "";
      });
    } catch (error) {
      if (!aliveRef.current || controller.signal.aborted) return;
      setErr(String(error?.message || error));
    } finally {
      if (inflightRef.current.logs === controller) {
        inflightRef.current.logs = null;
      }
      if (aliveRef.current) {
        setBusy(false);
      }
    }
  }, [abortInflight, botId, cacheKey, endTs, limit, modeNorm, startTs]);

  /**
   * Loads current bot status.
   *
   * @returns {Promise<void>}
   */
  const refreshStatus = useCallback(async () => {
    abortInflight("status");
    const controller = new AbortController();
    inflightRef.current.status = controller;

    try {
      const data = await apiGetWithRetry(
        `/api/bots/status?bot_id=${encodeURIComponent(safeStr(botId, "ema_trend"))}`,
        { signal: controller.signal },
      );

      if (!aliveRef.current || controller.signal.aborted) return;
      setBotStatus(data || null);
    } catch {
      if (!aliveRef.current || controller.signal.aborted) return;
      setBotStatus(null);
    } finally {
      if (inflightRef.current.status === controller) {
        inflightRef.current.status = null;
      }
    }
  }, [abortInflight, botId]);

  /**
   * Refreshes both logs and status together.
   *
   * @returns {void}
   */
  const refreshAll = useCallback(() => {
    refreshLogs();
    refreshStatus();
  }, [refreshLogs, refreshStatus]);

  useEffect(() => {
    const cached = getCachedLogs(cacheKey);

    if (cached) {
      setItems(cached);
    } else {
      refreshLogs();
    }

    refreshStatus();
  }, [cacheKey, refreshLogs, refreshStatus]);

  const friendly = useMemo(() => {
    return (Array.isArray(items) ? items : []).map(classifyLog);
  }, [items]);

  const availableDays = useMemo(() => {
    const unique = Array.from(
      new Set((Array.isArray(items) ? items : []).map((row) => dayKeyFromEpochSeconds(row.ts)).filter(Boolean)),
    ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    if (selectedDay && !unique.includes(selectedDay)) {
      unique.push(selectedDay);
    }

    return unique;
  }, [items, selectedDay]);

  const filtered = useMemo(() => {
    const search = safeStr(deferredQ, "").trim();

    return (Array.isArray(friendly) ? friendly : []).filter((row) => {
      const dayKey = dayKeyFromEpochSeconds(row.ts);

      if (selectedDay && dayKey && dayKey !== selectedDay) {
        return false;
      }

      if (status !== "all") {
        const isIssue = row.severity === "warn" || row.severity === "error";
        if (status === "issues" && !isIssue) return false;
        if (status === "good" && isIssue) return false;
      }

      if (search) {
        if (!includesAny(row.searchBlob, search)) {
          return false;
        }
      }

      return true;
    });
  }, [deferredQ, friendly, selectedDay, status]);

  const preview = useMemo(() => {
    const list = Array.isArray(filtered) ? filtered : [];
    return list.slice(Math.max(0, list.length - maxPreview));
  }, [filtered, maxPreview]);

  const counts = useMemo(() => {
    const list = Array.isArray(filtered) ? filtered : [];
    const issues = list.filter((row) => row.severity === "warn" || row.severity === "error").length;
    return {
      total: list.length,
      issues,
    };
  }, [filtered]);

  const desiredState = safeStr(botStatus?.desired_state || botStatus?.intent, "");
  const effective = normalizeEffective(
    botStatus?.effective_state || botStatus?.state,
    desiredState,
  );
  const pausedReason = safeStr(botStatus?.pausedReason || botStatus?.paused_reason, "");
  const pill = statusPill(effective, pausedReason, desiredState);

  const nextOpen =
    botStatus?.nextOpenEpoch ||
    botStatus?.next_open_epoch ||
    botStatus?.market?.next_open_epoch ||
    null;

  const explain = effectiveExplainer(effective, nextOpen, pausedReason, desiredState);

  const statusNode = useMemo(() => {
    return renderStatusNode({
      pill,
      effective,
      desiredState,
    });
  }, [desiredState, effective, pill]);

  return {
    botId,
    setBotId,
    limit,
    setLimit,
    items,
    busy,
    err,
    q,
    setQ,
    status,
    setStatus,
    selectedDay,
    setSelectedDay,
    preview,
    filtered,
    availableDays,
    counts,
    explain,
    pausedReason,
    nextOpen,
    statusNode,
    refreshLogs,
    refreshStatus,
    refreshAll,
    safeJson,
  };
}