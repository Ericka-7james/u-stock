// frontend/src/lib/format/botFormat.js

export function safeStr(x, fallback = "") {
  const s = String(x ?? "").trim();
  return s || fallback;
}

export function n(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

export function fmtTime(epochSec) {
  const t = Number(epochSec);
  if (!Number.isFinite(t) || t <= 0) return "—";
  try {
    return new Date(t * 1000).toLocaleString();
  } catch {
    return "—";
  }
}

export function fmtAge(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return "—";
  if (s < 60) return `${Math.floor(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d ${remH}h` : `${d}d`;
}

export function pillTone(kind) {
  if (kind === "pos") return "pos";
  if (kind === "warn") return "warn";
  return "neg";
}

/**
 * Normalize effective_state-like values for UI.
 * Keep this aligned with your backend contract.
 * NOTE: intentionally excludes "degraded" if it isn't part of your contract.
 */
export function normalizeEff(x) {
  const v = String(x || "").trim().toLowerCase();
  const ok = new Set([
    "running",
    "waiting_for_market",
    "starting",
    "paused",
    "stopped",
    "offline",
    "error",
    "idle",
    "armed",
    "disarmed",
  ]);
  return ok.has(v) ? v : v || "stopped";
}

/**
 * Normalize desired/intent values into a small stable set.
 * Canonical: running | stopped | paused | armed | disarmed
 */
export function normalizeIntent(x) {
  const v = String(x || "").trim().toLowerCase();
  if (v === "running") return "running";
  if (v === "paused") return "paused";
  if (v === "armed") return "armed";
  if (v === "disarmed") return "disarmed";
  return "stopped";
}