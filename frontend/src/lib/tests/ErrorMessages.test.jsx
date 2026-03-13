// frontend/src/lib/tests/ErrorMessages.test.jsx

import { describe, it, expect, vi } from "vitest";
import {
  extractErrorText,
  explainResponseError,
  explainAnyError,
} from "../ErrorMessages";
import { ERROR_KEYS } from "../../content/error/errorCatalog";

function mockJsonResponse({
  status = 400,
  statusText = "Bad Request",
  body = {},
  headers = { "content-type": "application/json" },
} = {}) {
  return {
    status,
    statusText,
    headers: {
      get: (key) => headers[key.toLowerCase()],
    },
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(""),
  };
}

function mockTextResponse({
  status = 500,
  statusText = "Internal Server Error",
  textBody = "Server exploded",
  headers = { "content-type": "text/plain" },
} = {}) {
  return {
    status,
    statusText,
    headers: {
      get: (key) => headers[key.toLowerCase()],
    },
    json: vi.fn(),
    text: vi.fn().mockResolvedValue(textBody),
  };
}

describe("extractErrorText", () => {
  it("extracts nested detail.message", () => {
    const err = { detail: { message: "Boom" } };
    expect(extractErrorText(err)).toBe("Boom");
  });

  it("extracts payload.error", () => {
    const err = { payload: { error: "Nope" } };
    expect(extractErrorText(err)).toBe("Nope");
  });

  it("returns string directly", () => {
    expect(extractErrorText("Plain error")).toBe("Plain error");
  });

  it("stringifies unknown object", () => {
    const err = { foo: "bar" };
    const result = extractErrorText(err);
    expect(result).toContain("foo");
  });
});

describe("explainResponseError", () => {
  it("resolves duplicate (409)", async () => {
    const res = mockJsonResponse({
      status: 409,
      body: { detail: { message: "Email already exists" } },
    });

    const ui = await explainResponseError(res);

    expect(ui.key).toBe(ERROR_KEYS.DUPLICATE);
    expect(ui.status).toBe(409);
    expect(ui.body.toLowerCase()).toContain("email");
  });

  it("resolves 401 as NOT_AUTHENTICATED", async () => {
    const res = mockJsonResponse({
      status: 401,
      body: { detail: { message: "Not authenticated" } },
    });

    const ui = await explainResponseError(res);

    expect(ui.key).toBe(ERROR_KEYS.NOT_AUTHENTICATED);
    expect(ui.status).toBe(401);
  });

  it("resolves 403 entitlement error", async () => {
    const res = mockJsonResponse({
      status: 403,
      body: {
        detail: {
          message: "subscription entitlement not authorized",
        },
      },
    });

    const ui = await explainResponseError(res);

    expect(ui.key).toBe(ERROR_KEYS.ALPACA_FEED_FORBIDDEN);
  });

  it("falls back to SERVER_ERROR for 500 text response", async () => {
    const res = mockTextResponse({
      status: 500,
      textBody: "Internal failure",
    });

    const ui = await explainResponseError(res);

    expect(ui.key).toBe(ERROR_KEYS.SERVER_ERROR);
    expect(ui.body).toContain("Internal failure");
  });
});

describe("explainAnyError", () => {
  it("returns UNKNOWN for null", () => {
    const ui = explainAnyError(null);
    expect(ui.key).toBe(ERROR_KEYS.UNKNOWN);
  });

  it("passes through already-shaped UI error", () => {
    const shaped = {
      key: ERROR_KEYS.SERVER_ERROR,
      title: "Custom",
      body: "Custom body",
      status: 500,
    };

    const ui = explainAnyError(shaped);

    expect(ui.title).toBe("Custom");
    expect(ui.body).toBe("Custom body");
  });

  it("handles thrown fetch/network error", () => {
    const err = new Error("Failed to fetch");
    const ui = explainAnyError(err);

    expect(ui.key).toBe(ERROR_KEYS.NETWORK_ERROR);
  });

  it("handles string error", () => {
    const ui = explainAnyError("Something broke");
    expect(ui.key).toBe(ERROR_KEYS.SERVER_ERROR);
    expect(ui.body).toContain("Something broke");
  });

  it("handles backend-style object error", () => {
    const err = {
      status: 409,
      detail: { message: "Account already exists" },
    };

    const ui = explainAnyError(err);

    expect(ui.key).toBe(ERROR_KEYS.DUPLICATE);
    expect(ui.status).toBe(409);
  });
});