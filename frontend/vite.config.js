import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // ✅ Load .env files (including .env.development.local)
  const env = loadEnv(mode, process.cwd(), "");
  const isDev = mode === "development";

  // ✅ Read from loaded env
  const API_TARGET = env.VITE_API_PROXY_TARGET || "http://localhost:8000";

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
    },
  };
});
