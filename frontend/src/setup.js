// src/setup.js
import "@testing-library/jest-dom";
import { vi } from "vitest";

// Always provide a stable base URL in tests
vi.stubGlobal("location", new URL("http://localhost/"));

// Global fetch mock so components that fetch on mount don't crash tests
const okJson = (data = {}) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });

vi.stubGlobal("fetch", vi.fn(async (input) => {
  const url = String(input);

  // bot status endpoint used by BotControlCard
  if (url.includes("/api/bots/status")) {
    return okJson({
      bot_id: "ema_trend",
      intent: "running",
      effective_state: "waiting_for_market",
      pausedReason: "market_closed",
      nextOpenEpoch: null,
      heartbeatEpoch: Date.now() / 1000
    });
  }

  // default: ok empty
  return okJson({});
}));
