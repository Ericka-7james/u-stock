// frontend/src/components/bots/tests/botRunnerApi.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchProviderStatus,
  fetchBotStatuses,
  startBot,
  stopBot,
} from "../botRunnerApi";

// Minimal Response-like helper
function makeRes(opts: {
  ok: boolean;
  status?: number;
  statusText?: string;
  jsonData?: any;
  textData?: string;
  contentType?: string;
}) {
  const {
    ok,
    status = ok ? 200 : 500,
    statusText = ok ? "OK" : "Internal Server Error",
    jsonData,
    textData = "",
    contentType = "application/json",
  } = opts;

  const headers = new Map<string, string>([["content-type", contentType]]);
  return {
    ok,
    status,
    statusText,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) || null },
    json: vi.fn(async () => jsonData),
    text: vi.fn(async () => textData),
  } as any;
}

describe("botRunnerApi", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // @ts-expect-error - test override
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchProviderStatus() hits /api/integrations/status with credentials include", async () => {
    fetchMock.mockResolvedValueOnce(
      makeRes({ ok: true, jsonData: { alpacaConnected: true } })
    );

    const data = await fetchProviderStatus();

    expect(data).toEqual({ alpacaConnected: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/integrations/status");
    expect(init.credentials).toBe("include");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("fetchBotStatuses() hits /api/bots/status", async () => {
    fetchMock.mockResolvedValueOnce(
      makeRes({
        ok: true,
        jsonData: {
          ema_trend: { id: "ema_trend", state: "running" },
        },
      })
    );

    const data = await fetchBotStatuses();
    expect(data).toEqual({ ema_trend: { id: "ema_trend", state: "running" } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bots/status");
    expect(init.credentials).toBe("include");
  });

  it("startBot() POSTs to /api/bots/start with body { botId }", async () => {
    fetchMock.mockResolvedValueOnce(makeRes({ ok: true, jsonData: { ok: true } }));

    const data = await startBot("ema_trend");
    expect(data).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bots/start");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ botId: "ema_trend" }));
  });

  it("stopBot() POSTs to /api/bots/stop with body { botId }", async () => {
    fetchMock.mockResolvedValueOnce(makeRes({ ok: true, jsonData: { ok: true } }));

    const data = await stopBot("ema_trend");
    expect(data).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bots/stop");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ botId: "ema_trend" }));
  });

  it("throws error message from JSON detail/message when non-ok", async () => {
    fetchMock.mockResolvedValueOnce(
      makeRes({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        jsonData: { detail: "Not logged in" },
      })
    );

    await expect(fetchProviderStatus()).rejects.toThrow("Not logged in");
  });

  it("falls back to status-based message when JSON parse fails", async () => {
    const res = makeRes({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      jsonData: undefined,
      contentType: "application/json",
    });
    res.json.mockRejectedValueOnce(new Error("bad json"));
    fetchMock.mockResolvedValueOnce(res);

    await expect(fetchProviderStatus()).rejects.toThrow("Request failed (500)");
  });

  it("falls back to default message when non-json error response", async () => {
    fetchMock.mockResolvedValueOnce(
      makeRes({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        contentType: "text/plain",
        textData: "nginx exploded",
      })
    );

    await expect(fetchProviderStatus()).rejects.toThrow("Request failed (502)");
  });
});
