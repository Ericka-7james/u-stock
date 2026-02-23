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