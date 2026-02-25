// frontend/src/components/dashboard/tests/MacroCard.test.jsx
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

/* -------------------------
   Stable COPY mock (avoid brittle copy drift)
   IMPORTANT: mock the exact module path MacroCard imports
-------------------------- */
vi.mock("../../../content/dashboard/cards/macroCard.content.ts", () => ({
  MACRO_CARD_COPY: {
    title: "Macro",
    tooltip: { title: "Macro help", body: "Tooltip body" },
    pill: { unknown: "Unknown" },
    states: { loading: "Loading…" },
    labels: {
      fedFunds: "Fed Funds",
      tenYear: "10Y",
      cpiYoY: "CPI YoY",
      unemployment: "Unemployment",
    },
    footer: {
      sourcePrefix: "Source:",
      sourceFallback: "—",
      dot: " · ",
      cachePrefix: "Cache ~",
      cacheSuffix: "m",
      cacheFallback: "Cache",
    },
  },
}));

/* -------------------------
   getJson mock
-------------------------- */
vi.mock("../../../lib/api/json.js", async () => {
  return {
    getJson: vi.fn(),
  };
});

import { getJson } from "../../../lib/api/json.js";

// Flush pending promises/microtasks
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("MacroCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("renders defaults before data loads", async () => {
    // resolve later, but we want to assert the immediate/default UI first
    getJson.mockResolvedValueOnce({
      ok: true,
      source: "fred",
      ttl_seconds: 120,
      data: {
        risk: "Low",
        rates: { fed_funds: 5.25, ten_year: 4.11 },
        inflation: { cpi_yoy: 3.4 },
        labor: { unemployment: 4.0 },
      },
    });

    render(<MacroCard />);

    // immediate render
    expect(screen.getByText("Macro")).toBeInTheDocument();
    expect(screen.getByText(/source:\s*—/i)).toBeInTheDocument();

    // allow effect to settle (don’t assert final state here)
    await flush();
  });

  test("fetches and renders formatted macro values + risk pill + source", async () => {
    getJson.mockResolvedValueOnce({
      ok: true,
      as_of: "2026-02-24T00:00:00Z",
      source: "fred",
      ttl_seconds: 120, // 2 minutes -> "Cache ~2m"
      data: {
        risk: "High",
        rates: { fed_funds: 5.25, ten_year: 4.1 },
        inflation: { cpi_yoy: 3.4 },
        labor: { unemployment: 4.0 },
      },
    });

    render(<MacroCard />);

    // wait for the first value to appear (signals effect finished)
    await waitFor(() => expect(screen.getByText("5.25%")).toBeInTheDocument());

    expect(screen.getByText("4.10%")).toBeInTheDocument();
    expect(screen.getByText("3.40%")).toBeInTheDocument();
    expect(screen.getByText("4.00%")).toBeInTheDocument();

    // footer: Source + cache label
    expect(screen.getByText(/source:\s*fred/i)).toBeInTheDocument();
    expect(screen.getByText(/cache ~2m/i)).toBeInTheDocument();

    const pill = screen.getByText("High");
    expect(pill.className).toMatch(/macro-pill/);
    expect(pill.className).toMatch(/macro-pill--high/);
  });

  test("shows error message when backend returns non-ok / invalid payload", async () => {
    // easiest: getJson throws what MacroCard displays
    getJson.mockRejectedValueOnce(new Error("No macro cache yet"));

    render(<MacroCard />);

    expect(await screen.findByText(/no macro cache yet/i)).toBeInTheDocument();
  });

  test("refreshes once per minute and cleans up interval on unmount", async () => {
    // ✅ fake timers MUST be enabled before render so setInterval is captured
    vi.useFakeTimers();

    getJson
      .mockResolvedValueOnce({
        ok: true,
        source: "fred",
        ttl_seconds: 60,
        data: {
          risk: "Low",
          rates: { fed_funds: 1, ten_year: 2 },
          inflation: { cpi_yoy: 3 },
          labor: { unemployment: 4 },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        source: "fred",
        ttl_seconds: 60,
        data: {
          risk: "Low",
          rates: { fed_funds: 1.5, ten_year: 2.5 },
          inflation: { cpi_yoy: 3.5 },
          labor: { unemployment: 4.5 },
        },
      });

    const { unmount } = render(<MacroCard />);

    // initial run happens immediately
    await flush();
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getJson).toHaveBeenCalledWith("/api/macro/summary", expect.any(Object));

    // advance 60s => interval triggers run again
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect(getJson).toHaveBeenCalledTimes(2);

    // cleanup should clear interval
    unmount();

    // advancing again should NOT refetch
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect(getJson).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});