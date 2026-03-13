import { safeJson, safeStr } from "../format/safe.js";

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 8;
const logsCache = new Map();

/**
 * Returns whether the cache entry is still fresh.
 *
 * @param {number} ts Entry timestamp.
 * @returns {boolean} True when fresh.
 */
function isFresh(ts) {
  return Number(ts) > 0 && Date.now() - Number(ts) <= CACHE_TTL_MS;
}

/**
 * Builds a stable cache key for bot log queries.
 *
 * @param {Object} params Key parts.
 * @param {string} params.botId Bot id.
 * @param {string} params.modeNorm Normalized mode.
 * @param {number} params.limit Result limit.
 * @param {number} params.startTs Start timestamp.
 * @param {number} params.endTs End timestamp.
 * @returns {string} Cache key.
 */
export function buildLogsCacheKey({ botId, modeNorm, limit, startTs, endTs }) {
  return [botId, modeNorm, limit, startTs || 0, endTs || 0].join("|");
}

/**
 * Gets cached logs for the provided key.
 *
 * @param {string} key Cache key.
 * @returns {Array|null} Cached data or null.
 */
export function getCachedLogs(key) {
  const entry = logsCache.get(key);
  if (!entry || !isFresh(entry.ts)) {
    logsCache.delete(key);
    return null;
  }
  return Array.isArray(entry.data) ? entry.data : null;
}

/**
 * Saves logs into the in-memory cache while keeping the cache bounded.
 *
 * @param {string} key Cache key.
 * @param {Array} data Cached rows.
 * @returns {void}
 */
export function setCachedLogs(key, data) {
  logsCache.set(key, {
    ts: Date.now(),
    data: Array.isArray(data) ? data : [],
  });

  if (logsCache.size <= MAX_CACHE_ENTRIES) return;

  const oldestKey = logsCache.keys().next().value;
  if (oldestKey) {
    logsCache.delete(oldestKey);
  }
}

/**
 * Returns true when the level should be treated as warning or failure-ish.
 *
 * @param {string} level Log level.
 * @returns {boolean} True when fail-ish.
 */
export function isFailishLevel(level) {
  const normalized = String(level || "").toLowerCase();
  return normalized === "error" || normalized === "warn" || normalized === "warning";
}

/**
 * Normalizes an effective bot state from multiple backend variants.
 *
 * @param {string} value Raw state value.
 * @param {string} [desiredState=""] Desired state.
 * @returns {string} Normalized effective state.
 */
export function normalizeEffective(value, desiredState = "") {
  const normalized = String(value || "").toLowerCase();
  const desired = String(desiredState || "").toLowerCase();

  if (["running", "starting", "stopping", "offline", "errored"].includes(normalized)) {
    return normalized;
  }

  if (normalized === "error" || normalized === "failed") {
    return "errored";
  }

  if (["stopped", "idle", "paused"].includes(normalized)) {
    return desired === "running" ? "offline" : "stopped";
  }

  return "unknown";
}

/**
 * Creates a UI pill descriptor for the effective state.
 *
 * @param {string} effective Effective state.
 * @param {string} [pausedReason=""] Paused reason.
 * @param {string} [desiredState=""] Desired state.
 * @returns {{label: string, cls: string}} Pill metadata.
 */
export function statusPill(effective, pausedReason = "", desiredState = "") {
  const desired = String(desiredState || "").toLowerCase();

  if (effective === "running" && pausedReason) {
    return { label: "Paused by condition", cls: "blog-pill blog-pill--warn" };
  }
  if (effective === "running") {
    return { label: "Live", cls: "blog-pill blog-pill--on" };
  }
  if (effective === "starting") {
    return { label: "Starting…", cls: "blog-pill blog-pill--soft" };
  }
  if (effective === "stopping") {
    return { label: "Stopping…", cls: "blog-pill blog-pill--soft" };
  }
  if (effective === "offline" && desired === "stopped") {
    return { label: "Stopped", cls: "blog-pill blog-pill--paused" };
  }
  if (effective === "offline") {
    return { label: "Runner offline", cls: "blog-pill blog-pill--off" };
  }
  if (effective === "stopped") {
    return { label: "Stopped", cls: "blog-pill blog-pill--paused" };
  }
  if (effective === "errored") {
    return { label: "Error", cls: "blog-pill blog-pill--bad" };
  }

  return { label: "Unknown", cls: "blog-pill blog-pill--soft" };
}

