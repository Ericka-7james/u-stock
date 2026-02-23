// frontend/src/lib/format/tradingview.js

export function prettyTvInterval(interval) {
  const v = String(interval || "").trim();

  // numeric minutes
  if (/^\d+$/.test(v)) {
    const mins = Number(v);
    if (mins === 15) return "15m";
    if (mins === 30) return "30m";
    if (mins === 60) return "1h";
    if (mins === 120) return "2h";
    if (mins === 240) return "4h";
    return `${mins}m`;
  }

  const up = v.toUpperCase();
  if (up === "D") return "1D";
  if (up === "W") return "1W";
  if (up === "M") return "1M";
  return up || "—";
}