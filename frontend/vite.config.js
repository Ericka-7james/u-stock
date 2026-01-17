import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev: proxy /api -> backend
const API_TARGET = process.env.VITE_API_PROXY_TARGET || "http://localhost:8000";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    plugins: [react()],
    server: {
      host: "localhost",          // ✅ was 127.0.0.1
      port: 5173,
      strictPort: true,
      proxy: isDev
        ? {
            "/api": {
              target: API_TARGET,  // ✅ default localhost:8000
              changeOrigin: true,
              secure: false,
              // optional but helpful:
              // ws: false,
            },
          }
        : undefined,
    },
    preview: {
      host: "localhost",          // ✅ was 127.0.0.1
      port: 5173,
      strictPort: true,
    },

    // ✅ ADD THIS: makes React Testing Library work (document/window available)
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.js",
    },
  };
});