/**
 * Normalizes a backend log row into a predictable frontend shape.
 *
 * @param {Object} row Raw backend row.
 * @returns {Object} Normalized row.
 */
export function normalizeLogRow(row) {
  const ts = Number(row?.ts) || 0;
  const level = safeStr(row?.level || row?.status, "info").toLowerCase();
  const source = safeStr(row?.source, "system").toLowerCase();
  const action = safeStr(row?.action || row?.event_type, "log").toLowerCase();
  const status = safeStr(row?.status, "").toLowerCase();
  const details = row?.details && typeof row.details === "object" ? row.details : {};

  const userMessage = safeStr(row?.user_message, "");
  const message = safeStr(row?.message, "");
  const technicalMessage = safeStr(row?.technical_message, "");
  const preferredMessage =
    userMessage ||
    message ||
    technicalMessage ||
    safeStr(details?.message, "") ||
    action.replaceAll("_", " ") ||
    "Update";

  return {
    ts,
    level,
    source,
    action,
    status,
    message: preferredMessage,
    user_message: userMessage,
    technical_message: technicalMessage,
    request_id: safeStr(row?.request_id, ""),
    runner_id: safeStr(row?.runner_id, ""),
    desired_state: safeStr(row?.desired_state, ""),
    runtime_state: safeStr(row?.runtime_state, ""),
    visible_to_user: Boolean(row?.visible_to_user),
    details,
  };
}

/**
 * Classifies a normalized log row into user-friendly display data.
 *
 * Precomputes a compact search blob so filtering does not repeatedly stringify
 * large metadata during every render.
 *
 * @param {Object} row Normalized row.
 * @returns {Object} Friendly row for display.
 */
export function classifyLog(row) {
  const levelRaw = String(row?.level || "info").toLowerCase();
  const isFail = isFailishLevel(levelRaw);

  const message = safeStr(row?.message, "");
  const userMessage = safeStr(row?.user_message, "");
  const technicalMessage = safeStr(row?.technical_message, "");
  const details = row?.details || {};
  const action = safeStr(row?.action, "log").toLowerCase();
  const source = safeStr(row?.source, "system").toLowerCase();
  const runtimeState = safeStr(row?.runtime_state, "").toLowerCase();
  const desiredState = safeStr(row?.desired_state, "").toLowerCase();

  const detailsStr = details ? safeJson(details) : "";
  const textBlob = `${message.toLowerCase()} ${action} ${source} ${detailsStr.toLowerCase()}`.trim();

  const hasAny = (...needles) => needles.some((needle) => textBlob.includes(String(needle).toLowerCase()));

  let category = "System";
  if (hasAny("market", "session", "open", "closed", "next_open_epoch", "market_closed")) category = "Market";
  else if (hasAny("order", "fill", "filled", "broker", "alpaca", "position")) category = "Orders";
  else if (hasAny("risk", "max trades", "min confidence", "blocked", "halt", "guard")) category = "Risk";
  else if (hasAny("signal", "strategy", "ema", "trend", "entry", "exit")) category = "Strategy";
  else if (hasAny("runner", "heartbeat", "offline", "starting", "stopping")) category = "Runner";

  let headline = userMessage || message || "Update";
  let detail = "";
  let actionLabel = action ? action.replaceAll("_", " ") : "Update";

  if (action === "request_start") {
    actionLabel = "Start";
    headline = "Start requested";
    detail = "The control plane asked the runner to start the bot.";
    category = "System";
  } else if (action === "request_stop") {
    actionLabel = "Stop";
    headline = "Stop requested";
    detail = "The control plane asked the runner to stop the bot.";
    category = "System";
  } else if (action === "request_arm") {
    actionLabel = "Arm";
    headline = "Bot armed";
    detail = "The bot is armed and allowed to start.";
    category = "System";
  } else if (action === "request_disarm") {
    actionLabel = "Disarm";
    headline = "Bot disarmed";
    detail = "The bot is disarmed and cannot start until armed again.";
    category = "System";
  } else if (action === "config_loaded") {
    actionLabel = "Config";
    headline = "Configuration updated";
    detail = "Bot configuration was saved successfully.";
    category = "System";
  } else if (action === "heartbeat") {
    actionLabel = "Heartbeat";

    if (details?.reason_code === "market_closed") {
      headline = "Waiting for market open";
      detail = technicalMessage || "The runner is healthy, but trading is paused until the market opens.";
      category = "Market";
    } else if (runtimeState === "running") {
      headline = "Runner heartbeat received";
      detail = technicalMessage || "Runner is online and scanning for setups.";
      category = "Runner";
    } else if (runtimeState === "starting") {
      headline = "Bot is starting";
      detail = technicalMessage || "Runner is initializing the bot.";
      category = "Runner";
    } else if (runtimeState === "stopping") {
      headline = "Bot is stopping";
      detail = technicalMessage || "Runner is shutting the bot down.";
      category = "Runner";
    } else if (runtimeState === "offline") {
      headline = desiredState === "stopped" ? "Bot is stopped" : "Runner reports bot offline";
      detail =
        technicalMessage ||
        (desiredState === "stopped"
          ? "The bot is intentionally not running."
          : "The bot is currently not running.");
      category = "Runner";
    } else {
      headline = userMessage || "Runner heartbeat received";
      detail = technicalMessage || "";
      category = "Runner";
    }
  } else if (action === "error") {
    actionLabel = "Error";
    headline = userMessage || "Bot reported an error";
    detail = technicalMessage || detailsStr;
    category = "Runner";
  } else if (action === "log" && (hasAny("intent", "preview") || Array.isArray(details?.preview))) {
    actionLabel = "Intent";
    headline = userMessage || "Runner submitted intents";
    detail = details?.count ? `Submitted ${details.count} intents.` : "";
    category = "Strategy";
  } else if (technicalMessage) {
    detail = technicalMessage;
  } else if (Object.keys(details).length) {
    detail = detailsStr;
  }

  const severity = isFail ? (levelRaw === "error" ? "error" : "warn") : "info";

  const rawMeta = {
    source: row?.source || null,
    action: row?.action || null,
    request_id: row?.request_id || null,
    runner_id: row?.runner_id || null,
    desired_state: row?.desired_state || null,
    runtime_state: row?.runtime_state || null,
    visible_to_user: row?.visible_to_user ?? null,
    details: row?.details || {},
  };

  const rawMetaString = safeJson(rawMeta);

  return {
    ts: row?.ts,
    category,
    action: actionLabel,
    severity,
    headline,
    detail,
    rawLevel: String(row?.level || row?.status || "info").toUpperCase(),
    rawMessage: message,
    rawMeta,
    rawMetaString,
    searchBlob: [
      safeStr(headline),
      safeStr(category),
      safeStr(actionLabel),
      String(levelRaw || ""),
      safeStr(message),
      rawMetaString,
    ]
      .join(" ")
      .toLowerCase(),
  };
}

