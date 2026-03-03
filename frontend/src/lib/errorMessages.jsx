// frontend/src/lib/ErrorMessages.jsx

import { ERROR_KEYS, ERROR_PRESETS } from "../content/error/errorCatalog";

/**
 * Output shape (ErrorModal-friendly):
 * {
 *   title, body, subtitle?, action?, image?,
 *   status, code,
 *   debug: { feature, status, statusText, detail, raw }
 * }
 */

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeBackendDetail(detail) {
  if (!detail) return null;
  if (typeof detail === "string") return { message: detail };
  if (typeof detail === "object") return detail;
  return { message: String(detail) };
}

function extractMessage(detail, text) {
  return (
    String(detail?.message || detail?.detail || "").trim() ||
    String(text || "").trim() ||
    ""
  );
}

/**
 * If body contains "... Fix: ...", split it into body + subtitle.
 * If subtitle exists, keep it (strip leading Fix:).
 */
function splitFix(body, subtitle) {
  const b = String(body || "").trim();
  const s = String(subtitle || "").trim();

  if (s) return { body: b, subtitle: s.replace(/^fix\s*:\s*/i, "").trim() };

  const idx = b.toLowerCase().indexOf("fix:");
  if (idx === -1) return { body: b, subtitle: "" };

  const before = b.slice(0, idx).trim();
  const after = b.slice(idx + 4).trim();
  return { body: before, subtitle: after };
}

/** Robustly extract the most useful human-readable message from many shapes */
export function extractErrorText(anyErr) {
  const candidates = [
    anyErr?.detail?.message,
    anyErr?.detail,
    anyErr?.payload?.detail?.message,
    anyErr?.payload?.detail,
    anyErr?.payload?.error,
    anyErr?.payload?.message,
    anyErr?.message,
    anyErr?.body,
    anyErr,
  ];

  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") return c;
    if (typeof c === "object") {
      if (typeof c.message === "string") return c.message;
      if (typeof c.error === "string") return c.error;
      try {
        return JSON.stringify(c);
      } catch {
        /* ignore */
      }
    }
  }
  return "";
}

/** Detect “duplicate email/phone” from a variety of backend styles */
function looksLikeDuplicateCredential(anyErr) {
  const s = extractErrorText(anyErr).toLowerCase();
  return (
    s.includes("already registered") ||
    s.includes("already exists") ||
    s.includes("account already exists") ||
    s.includes("duplicate") ||
    s.includes("unique constraint") ||
    s.includes("23505") ||
    s.includes("user already") ||
    s.includes("email already") ||
    s.includes("phone already") ||
    s.includes("already in use")
  );
}

function looksLikeAlpacaFeedOrEntitlement(msg = "") {
  const m = String(msg || "").toLowerCase();

  const hasForbidden =
    m.includes("forbidden") ||
    m.includes("not authorized") ||
    m.includes("unauthorized");

  const mentionsFeed =
    m.includes("sip") ||
    m.includes("iex") ||
    m.includes("entitlement") ||
    m.includes("subscription") ||
    (m.includes("market data") && (m.includes("not available") || hasForbidden));

  if (mentionsFeed && hasForbidden) return true;
  if (m.includes("entitlement") || m.includes("subscription")) return true;
  return false;
}

function looksLikeNetworkError(anyErr) {
  const s = extractErrorText(anyErr).toLowerCase();
  return (
    s.includes("network error") ||
    s.includes("failed to fetch") ||
    s.includes("timeout") ||
    s.includes("connection refused") ||
    s.includes("econnrefused") ||
    s.includes("enotfound") ||
    s.includes("fetch") && s.includes("failed")
  );
}

function makeUiError({
  key,
  title,
  body,
  subtitle,
  status,
  code,
  feature,
  statusText,
  detail,
  raw,
  action,
  image,
}) {
  const split = splitFix(body, subtitle);

  return {
    key,
    title,
    body: split.body,
    ...(split.subtitle ? { subtitle: split.subtitle } : {}),
    ...(action ? { action } : {}),
    ...(image ? { image } : {}),
    status,
    code,
    debug: { feature, status, statusText, detail, raw },
  };
}

/**
 * Apply preset defaults (title/body/subtitle/image/action),
 * allowing resolver to override specific fields.
 */
function applyPreset(key, overrides = {}) {
  const preset = ERROR_PRESETS[key] || ERROR_PRESETS[ERROR_KEYS.UNKNOWN];
  return { ...preset, ...overrides };
}

/**
 * Core resolver: takes normalized info, returns ErrorModal payload.
 * This is the *one* place where matching happens.
 */
