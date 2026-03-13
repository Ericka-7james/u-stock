// frontend/src/lib/backtests/backtestPracticeUtils.js

export const TF_OPTIONS = ["1Min", "5Min", "15Min", "30Min", "1Hour", "1Day"];

export function asStr(x) {
  return String(x ?? "").trim();
}

export function asInt(x, fallback) {
  const n = Number.parseInt(String(x ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function splitSymbols(raw) {
  return asStr(raw)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 25); // UI guardrail (backend should enforce too)
}

export function todayISO() {
  // Date input needs YYYY-MM-DD in local tz
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function validateBacktestConfig({
  symbols,
  tfEntry,
  tfBias,
  startDate,
  endDate,
  warmup,
  steps,
  qty,
  tfOptions = TF_OPTIONS,
}) {
  const issues = [];

  const sym = Array.isArray(symbols) ? symbols : [];
  if (sym.length === 0) issues.push("Add at least one symbol.");

  if (!tfOptions.includes(tfEntry)) issues.push("Entry timeframe is invalid.");
  if (!tfOptions.includes(tfBias)) issues.push("Bias timeframe is invalid.");

  const s = asStr(startDate);
  const e = asStr(endDate);

  if (s === "" || e === "") {
    issues.push("Start and end dates are required.");
  } else if (s > e) {
    // ISO-8601 date strings sort correctly lexicographically
    issues.push("Start date must be before end date.");
  }

  const w = asInt(warmup, 0);
  const st = asInt(steps, 0);
  const q = asInt(qty, 0);

  if (w < 0) issues.push("Warmup must be 0 or greater.");
  if (st <= 0) issues.push("Steps must be greater than 0.");
  if (q <= 0) issues.push("Qty must be greater than 0.");

  return { ok: issues.length === 0, issues };
}