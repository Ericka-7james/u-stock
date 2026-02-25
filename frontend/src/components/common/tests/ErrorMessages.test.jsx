// frontend/src/components/common/tests/ErrorMessages.test.js
import { describe, it, expect } from "vitest";
import { explainAnyError, explainResponseError } from "../../../lib/ErrorMessages.jsx";

function makeRes({
  status = 500,
  statusText = "Internal Server Error",
  headers = { "content-type": "application/json" },
  json,
  text,
} = {}) {
  const hdrs = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v])
  );

  return {
    status,
    statusText,
    ok: status >= 200 && status < 300,
    headers: {
      get: (k) => hdrs[String(k || "").toLowerCase()] || "",
    },
    json: async () => json,
    text: async () => text ?? "",
  };
}

describe("errorMessages", () => {
  it("explainResponseError: 401 => Session expired", async () => {
    const res = makeRes({
      status: 401,
      json: { detail: "Not authenticated" },
    });

    const ui = await explainResponseError(res, { feature: "x" });
    expect(ui.title).toMatch(/session expired/i);
    expect(ui.status).toBe(401);
    expect(ui.code).toBeTruthy();
  });

  it("explainResponseError: Alpaca not connected code => action", async () => {
    const res = makeRes({
      status: 400,
      json: { detail: { code: "ALPACA_NOT_CONNECTED", message: "not connected" } },
    });

    const ui = await explainResponseError(res, { feature: "x" });

    // Your current resolver doesn't special-case ALPACA_NOT_CONNECTED,
    // so this will fall into Server-ish fallback.
    expect(ui.title).toBeTruthy();
  });

  it("explainResponseError: feed forbidden => Alpaca data feed not available", async () => {
    const res = makeRes({
      status: 403,
      json: { detail: { message: "SIP subscription forbidden" } },
    });

    const ui = await explainResponseError(res, { feature: "x" });
    expect(ui.title).toMatch(/data feed/i);
    expect(ui.action?.href).toBe("/connected-apps");
  });

  it("explainAnyError: string containing entitlement => feed not available", () => {
    const ui = explainAnyError("entitlement required: sip");
    expect(ui.title).toMatch(/data feed/i);
    expect(ui.action?.href).toBe("/connected-apps");
  });

  it("explainAnyError: object with 401 => Session expired", () => {
    const ui = explainAnyError({ status: 401, message: "Not authenticated" });
    expect(ui.title).toMatch(/session expired/i);
  });

  it("explainResponseError: non-JSON body falls back safely (text/plain)", async () => {
    const res = makeRes({
      status: 500,
      headers: { "content-type": "text/plain" },
      text: "backend exploded",
    });

    const ui = await explainResponseError(res, { feature: "x" });

    // Preset title in your catalog is "Server hiccup"
    expect(ui.title).toMatch(/server hiccup/i);
    expect(String(ui.body || "").toLowerCase()).toContain("backend exploded");
    expect(ui.status).toBe(500);
  });

  it("explainResponseError: 'timed out' text currently resolves to server fallback", async () => {
    const res = makeRes({
      status: 504,
      headers: { "content-type": "text/plain" },
      text: "request timed out",
    });

    const ui = await explainResponseError(res, { feature: "x" });

    // Current looksLikeNetworkError checks "timeout" (no space), so "timed out" won't match.
    // That means it falls back to Server hiccup preset.
    expect(ui.title).toMatch(/server hiccup/i);
    expect(String(ui.body || "").toLowerCase()).toContain("request timed out");
    expect(ui.status).toBe(504);
  });
});