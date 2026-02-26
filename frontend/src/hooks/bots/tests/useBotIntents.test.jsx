// frontend/src/hooks/bots/tests/useBotIntents.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import useBotIntents from "../useBotIntents";

// Small test harness so we can observe hook state in the DOM
function Harness({ botId, enabled = true, limit = 10, pollMs = 7000 }) {
  const { items, ts, busy, err, refresh } = useBotIntents({ botId, enabled, limit, pollMs });

  return (
    <div>
      <div data-testid="busy">{busy ? "1" : "0"}</div>
      <div data-testid="err">{err || ""}</div>
      <div data-testid="ts">{String(ts || 0)}</div>
      <div data-testid="items">{String(items?.length ?? 0)}</div>
      <button type="button" onClick={refresh}>
        refresh
      </button>
    </div>
  );
}

function deferred() {
  let resolve;
  let reject;
  const p = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { p, resolve, reject };
}

// flush microtasks so fetch->json->setState completes
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useBotIntents", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // ✅ keep REAL timers by default so waitFor works
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing when botId is empty (no fetch, stays reset)", async () => {
    render(<Harness botId="" enabled />);

    expect(screen.getByTestId("items").textContent).toBe("0");
    expect(screen.getByTestId("ts").textContent).toBe("0");
    expect(screen.getByTestId("err").textContent).toBe("");

    await flush();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fetches intents on mount and stores items + ts (success)", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ symbol: "AAPL" }, { symbol: "MSFT" }],
        ts: 123,
      }),
    });

    render(<Harness botId="bot-1" enabled={false} limit={10} />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(String(url)).toContain("/api/bots/intents?");
    expect(String(url)).toContain("bot_id=bot-1");
    expect(String(url)).toContain("limit=10");
    expect(opts).toMatchObject({ credentials: "include" });

    await waitFor(() => expect(screen.getByTestId("items").textContent).toBe("2"));
    expect(screen.getByTestId("ts").textContent).toBe("123");
    expect(screen.getByTestId("err").textContent).toBe("");
  });

  it("sets err when response is not ok (detail preferred), and clears busy", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Server said nope" }),
    });

    render(<Harness botId="bot-2" enabled={false} />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    // busy should end up back at 0
    await waitFor(() => expect(screen.getByTestId("busy").textContent).toBe("0"));
    expect(screen.getByTestId("err").textContent).toMatch(/server said nope/i);
    expect(screen.getByTestId("items").textContent).toBe("0");
  });

    it("polls when enabled=true (initial fetch + interval fetches)", async () => {
        vi.useFakeTimers();

        globalThis.fetch
        .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ items: [{ symbol: "AAPL" }], ts: 1 }),
        })
        .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ items: [{ symbol: "AAPL" }, { symbol: "TSLA" }], ts: 2 }),
        });

        render(<Harness botId="bot-poll" enabled pollMs={1000} />);

        // initial fetch (effect runs, fetch resolves, json resolves, state updates)
        await flush();
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("items").textContent).toBe("1");
        expect(screen.getByTestId("ts").textContent).toBe("1");

        // tick one interval (this schedules another async refresh)
        await act(async () => {
        vi.advanceTimersByTime(1000);
        });

        // allow fetch->json->setState to finish
        await flush();

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("items").textContent).toBe("2");
        expect(screen.getByTestId("ts").textContent).toBe("2");

        vi.useRealTimers();
    });

  it("does not poll when enabled=false (only initial fetch)", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ symbol: "AAPL" }], ts: 10 }),
    });

    render(<Harness botId="bot-nopoll" enabled={false} pollMs={1000} />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    // even if time passes, no polling should occur
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("clears old items immediately when botId changes (prevents stale flash)", async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ symbol: "AAPL" }], ts: 11 }),
    });

    const { rerender } = render(<Harness botId="bot-A" enabled={false} />);

    await waitFor(() => expect(screen.getByTestId("items").textContent).toBe("1"));

    // Second bot fetch will hang so we can observe immediate clear
    const d = deferred();
    globalThis.fetch.mockReturnValueOnce(d.p);

    rerender(<Harness botId="bot-B" enabled={false} />);

    // ✅ immediate clear should happen before fetch resolves
    expect(screen.getByTestId("items").textContent).toBe("0");
    expect(screen.getByTestId("ts").textContent).toBe("0");
    expect(screen.getByTestId("err").textContent).toBe("");

    d.resolve({
      ok: true,
      json: async () => ({ items: [{ symbol: "MSFT" }, { symbol: "NVDA" }], ts: 99 }),
    });

    await waitFor(() => expect(screen.getByTestId("items").textContent).toBe("2"));
    expect(screen.getByTestId("ts").textContent).toBe("99");
  });
});