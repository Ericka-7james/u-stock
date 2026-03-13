// frontend/src/lib/api/tests/http.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { toError, apiGet, apiGetWithRetry } from "../http";

function makeHeaders(map = {}) {
  const lower = Object.fromEntries(
    Object.entries(map).map(([k, v]) => [String(k).toLowerCase(), v])
  );
  return {
    get: (key) => lower[String(key).toLowerCase()] ?? null,
  };
}

function makeFetchResponse({
  ok = true,
  status = 200,
  statusText = "OK",
  headers = { "content-type": "application/json" },
  jsonValue = { ok: true },
  textValue = "ok",
  jsonReject = false,
  textReject = false,
} = {}) {
  return {
    ok,
    status,
    statusText,
    headers: makeHeaders(headers),
    json: vi
      .fn()
      .mockImplementation(() =>
        jsonReject ? Promise.reject(new Error("bad json")) : Promise.resolve(jsonValue)
      ),
    text: vi
      .fn()
      .mockImplementation(() =>
        textReject ? Promise.reject(new Error("bad text")) : Promise.resolve(textValue)
      ),
  };
}

describe("lib/api/http", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("toError", () => {
    it("returns the same Error instance if given an Error", () => {
      const e = new Error("x");
      expect(toError(e)).toBe(e);
    });

    it("wraps string into Error with same message", () => {
      const e = toError("nope");
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toBe("nope");
    });

    it("uses e.message if present (stringified)", () => {
      const e = toError({ message: "hello" });
      expect(e.message).toBe("hello");
    });

    it("stringifies objects without message", () => {
      const e = toError({ a: 1 });
      expect(e.message).toBe(JSON.stringify({ a: 1 }));
    });

    it("stringifies non-string message values", () => {
      const e = toError({ message: 123 });
      expect(e.message).toBe("123");
    });

    it("stringifies null/undefined into a message", () => {
    const e1 = toError(null);
    const e2 = toError(undefined);

    expect(e1.message).toBe("null");
    // JSON.stringify(undefined) -> undefined, and new Error(undefined).message -> ""
    expect(e2.message).toBe("");
    });
  });

  describe("apiGet", () => {
    it("calls fetch with GET, include credentials, Accept header, and passes signal", async () => {
      const signal = { aborted: false };
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: true,
          status: 200,
          headers: { "content-type": "application/json" },
          jsonValue: { ok: true },
        })
      );

      const out = await apiGet("/api/ping", { signal });
      expect(out).toEqual({ ok: true });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [path, opts] = globalThis.fetch.mock.calls[0];
      expect(path).toBe("/api/ping");
      expect(opts).toMatchObject({
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });
    });

    it("returns JSON object when content-type includes application/json", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: true,
          headers: { "content-type": "application/json; charset=utf-8" },
          jsonValue: { hello: "world" },
        })
      );

      const out = await apiGet("/x");
      expect(out).toEqual({ hello: "world" });
    });

    it("treats missing content-type header as non-json and returns {ok:true, raw:text}", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: true,
          headers: {}, // get("content-type") => null => ""
          textValue: "plain ok",
        })
      );

      const out = await apiGet("/no-ct");
      expect(out).toEqual({ ok: true, raw: "plain ok" });
    });

    it("returns {ok:true, raw:text} when content-type is not json", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: true,
          headers: { "content-type": "text/plain" },
          textValue: "plain ok",
        })
      );

      const out = await apiGet("/text");
      expect(out).toEqual({ ok: true, raw: "plain ok" });
    });

    it("on error prefers json.detail over fallback message and attaches status+payload", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 400,
          headers: { "content-type": "application/json" },
          jsonValue: { detail: "Bad input" },
        })
      );

      await expect(apiGet("/bad")).rejects.toMatchObject({
        message: "Bad input",
        status: 400,
        payload: { detail: "Bad input" },
      });
    });

    it("on error prefers json.error", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 500,
          headers: { "content-type": "application/json" },
          jsonValue: { error: "Server down" },
        })
      );

      await expect(apiGet("/fail")).rejects.toMatchObject({
        message: "Server down",
        status: 500,
        payload: { error: "Server down" },
      });
    });

    it("on error prefers json.message", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 403,
          headers: { "content-type": "application/json" },
          jsonValue: { message: "Forbidden" },
        })
      );

      await expect(apiGet("/nope")).rejects.toMatchObject({
        message: "Forbidden",
        status: 403,
        payload: { message: "Forbidden" },
      });
    });

    it("on error uses fallback message when json has no detail/error/message", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 418,
          headers: { "content-type": "application/json" },
          jsonValue: { whatever: true },
        })
      );

      await expect(apiGet("/teapot")).rejects.toMatchObject({
        message: "Request failed (418)",
        status: 418,
        payload: { whatever: true },
      });
    });

    it("if json parsing fails, treats json as {} and still throws with fallback", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 502,
          headers: { "content-type": "application/json" },
          jsonReject: true,
        })
      );

      await expect(apiGet("/bad-json")).rejects.toMatchObject({
        message: "Request failed (502)",
        status: 502,
        payload: {}, // because .catch(() => ({}))
      });
    });

    it("if text parsing fails on non-json, returns raw as empty string when ok", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: true,
          headers: { "content-type": "text/plain" },
          textReject: true,
        })
      );

      const out = await apiGet("/text-fail");
      expect(out).toEqual({ ok: true, raw: "" });
    });

    it("on error with non-json response uses fallback message and payload is raw text", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 503,
          headers: { "content-type": "text/plain" },
          textValue: "Service unavailable",
        })
      );

      await expect(apiGet("/down")).rejects.toMatchObject({
        message: "Request failed (503)",
        status: 503,
        payload: "Service unavailable",
      });
    });

    it("on error with non-json + text parsing failure uses fallback and payload is empty string", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 504,
          headers: { "content-type": "text/plain" },
          textReject: true,
        })
      );

      await expect(apiGet("/timeout")).rejects.toMatchObject({
        message: "Request failed (504)",
        status: 504,
        payload: "",
      });
    });

    it("stringifies non-string json.detail when building error message", async () => {
      globalThis.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 400,
          headers: { "content-type": "application/json" },
          jsonValue: { detail: { why: "nope" } },
        })
      );

      await expect(apiGet("/bad2")).rejects.toMatchObject({
        status: 400,
      });

      try {
        await apiGet("/bad2");
      } catch (e) {
        expect(e.message).toBe(JSON.stringify({ why: "nope" }));
      }
    });
  });

  describe("apiGetWithRetry", () => {
    it("retries once after failure and returns success on second attempt", async () => {
      globalThis.fetch
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: false,
            status: 500,
            headers: { "content-type": "application/json" },
            jsonValue: { error: "nope" },
          })
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: true,
            status: 200,
            headers: { "content-type": "application/json" },
            jsonValue: { ok: true },
          })
        );

      const out = await apiGetWithRetry("/flaky");
      expect(out).toEqual({ ok: true });
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry if signal is aborted after the first failure (rethrows same error)", async () => {
      const signal = { aborted: true };

      globalThis.fetch.mockResolvedValueOnce(
        makeFetchResponse({
          ok: false,
          status: 500,
          headers: { "content-type": "application/json" },
          jsonValue: { error: "nope" },
        })
      );

      await expect(apiGetWithRetry("/abort", { signal })).rejects.toMatchObject({
        status: 500,
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("retries with same signal when not aborted", async () => {
      const signal = { aborted: false };

      globalThis.fetch
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: false,
            status: 500,
            headers: { "content-type": "application/json" },
            jsonValue: { error: "nope" },
          })
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: true,
            status: 200,
            headers: { "content-type": "application/json" },
            jsonValue: { ok: true },
          })
        );

      const out = await apiGetWithRetry("/retry", { signal });
      expect(out).toEqual({ ok: true });

      // Both calls should include the same signal object
      const call1Opts = globalThis.fetch.mock.calls[0][1];
      const call2Opts = globalThis.fetch.mock.calls[1][1];
      expect(call1Opts.signal).toBe(signal);
      expect(call2Opts.signal).toBe(signal);
    });

    it("if second attempt fails too, it rejects with that error", async () => {
      globalThis.fetch
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: false,
            status: 500,
            headers: { "content-type": "application/json" },
            jsonValue: { error: "first" },
          })
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: false,
            status: 502,
            headers: { "content-type": "application/json" },
            jsonValue: { error: "second" },
          })
        );

      await expect(apiGetWithRetry("/still-bad")).rejects.toMatchObject({
        status: 502,
        payload: { error: "second" },
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });
});