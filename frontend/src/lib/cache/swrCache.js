// frontend/src/lib/cache/swrCache.js

export function isFresh(ts, ttlMs) {
  return Date.now() - Number(ts || 0) < ttlMs;
}

export function createSWRCache(initialData) {
  return { ts: 0, data: initialData };
}