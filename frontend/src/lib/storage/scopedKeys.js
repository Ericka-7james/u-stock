export function scopedKey(base, scope) {
  const s = String(scope || "").trim();
  return s ? `${base}::${s}` : base;
}