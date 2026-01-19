// frontend/src/lib/apiFetch.js

function normalizeErrorPayload(payload) {
  // backend sometimes returns: { detail: "..." }
  // or: { detail: { code, message, user_action, debug } }
  const d = payload?.detail;

  if (!d) return { message: payload?.error || payload?.message || "" };

  if (typeof d === "string") return { message: d };

  // object detail
  return {
    code: d.code,
    message: d.message || "Request failed",
    user_action: d.user_action,
    source: d.source,
    debug: d.debug,
  };
}

export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    // default safe headers
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    // IMPORTANT for cookie auth
    credentials: "include",
    ...options,
  });

  // Try JSON, but don’t die if server returns HTML
  let payload = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    const text = await res.text().catch(() => "");
    payload = { detail: text ? text.slice(0, 800) : "" };
  }

  if (!res.ok) {
    const info = normalizeErrorPayload(payload || {});
    const msgParts = [];

    if (info.message) msgParts.push(info.message);
    else msgParts.push(`Request failed (${res.status})`);

    if (info.user_action) msgParts.push(`Action: ${info.user_action}`);
    if (info.code) msgParts.push(`Code: ${info.code}`);
    if (info.source) msgParts.push(`Source: ${info.source}`);

    // keep debug out of the UI unless you want it
    const err = new Error(msgParts.join(" | "));
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload ?? {};
}
