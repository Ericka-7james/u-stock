import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setupTests.js",
    coverage: {
      provider: "v8",
      all: true,
      lines: 60,
      functions: 60,
      branches: 60,
      statements: 60,
    },
    globals: true,
  },
});
