// frontend/src/lib/format/safe.js

export function safeStr(x, fallback = "") {
  const s = String(x ?? "").trim();
  return s || fallback;
}

export function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x ?? "");
  }
}

export function includesAny(haystack, needle) {
  const h = String(haystack || "").toLowerCase();
  const n = String(needle || "").toLowerCase().trim();
  if (!n) return true;
  return h.includes(n);
}