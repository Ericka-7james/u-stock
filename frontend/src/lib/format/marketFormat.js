// frontend/src/lib/format/marketFormat.js

// ---------- numbers ----------
export function nOrNull(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

export function nOrZero(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

// ---------- money / pct ----------
export function fmtMoney(v) {
  const x = Number(v);
  return Number.isFinite(x) ? `$${x.toFixed(2)}` : "—";
}

// Signed percent with 2 decimals, "+" for positive.
export function fmtPctSigned(x) {
  const v = nOrNull(x);
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

// Whole-number percent, no "+" prefix (matches TradePerformancePanel UI).
export function fmtPctWhole(x) {
  return `${Math.round(nOrZero(x))}%`;
}

// ---------- symbol validation ----------
export function isAlphaOnlySymbol(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return /^[A-Z]+$/.test(s);
}

// ---------- derived helpers ----------

// If prevClose missing but we have last + pct move,
// back-calc prev ≈ last / (1 + pct/100)
export function computePrevFallback(last, pct) {
  const L = nOrNull(last);
  const P = nOrNull(pct);
  if (L === null || P === null) return null;

  const denom = 1 + P / 100;
  if (!Number.isFinite(denom) || denom <= 0) return null;

  const prev = L / denom;
  if (!Number.isFinite(prev) || prev <= 0) return null;

  return prev;
}

export function toneForScore(score) {
  const v = nOrNull(score);
  if (v === null) return "";
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return "";
}