export function normalizeSymbol(sym) {
  const s = String(sym || "").trim();
  if (!s) return "";
  return s.includes(":") ? s.split(":").pop().toUpperCase() : s.toUpperCase();
}

export function isTvSafe(sym) {
  return /^[A-Z]+$/.test(String(sym || "").toUpperCase());
}