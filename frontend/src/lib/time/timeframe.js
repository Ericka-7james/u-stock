// frontend/src/lib/time/timeframe.js

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDateStr(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

export function startOfYear(date) {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function clampRange(start, end) {
  if (!start || !end) return { start, end };
  if (start <= end) return { start, end };
  return { start: end, end: start };
}

export function parseDateLoose(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d?.getTime?.()) ? d : null;
}

// inclusive days: Jan 28 -> Feb 1 = 5 days
export function computeInclusiveDays(start, end) {
  const a = parseDateLoose(start);
  const b = parseDateLoose(end);
  if (!a || !b) return null;

  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / 86400000) + 1;
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

// map days -> TradingView candle interval
export function mapDaysToTvInterval(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return "60"; // default "Past week feel"
  if (d <= 2) return "15"; // 15m
  if (d <= 10) return "60"; // 1h
  if (d <= 45) return "240"; // 4h
  if (d <= 180) return "D"; // 1D
  return "W"; // 1W
}

export function buildPreset(preset) {
  const now = new Date();
  const t = todayStr();

  if (preset === "today") {
    const days = 1;
    return { preset, start: t, end: t, label: "Today", days, tvInterval: mapDaysToTvInterval(days) };
  }

  // "Last 24h" still maps to ≤2 days. Widget can't force exact last-24h window.
  if (preset === "24h") {
    const days = 1;
    return { preset, start: t, end: t, label: "Last 24h", days, tvInterval: mapDaysToTvInterval(days) };
  }

  if (preset === "7d") {
    const start = toDateStr(addDays(now, -6));
    const end = t;
    const days = computeInclusiveDays(start, end) ?? 7;
    return { preset, start, end, label: "Past week", days, tvInterval: mapDaysToTvInterval(days) };
  }

  if (preset === "30d") {
    const start = toDateStr(addDays(now, -29));
    const end = t;
    const days = computeInclusiveDays(start, end) ?? 30;
    return { preset, start, end, label: "Past 30 days", days, tvInterval: mapDaysToTvInterval(days) };
  }

  if (preset === "90d") {
    const start = toDateStr(addDays(now, -89));
    const end = t;
    const days = computeInclusiveDays(start, end) ?? 90;
    return { preset, start, end, label: "Past 90 days", days, tvInterval: mapDaysToTvInterval(days) };
  }

  if (preset === "ytd") {
    const start = toDateStr(startOfYear(now));
    const end = t;
    const days = computeInclusiveDays(start, end);
    return { preset, start, end, label: "Year to date", days, tvInterval: mapDaysToTvInterval(days) };
  }

  // fallback = past week
  {
    const start = toDateStr(addDays(now, -6));
    const end = t;
    const days = computeInclusiveDays(start, end) ?? 7;
    return { preset: "7d", start, end, label: "Past week", days, tvInterval: mapDaysToTvInterval(days) };
  }
}