/**
 * Creates a user-facing explainer for the current effective state.
 *
 * @param {string} effective Effective state.
 * @param {number | null} nextOpenEpoch Next market open epoch.
 * @param {string} [pausedReason=""] Paused reason.
 * @param {string} [desiredState=""] Desired state.
 * @returns {{tone: string, title: string, body: string}} Banner copy.
 */
export function effectiveExplainer(effective, nextOpenEpoch, pausedReason = "", desiredState = "") {
  const desired = String(desiredState || "").toLowerCase();

  if (effective === "running" && pausedReason) {
    return {
      tone: "warn",
      title: "Runner is healthy, but work is paused",
      body: pausedReason,
    };
  }
  if (effective === "running") {
    return {
      tone: "ok",
      title: "Live: scanning for trades",
      body: "The bot is online and evaluating signals. Orders may be placed if risk checks pass.",
    };
  }
  if (effective === "starting") {
    return {
      tone: "neutral",
      title: "Starting up",
      body: "Loading configuration and checking connectivity.",
    };
  }
  if (effective === "stopping") {
    return {
      tone: "neutral",
      title: "Stopping",
      body: "The runner is shutting the bot down.",
    };
  }
  if (effective === "offline" && desired === "stopped") {
    return {
      tone: "neutral",
      title: "Stopped",
      body: "The bot is intentionally not running right now.",
    };
  }
  if (effective === "offline") {
    return {
      tone: "bad",
      title: "Runner offline",
      body: "U-Stock isn’t receiving live runtime updates from the runner right now.",
    };
  }
  if (effective === "stopped") {
    return {
      tone: "neutral",
      title: "Stopped",
      body: "The bot is currently not running.",
    };
  }
  if (effective === "errored") {
    return {
      tone: "bad",
      title: "Error state",
      body: "The bot reported an error. Review recent issues below and inspect the raw details.",
    };
  }

  return {
    tone: "neutral",
    title: "Status unknown",
    body: "The bot status couldn’t be determined. Refresh and verify the runner is online.",
  };
}