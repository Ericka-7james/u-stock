// src/components/dashboard/tests/MacroCard.test.jsx
import React from "react";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import MacroCard from "../cards/MacroCard.jsx";

// Keep MacroCard tests focused on MacroCard (tooltip behavior tested elsewhere)
vi.mock("../../common/HelpTooltip.jsx", () => ({
  default: ({ title = "Help", children }) => (
    <div data-testid="help-tooltip">
      <span>{title}</span>
      <div>{children}</div>
    </div>
  ),
}));

function makeRes(
  json,
  { ok = true, status = 200, contentType = "application/json" } = {}
) {
  return {
    ok,
    status,
    headers: {
      get: (k) =>
        String(k || "").toLowerCase() === "content-type" ? contentType : "",
    },
    json: async () => json,
  };
}

// Flush pending promises/microtasks
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("MacroCard", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("renders defaults before data loads", async () => {
    fetch.mockResolvedValueOnce(
      makeRes(
        {
          risk: "Low",
          source: "FRED",
          rates: { fed_funds: 5.25, ten_year: 4.11 },
          inflation: { cpi_yoy: 3.4 },
          labor: { unemployment: 4.0 },
        },
        { ok: true }
      )
    );

    render(<MacroCard />);

    // immediate render
    expect(screen.getByText("Macro")).toBeInTheDocument();
    expect(screen.getByText(/source:\s*—/i)).toBeInTheDocument();

    // let the async effect run without asserting final state here
    await flush();
  });

  test("fetches and renders formatted macro values + risk pill + source", async () => {
    fetch.mockResolvedValueOnce(
      makeRes(
        {
          risk: "High",
          source: "FRED",
          rates: { fed_funds: 5.25, ten_year: 4.1 },
          inflation: { cpi_yoy: 3.4 },
          labor: { unemployment: 4.0 },
        },
        { ok: true }
      )
    );

    render(<MacroCard />);

    // wait for the first value to appear (signals effect finished)
    await waitFor(() => expect(screen.getByText("5.25%")).toBeInTheDocument());

    expect(screen.getByText("4.10%")).toBeInTheDocument();
    expect(screen.getByText("3.40%")).toBeInTheDocument();
    expect(screen.getByText("4.00%")).toBeInTheDocument();

    expect(screen.getByText(/source:\s*fred/i)).toBeInTheDocument();

    const pill = screen.getByText("High");
    expect(pill.className).toMatch(/macro-pill/);
    expect(pill.className).toMatch(/macro-pill--high/);
  });

  test("shows error message when backend returns non-ok", async () => {
    fetch.mockResolvedValueOnce(
      makeRes({ detail: "No macro cache yet" }, { ok: false, status: 500 })
    );

    render(<MacroCard />);

    expect(await screen.findByText(/no macro cache yet/i)).toBeInTheDocument();
  });

  test("refreshes once per minute and cleans up interval on unmount", async () => {
    // ✅ fake timers MUST be enabled before render so setInterval is captured
    vi.useFakeTimers();

    fetch
      .mockResolvedValueOnce(
        makeRes(
          {
            risk: "Low",
            source: "FRED",
            rates: { fed_funds: 1, ten_year: 2 },
            inflation: { cpi_yoy: 3 },
            labor: { unemployment: 4 },
          },
          { ok: true }
        )
      )
      .mockResolvedValueOnce(
        makeRes(
          {
            risk: "Low",
            source: "FRED",
            rates: { fed_funds: 1.5, ten_year: 2.5 },
            inflation: { cpi_yoy: 3.5 },
            labor: { unemployment: 4.5 },
          },
          { ok: true }
        )
      );

    const { unmount } = render(<MacroCard />);

    // initial run() happens immediately (effect)
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);

    // advance 60s => interval triggers run() again
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect(fetch).toHaveBeenCalledTimes(2);

    // cleanup should clear interval
    unmount();

    // advancing again should NOT refetch
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect(fetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
