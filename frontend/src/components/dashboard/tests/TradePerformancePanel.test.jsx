// frontend/src/components/dashboard/tests/TradePerformancePanel.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// --- Prevent side-effects from BotControlCard (polling/fetch/timers) ---
vi.mock("../cards/BotControlCard.jsx", async () => {
  const React = (await import("react")).default;
  function BotControlCardMock({ onStateChange }) {
    React.useEffect(() => {
      // Panel expects BotControlCard to call this; keep bot OFF in tests
      onStateChange?.(null);
    }, [onStateChange]);
    return <div data-testid="bot-control-card" />;
  }
  return { default: BotControlCardMock };
});

// If your panel uses these libs, keep these mocks (they won't hurt)
vi.mock("recharts", async () => {
  const React = (await import("react")).default;
  return new Proxy(
    {},
    {
      get: (_t, prop) =>
        function RechartsStub({ children, ...rest }) {
          return (
            <div data-recharts={String(prop)} {...rest}>
              {children}
            </div>
          );
        },
    }
  );
});

vi.mock("lucide-react", async () => {
  const React = (await import("react")).default;
  return new Proxy(
    {},
    {
      get: (_t, prop) =>
        function LucideStub(props) {
          return <svg data-lucide={String(prop)} {...props} />;
        },
    }
  );
});

// Import the module and select the exported component safely
import * as TradePerformancePanelModule from "../cards/TradePerformancePanel.jsx";

function pickComponent(mod) {
  if (!mod) return undefined;
  if (typeof mod.default === "function") return mod.default;
  if (typeof mod.TradePerformancePanel === "function") return mod.TradePerformancePanel;
  for (const k of Object.keys(mod)) {
    if (typeof mod[k] === "function") return mod[k];
  }
  return undefined;
}
const TradePerformancePanel = pickComponent(TradePerformancePanelModule);

