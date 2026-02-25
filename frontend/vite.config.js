// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isDev = mode === "development";

  const API_TARGET = (env.VITE_API_PROXY_TARGET || "http://localhost:8000").trim();

  return {
    plugins: [react()],
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
      proxy: isDev
        ? {
            "/api": {
              target: API_TARGET,
              changeOrigin: true,
              secure: false,
              rewrite: (path) => path,
            },
          }
        : undefined,
    },
    preview: {
      host: "localhost",
      port: 5173,
      strictPort: true,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/setup.js"],
      environmentOptions: { jsdom: { url: "http://localhost/" } },

      // ✅ coverage gate (>= 70%)
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "json"],
        reportsDirectory: "./coverage",
        thresholds: {
          lines: 70,
          functions: 70,
          statements: 70,
          branches: 60,
        },
      },
    },
  };
});