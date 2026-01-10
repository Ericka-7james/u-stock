// frontend/src/common/errorMessages.js

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeBackendDetail(detail) {
  // FastAPI often returns: { detail: "..." } or { detail: { code, message, ... } }
  if (!detail) return null;
  if (typeof detail === "string") return { message: detail };
  if (typeof detail === "object") return detail;
  return { message: String(detail) };
}

/**
 * Turn a Response into a friendly error payload:
 * {
 *   title, body, debug, code, status
 * }
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

  // If backend provided a structured code, use it
  const code = detail?.code || data?.code || null;

  // ---- Common auth errors ----
  if (status === 401) {
    return {
      title: "Session expired",
      body:
        "You’re signed out or your session expired.\n\n" +
        "Fix: Sign in again, then retry.",
      status,
      code: code || "NOT_AUTHENTICATED",
      debug: { feature, status, statusText, detail, raw: data || text },
    };
  }

  if (status === 403) {
    return {
      title: "Access blocked",
      body:
        "This action isn’t allowed for your account/session.\n\n" +
        "Fix: Refresh the page. If it keeps happening, sign out and back in.",
      status,
      code: code || "FORBIDDEN",
      debug: { feature, status, statusText, detail, raw: data || text },
    };
  }

  // ---- Provider integration / Alpaca style errors ----
  const msg = (detail?.message || detail?.detail || "").toLowerCase();

  if (code === "ALPACA_NOT_CONNECTED" || msg.includes("not connected")) {
    return {
      title: "Alpaca not connected",
      body:
        "You haven’t connected Alpaca yet.\n\n" +
        "Fix: Go to Connected Apps and add your Alpaca API key + secret.",
      status,
      code: code || "ALPACA_NOT_CONNECTED",
      debug: { feature, status, statusText, detail, raw: data || text },
    };
  }

  if (code === "ALPACA_INVALID_KEY" || msg.includes("invalid api key") || msg.includes("invalid api")) {
    return {
      title: "Alpaca keys rejected",
      body:
        "Your Alpaca API key/secret looks invalid or expired.\n\n" +
        "Fix: Reconnect Alpaca in Connected Apps (paste keys again).",
      status,
      code: code || "ALPACA_INVALID_KEY",
      debug: { feature, status, statusText, detail, raw: data || text },
    };
  }

  if (msg.includes("timeout") || msg.includes("timed out")) {
    return {
      title: "Connection timed out",
      body:
        "The backend took too long to respond.\n\n" +
        "Fix: Retry in a moment. If it persists, check your internet or restart the backend.",
      status,
      code: code || "TIMEOUT",
      debug: { feature, status, statusText, detail, raw: data || text },
    };
  }

  // ---- Generic fallback ----
  const fallbackText =
    detail?.message ||
    detail?.detail ||
    (typeof data === "string" ? data : null) ||
    (text ? `Backend returned non-JSON (${status}).` : null) ||
    `${status} ${statusText}`.trim() ||
    "Server error";

  return {
    title: "Server error",
    body:
      `${fallbackText}\n\n` +
      "Fix: Refresh and try again. If it keeps happening, sign out/in or restart the backend.",
    status,
    code: code || "SERVER_ERROR",
    debug: { feature, status, statusText, detail, raw: data || text },
  };
}

/**
 * Turn *any* frontend error (string/object/Error) into friendly copy.
 * Useful when hooks return strings today.
 */
export function explainAnyError(err, { feature = "request" } = {}) {
  if (!err) {
    return { title: "Something went wrong", body: "An unknown error occurred.", debug: { feature } };
  }

  // If hook already returns our structured object
  if (typeof err === "object" && err.title && err.body) return err;

  // Backend structured object passed through
  if (typeof err === "object" && (err.code || err.message || err.detail)) {
    const detail = normalizeBackendDetail(err.detail) || err;
    const msg = String(detail?.message || detail?.detail || detail?.raw || "").toLowerCase();

    if (msg.includes("invalid api key")) {
      return {
        title: "Alpaca keys rejected",
        body: "Reconnect Alpaca in Connected Apps and paste keys again.",
        debug: { feature, raw: err },
      };
    }

    return {
      title: "Server error",
      body: detail?.message || detail?.detail || "Something went wrong. Please try again.",
      debug: { feature, raw: err },
    };
  }

  // Plain string
  if (typeof err === "string") {
    const lower = err.toLowerCase();
    if (lower.includes("invalid api key")) {
      return {
        title: "Alpaca keys rejected",
        body: "Reconnect Alpaca in Connected Apps and paste keys again.",
        debug: { feature, raw: err },
      };
    }
    if (lower.includes("not authenticated") || lower.includes("session expired")) {
      return {
        title: "Session expired",
        body: "Sign in again, then retry.",
        debug: { feature, raw: err },
      };
    }
    return { title: "Server error", body: err, debug: { feature, raw: err } };
  }

  // Error instance
  if (err instanceof Error) {
    return { title: "Server error", body: err.message || "Unknown error", debug: { feature, raw: err } };
  }

  return { title: "Server error", body: "Something went wrong.", debug: { feature, raw: err } };
}