describe("TradePerformancePanel", () => {
  let originalConsoleError;

  beforeEach(() => {
    // Avoid vitest spy recursion issues: do NOT vi.spyOn(console.error)
    originalConsoleError = console.error;
    console.error = (...args) => {
      const msg = String(args?.[0] ?? "");
      if (msg.includes("not wrapped in act")) return;
      // swallow other errors during tests (optional)
      // originalConsoleError(...args); // uncomment if you want to see non-act errors
    };

    // Optional: if anything else fetches unexpectedly, keep it from rejecting
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.unstubAllGlobals();
    cleanup();
  });

  function baseProps(overrides = {}) {
    return {
      data: { start: "2026-01-01", end: "2026-01-07", trades: [] },
      onChangeRange: vi.fn(),
      opportunities: { stocks: [] },
      leaders: [],
      onPickSymbol: vi.fn(),
      ...overrides,
    };
  }

  function renderWithRouter(props) {
    return render(
      <MemoryRouter>
        <TradePerformancePanel {...props} />
      </MemoryRouter>
    );
  }

  const normalize = (s) => String(s || "").replace(/\s+/g, " ").trim();

  const getOppTableByTitle = (titleTextOrRegex) => {
    const titleEl =
      titleTextOrRegex instanceof RegExp
        ? screen.getByText(titleTextOrRegex)
        : screen.getByText(String(titleTextOrRegex));
    return titleEl.closest(".tpOppMiniTable");
  };

  const getCardByTitle = (titleRegex) => {
    const titleEl = screen.getByText(titleRegex);
    return titleEl.closest(".tpCard");
  };

  it("sanity: component import resolves", () => {
    expect(TradePerformancePanel).toBeTypeOf("function");
  });

  it("renders header + range tabs and calls onChangeRange with Week/Month/Year", async () => {
    const user = userEvent.setup();
    const onChangeRange = vi.fn();
    renderWithRouter(baseProps({ onChangeRange }));

    expect(screen.getByRole("heading", { name: /opportunities/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /week/i }));
    await user.click(screen.getByRole("button", { name: /month/i }));
    await user.click(screen.getByRole("button", { name: /year/i }));

    const calls = onChangeRange.mock.calls.map((c) => c[0]);
    expect(calls.slice(-3)).toEqual(["Week", "Month", "Year"]);
  });

  it("shows bot OFF state + locked messages when no bot is running", () => {
    renderWithRouter(baseProps());

    expect(screen.getAllByText(/no bot running/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("OFF").length).toBeGreaterThan(0);

    const alignedTable = getOppTableByTitle(/bot-aligned \(leaders ∩ bot\)/i);
    expect(alignedTable).not.toBeNull();
    expect(normalize(alignedTable.textContent).toLowerCase()).toContain("start a bot to generate aligned picks");
  });

  it("renders Trades Context count and computes win rate percent", () => {
    renderWithRouter(
      baseProps({
        data: {
          start: "2026-01-01",
          end: "2026-01-07",
          trades: [{ pnl: 10 }, { pnl: -5 }, { pnl: 2 }],
        },
      })
    );

    const tradesCard = getCardByTitle(/trades context/i);
    expect(tradesCard).not.toBeNull();

    expect(within(tradesCard).getByText("3")).toBeInTheDocument();
    expect(within(tradesCard).getByText(/win rate 67%/i)).toBeInTheDocument();
  });

  it("renders Market leaders section and shows Source: ALPACA by default", () => {
    renderWithRouter(
      baseProps({
        leaders: [{ symbol: "AAPL", changePct: 1, last: 100, prevClose: 99, prevCloseComputed: false }],
      })
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    const text = normalize(leadersTable.textContent);
    expect(text).toMatch(/Source:\s*ALPACA/i);
  });

  it("uses ALPACA+Computed source label when prevCloseComputed=true", () => {
    renderWithRouter(
      baseProps({
        leaders: [{ symbol: "AAPL", changePct: 1, last: 100, prevClose: 99, prevCloseComputed: true }],
      })
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    const text = normalize(leadersTable.textContent);
    expect(text).toMatch(/Source:\s*ALPACA\+Computed/i);
  });

  it("renders leaders rows when leaders are provided", () => {
    renderWithRouter(
      baseProps({
        leaders: [
          { symbol: "AAPL", changePct: 2.5, last: 100, prevClose: 98 },
          { symbol: "MSFT", changePct: 1.0, last: 50, prevClose: 49 },
        ],
      })
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    const text = normalize(leadersTable.textContent);
    expect(text).toMatch(/AAPL/i);
    expect(text).toMatch(/MSFT/i);
  });

  it("aligned locked when bot not running; internal shows picks when opportunities provided", () => {
    renderWithRouter(
      baseProps({
        opportunities: {
          stocks: [
            { symbol: "AAPL", score: 3.25, reason: "bot likes it" },
            { symbol: "TSLA", score: 2.0, reason: "bot likes it" },
          ],
        },
      })
    );

    const alignedTable = getOppTableByTitle(/bot-aligned \(leaders ∩ bot\)/i);
    expect(alignedTable).not.toBeNull();
    expect(normalize(alignedTable.textContent).toLowerCase()).toContain("start a bot to generate aligned picks");

    const internalTable = getOppTableByTitle(/internal \(bot picks\)/i);
    expect(internalTable).not.toBeNull();

    const internalText = normalize(internalTable.textContent);
    expect(internalText).toMatch(/AAPL/i);
    expect(internalText).toMatch(/TSLA/i);
  });

  it("leaders table contains Symbol/Score headings (structure)", () => {
    const oppStocks = ["AAPL", "MSFT", "GOOG", "TSLA"].map((s, i) => ({
      symbol: s,
      score: i + 1,
      reason: `r${i}`,
    }));

    renderWithRouter(
      baseProps({
        opportunities: { stocks: oppStocks },
        leaders: oppStocks.map((o, i) => ({
          symbol: o.symbol,
          changePct: i + 1,
          last: 100 + i,
          prevClose: 99 + i,
        })),
      })
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    const leadersText = normalize(leadersTable.textContent);
    expect(leadersText).toMatch(/Symbol/i);
    expect(leadersText).toMatch(/Score/i);
  });
});