function resolveUiError({
  status = 0,
  code = null,
  message = "",
  feature = "request",
  statusText = "",
  detail = null,
  raw = null,
}) {
  const msgLower = String(message || "").toLowerCase();

  // Network problems (fetch threw / backend unreachable)
  if (looksLikeNetworkError(raw) || msgLower.includes("failed to fetch")) {
    const preset = applyPreset(ERROR_KEYS.NETWORK_ERROR);
    return makeUiError({
      key: ERROR_KEYS.NETWORK_ERROR,
      ...preset,
      status,
      code: code || ERROR_KEYS.NETWORK_ERROR,
      feature,
      statusText,
      detail,
      raw,
    });
  }

  // Auth
  if (status === 401 || msgLower.includes("not authenticated") || msgLower.includes("session expired")) {
    const preset = applyPreset(ERROR_KEYS.NOT_AUTHENTICATED);
    return makeUiError({
      key: ERROR_KEYS.NOT_AUTHENTICATED,
      ...preset,
      status,
      code: code || ERROR_KEYS.NOT_AUTHENTICATED,
      feature,
      statusText,
      detail,
      raw,
    });
  }

  // Duplicate signup
  if (status === 409 || looksLikeDuplicateCredential({ detail, raw, message })) {
    const preset = applyPreset(ERROR_KEYS.DUPLICATE, {
      // Prefer backend message as body if it’s actually human-friendly
      body: detail?.message || presetBodyFallback(ERROR_KEYS.DUPLICATE),
    });
    return makeUiError({
      key: ERROR_KEYS.DUPLICATE,
      ...preset,
      status,
      code: code || ERROR_KEYS.DUPLICATE,
      feature,
      statusText,
      detail,
      raw,
    });
  }

  // Alpaca feed entitlement
  if (status === 403 || code === ERROR_KEYS.ALPACA_FEED_FORBIDDEN || looksLikeAlpacaFeedOrEntitlement(msgLower)) {
    const preset = applyPreset(ERROR_KEYS.ALPACA_FEED_FORBIDDEN);
    return makeUiError({
      key: ERROR_KEYS.ALPACA_FEED_FORBIDDEN,
      ...preset,
      status,
      code: code || ERROR_KEYS.ALPACA_FEED_FORBIDDEN,
      feature,
      statusText,
      detail,
      raw,
    });
  }

  // Server-ish fallback
  const fallbackText =
    String(message || "").trim() ||
    (status ? `${status} ${statusText}`.trim() : "") ||
    "Server error";

  const preset = applyPreset(ERROR_KEYS.SERVER_ERROR, {
    body: fallbackText,
  });

  return makeUiError({
    key: ERROR_KEYS.SERVER_ERROR,
    ...preset,
    status,
    code: code || ERROR_KEYS.SERVER_ERROR,
    feature,
    statusText,
    detail,
    raw,
  });
}

function presetBodyFallback(key) {
  const preset = ERROR_PRESETS[key];
  return preset?.body || "Something went wrong.";
}

/**
 * Response -> friendly error payload
 */
export async function explainResponseError(res, { feature = "request" } = {}) {
  const status = res?.status || 0;
  const statusText = res?.statusText || "";
  const ct = res?.headers?.get?.("content-type") || "";

  let data = null;
  let text = "";

  if (ct.includes("application/json")) {
    data = await safeJson(res);
  } else {
    try {
      text = await res.text();
    } catch {
      text = "";
    }
  }

  const detail = normalizeBackendDetail(data?.detail) || null;
  const code = detail?.code || data?.code || null;

  const message = extractMessage(detail, text) || (typeof data === "string" ? data : "");

  return resolveUiError({
    status,
    code,
    message,
    feature,
    statusText,
    detail,
    raw: data || text,
  });
}

/**
 * Any error -> friendly error payload
 * (supports thrown fetch errors, already-shaped UI errors, backend error objects, strings, etc.)
 */
export function explainAnyError(err, { feature = "request" } = {}) {
  if (!err) {
    const preset = applyPreset(ERROR_KEYS.UNKNOWN);
    return makeUiError({
      key: ERROR_KEYS.UNKNOWN,
      ...preset,
      status: 0,
      code: ERROR_KEYS.UNKNOWN,
      feature,
      statusText: "",
      detail: null,
      raw: err,
    });
  }

  // already shaped (your own UI error)
  if (typeof err === "object" && err.title && err.body) {
    // Ensure preset image/action exist if caller forgot them
    const key = err.key || ERROR_KEYS.UNKNOWN;
    const preset = applyPreset(key);
    return makeUiError({
      key,
      title: err.title || preset.title,
      body: err.body || preset.body,
      subtitle: err.subtitle ?? preset.subtitle,
      action: err.action ?? preset.action,
      image: err.image ?? preset.image,
      status: err.status || 0,
      code: err.code || key,
      feature,
      statusText: err?.debug?.statusText || "",
      detail: err?.debug?.detail || null,
      raw: err?.debug?.raw || err,
    });
  }

  // Normalize common thrown/object shapes
  if (typeof err === "object") {
    const status = err.status || err?.payload?.status || 0;
    const detailObj = normalizeBackendDetail(err.detail || err?.payload?.detail) || null;
    const code = detailObj?.code || err.code || err?.payload?.code || null;

    const message =
      detailObj?.message ||
      detailObj?.detail ||
      err.message ||
      extractErrorText(err);

    return resolveUiError({
      status,
      code,
      message,
      feature,
      statusText: "",
      detail: detailObj,
      raw: err,
    });
  }

  if (typeof err === "string") {
    return resolveUiError({
      status: 0,
      code: ERROR_KEYS.SERVER_ERROR,
      message: err,
      feature,
      statusText: "",
      detail: null,
      raw: err,
    });
  }

  // last resort
  const preset = applyPreset(ERROR_KEYS.SERVER_ERROR);
  return makeUiError({
    key: ERROR_KEYS.SERVER_ERROR,
    ...preset,
    status: 0,
    code: ERROR_KEYS.SERVER_ERROR,
    feature,
    statusText: " ",
    detail: null,
    raw: err,
  });
}
