// frontend/src/hooks/bots/useBotControlCard.js

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../../lib/api/botApi.js";
import { safeStr } from "../../lib/format/botFormat.js";

import botUnavailableSquirrel from "../../assets/modal/bot-unavailable-squirrel.png";

/**
 * IMPORTANT:
 * - No JSX in this hook.
 * - This hook owns state, derivation, polling, optimistic transition handling,
 *   and mutation handlers for BotControlCard.
 * - UI components should consume this hook and render only.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Storage key base for the last selected bot.
 *
 * @type {string}
 */
const LAST_SELECTED_BOT_KEY = "ustock:last_bot_id_v1";

/**
 * Grace windows used to smooth over backend eventual consistency after actions.
 * These windows prevent the UI from immediately snapping back to stale state.
 */
const ARM_GRACE_MS = 10_000;
const DISARM_GRACE_MS = 10_000;
const START_GRACE_MS = 20_000;
const PAUSE_GRACE_MS = 12_000;

/**
 * Throttle interval for repeated non-forced status fetches.
 *
 * @type {number}
 */
const STATUS_THROTTLE_MS = 600;

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Returns a plain object or an empty object.
 *
 * @param {any} value
 * @returns {Record<string, any>}
 */
function asDict(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Returns an array or an empty array.
 *
 * @param {any} value
 * @returns {any[]}
 */
function asList(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Converts a value to a trimmed string.
 *
 * @param {any} value
 * @returns {string}
 */
function toNumStr(value) {
  return String(value ?? "").trim();
}

/**
 * Returns the current timestamp in milliseconds.
 *
 * @returns {number}
 */
function nowMs() {
  return Date.now();
}

/**
 * Sleep helper for small async timing gaps.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safely stringifies JSON-like data.
 *
 * @param {any} value
 * @returns {string}
 */
function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Extracts the most useful human-readable message from an error-like object.
 *
 * @param {any} err
 * @returns {string}
 */
function getErrorMessage(err) {
  if (!err) return "Unknown error";

  const body =
    err?.detail?.message ||
    err?.detail?.detail ||
    err?.response?.data?.detail ||
    err?.response?.data?.message ||
    err?.message;

  const text = String(body || err).trim();
  return text || "Unknown error";
}

/* -------------------------------------------------------------------------- */
/* Log helpers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Maps a log item to a normalized severity.
 *
 * @param {any} item
 * @returns {"info" | "warn" | "error"}
 */
function logSeverity(item) {
  const level = String(item?.level || "").toLowerCase();
  if (level === "error") return "error";
  if (level === "warn" || level === "warning") return "warn";
  return "info";
}

/**
 * Returns the CSS class name for a log severity.
 *
 * @param {"info" | "warn" | "error"} severity
 * @returns {string}
 */
function toneClass(severity) {
  if (severity === "error") return "blog-evt blog-evt--error";
  if (severity === "warn") return "blog-evt blog-evt--warn";
  return "blog-evt";
}

/**
 * Extracts the most relevant message from a log item.
 *
 * @param {any} item
 * @returns {string}
 */
function logMessageFor(item) {
  const payload = item?.payload;

  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
  if (typeof item?.message === "string" && item.message.trim()) return item.message.trim();
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();

  return "";
}

/* -------------------------------------------------------------------------- */
/* Runtime state helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Returns true when a value represents a truthy "armed" flag.
 *
 * @param {any} value
 * @returns {boolean}
 */
function truthy(value) {
  if (value === true || value === 1) return true;

  const s = String(value ?? "").trim().toLowerCase();
  return s === "true" || s === "armed" || s === "1" || s === "yes";
}

/**
 * Reads an "armed" flag from a status snapshot.
 *
 * @param {Record<string, any> | null | undefined} snapshot
 * @returns {boolean}
 */
function readArmedFlag(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;

  if (truthy(snapshot.armed)) return true;
  if (truthy(snapshot.is_armed)) return true;
  if (truthy(snapshot.isArmed)) return true;

  const armedState = String(snapshot.armed_state ?? snapshot.armedState ?? snapshot.arm_state ?? "")
    .trim()
    .toLowerCase();

  return armedState === "armed";
}

/**
 * Normalizes a raw status payload into a flatter shape with a nested market object.
 *
 * @param {any} data
 * @returns {Record<string, any>}
 */
function normalizeStatusPayload(data) {
  const root = asDict(data);
  const status = asDict(root.status) || asDict(root.snapshot) || asDict(root.data) || root;

  const merged = { ...root, ...status };
  merged.market = asDict(status.market) || asDict(root.market) || {};

  return merged;
}

/**
 * Returns a normalized effective state string.
 *
 * @param {any} value
 * @returns {string}
 */
function normalizeEffectiveState(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Returns true if the effective state represents running.
 *
 * @param {string} effectiveState
 * @returns {boolean}
 */
function isRunningState(effectiveState) {
  const s = normalizeEffectiveState(effectiveState);
  return s.includes("running");
}

/**
 * Returns true if the effective state represents waiting.
 *
 * @param {string} effectiveState
 * @returns {boolean}
 */
function isWaitingState(effectiveState) {
  const s = normalizeEffectiveState(effectiveState);
  return s.includes("waiting");
}

/**
 * Returns true if the effective state represents a stopped or idle family state.
 *
 * @param {string} effectiveState
 * @returns {boolean}
 */
function isStoppedFamilyState(effectiveState) {
  const s = normalizeEffectiveState(effectiveState);
  return s.includes("stopped") || s.includes("paused") || s.includes("idle") || s.includes("offline");
}

/**
 * Maps an effective state to a tone.
 *
 * @param {string} effectiveState
 * @returns {"neutral" | "pos" | "warn" | "neg"}
 */
function runtimeToneFromEffective(effectiveState) {
  const s = normalizeEffectiveState(effectiveState);

  if (!s) return "neutral";
  if (s === "starting" || s === "waiting_for_runner") return "warn";
  if (s === "stopping") return "warn";
  if (s.includes("running")) return "pos";
  if (s.includes("waiting")) return "warn";
  if (s.includes("paused") || s.includes("stopped") || s.includes("idle")) return "neutral";
  if (s.includes("error") || s.includes("failed") || s.includes("offline")) return "neg";

  return "neutral";
}

/**
 * Maps an effective state + intent to a compact human-readable runtime label.
 *
 * @param {string} effectiveState
 * @param {string} intent
 * @returns {string}
 */
function runtimeLabelFromEffective(effectiveState, intent) {
  const e = normalizeEffectiveState(effectiveState);
  const i = String(intent || "").toLowerCase();

  if (e === "starting" || e === "waiting_for_runner") return "Starting";
  if (e === "stopping") return "Stopping";
  if (e === "waiting_for_market") return "Waiting";
  if (e.includes("waiting")) return "Waiting";
  if (e.includes("running")) return "Running";
  if (e.includes("paused")) return "Paused";
  if (e.includes("stopped")) return "Stopped";
  if (e.includes("idle")) return "Idle";
  if (e.includes("offline")) return "Offline";
  if (e.includes("error") || e.includes("failed")) return "Error";

  if (i === "running") return "Running";
  if (i === "paused") return "Paused";
  if (i === "stopped") return "Stopped";

  return "Unknown";
}

/* -------------------------------------------------------------------------- */
/* Risk helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Validates the risk settings draft.
 *
 * @param {{
 *   risk_per_trade: string,
 *   max_trades_per_day: string,
 *   min_confidence: string
 * }} draft
 * @returns {Record<string, string>}
 */
function validateRiskDraft(draft) {
  const errors = {};

  const riskPerTrade = Number(draft.risk_per_trade);
  if (!Number.isFinite(riskPerTrade) || riskPerTrade <= 0 || riskPerTrade > 0.2) {
    errors.risk_per_trade = "Enter a number between 0 and 0.20";
  }

  const maxTradesPerDay = Number(draft.max_trades_per_day);
  if (!Number.isFinite(maxTradesPerDay) || !Number.isInteger(maxTradesPerDay) || maxTradesPerDay <= 0 || maxTradesPerDay > 200) {
    errors.max_trades_per_day = "Enter a whole number between 1 and 200";
  }

  const minConfidence = Number(draft.min_confidence);
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    errors.min_confidence = "Enter a number between 0 and 1";
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* API normalization helpers                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Normalizes available bot payloads from several server shapes.
 *
 * @param {any} data
 * @returns {Array<{id: string, name: string, description: string}>}
 */
function normalizeAvailableBots(data) {
  const root = asDict(data);
  const raw = root.items ?? root.bots ?? root.available ?? root.bot_ids ?? root.botIds ?? data;
  const items = asList(raw);

  const normalized = items
    .map((item) => {
      if (typeof item === "string") {
        const id = item.trim();
        return id ? { id, name: id, description: "" } : null;
      }

      const obj = asDict(item);
      const id = String(obj.id ?? obj.bot_id ?? obj.botId ?? obj.key ?? "").trim();
      if (!id) return null;

      return {
        id,
        name: String(obj.name ?? obj.label ?? id),
        description: String(obj.description ?? obj.desc ?? ""),
      };
    })
    .filter(Boolean);

  const seen = new Set();
  return normalized.filter((bot) => {
    if (seen.has(bot.id)) return false;
    seen.add(bot.id);
    return true;
  });
}

/**
 * Returns true when the error looks like a 404/not-found response.
 *
 * @param {any} err
 * @returns {boolean}
 */
function isNotFoundError(err) {
  const status = Number(err?.status || err?.response?.status || 0);
  if (status === 404) return true;

  const message = String(err?.message || err || "").toLowerCase();
  return message.includes("404") || message.includes("not found");
}

/**
 * Returns true when the error clearly indicates the selected bot is unavailable.
 *
 * @param {any} err
 * @returns {boolean}
 */
function isBotUnavailableError(err) {
  const status = Number(err?.status || err?.response?.status || 0);
  const message = String(err?.message || "").toLowerCase();
  const detailMessage = String(
    err?.detail?.message ||
      err?.detail?.detail ||
      err?.response?.data?.detail ||
      err?.response?.data?.message ||
      ""
  ).toLowerCase();

  const blob = `${message} ${detailMessage}`.trim();

  const explicit =
    blob.includes("unknown bot") ||
    blob.includes("bot not registered") ||
    blob.includes("not wired") ||
    blob.includes("not hooked") ||
    blob.includes("bot unavailable") ||
    blob.includes("bot not found");

  if (status === 404) return explicit || blob.includes("bot");
  return explicit;
}

/**
 * GET helper that falls back across multiple possible routes.
 *
 * @param {string[]} paths
 * @param {Record<string, any>} params
 * @returns {Promise<any>}
 */
async function apiGetWithFallback(paths, params) {
  let lastErr = null;

  for (const path of paths) {
    try {
      return await apiGet(path, params);
    } catch (err) {
      lastErr = err;
      if (!isNotFoundError(err)) break;
    }
  }

  throw lastErr;
}

/**
 * POST helper that falls back across multiple possible routes.
 *
 * @param {string[]} paths
 * @param {Record<string, any>} body
 * @returns {Promise<any>}
 */
async function apiPostWithFallback(paths, body) {
  let lastErr = null;

  for (const path of paths) {
    try {
      return await apiPost(path, body);
    } catch (err) {
      lastErr = err;
      if (!isNotFoundError(err)) break;
    }
  }

  throw lastErr;
}

/* -------------------------------------------------------------------------- */
/* Persistence helpers                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Builds a storage key for a user/session-scoped bot selection.
 *
 * @param {string | number | null | undefined} storageScope
 * @returns {string}
 */
function buildStorageKey(storageScope) {
  const scope = String(storageScope || "").trim();
  return scope ? `${LAST_SELECTED_BOT_KEY}:${scope}` : LAST_SELECTED_BOT_KEY;
}

/**
 * Reads a stored bot id from localStorage.
 *
 * @param {string} storageKey
 * @returns {string}
 */
function readStoredBotId(storageKey) {
  try {
    const value = window.localStorage.getItem(storageKey);
    const s = String(value || "").trim();
    return s || "";
  } catch {
    return "";
  }
}

/**
 * Writes a stored bot id to localStorage.
 *
 * @param {string} storageKey
 * @param {string} botId
 * @returns {void}
 */
function writeStoredBotId(storageKey, botId) {
  try {
    const s = String(botId || "").trim();
    if (!s) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, s);
  } catch {
    // Ignore storage failures.
  }
}

/* -------------------------------------------------------------------------- */
/* Pending action helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Creates a pending action record.
 *
 * @param {"arm" | "disarm" | "start" | "pause"} kind
 * @param {string} botId
 * @param {number} durationMs
 * @returns {{ kind: "arm" | "disarm" | "start" | "pause", botId: string, until: number }}
 */
function makePendingAction(kind, botId, durationMs) {
  return {
    kind,
    botId,
    until: nowMs() + durationMs,
  };
}

/**
 * Returns true when a pending action is still active for the selected bot.
 *
 * @param {{ kind: string, botId: string, until: number } | null} pendingAction
 * @param {string} selectedBotId
 * @returns {boolean}
 */
function isPendingForSelectedBot(pendingAction, selectedBotId) {
  if (!pendingAction) return false;
  if (!selectedBotId) return false;
  if (pendingAction.botId !== selectedBotId) return false;
  return pendingAction.until > nowMs();
}

/**
 * Returns true if the pending action can be cleared based on the latest snapshot.
 *
 * @param {{ kind: string, botId: string, until: number } | null} pendingAction
 * @param {Record<string, any> | null} snapshot
 * @param {string} selectedBotId
 * @returns {boolean}
 */
function shouldClearPendingAction(pendingAction, snapshot, selectedBotId) {
  if (!pendingAction) return true;
  if (!selectedBotId) return true;
  if (pendingAction.botId !== selectedBotId) return true;
  if (pendingAction.until <= nowMs()) return true;

  const effectiveState = normalizeEffectiveState(snapshot?.effective_state);
  const armed = readArmedFlag(snapshot);

  if (pendingAction.kind === "arm") return armed;
  if (pendingAction.kind === "disarm") return !armed;

  if (pendingAction.kind === "start") {
    if (isRunningState(effectiveState) || isWaitingState(effectiveState)) return true;
    return false;
  }

  if (pendingAction.kind === "pause") {
    if (isStoppedFamilyState(effectiveState)) return true;
    return false;
  }

  return true;
}

/**
 * Returns a display-effective-state that smooths over stale backend snapshots
 * during transition windows after start/pause actions.
 *
 * @param {string} rawEffectiveState
 * @param {string} intent
 * @param {string} desiredState
 * @param {{ kind: string, botId: string, until: number } | null} pendingAction
 * @param {string} selectedBotId
 * @returns {string}
 */
function deriveDisplayEffectiveState(rawEffectiveState, intent, desiredState, pendingAction, selectedBotId) {
  const effectiveState = normalizeEffectiveState(rawEffectiveState);

  if (!isPendingForSelectedBot(pendingAction, selectedBotId)) {
    return effectiveState;
  }

  if (pendingAction.kind === "start") {
    if (isRunningState(effectiveState) || isWaitingState(effectiveState)) return effectiveState;

    const normalizedIntent = String(intent || "").toLowerCase();
    const normalizedDesired = String(desiredState || "").toLowerCase();

    if (normalizedIntent === "running" || normalizedDesired === "running") {
      return "starting";
    }

    if (isStoppedFamilyState(effectiveState)) {
      return "starting";
    }

    return effectiveState || "starting";
  }

  if (pendingAction.kind === "pause") {
    if (isStoppedFamilyState(effectiveState)) return effectiveState;
    if (isRunningState(effectiveState) || isWaitingState(effectiveState)) return "stopping";
    return effectiveState || "stopping";
  }

  return effectiveState;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * useBotControlCard
 *
 * State and behavior controller for the dashboard BotControlCard.
 *
 * Responsibilities:
 * - load and persist bot selection
 * - fetch available bots, status, logs, and risk settings
 * - manage arm/start/pause/disarm actions
 * - smooth over eventual consistency after mutations with pending transitions
 * - derive button enablement and display state
 *
 * @param {{
 *   activeBotId?: string | null,
 *   onActiveBotChange?: (botId: string) => void,
 *   onStartBot?: (botId: string) => Promise<any> | any,
 *   onStopBot?: (botId: string) => Promise<any> | any,
 *   COPY?: Record<string, any>,
 *   storageScope?: string | number | null
 * }} params
 * @returns {Record<string, any>}
 */
export default function useBotControlCard({
  activeBotId,
  onActiveBotChange,
  onStartBot,
  onStopBot,
  COPY,
  storageScope = "",
}) {
  const storageKey = useMemo(() => buildStorageKey(storageScope), [storageScope]);

  const [available, setAvailable] = useState([]);
  const [availableLoaded, setAvailableLoaded] = useState(false);

  const [selected, setSelected] = useState(safeStr(activeBotId, ""));
  const [snapshot, setSnapshot] = useState(null);

  const [hardLoading, setHardLoading] = useState(false);
  const [softLoading, setSoftLoading] = useState(false);

  const [armBusy, setArmBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);

  const [optimisticArmed, setOptimisticArmed] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const [errModalOpen, setErrModalOpen] = useState(false);
  const [errModal, setErrModal] = useState(null);

  const [armConfirmOpen, setArmConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [logItems, setLogItems] = useState([]);

  const [riskOpen, setRiskOpen] = useState(false);
  const [riskBusy, setRiskBusy] = useState(false);
  const [riskDraft, setRiskDraft] = useState({
    risk_per_trade: "",
    max_trades_per_day: "",
    min_confidence: "",
  });
  const [riskTouched, setRiskTouched] = useState({
    risk_per_trade: false,
    max_trades_per_day: false,
    min_confidence: false,
  });
  const [riskErrors, setRiskErrors] = useState({});

  const [selectPromptOpen, setSelectPromptOpen] = useState(false);

  const loadedBotsRef = useRef(new Set());
  const initialStatusLoadedRef = useRef(false);
  const statusReqSeqRef = useRef(0);
  const statusAbortRef = useRef(null);
  const statusInFlightRef = useRef(false);
  const lastStatusFetchRef = useRef(0);
  const pollTimerRef = useRef(null);
  const pendingActionClearTimerRef = useRef(null);
  const lastUnavailableBotRef = useRef("");

  const selectPromptKey = useMemo(() => {
    const scope = String(storageScope || "").trim();
    return scope ? `ustock_select_bot_prompt_shown_v1:${scope}` : "ustock_select_bot_prompt_shown_v1";
  }, [storageScope]);

  /**
   * Composite busy state.
   */
  const busy = useMemo(
    () => armBusy || startBusy || pauseBusy || riskBusy || hardLoading,
    [armBusy, startBusy, pauseBusy, riskBusy, hardLoading]
  );

  /**
   * Current selection state.
   */
  const hasSelection = useMemo(() => safeStr(selected, "") !== "", [selected]);

  /**
   * Selected bot metadata from available list.
   */
  const selectedMeta = useMemo(() => {
    const botId = safeStr(selected, "");
    if (!botId) return null;
    return (available || []).find((bot) => String(bot?.id || "") === botId) || null;
  }, [available, selected]);

  /**
   * Raw snapshot-derived values.
   */
  const mode = useMemo(() => {
    const m = String(snapshot?.mode || "paper").toLowerCase();
    return m === "live" ? "live" : "paper";
  }, [snapshot?.mode]);

  const intent = useMemo(() => safeStr(snapshot?.intent, ""), [snapshot?.intent]);
  const rawEff = useMemo(() => safeStr(snapshot?.effective_state, ""), [snapshot?.effective_state]);
  const desiredState = useMemo(() => safeStr(snapshot?.desired_state, ""), [snapshot?.desired_state]);
  const message = useMemo(() => safeStr(snapshot?.message, ""), [snapshot?.message]);

  const isOpen = useMemo(() => snapshot?.market?.is_open === true, [snapshot?.market?.is_open]);

  const nextOpenEpoch = useMemo(() => {
    const value = snapshot?.market?.next_open_epoch ?? snapshot?.nextOpenEpoch;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }, [snapshot?.market?.next_open_epoch, snapshot?.nextOpenEpoch]);

  const hbAge = useMemo(() => {
    const value =
      snapshot?.heartbeatAgeSec ??
      snapshot?.hb_age_seconds ??
      snapshot?.heartbeat_age ??
      snapshot?.heartbeat_age_seconds ??
      null;

    if (value == null) return null;

    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }, [snapshot]);

  /**
   * Smooth display-effective state during post-action backend lag.
   */
  const eff = useMemo(() => {
    return deriveDisplayEffectiveState(rawEff, intent, desiredState, pendingAction, safeStr(selected, ""));
  }, [rawEff, intent, desiredState, pendingAction, selected]);

  /**
   * Runtime tone + label should use display-effective state, not raw state.
   */
  const runtimeTone = useMemo(() => runtimeToneFromEffective(eff), [eff]);
  const runtimeLabel = useMemo(() => runtimeLabelFromEffective(eff, intent), [eff, intent]);

  /**
   * Armed state may use a short optimistic window after arm/disarm.
   */
  const isArmed = useMemo(() => {
    if (typeof optimisticArmed === "boolean") return optimisticArmed;
    return readArmedFlag(snapshot);
  }, [snapshot, optimisticArmed]);

  /**
   * Action-state booleans based on display-effective state.
   */
  const isRunningEff = useMemo(() => isRunningState(eff), [eff]);
  const isWaiting = useMemo(() => isWaitingState(eff), [eff]);

  /**
   * Expose isStarting for the card. This now includes both the API mutation and
   * the transition grace window after a successful start.
   */
  const isStartPending = useMemo(() => {
    return isPendingForSelectedBot(pendingAction, safeStr(selected, "")) && pendingAction?.kind === "start";
  }, [pendingAction, selected]);

  const isPausePending = useMemo(() => {
    return isPendingForSelectedBot(pendingAction, safeStr(selected, "")) && pendingAction?.kind === "pause";
  }, [pendingAction, selected]);

  const isStarting = useMemo(() => startBusy || isStartPending, [startBusy, isStartPending]);

  /**
   * Market-related derivations.
   */
  const marketClosedBlocksStart = useMemo(() => {
    if (!hasSelection) return false;
    return snapshot?.market?.blocks_start === true;
  }, [hasSelection, snapshot]);

  const showMarketClosedNote = useMemo(() => {
    if (!hasSelection) return false;
    if (snapshot?.market?.show_note) return true;
    if (snapshot?.market?.is_open === false) return true;
    if (marketClosedBlocksStart) return true;
    return false;
  }, [hasSelection, snapshot, marketClosedBlocksStart]);

  const startBlockedReason = useMemo(() => {
    if (!hasSelection) return "";
    const reason = safeStr(snapshot?.market?.reason, "");
    if (reason) return reason;
    if (marketClosedBlocksStart) return "Start blocked by server.";
    if (snapshot?.market?.is_open === false) return "Market is closed.";
    return "";
  }, [hasSelection, snapshot, marketClosedBlocksStart]);

  /**
   * Primary status line for display.
   */
  const statusLine = useMemo(() => {
    if (!hasSelection) return "Select a bot to view status.";

    const parts = [];
    if (runtimeLabel) parts.push(runtimeLabel);
    if (mode) parts.push(mode.toUpperCase());
    if (snapshot?.reason_code) parts.push(String(snapshot.reason_code).replaceAll("_", " "));

    return parts.filter(Boolean).join(" · ");
  }, [hasSelection, runtimeLabel, mode, snapshot?.reason_code]);

  /**
   * Button enablement.
   */
  const canArm = useMemo(() => {
    return hasSelection && !armBusy && !startBusy && !pauseBusy && !isArmed;
  }, [hasSelection, armBusy, startBusy, pauseBusy, isArmed]);

  const canDisarm = useMemo(() => {
    return hasSelection && !armBusy && !startBusy && !pauseBusy && isArmed && !isRunningEff && !isWaiting && !isStartPending;
  }, [hasSelection, armBusy, startBusy, pauseBusy, isArmed, isRunningEff, isWaiting, isStartPending]);

  const canStart = useMemo(() => {
    if (!hasSelection) return false;
    if (startBusy || pauseBusy) return false;
    if (isStartPending || isPausePending) return false;
    if (!isArmed) return false;
    if (isRunningEff || isWaiting) return false;
    if (marketClosedBlocksStart) return false;
    return true;
  }, [
    hasSelection,
    startBusy,
    pauseBusy,
    isStartPending,
    isPausePending,
    isArmed,
    isRunningEff,
    isWaiting,
    marketClosedBlocksStart,
  ]);

  const canPause = useMemo(() => {
    return hasSelection && !pauseBusy && !startBusy && (isRunningEff || isWaiting || isStartPending);
  }, [hasSelection, pauseBusy, startBusy, isRunningEff, isWaiting, isStartPending]);

  /**
   * Polling interval. Poll faster while starting / waiting / running.
   */
  const pollMs = useMemo(() => {
    if (!hasSelection) return 0;
    if (isRunningEff || isWaiting || isStartPending || startBusy) return 2500;
    return 5000;
  }, [hasSelection, isRunningEff, isWaiting, isStartPending, startBusy]);

  /**
   * Opens the standard error modal.
   */
  const fail = useCallback((title, body, action = null, image = null, subtitle = "") => {
    setErrModal({
      title: title || "Something went wrong",
      body: body || "Unexpected error.",
      subtitle: subtitle || "",
      image: image || null,
      action: action || null,
    });
    setErrModalOpen(true);
  }, []);

  /**
   * Closes the standard error modal.
   */
  const closeErrorModal = useCallback(() => {
    setErrModalOpen(false);
    setErrModal(null);
  }, []);

  /**
   * Clears the selected bot and resets most state related to that bot.
   *
   * @param {string} reason
   */
  const unselectBot = useCallback(
    (reason = "") => {
      if (statusAbortRef.current) {
        statusAbortRef.current.abort();
        statusAbortRef.current = null;
      }

      statusInFlightRef.current = false;
      statusReqSeqRef.current += 1;

      setSelected("");
      setSnapshot(null);
      setOptimisticArmed(null);
      setPendingAction(null);

      lastUnavailableBotRef.current = "";
      loadedBotsRef.current = new Set();
      initialStatusLoadedRef.current = false;

      setHardLoading(false);
      setSoftLoading(false);

      writeStoredBotId(storageKey, "");

      if (typeof onActiveBotChange === "function") {
        onActiveBotChange("");
      }

      setArmConfirmOpen(false);
      setStartConfirmOpen(false);
      setLogOpen(false);
      setRiskOpen(false);

      if (reason) {
        fail(COPY?.errors?.botUnavailableTitle || "Bot unavailable", reason, null, botUnavailableSquirrel);
      }
    },
    [COPY, fail, onActiveBotChange, storageKey]
  );

  /**
   * Loads the list of available bots.
   */
  const fetchAvailable = useCallback(async () => {
    try {
      const data = await apiGet("/api/bots/available", {});
      setAvailable(normalizeAvailableBots(data));
    } catch {
      setAvailable([]);
    } finally {
      setAvailableLoaded(true);
    }
  }, []);

  /**
   * Loads the latest status for the selected bot.
   *
   * Notes:
   * - uses request sequencing + abort controller to avoid stale overwrites
   * - uses hard loading for first-load experience
   * - does not immediately clear pending start/pause transitions unless the server
   *   confirms the new state or the grace window expires
   *
   * @param {{ force?: boolean }} options
   */
  const fetchStatus = useCallback(
    async ({ force = false } = {}) => {
      const botId = safeStr(selected, "");
      if (!botId) return;

      const currentTime = nowMs();

      if (!force && currentTime - lastStatusFetchRef.current < STATUS_THROTTLE_MS) return;
      if (statusInFlightRef.current && !force) return;

      lastStatusFetchRef.current = currentTime;

      const hasLoadedThisBot = loadedBotsRef.current.has(botId);
      const isHard = !initialStatusLoadedRef.current && (force || !hasLoadedThisBot);

      const controller = new AbortController();
      statusAbortRef.current = controller;

      const requestSeq = ++statusReqSeqRef.current;
      statusInFlightRef.current = true;

      if (isHard) setHardLoading(true);
      else setSoftLoading(true);

      try {
        const data = await apiGet("/api/bots/status", { bot_id: botId }, { signal: controller.signal });

        if (controller.signal.aborted) return;
        if (requestSeq !== statusReqSeqRef.current) return;
        if (safeStr(selected, "") !== botId) return;

        const normalized = normalizeStatusPayload(data);

        setSnapshot(normalized);
        loadedBotsRef.current.add(botId);
        initialStatusLoadedRef.current = true;

        if (lastUnavailableBotRef.current === botId) {
          lastUnavailableBotRef.current = "";
        }

        if (shouldClearPendingAction(pendingAction, normalized, botId)) {
          setPendingAction(null);
        }

        if (
          pendingAction?.kind === "arm" &&
          pendingAction.botId === botId &&
          readArmedFlag(normalized)
        ) {
          setOptimisticArmed(null);
        }

        if (
          pendingAction?.kind === "disarm" &&
          pendingAction.botId === botId &&
          !readArmedFlag(normalized)
        ) {
          setOptimisticArmed(null);
        }
      } catch (err) {
        if (err?.name === "AbortError") return;

        if (isBotUnavailableError(err)) {
          if (requestSeq !== statusReqSeqRef.current) return;

          if (lastUnavailableBotRef.current !== botId) {
            lastUnavailableBotRef.current = botId;
            unselectBot(COPY?.errors?.botUnavailableMessage || `“${botId}” is not available yet.`);
          } else {
            setSelected("");
            setSnapshot(null);
            setOptimisticArmed(null);
            setPendingAction(null);
            writeStoredBotId(storageKey, "");
            if (typeof onActiveBotChange === "function") onActiveBotChange("");
          }
          return;
        }

        if (requestSeq !== statusReqSeqRef.current) return;

        fail("Failed to load bot status", getErrorMessage(err), { label: "Refresh", kind: "refresh" });
      } finally {
        statusInFlightRef.current = false;

        if (requestSeq === statusReqSeqRef.current) {
          if (isHard) setHardLoading(false);
          else setSoftLoading(false);
        }
      }
    },
    [selected, pendingAction, fail, unselectBot, COPY, storageKey, onActiveBotChange]
  );

  /**
   * Handles modal error actions.
   *
   * @param {{ kind?: string } | null | undefined} action
   */
  const handleErrorAction = useCallback(
    async (action) => {
      const kind = action?.kind || errModal?.action?.kind;
      closeErrorModal();

      if (kind === "refresh") {
        await sleep(10);
        if (hasSelection) {
          await fetchStatus({ force: true });
        }
      }
    },
    [closeErrorModal, errModal, fetchStatus, hasSelection]
  );

  /**
   * Loads recent log items for the selected bot.
   */
  const fetchLog = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setLogBusy(true);

    try {
      const data = await apiGetWithFallback(
        ["/api/bots/log", "/api/bots/logs", "/api/bots/events"],
        { bot_id: botId, limit: 80, mode: "paper" }
      );

      const incoming = asList(data?.items || data || []).filter((item) => item && typeof item === "object");

      const keyOf = (item) => {
        const eventId = String(item?.event_id || item?.id || "").trim();
        if (eventId) return `eid:${eventId}`;

        const ts = String(item?.ts ?? "");
        const eventType = String(item?.event_type ?? "");
        const level = String(item?.level ?? "");
        const msg =
          typeof item?.payload?.message === "string"
            ? item.payload.message.trim()
            : typeof item?.message === "string"
              ? item.message.trim()
              : "";

        return `fb:${ts}|${eventType}|${level}|${msg}`;
      };

      setLogItems((prev) => {
        const old = Array.isArray(prev) ? prev : [];
        if (!old.length) return incoming;

        const seen = new Set(old.map(keyOf));
        const newOnes = [];

        for (const item of incoming) {
          const key = keyOf(item);
          if (!seen.has(key)) {
            seen.add(key);
            newOnes.push(item);
          }
        }

        const merged = [...newOnes, ...old];
        return merged.slice(0, 240);
      });
    } catch (err) {
      fail("Failed to load logs", getErrorMessage(err));
    } finally {
      setLogBusy(false);
    }
  }, [selected, fail]);

  /**
   * Loads risk settings for the selected bot.
   */
  const fetchRisk = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setRiskBusy(true);

    try {
      const data = await apiGetWithFallback(
        ["/api/bots/risk", "/api/bots/risk_settings", "/api/bots/risk-controls"],
        { bot_id: botId }
      );

      const d = asDict(data);
      const next = {
        risk_per_trade: toNumStr(d.risk_per_trade ?? d.riskPerTrade ?? ""),
        max_trades_per_day: toNumStr(d.max_trades_per_day ?? d.maxTradesPerDay ?? ""),
        min_confidence: toNumStr(d.min_confidence ?? d.minConfidence ?? ""),
      };

      setRiskDraft(next);
      setRiskTouched({
        risk_per_trade: false,
        max_trades_per_day: false,
        min_confidence: false,
      });
      setRiskErrors({});
    } catch (err) {
      fail("Failed to load risk settings", getErrorMessage(err));
    } finally {
      setRiskBusy(false);
    }
  }, [selected, fail]);

  /**
   * Handles bot selection changes from the UI.
   *
   * @param {Event} event
   */
  const onSelect = useCallback(
    (event) => {
      const value = safeStr(event?.target?.value, "");

      if (statusAbortRef.current) {
        statusAbortRef.current.abort();
        statusAbortRef.current = null;
      }

      statusInFlightRef.current = false;
      statusReqSeqRef.current += 1;
      initialStatusLoadedRef.current = false;

      if (!value) {
        setSelected("");
        setSnapshot(null);
        setOptimisticArmed(null);
        setPendingAction(null);

        lastUnavailableBotRef.current = "";
        loadedBotsRef.current = new Set();

        writeStoredBotId(storageKey, "");

        if (typeof onActiveBotChange === "function") {
          onActiveBotChange("");
        }

        return;
      }

      loadedBotsRef.current.delete(value);

      setSelected(value);
      setSnapshot(null);
      setOptimisticArmed(null);
      setPendingAction(null);

      writeStoredBotId(storageKey, value);

      if (typeof onActiveBotChange === "function") {
        onActiveBotChange(value);
      }
    },
    [onActiveBotChange, storageKey]
  );

  /**
   * Open risk modal after loading risk data.
   */
  const openRisk = useCallback(async () => {
    if (!hasSelection) return;

    try {
      await fetchRisk();
      setRiskOpen(true);
    } catch {
      // fetchRisk already handles fail()
    }
  }, [hasSelection, fetchRisk]);

  /**
   * Open log modal after loading log data.
   */
  const openLog = useCallback(async () => {
    if (!hasSelection) return;

    try {
      await fetchLog();
      setLogOpen(true);
    } catch {
      // fetchLog already handles fail()
    }
  }, [hasSelection, fetchLog]);

  /**
   * Close log modal.
   */
  const closeLog = useCallback(() => setLogOpen(false), []);

  /**
   * Close risk modal.
   */
  const closeRisk = useCallback(() => setRiskOpen(false), []);

  /**
   * Opens arm confirmation modal if arming is allowed.
   */
  const requestArm = useCallback(() => {
    if (!canArm) return;
    setArmConfirmOpen(true);
  }, [canArm]);

  /**
   * Confirms arm action.
   */
  const confirmArm = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setArmBusy(true);

    try {
      await apiPost("/api/bots/arm", { bot_id: botId });

      setOptimisticArmed(true);
      setPendingAction(makePendingAction("arm", botId, ARM_GRACE_MS));
      setArmConfirmOpen(false);

      await fetchStatus({ force: true });
      await sleep(250);
      await fetchStatus({ force: true });
    } catch (err) {
      setOptimisticArmed(null);
      setPendingAction(null);
      fail("Failed to arm bot", getErrorMessage(err));
    } finally {
      setArmBusy(false);
    }
  }, [selected, fetchStatus, fail]);

  /**
   * Disarms the selected bot.
   */
  const doDisarm = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;
    if (!canDisarm) return;

    setArmBusy(true);

    try {
      await apiPost("/api/bots/disarm", { bot_id: botId });

      setOptimisticArmed(false);
      setPendingAction(makePendingAction("disarm", botId, DISARM_GRACE_MS));

      await fetchStatus({ force: true });
    } catch (err) {
      setOptimisticArmed(null);
      setPendingAction(null);
      fail("Failed to disarm bot", getErrorMessage(err));
    } finally {
      setArmBusy(false);
    }
  }, [selected, canDisarm, fetchStatus, fail]);

  /**
   * Opens start confirmation modal if starting is allowed.
   */
  const requestStart = useCallback(() => {
    if (!canStart) return;
    setStartConfirmOpen(true);
  }, [canStart]);

  /**
   * Confirms start action.
   *
   * Key behavior:
   * - immediately enters a pending "start" grace window after a successful API call
   * - this prevents the UI from reverting to stale "Stopped" snapshots while the runner catches up
   */
  const confirmStart = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setStartBusy(true);

    try {
      if (typeof onStartBot === "function") {
        await onStartBot(botId);
      } else {
        await apiPost("/api/bots/start", { bot_id: botId });
      }

      setStartConfirmOpen(false);
      setPendingAction(makePendingAction("start", botId, START_GRACE_MS));

      await fetchStatus({ force: true });
      await sleep(1200);
      await fetchStatus({ force: true });
    } catch (err) {
      setPendingAction(null);
      fail("Failed to start bot", getErrorMessage(err));
    } finally {
      setStartBusy(false);
    }
  }, [selected, onStartBot, fetchStatus, fail]);

  /**
   * Pauses/stops the selected bot.
   */
  const doPause = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;
    if (!canPause) return;

    setPauseBusy(true);

    try {
      if (typeof onStopBot === "function") {
        await onStopBot(botId);
      } else {
        await apiPost("/api/bots/stop", { bot_id: botId });
      }

      setPendingAction(makePendingAction("pause", botId, PAUSE_GRACE_MS));
      await fetchStatus({ force: true });
    } catch (err) {
      setPendingAction(null);
      fail("Failed to pause bot", getErrorMessage(err));
    } finally {
      setPauseBusy(false);
    }
  }, [selected, canPause, onStopBot, fetchStatus, fail]);

  /**
   * Updates risk draft field values.
   *
   * @param {string} key
   * @param {string} value
   */
  const onRiskChange = useCallback((key, value) => {
    setRiskDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  /**
   * Marks a risk field as touched and updates that field's validation state.
   *
   * @param {string} key
   */
  const onRiskBlur = useCallback(
    (key) => {
      setRiskTouched((prev) => ({ ...prev, [key]: true }));

      setRiskErrors((prev) => {
        const next = { ...prev };
        const errs = validateRiskDraft({ ...riskDraft, [key]: riskDraft[key] });

        if (errs[key]) next[key] = errs[key];
        else delete next[key];

        return next;
      });
    },
    [riskDraft]
  );

  /**
   * Persists risk settings.
   */
  const saveRisk = useCallback(async () => {
    const botId = safeStr(selected, "");
    if (!botId) return;

    setRiskTouched({
      risk_per_trade: true,
      max_trades_per_day: true,
      min_confidence: true,
    });

    const errs = validateRiskDraft(riskDraft);
    setRiskErrors(errs);

    if (Object.keys(errs).length > 0) return;

    setRiskBusy(true);

    try {
      await apiPostWithFallback(
        ["/api/bots/risk", "/api/bots/risk_settings", "/api/bots/risk-controls"],
        {
          bot_id: botId,
          risk_per_trade: Number(riskDraft.risk_per_trade),
          max_trades_per_day: Number(riskDraft.max_trades_per_day),
          min_confidence: Number(riskDraft.min_confidence),
        }
      );

      setRiskOpen(false);
      await fetchStatus({ force: true });
    } catch (err) {
      fail("Failed to save risk settings", getErrorMessage(err));
    } finally {
      setRiskBusy(false);
    }
  }, [selected, riskDraft, fetchStatus, fail]);

  /* ------------------------------------------------------------------------ */
  /* Effects                                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * Restore selection from storage when parent has not supplied a bot id yet.
   */
  useEffect(() => {
    const propId = safeStr(activeBotId, "");
    const sel = safeStr(selected, "");

    if (propId) return;
    if (sel) return;

    const stored = readStoredBotId(storageKey);
    if (!stored) return;

    setSelected(stored);

    if (typeof onActiveBotChange === "function") {
      onActiveBotChange(stored);
    }

    loadedBotsRef.current.delete(stored);
  }, [activeBotId, selected, storageKey, onActiveBotChange]);

  /**
   * When parent provides an active bot id, accept it if local selection is empty.
   */
  useEffect(() => {
    const propId = safeStr(activeBotId, "");
    if (!propId) return;

    setSelected((prev) => (prev ? prev : propId));
    writeStoredBotId(storageKey, propId);
  }, [activeBotId, storageKey]);

  /**
   * Prompt logic for "please select a bot" style UX.
   */
  useEffect(() => {
    const propId = safeStr(activeBotId, "");
    const sel = safeStr(selected, "");
    const hasBotsLoaded = Array.isArray(available) && available.length > 0;

    if (sel || propId) {
      if (selectPromptOpen) setSelectPromptOpen(false);
      return;
    }

    if (!hasBotsLoaded) return;

    try {
      const alreadyShown = sessionStorage.getItem(selectPromptKey) === "1";
      if (alreadyShown) return;
      sessionStorage.setItem(selectPromptKey, "1");
    } catch {
      // Ignore sessionStorage failures.
    }

    setSelectPromptOpen(true);
  }, [activeBotId, selected, available, selectPromptOpen, selectPromptKey]);

  /**
   * If the current selection disappears from the available list, clear it.
   */
  useEffect(() => {
    if (!availableLoaded) return;

    const botId = safeStr(selected, "");
    if (!botId) return;

    const stillExists = (available || []).some((bot) => String(bot?.id || "") === botId);

    if (!stillExists) {
      unselectBot(COPY?.errors?.botUnavailableMessage || `“${botId}” is not available.`);
    }
  }, [availableLoaded, available, selected, unselectBot, COPY]);

  /**
   * Clear pending-action grace windows once they expire.
   */
  useEffect(() => {
    if (pendingActionClearTimerRef.current) {
      clearTimeout(pendingActionClearTimerRef.current);
      pendingActionClearTimerRef.current = null;
    }

    if (!pendingAction) return;

    const msRemaining = Math.max(0, pendingAction.until - nowMs());

    pendingActionClearTimerRef.current = setTimeout(() => {
      setPendingAction((current) => {
        if (!current) return null;
        if (current.until <= nowMs()) return null;
        return current;
      });
    }, msRemaining + 20);

    return () => {
      if (pendingActionClearTimerRef.current) {
        clearTimeout(pendingActionClearTimerRef.current);
        pendingActionClearTimerRef.current = null;
      }
    };
  }, [pendingAction]);

  /**
   * Clear optimistic armed override once confirmed or once the grace window expires.
   */
  useEffect(() => {
    if (!pendingAction || !selected) return;
    if (pendingAction.botId !== selected) return;

    if (pendingAction.kind === "arm" || pendingAction.kind === "disarm") {
      if (pendingAction.until <= nowMs()) {
        setOptimisticArmed(null);
      }
    }
  }, [pendingAction, selected]);

  /**
   * Initial available-bots load.
   */
  useEffect(() => {
    fetchAvailable();
  }, [fetchAvailable]);

  /**
   * Status polling lifecycle.
   */
  useEffect(() => {
    if (!hasSelection) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    fetchStatus({ force: true });

    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    pollTimerRef.current = setInterval(() => {
      fetchStatus({ force: false });
    }, pollMs);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [hasSelection, selected, fetchStatus, pollMs]);

  /**
   * Refresh logs while log modal is open.
   */
  useEffect(() => {
    if (!logOpen) return;

    const timer = setInterval(() => {
      fetchLog();
    }, 5000);

    return () => clearInterval(timer);
  }, [logOpen, fetchLog]);

  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    return () => {
      if (statusAbortRef.current) {
        statusAbortRef.current.abort();
        statusAbortRef.current = null;
      }

      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      if (pendingActionClearTimerRef.current) {
        clearTimeout(pendingActionClearTimerRef.current);
        pendingActionClearTimerRef.current = null;
      }

      statusInFlightRef.current = false;
    };
  }, []);

  return {
    errModalOpen,
    errModal,
    closeErrorModal,
    handleErrorAction,

    hardLoading,
    softLoading,

    available,
    selected,
    selectedMeta,
    hasSelection,
    onSelect,

    runtimeTone,
    runtimeLabel,
    isArmed,

    busy,
    armBusy,
    startBusy,
    pauseBusy,
    isRunningEff,
    isWaiting,
    isStarting,
    canDisarm,
    canArm,
    canStart,
    canPause,

    marketClosedBlocksStart,

    openLog,
    openRisk,
    doDisarm,
    doPause,
    requestArm,
    requestStart,

    showMarketClosedNote,
    startBlockedReason,
    nextOpenEpoch,

    intent,
    eff,
    desiredState,
    hbAge,
    isOpen,
    statusLine,
    message,

    armConfirmOpen,
    setArmConfirmOpen,
    confirmArm,

    startConfirmOpen,
    setStartConfirmOpen,
    confirmStart,

    logOpen,
    closeLog,
    logBusy,
    logItems,
    logSeverity,
    toneClass,
    logMessageFor,
    safeJson,

    riskOpen,
    closeRisk,
    riskBusy,
    riskDraft,
    riskTouched,
    riskErrors,
    onRiskChange,
    onRiskBlur,
    saveRisk,

    mode,

    selectPromptOpen,
    setSelectPromptOpen,
  };
}