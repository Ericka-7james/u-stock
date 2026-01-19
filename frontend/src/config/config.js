// frontend/src/config/config.js
// Centralized config for frontend network calls.
// Works in dev (Vite proxy) and prod (absolute API base if needed).

// In dev you typically want "" so fetch("/api/...") hits the Vite proxy.
// In prod you can set VITE_API_BASE="https://your-domain.com" (no trailing slash).
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

// Backend routes are all under /api
export const API_PREFIX = "/api";
