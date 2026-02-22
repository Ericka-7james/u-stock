// frontend/src/lib/format/botLogFormat.js
import { safeStr } from "./botFormat.js";

export function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x ?? "");
  }
}

export function logSeverity(it) {
  const lvl = String(it?.level || "info").toLowerCase();
  if (lvl === "error") return "error";
  if (lvl === "warn" || lvl === "warning") return "warn";
  return "info";
}

export function toneClass(sev) {
  if (sev === "error") return "blog-evt blog-evt--error";
  if (sev === "warn") return "blog-evt blog-evt--warn";
  return "blog-evt";
}

/**
 * Default extraction aligned with backend service.py contract:
 * - payload.message
 * - payload.paused_reason
 * - payload.last_error
 * - fallback event_type
 */
export function defaultLogMessageFor(it) {
  const p = it?.payload && typeof it.payload === "object" ? it.payload : null;
  return (
    safeStr(p?.message, "") ||
    safeStr(p?.paused_reason, "") ||
    safeStr(p?.last_error, "") ||
    safeStr(it?.event_type, "")
  );
}
