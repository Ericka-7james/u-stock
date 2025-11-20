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
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70,
    },
    globals: true,
  },
});
