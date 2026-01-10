// src/config/config.js

export const API_PREFIX = "/api";

// ✅ In dev: always use Vite proxy.
// ✅ In prod: use VITE_API_BASE (or empty if same-origin)
export const API_BASE = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_BASE ?? "");

// Optional: version + feature flags
export const APP_VERSION = "1.0.0";

export const FEATURES = {
  ENABLE_SENTIMENT: false,
  ENABLE_BACKTESTING: false,
};
