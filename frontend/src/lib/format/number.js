// frontend/src/lib/format/number.js

export function fmtPct2(x) {
  const n = Number(x);
  if (x === null || x === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

// Same behavior as fmtPct2, but keeps naming intention clear
export function fmtRate2(x) {
  const n = Number(x);
  if (x === null || x === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

// Integer formatting (0 decimals), with thousands separators.
export function fmtInt0(x) {
  const n = Number(x);
  if (x === null || x === undefined || !Number.isFinite(n)) return "—";
  try {
    return Intl.NumberFormat().format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

/**
 * Ratio → percent helpers
 * Example: 0.0123 => "1.2%"
 * Useful for returns where backend sends decimals (0.01 = 1%).
 */
export function fmtPctFromRatio(x, decimals = 1) {
  const n = Number(x);
  if (x === null || x === undefined || !Number.isFinite(n)) return "—";

  const d = Number(decimals);
  const places = Number.isFinite(d) && d >= 0 && d <= 6 ? Math.floor(d) : 1;

  const pct = n * 100;
  return `${pct.toFixed(places)}%`;
}

// Convenience: ratio → 1 decimal percent
export function fmtPct1FromRatio(x) {
  return fmtPctFromRatio(x, 1);
}