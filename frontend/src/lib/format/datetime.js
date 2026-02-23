// frontend/src/lib/format/datetime.js

/**
 * Formatting + time helpers used by UI components.
 * Keep this file UI-friendly (browser local timezone is OK unless noted).
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Epoch seconds -> local date/time string
 */
export function fmtEpochSeconds(epochSeconds) {
  const t = Number(epochSeconds);
  if (!Number.isFinite(t) || t <= 0) return "—";
  try {
    return new Date(t * 1000).toLocaleString();
  } catch {
    return "—";
  }
}

/**
 * Epoch seconds -> YYYY-MM-DD (local day key)
 * Used for bucketing logs by day.
 */
export function dayKeyFromEpochSeconds(epochSeconds) {
  const t = Number(epochSeconds);
  if (!Number.isFinite(t) || t <= 0) return "";
  try {
    const d = new Date(t * 1000);
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

/**
 * YYYY-MM-DD -> epoch seconds
 * Local timezone by default (fine for UI filtering).
 *
 * Options:
 * - endOfDay: if true, returns 23:59:59 local time.
 */
export function dateStrToEpochSec(dateStr, { endOfDay = false } = {}) {
  const s = String(dateStr || "").trim();
  if (!s) return 0;

  // Browser-local interpretation is OK for UI filters.
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;

  if (!endOfDay) return Math.floor(d.getTime() / 1000);

  d.setHours(23, 59, 59, 999);
  return Math.floor(d.getTime() / 1000);
}