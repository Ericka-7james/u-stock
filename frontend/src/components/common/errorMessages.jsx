// frontend/src/common/errorMessages.jsx

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

function alpacaAction() {
  return { label: "Connected Apps", href: "/connected-apps" };
}

function authAction() {
  return { label: "Sign in", href: "/auth" };
}

// ✅ tighter + fixed precedence
function looksLikeAlpacaFeedOrEntitlement(msg = "") {
  const m = String(msg || "").toLowerCase();

  const hasForbidden =
    m.includes("forbidden") || m.includes("not authorized") || m.includes("unauthorized");

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

function extractMessage(detail, text) {
  return (
    String(detail?.message || detail?.detail || "").trim() ||
    String(text || "").trim() ||
    ""
  );
}

/**
 * ✅ Core fix:
 * If body contains "... Fix: ...", split it into { body, subtitle }.
 * This guarantees your ErrorModal subtitle row gets used.
 */
function splitFixFromBody(body, subtitle) {
  const b = String(body || "").trim();
  const s = String(subtitle || "").trim();

  // if subtitle already provided, keep it (but strip leading "Fix:")
  if (s) return { body: b, subtitle: s.replace(/^fix:\s*/i, "").trim() };

  // Try to split "Fix:" out of body
  const idx = b.toLowerCase().indexOf("fix:");
  if (idx === -1) return { body: b, subtitle: "" };

  const before = b.slice(0, idx).trim();
  const after = b.slice(idx + 4).trim(); // after "Fix:"
  return { body: before, subtitle: after };
}

/**
 * Detect “duplicate email/phone” from a variety of backend styles
 * (works for string errors AND object errors)
 */
function looksLikeDuplicateCredential(anyErr) {
  const raw =
    anyErr?.detail?.message ||
    anyErr?.payload?.detail?.message ||
    anyErr?.message ||
    anyErr?.body ||
    anyErr?.detail ||
    anyErr;

  const s = String(raw || "").toLowerCase();

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

function makeUiError({
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
}) {
  const split = splitFixFromBody(body, subtitle);

  return {
    title,
    body: split.body,
    ...(split.subtitle ? { subtitle: split.subtitle } : {}),
    status,
    code,
    ...(action ? { action } : {}),
    debug: { feature, status, statusText, detail, raw },
  };
}

/**
 * Turn a Response into a friendly error payload:
 * { title, body, subtitle?, debug, code, status, action? }
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

  // ---- Common auth errors ----
  if (status === 401) {
    return makeUiError({
      title: "Session expired",
      body: "You’re signed out or your session expired.",
      subtitle: "Sign in again, then retry.",
      status,
      code: code || "NOT_AUTHENTICATED",
      feature,
      statusText,
      detail,
      raw: data || text,
      action: authAction(),
    });
  }

  // ---- Signup collisions ----
  if (status === 409 || looksLikeDuplicateCredential({ payload: data, detail, message: text })) {
    return makeUiError({
      title: "Account already exists",
      body: detail?.message || "That email or phone number is already in use.",
      subtitle: "Try signing in instead, or use a different email/phone.",
      status,
      code: code || "DUPLICATE",
      feature,
      statusText,
      detail,
      raw: data || text,
      action: authAction(),
    });
  }

  const msg = extractMessage(detail, text).toLowerCase();

  // ---- Provider / Alpaca style errors ----
  if (status === 403 || code === "ALPACA_FEED_FORBIDDEN" || looksLikeAlpacaFeedOrEntitlement(msg)) {
    return makeUiError({
      title: "Alpaca data feed not available",
      body: "Your Alpaca account doesn’t have access to this market data feed (often SIP).",
      subtitle: "Use IEX feed for dev, or upgrade your Alpaca market data plan.",
      status,
      code: code || "ALPACA_FEED_FORBIDDEN",
      action: alpacaAction(),
      feature,
      statusText,
      detail,
      raw: data || text,
    });
  }

  if (status === 403) {
    return makeUiError({
      title: "Access blocked",
      body: "This action isn’t allowed for your account/session.",
      subtitle: "Refresh the page. If it keeps happening, sign out and back in.",
      status,
      code: code || "FORBIDDEN",
      feature,
      statusText,
      detail,
      raw: data || text,
    });
  }

  if (code === "ALPACA_NOT_CONNECTED" || msg.includes("not connected")) {
    return makeUiError({
      title: "Alpaca not connected",
      body: "You haven’t connected Alpaca yet.",
      subtitle: "Go to Connected Apps and add your Alpaca API key + secret.",
      status,
      code: code || "ALPACA_NOT_CONNECTED",
      action: alpacaAction(),
      feature,
      statusText,
      detail,
      raw: data || text,
    });
  }

  if (code === "ALPACA_INVALID_KEY" || msg.includes("invalid api key") || msg.includes("invalid api")) {
    return makeUiError({
      title: "Alpaca keys rejected",
      body: "Your Alpaca API key/secret looks invalid or expired.",
      subtitle: "Reconnect Alpaca in Connected Apps and paste keys again.",
      status,
      code: code || "ALPACA_INVALID_KEY",
      action: alpacaAction(),
      feature,
      statusText,
      detail,
      raw: data || text,
    });
  }

  if (msg.includes("timeout") || msg.includes("timed out")) {
    return makeUiError({
      title: "Connection timed out",
      body: "The backend took too long to respond.",
      subtitle: "Retry in a moment. If it persists, check your internet or restart the backend.",
      status,
      code: code || "TIMEOUT",
      feature,
      statusText,
      detail,
      raw: data || text,
    });
  }

  // ---- Generic fallback ----
  const fallbackText =
    extractMessage(detail, text) ||
    (typeof data === "string" ? data : null) ||
    (text ? `Backend returned non-JSON (${status}).` : null) ||
    `${status} ${statusText}`.trim() ||
    "Server error";

  return makeUiError({
    title: "Server error",
    body: fallbackText,
    subtitle: "Refresh and try again. If it keeps happening, sign out/in or restart the backend.",
    status,
    code: code || "SERVER_ERROR",
    feature,
    statusText,
    detail,
    raw: data || text,
  });
}

/**
 * Turn *any* frontend error (string/object/Error) into friendly copy.
 */
export function explainAnyError(err, { feature = "request" } = {}) {
  if (!err) {
    return makeUiError({
      title: "Something went wrong",
      body: "An unknown error occurred.",
      subtitle: "",
      status: 0,
      code: "UNKNOWN",
      feature,
      statusText: "",
      detail: null,
      raw: err,
    });
  }

  // Already shaped
  if (typeof err === "object" && err.title && err.body) {
    return makeUiError({
      ...err,
      feature,
      raw: err,
    });
  }

  // DUPLICATE (catch-all)
  if (looksLikeDuplicateCredential(err)) {
    return makeUiError({
      title: "Account already exists",
      body: "That email or phone number is already in use.",
      subtitle: "Try signing in instead, or use a different email/phone.",
      status: err?.status || 409,
      code: err?.code || "DUPLICATE",
      feature,
      statusText: "",
      detail: err?.detail || err?.payload?.detail || null,
      raw: err,
      action: authAction(),
    });
  }

  // object-like errors
  if (typeof err === "object") {
    const status = err.status || err?.payload?.status || 0;
    const detailObj = normalizeBackendDetail(err.detail || err?.payload?.detail) || null;
    const code = detailObj?.code || err.code || err?.payload?.code || null;

    const msg = String(detailObj?.message || detailObj?.detail || err.message || "").toLowerCase();

    if (status === 401 || msg.includes("not authenticated") || msg.includes("session expired")) {
      return makeUiError({
        title: "Session expired",
        body: "You’re signed out or your session expired.",
        subtitle: "Sign in again, then retry.",
        status,
        code: code || "NOT_AUTHENTICATED",
        feature,
        statusText: "",
        detail: detailObj,
        raw: err,
        action: authAction(),
      });
    }

    if (status === 403 || code === "ALPACA_FEED_FORBIDDEN" || looksLikeAlpacaFeedOrEntitlement(msg)) {
      return makeUiError({
        title: "Alpaca data feed not available",
        body: "Your Alpaca account doesn’t have access to this market data feed (often SIP).",
        subtitle: "Use IEX feed for dev, or upgrade your Alpaca market data plan.",
        status,
        code: code || "ALPACA_FEED_FORBIDDEN",
        feature,
        statusText: "",
        detail: detailObj,
        raw: err,
        action: alpacaAction(),
      });
    }

    return makeUiError({
      title: "Server error",
      body: detailObj?.message || detailObj?.detail || err.message || "Something went wrong. Please try again.",
      subtitle: "",
      status,
      code: code || "SERVER_ERROR",
      feature,
      statusText: "",
      detail: detailObj,
      raw: err,
    });
  }

  // string errors
  if (typeof err === "string") {
    const lower = err.toLowerCase();

    if (looksLikeAlpacaFeedOrEntitlement(lower)) {
      return makeUiError({
        title: "Alpaca data feed not available",
        body: "Your Alpaca account doesn’t have access to this market data feed (often SIP).",
        subtitle: "Use IEX feed for dev, or upgrade your Alpaca market data plan.",
        status: 403,
        code: "ALPACA_FEED_FORBIDDEN",
        feature,
        statusText: "",
        detail: null,
        raw: err,
        action: alpacaAction(),
      });
    }

    // ✅ This will split "Fix:" if present
    return makeUiError({
      title: "Server error",
      body: err,
      subtitle: "",
      status: 0,
      code: "SERVER_ERROR",
      feature,
      statusText: "",
      detail: null,
      raw: err,
    });
  }

  // Error instance
  if (err instanceof Error) {
    return makeUiError({
      title: "Server error",
      body: err.message || "Unknown error",
      subtitle: "",
      status: err.status || 0,
      code: err.code || "SERVER_ERROR",
      feature,
      statusText: "",
      detail: err.detail || null,
      raw: err,
    });
  }

  return makeUiError({
    title: "Server error",
    body: "Something went wrong.",
    subtitle: "",
    status: 0,
    code: "SERVER_ERROR",
    feature,
    statusText: "",
    detail: null,
    raw: err,
  });
}
