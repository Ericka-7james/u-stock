// frontend/src/context/tests/authUtils.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  SESSION_HINT_KEY,
  JUST_AUTHED_KEY,
  JUST_AUTHED_KIND_KEY,
  safeJson,
  extractDetailMessage,
  makeHttpError,
  setJustAuthed,
} from "../authUtils.js";

describe("authUtils", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports stable storage keys", () => {
    expect(SESSION_HINT_KEY).toBe("ustock_session_hint_v1");
    expect(JUST_AUTHED_KEY).toBe("ustock:just_authed_v1");
    expect(JUST_AUTHED_KIND_KEY).toBe("ustock:just_authed_kind_v1");
  });

  describe("safeJson", () => {
    it("returns parsed json when res.json() succeeds", async () => {
      const res = { json: vi.fn(async () => ({ ok: true })) };
      await expect(safeJson(res)).resolves.toEqual({ ok: true });
      expect(res.json).toHaveBeenCalledTimes(1);
    });

    it("returns {} when res.json() throws", async () => {
      const res = { json: vi.fn(async () => Promise.reject(new Error("bad json"))) };
      await expect(safeJson(res)).resolves.toEqual({});
      expect(res.json).toHaveBeenCalledTimes(1);
    });
  });

  describe("extractDetailMessage", () => {
    it("returns '' for falsy input", () => {
      expect(extractDetailMessage(null)).toBe("");
      expect(extractDetailMessage(undefined)).toBe("");
      expect(extractDetailMessage("")).toBe("");
    });

    it("returns the string when detail is a string", () => {
      expect(extractDetailMessage("Nope")).toBe("Nope");
    });

    it("returns message/detail/error from object detail (priority order)", () => {
      expect(extractDetailMessage({ message: "m", detail: "d", error: "e" })).toBe("m");
      expect(extractDetailMessage({ detail: "d", error: "e" })).toBe("d");
      expect(extractDetailMessage({ error: "e" })).toBe("e");
      expect(extractDetailMessage({})).toBe("");
    });

    it("stringifies non-string, non-object values", () => {
      expect(extractDetailMessage(123)).toBe("123");
      expect(extractDetailMessage(true)).toBe("true");
    });
  });

  describe("makeHttpError", () => {
    it("prefers code from detail.code (when detail is object)", () => {
      const res = { status: 418 };
      const data = { detail: { code: "TEAPOT", message: "I'm a teapot" } };

      const err = makeHttpError(res, data);

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("I'm a teapot");
      expect(err.status).toBe(418);
      expect(err.code).toBe("TEAPOT");
      expect(err.detail).toEqual(data.detail);
      expect(err.payload).toEqual(data);
    });

    it("falls back to data.code when detail has no code", () => {
      const res = { status: 400 };
      const data = { code: "BAD_INPUT", detail: { message: "Invalid" } };

      const err = makeHttpError(res, data);

      expect(err.code).toBe("BAD_INPUT");
      expect(err.message).toBe("Invalid");
    });

    it("uses data.message or data.error when detail has no message", () => {
      const res = { status: 500 };

      const err1 = makeHttpError(res, { detail: null, message: "Server down" });
      expect(err1.message).toBe("Server down");

      const err2 = makeHttpError(res, { detail: null, error: "Nope" });
      expect(err2.message).toBe("Nope");
    });

    it("uses fallback message when nothing else is available", () => {
      const res = { status: 404 };

      const err = makeHttpError(res, {});
      expect(err.message).toBe("Request failed (404)");
      expect(err.code).toBe(null);
      expect(err.detail).toBe(null);
    });

    it("stringifies non-object detail and uses it as message", () => {
      const res = { status: 401 };
      const err = makeHttpError(res, { detail: 123 });

      expect(err.message).toBe("123");
      expect(err.detail).toBe(123);
    });
  });

  describe("setJustAuthed", () => {
    it("writes flags into localStorage (default kind=login)", () => {
      setJustAuthed();

      expect(window.localStorage.getItem(JUST_AUTHED_KEY)).toBe("1");
      expect(window.localStorage.getItem(JUST_AUTHED_KIND_KEY)).toBe("login");
    });

    it("writes the provided kind into localStorage", () => {
      setJustAuthed("signup");

      expect(window.localStorage.getItem(JUST_AUTHED_KEY)).toBe("1");
      expect(window.localStorage.getItem(JUST_AUTHED_KIND_KEY)).toBe("signup");
    });

    it("does not throw if localStorage.setItem throws", () => {
      const spy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("blocked");
        });

      expect(() => setJustAuthed("login")).not.toThrow();
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });
  });
});