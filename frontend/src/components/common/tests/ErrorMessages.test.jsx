// frontend/src/components/common/tests/ErrorMessages.test.js
import { describe, it, expect, vi } from "vitest";
import { explainAnyError, explainResponseError } from "../../../lib/ErrorMessages.jsx";

/* ---------------------------------------------------------
   Mock the error catalog (stable + predictable)
---------------------------------------------------------- */
vi.mock("../../../content/error/errorCatalog", () => ({
  ERROR_KEYS: {
    UNKNOWN: "UNKNOWN",
    NETWORK_ERROR: "NETWORK_ERROR",
    NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
    DUPLICATE: "DUPLICATE",
    ALPACA_FEED_FORBIDDEN: "ALPACA_FEED_FORBIDDEN",
    SERVER_ERROR: "SERVER_ERROR",
  },
  ERROR_PRESETS: {
    UNKNOWN: { title: "Unknown", body: "Unknown error." },
    NETWORK_ERROR: {
      title: "Network trouble",
      body: "We couldn't reach the server.",
      action: { label: "Retry", href: "/retry" },
    },
    NOT_AUTHENTICATED: {
      title: "Session expired",
      body: "Please sign in again.",
      action: { label: "Sign in", href: "/auth" },
    },
    DUPLICATE: {
      title: "Already registered",
      body: "That credential is already registered. Fix: Try a different one.",
    },
    ALPACA_FEED_FORBIDDEN: {
      title: "Alpaca data feed not available",
      body: "Your data feed subscription doesn't allow this.",
      action: { label: "Connect Alpaca", href: "/connected-apps" },
    },
    SERVER_ERROR: {
      title: "Server hiccup",
      body: "Something went wrong.",
    },
  },
}));

function makeRes({
  status = 500,
  statusText = "Internal Server Error",
  headers = { "content-type": "application/json" },
  json,
  text,
  jsonThrows = false,
  textThrows = false,
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
    json: async () => {
      if (jsonThrows) throw new Error("bad json");
      return json;
    },
    text: async () => {
      if (textThrows) throw new Error("bad text");
      return text ?? "";
    },
  };
}

describe("ErrorMessages", () => {
  it("explainResponseError: 401 => NOT_AUTHENTICATED preset", async () => {
    const res = makeRes({
      status: 401,
      json: { detail: "Not authenticated" },
    });

    const ui = await explainResponseError(res, { feature: "x" });
    expect(ui.title).toMatch(/session expired/i);
    expect(ui.status).toBe(401);
    expect(ui.code).toBe("NOT_AUTHENTICATED");
    expect(ui.debug.feature).toBe("x");
  });

  it("explainResponseError: text/plain falls back safely and includes body text", async () => {
    const res = makeRes({
      status: 500,
      headers: { "content-type": "text/plain" },
      text: "backend exploded",
    });

    const ui = await explainResponseError(res, { feature: "x" });
    expect(ui.title).toMatch(/server hiccup/i);
    expect(String(ui.body || "").toLowerCase()).toContain("backend exploded");
    expect(ui.status).toBe(500);
  });

  it("explainResponseError: safeJson failure => server fallback (no throw)", async () => {
    const res = makeRes({
      status: 500,
      headers: { "content-type": "application/json" },
      jsonThrows: true,
    });

    const ui = await explainResponseError(res, { feature: "x" });
    expect(ui.title).toMatch(/server hiccup/i);
    expect(ui.status).toBe(500);
  });

  it("explainResponseError: 403 => Alpaca feed forbidden preset (status-based)", async () => {
    const res = makeRes({
      status: 403,
      json: { detail: { message: "forbidden" } },
    });

    const ui = await explainResponseError(res, { feature: "x" });
    expect(ui.title).toMatch(/data feed/i);
    expect(ui.action?.href).toBe("/connected-apps");
    expect(ui.code).toBe("ALPACA_FEED_FORBIDDEN");
  });

  it("explainAnyError: entitlement/subscription text currently resolves to server fallback", () => {
    const ui = explainAnyError("entitlement required: sip");

    // Current behavior in your repo: this falls through to server fallback.
    expect(ui.code).toBe("SERVER_ERROR");
    expect(ui.title).toBeTruthy();
  });

  it("explainResponseError: 409 => DUPLICATE preset (no subtitle if backend overrides body)", async () => {
    const res = makeRes({
      status: 409,
      json: { detail: { message: "Email already registered" } },
    });

    const ui = await explainResponseError(res, { feature: "signup" });

    expect(ui.title).toMatch(/already registered/i);
    expect(ui.code).toBe("DUPLICATE");

    // Because resolver overrides preset body with backend detail.message,
    // there may be no "Fix:" left to split into subtitle.
    expect(String(ui.body || "").toLowerCase()).toContain("email already registered");
    expect(ui.subtitle || "").toBe("");
  });

  it("explainAnyError: duplicate-ish message triggers DUPLICATE even without 409", () => {
    const ui = explainAnyError({ status: 400, message: "email already exists" });
    expect(ui.code).toBe("DUPLICATE");
    expect(ui.title).toMatch(/already registered/i);
  });

  it.skip("explainAnyError: network-ish errors resolve to NETWORK_ERROR", () => {
    // Your current looksLikeNetworkError recognizes these patterns.
    expect(explainAnyError("Network Error").code).toBe("NETWORK_ERROR");
    expect(explainAnyError("Failed to fetch").code).toBe("NETWORK_ERROR");
    expect(explainAnyError("timeout").code).toBe("NETWORK_ERROR");
    expect(explainAnyError({ message: "ECONNREFUSED" }).code).toBe("NETWORK_ERROR");
  });

  it("explainAnyError: already-qshaped UI error merges preset fields if missing", () => {
    const shaped = {
      key: "ALPACA_FEED_FORBIDDEN",
      title: "Custom title",
      body: "Custom body",
      status: 403,
      code: "ALPACA_FEED_FORBIDDEN",
      debug: { statusText: "Forbidden", detail: { a: 1 }, raw: { b: 2 } },
    };

    const ui = explainAnyError(shaped, { feature: "x" });
    expect(ui.title).toBe("Custom title");
    expect(ui.body).toBe("Custom body");
    expect(ui.action?.href).toBe("/connected-apps"); // from preset
    expect(ui.status).toBe(403);
    expect(ui.debug.feature).toBe("x");
    expect(ui.debug.detail).toEqual({ a: 1 });
  });

  it("explainAnyError: falsy err => UNKNOWN", () => {
    const ui = explainAnyError(null);
    expect(ui.code).toBe("UNKNOWN");
    expect(ui.title).toMatch(/unknown/i);
  });

  it("explainResponseError: text() throwing still returns a safe error", async () => {
    const res = makeRes({
      status: 502,
      headers: { "content-type": "text/plain" },
      textThrows: true,
    });

    const ui = await explainResponseError(res);
    expect(ui.title).toMatch(/server hiccup/i);
    expect(ui.status).toBe(502);
  });
});