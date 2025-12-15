// src/config/config.js

// Detect environment based on Vite
const isDev = import.meta.env.DEV;

// Local dev backend
const LOCAL_API = "http://localhost:8000";

// Deployed backend (replace with your real URL once you deploy FastAPI)
const PROD_API = "https://u-stock-backend.vercel.app";

// 👇 Named export that AuthContext.jsx imports
export const API_BASE = PROD_API;
export const API_PREFIX = "/api";

// Optional: version + feature flags if you want them later
export const APP_VERSION = "1.0.0";

export const FEATURES = {
  ENABLE_SENTIMENT: true,
  ENABLE_BACKTESTING: false,
};
