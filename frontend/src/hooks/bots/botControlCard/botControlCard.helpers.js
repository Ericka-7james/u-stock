// frontend/src/hooks/bots/botControlCard/botControlCard.helpers.js

export function asDict(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function asList(value) {
  return Array.isArray(value) ? value : [];
}

export function toNumStr(value) {
  return String(value ?? "").trim();
}

export function nowMs() {
  return Date.now();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function getErrorMessage(err) {
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
/* Log helpers                                                                */
/* -------------------------------------------------------------------------- */

export function logSeverity(item) {
  const level = String(item?.level || item?.status || "").toLowerCase();
  if (level === "error") return "error";
  if (level === "warn" || level === "warning") return "warn";
  return "info";
}

export function toneClass(severity) {
  if (severity === "error") return "blog-evt blog-evt--error";
  if (severity === "warn") return "blog-evt blog-evt--warn";
  return "blog-evt";
}

export function logMessageFor(item) {
  if (typeof item?.user_message === "string" && item.user_message.trim()) {
    return item.user_message.trim();
  }

  if (typeof item?.message === "string" && item.message.trim()) {
    return item.message.trim();
  }

  if (typeof item?.technical_message === "string" && item.technical_message.trim()) {
    return item.technical_message.trim();
  }

  const payload = item?.payload || item?.details;

  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof item?.action === "string" && item.action.trim()) {
    return item.action.trim().replaceAll("_", " ");
  }

  return "";
}

/* -------------------------------------------------------------------------- */
/* Runtime state helpers                                                      */
/* -------------------------------------------------------------------------- */

export function truthy(value) {
  if (value === true || value === 1) return true;

  const s = String(value ?? "").trim().toLowerCase();
  return s === "true" || s === "armed" || s === "1" || s === "yes";
}

export function readArmedFlag(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;

  if (truthy(snapshot.armed)) return true;
  if (truthy(snapshot.is_armed)) return true;
  if (truthy(snapshot.isArmed)) return true;

  const armedState = String(snapshot.armed_state ?? snapshot.armedState ?? snapshot.arm_state ?? "")
    .trim()
    .toLowerCase();

  return armedState === "armed";
}

export function normalizeStatusPayload(data) {
  const root = asDict(data);
  const status = asDict(root.status) || asDict(root.snapshot) || asDict(root.data) || root;
  const merged = { ...root, ...status };
  merged.market = asDict(status.market) || asDict(root.market) || {};
  return merged;
}

export function normalizeEffectiveState(value) {
  return String(value || "").trim().toLowerCase();
}

export function isRunningState(effectiveState) {
  return normalizeEffectiveState(effectiveState) === "running";
}

export function isWaitingState(effectiveState) {
  const s = normalizeEffectiveState(effectiveState);
  return s === "starting" || s === "stopping";
}

export function isStoppedFamilyState(effectiveState) {
  const s = normalizeEffectiveState(effectiveState);
  return s === "stopped" || s === "idle" || s === "offline";
}

export function isErroredState(effectiveState) {
  return normalizeEffectiveState(effectiveState) === "errored";
}

export function runtimeToneFromEffective(effectiveState) {
  const s = normalizeEffectiveState(effectiveState);

  if (!s) return "neutral";
  if (s === "starting" || s === "stopping") return "warn";
  if (s === "running") return "pos";
  if (s === "errored") return "neg";
  if (s === "offline" || s === "stopped" || s === "idle") return "neutral";

  return "neutral";
}

export function runtimeLabelFromEffective(effectiveState, intent, pausedReason = "") {
  const e = normalizeEffectiveState(effectiveState);
  const i = String(intent || "").toLowerCase();
  const paused = String(pausedReason || "").trim();

  if (e === "starting") return "Starting";
  if (e === "stopping") return "Stopping";
  if (e === "running" && paused) return "Running";
  if (e === "running") return "Running";
  if (e === "offline") return i === "running" ? "Offline" : "Stopped";
  if (e === "stopped") return "Stopped";
  if (e === "idle") return "Idle";
  if (e === "errored") return "Error";

  if (i === "running") return "Running";
  if (i === "stopped") return "Stopped";

  return "Unknown";
}

/* -------------------------------------------------------------------------- */
/* Risk helpers                                                               */
/* -------------------------------------------------------------------------- */

export function validateRiskDraft(draft) {
  const errors = {};

  const riskPerTrade = Number(draft.risk_per_trade);
  if (!Number.isFinite(riskPerTrade) || riskPerTrade <= 0 || riskPerTrade > 0.2) {
    errors.risk_per_trade = "Enter a number between 0 and 0.20";
  }

  const maxTradesPerDay = Number(draft.max_trades_per_day);
  if (
    !Number.isFinite(maxTradesPerDay) ||
    !Number.isInteger(maxTradesPerDay) ||
    maxTradesPerDay <= 0 ||
    maxTradesPerDay > 200
  ) {
    errors.max_trades_per_day = "Enter a whole number between 1 and 200";
  }

  const minConfidence = Number(draft.min_confidence);
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    errors.min_confidence = "Enter a number between 0 and 1";
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* API normalization helpers                                                  */
/* -------------------------------------------------------------------------- */

export function normalizeAvailableBots(data) {
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

export function normalizeLogItems(data) {
  const incoming = asList(data?.items || data || []).filter((item) => item && typeof item === "object");

  return incoming.map((item) => {
    const details = asDict(item.details);
    const payload = asDict(item.payload);

    return {
      ...item,
      details,
      payload,
      level: String(item.level || item.status || "info").toLowerCase(),
      action: String(item.action || item.event_type || "").trim(),
      user_message: String(item.user_message || "").trim(),
      technical_message: String(item.technical_message || "").trim(),
    };
  });
}

export function isNotFoundError(err) {
  const status = Number(err?.status || err?.response?.status || 0);
  if (status === 404) return true;

  const message = String(err?.message || err || "").toLowerCase();
  return message.includes("404") || message.includes("not found");
}

export function isBotUnavailableError(err) {
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

/* -------------------------------------------------------------------------- */
/* Persistence helpers                                                        */
/* -------------------------------------------------------------------------- */

export function buildStorageKey(baseKey, storageScope) {
  const scope = String(storageScope || "").trim();
  return scope ? `${baseKey}:${scope}` : baseKey;
}

export function readStoredBotId(storageKey) {
  try {
    const value = window.localStorage.getItem(storageKey);
    const s = String(value || "").trim();
    return s || "";
  } catch {
    return "";
  }
}

export function writeStoredBotId(storageKey, botId) {
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
/* Pending action helpers                                                     */
/* -------------------------------------------------------------------------- */

export function makePendingAction(kind, botId, durationMs) {
  return {
    kind,
    botId,
    until: nowMs() + durationMs,
  };
}

export function isPendingForSelectedBot(pendingAction, selectedBotId) {
  if (!pendingAction) return false;
  if (!selectedBotId) return false;
  if (pendingAction.botId !== selectedBotId) return false;
  return pendingAction.until > nowMs();
}

export function shouldClearPendingAction(pendingAction, snapshot, selectedBotId) {
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

export function deriveDisplayEffectiveState(rawEffectiveState, intent, desiredState, pendingAction, selectedBotId) {
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