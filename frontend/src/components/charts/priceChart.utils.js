export function toTradingViewSymbol(ticker) {
  const t = String(ticker || "").trim();
  if (!t) return "NASDAQ:AAPL";

  if (t.includes(":")) return t.toUpperCase();

  const normalized = t.replace("-", "/");
  if (normalized.includes("/")) {
    const [base, quote] = normalized
      .split("/")
      .map((s) => String(s || "").toUpperCase().trim());

    if (base && quote) return `BITSTAMP:${base}${quote}`;
  }

  return `NASDAQ:${t.toUpperCase()}`;
}

export function clampHeight(h, fallback = 360) {
  const n = Number(h);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(180, Math.min(1200, Math.floor(n)));
}

export function normalizeTheme(theme) {
  const t = String(theme || "").toLowerCase().trim();
  return t === "dark" ? "dark" : "light";
}