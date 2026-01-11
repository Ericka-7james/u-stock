// frontend/src/common/errorMessages.js

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

// ✅ NEW helper: detect “feed/entitlement” style errors
function looksLikeAlpacaFeedOrEntitlement(msg = "") {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("sip") ||
    m.includes("iex") && m.includes("forbidden") ||
    m.includes("entitlement") ||
    m.includes("subscription") ||
    m.includes("not authorized") ||
    m.includes("forbidden") ||
    m.includes("market data") && m.includes("not available")
  );
}

/**
 * Turn a Response into a friendly error payload:
 * { title, body, debug, code, status, action? }
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
    return {
      title: "Session expired",
      body: "You’re signed out or your session expired.\n\nFix: Sign in again, then retry.",
      status,
      code: code || "NOT_AUTHENTICATED",
      debug: { feature, status, statusText, detail, raw: data || text },
    };
  }

  // ---- Provider / Alpaca style errors ----
  const msg = (detail?.message || detail?.detail || text || "").toLowerCase();

  // ✅ NEW: distinguish “forbidden / entitlement / subscription” from “invalid key”
  if (status === 403 || code === "ALPACA_FEED_FORBIDDEN" || looksLikeAlpacaFeedOrEntitlement(msg)) {
    return {
      title: "Alpaca data feed not available",
      body:
        "Your Alpaca account doesn’t have access to this market data feed (often SIP).\n\n" +
        "Fix: Use IEX feed for dev, or upgrade your Alpaca market data plan.",
      status,
      code: code || "ALPACA_FEED_FORBIDDEN",
      action: alpacaAction(),
      debug: { feature, status, statusText, detail, raw: data || text },
    };
  }

  if (status === 403) {
    // generic 403 fallback (non-feed related)
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

  if (code === "ALPACA_NOT_CONNECTED" || msg.includes("not connected")) {
    return {
      title: "Alpaca not connected",
      body:
        "You haven’t connected Alpaca yet.\n\n" +
        "Fix: Go to Connected Apps and add your Alpaca API key + secret.",
      status,
      code: code || "ALPACA_NOT_CONNECTED",
      action: alpacaAction(),
      debug: { feature, status, statusText, detail, raw: data || text },
    };
  }

  if (code === "ALPACA_INVALID_KEY" || msg.includes("invalid api key") || msg.includes("invalid api")) {
    return {
      title: "Alpaca keys rejected",
      body:
        "Your Alpaca API key/secret looks invalid or expired.\n\n" +
        "Fix: Reconnect Alpaca in Connected Apps and paste keys again.",
      status,
      code: code || "ALPACA_INVALID_KEY",
      action: alpacaAction(),
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
 */
export function explainAnyError(err, { feature = "request" } = {}) {
  if (!err) {
    return { title: "Something went wrong", body: "An unknown error occurred.", debug: { feature } };
  }

  if (typeof err === "object" && err.title && err.body) return err;

  // If apiGet attached status/detail/payload, use it
  if (typeof err === "object") {
    const status = err.status || err?.payload?.status || 0;
    const detailObj = normalizeBackendDetail(err.detail || err?.payload?.detail) || null;
    const msg = String(
      detailObj?.message ||
      detailObj?.detail ||
      err.message ||
      ""
    ).toLowerCase();
    const code = detailObj?.code || err.code || err?.payload?.code || null;

    // ✅ NEW: feed/entitlement handling
    if (status === 403 || code === "ALPACA_FEED_FORBIDDEN" || looksLikeAlpacaFeedOrEntitlement(msg)) {
      return {
        title: "Alpaca data feed not available",
        body:
          "Your Alpaca account doesn’t have access to this market data feed (often SIP).\n\n" +
          "Fix: Use IEX feed for dev, or upgrade your Alpaca market data plan.",
        action: alpacaAction(),
        debug: { feature, raw: err },
      };
    }

    if (code === "ALPACA_NOT_CONNECTED" || msg.includes("not connected")) {
      return {
        title: "Alpaca not connected",
        body: "You haven’t connected Alpaca yet.\n\nFix: Go to Connected Apps and add your Alpaca API key + secret.",
        action: alpacaAction(),
        debug: { feature, raw: err },
      };
    }

    if (code === "ALPACA_INVALID_KEY" || msg.includes("invalid api key") || msg.includes("invalid api")) {
      return {
        title: "Alpaca keys rejected",
        body: "Reconnect Alpaca in Connected Apps and paste keys again.",
        action: alpacaAction(),
        debug: { feature, raw: err },
      };
    }

    if (status === 401 || msg.includes("not authenticated") || msg.includes("session expired")) {
      return {
        title: "Session expired",
        body: "Sign in again, then retry.",
        debug: { feature, raw: err },
      };
    }

    return {
      title: "Server error",
      body: detailObj?.message || detailObj?.detail || err.message || "Something went wrong. Please try again.",
      debug: { feature, raw: err },
    };
  }

  if (typeof err === "string") {
    const lower = err.toLowerCase();

    if (looksLikeAlpacaFeedOrEntitlement(lower)) {
      return {
        title: "Alpaca data feed not available",
        body:
          "Your Alpaca account doesn’t have access to this market data feed (often SIP).\n\n" +
          "Fix: Use IEX feed for dev, or upgrade your Alpaca market data plan.",
        action: alpacaAction(),
        debug: { feature, raw: err },
      };
    }

    if (lower.includes("not connected") || lower.includes("alpaca not connected")) {
      return {
        title: "Alpaca not connected",
        body: "You haven’t connected Alpaca yet.\n\nFix: Go to Connected Apps and add your Alpaca API key + secret.",
        action: alpacaAction(),
        debug: { feature, raw: err },
      };
    }

    if (lower.includes("invalid api key") || lower.includes("alpaca_invalid_key") || lower.includes("alpaca keys rejected")) {
      return {
        title: "Alpaca keys rejected",
        body: "Reconnect Alpaca in Connected Apps and paste keys again.",
        action: alpacaAction(),
        debug: { feature, raw: err },
      };
    }

    if (lower.includes("not authenticated") || lower.includes("session expired")) {
      return { title: "Session expired", body: "Sign in again, then retry.", debug: { feature, raw: err } };
    }

    return { title: "Server error", body: err, debug: { feature, raw: err } };
  }

  if (err instanceof Error) {
    const msg = String(err.message || "").toLowerCase();

    if (looksLikeAlpacaFeedOrEntitlement(msg)) {
      return {
        title: "Alpaca data feed not available",
        body:
          "Your Alpaca account doesn’t have access to this market data feed (often SIP).\n\n" +
          "Fix: Use IEX feed for dev, or upgrade your Alpaca market data plan.",
        action: alpacaAction(),
        debug: { feature, raw: err },
      };
    }

    if (msg.includes("not connected") || msg.includes("alpaca not connected")) {
      return {
        title: "Alpaca not connected",
        body: "You haven’t connected Alpaca yet.\n\nFix: Go to Connected Apps and add your Alpaca API key + secret.",
        action: alpacaAction(),
        debug: { feature, raw: err },
      };
    }

    if (msg.includes("invalid api key") || msg.includes("invalid api")) {
      return {
        title: "Alpaca keys rejected",
        body: "Reconnect Alpaca in Connected Apps and paste keys again.",
        action: alpacaAction(),
        debug: { feature, raw: err },
      };
    }

    return { title: "Server error", body: err.message || "Unknown error", debug: { feature, raw: err } };
  }

  return { title: "Server error", body: "Something went wrong.", debug: { feature, raw: err } };
}
