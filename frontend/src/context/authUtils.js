// frontend/src/context/authUtils.js

export const SESSION_HINT_KEY = "ustock_session_hint_v1";
export const JUST_AUTHED_KEY = "ustock:just_authed_v1";
export const JUST_AUTHED_KIND_KEY = "ustock:just_authed_kind_v1"; // "signup" | "login"

export async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function extractDetailMessage(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;

  if (typeof detail === "object") {
    // backend may send: { code, message } or { detail, error }
    return String(detail.message || detail.detail || detail.error || "");
  }

  return String(detail);
}

export function makeHttpError(res, data) {
  const detail = data?.detail ?? null;

  const code =
    typeof detail === "object" && detail?.code
      ? detail.code
      : typeof data === "object" && data?.code
      ? data.code
      : null;

  const msg =
    extractDetailMessage(detail) ||
    String(data?.message || data?.error || "") ||
    `Request failed (${res.status})`;

  const err = new Error(msg);
  err.status = res.status;
  err.code = code;
  err.detail = detail;
  err.payload = data;

  return err;
}

export function setJustAuthed(kind = "login") {
  try {
    window.localStorage.setItem(JUST_AUTHED_KEY, "1");
    window.localStorage.setItem(JUST_AUTHED_KIND_KEY, kind);
  } catch {
    // ignore
  }
}