import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In production on Vercel, you typically call the backend by absolute URL.
// Locally, we proxy /api -> http://127.0.0.1:8000
const API_TARGET = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: isDev
        ? {
            "/api": {
              target: API_TARGET,
              changeOrigin: true,
              secure: false,
            },
          }
        : undefined,
    },
    preview: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
  };
});
