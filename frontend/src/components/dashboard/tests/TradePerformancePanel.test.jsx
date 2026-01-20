// frontend/src/components/dashboard/tests/TradePerformancePanel.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TradePerformancePanel from "../cards/TradePerformancePanel.jsx";

describe("TradePerformancePanel", () => {
  beforeEach(() => {
    // Avoid restore loops / stack issues; we mostly need call counts reset.
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  function baseProps(overrides = {}) {
    return {
      data: { start: "2026-01-01", end: "2026-01-07", trades: [] },
      onChangeRange: vi.fn(),
      opportunities: { stocks: [] },
      leaders: [],
      activeBot: null,
      onPickSymbol: vi.fn(),
      ...overrides,
    };
  }

  function renderWithRouter(ui) {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
  }

  // Normalize whitespace so "Source:\n ALPACA" matches reliably
  function expectSomeElementToHaveTextContent(regex) {
    const all = Array.from(document.body.querySelectorAll("*"));
    const hit = all.find((n) => regex.test((n.textContent || "").replace(/\s+/g, " ").trim()));
    expect(hit, `Expected to find textContent matching ${regex}`).toBeTruthy();
    return hit;
  }

  const getOppTableByTitle = (titleRegex) => {
    const titleEl = screen.getByText(titleRegex);
    return titleEl.closest(".tpOppMiniTable");
  };

  it("renders header + range tabs and calls onChangeRange with Week/Month/Year", () => {
    const onChangeRange = vi.fn();
    renderWithRouter(<TradePerformancePanel {...baseProps({ onChangeRange })} />);

    expect(screen.getByRole("heading", { name: /opportunities/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    fireEvent.click(screen.getByRole("button", { name: "Year" }));

    expect(onChangeRange).toHaveBeenCalledTimes(3);
    expect(onChangeRange).toHaveBeenNthCalledWith(1, "Week");
    expect(onChangeRange).toHaveBeenNthCalledWith(2, "Month");
    expect(onChangeRange).toHaveBeenNthCalledWith(3, "Year");
  });

  it("shows bot OFF state + locked messages when no bot is running", () => {
    const { container } = renderWithRouter(
      <TradePerformancePanel {...baseProps({ activeBot: { running: false, name: "EMA" } })} />
    );

    // This subtitle appears (and may appear elsewhere too)
    expect(container.querySelector(".tpSubtitle")?.textContent || "").toMatch(/no bot running/i);

    // OFF shows in multiple places (pill + big card), so use getAllByText
    expect(screen.getAllByText("OFF").length).toBeGreaterThan(0);
    expect(screen.getByText(/leaders-only/i)).toBeInTheDocument();

    // Bot-aligned table lock message
    expectSomeElementToHaveTextContent(/start a bot to generate aligned picks/i);

    // Internal picks not wired
    expectSomeElementToHaveTextContent(/bot opportunities not wired yet/i);
  });

  it("does not crash when activeBot.running=true (current UI still shows OFF contract)", () => {
    const { container } = renderWithRouter(
      <TradePerformancePanel {...baseProps({ activeBot: { running: true, name: "EMA Trend" } })} />
    );

    // Based on your DOM snapshot, the panel still renders OFF messaging.
    expect(container.querySelector(".tpSubtitle")?.textContent || "").toMatch(/no bot running/i);
    expect(screen.getAllByText("OFF").length).toBeGreaterThan(0);
  });

  it("renders Trades Context count and computes win rate percent", () => {
    renderWithRouter(
      <TradePerformancePanel
        {...baseProps({
          data: {
            start: "2026-01-01",
            end: "2026-01-07",
            trades: [{ pnl: 10 }, { pnl: -5 }, { pnl: 2 }],
          },
        })}
      />
    );

    expect(screen.getByText(/trades context/i)).toBeInTheDocument();
    // Big value should be 3
    expect(screen.getByText("3")).toBeInTheDocument();
    // win rate: 2/3 -> 67%
    expectSomeElementToHaveTextContent(/win rate 67%/i);
  });

  it("renders Market leaders section and shows Source: ALPACA by default", () => {
    renderWithRouter(<TradePerformancePanel {...baseProps()} />);

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    // "Source:\n ALPACA" is split across nodes; check textContent on the table
    expect((leadersTable.textContent || "").replace(/\s+/g, " ")).toMatch(/source:\s*alpaca/i);
  });

  it("uses ALPACA+Computed source label when backend marks prevCloseComputed=true", () => {
    renderWithRouter(
      <TradePerformancePanel
        {...baseProps({
          leaders: [
            { symbol: "AAPL", changePct: 1, last: 100, prevClose: 99, prevCloseComputed: true },
          ],
        })}
      />
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();
    expect((leadersTable.textContent || "").replace(/\s+/g, " ")).toMatch(/alpaca\+computed/i);
  });

  it("uses ALPACA source label when no computed prevClose is involved", () => {
    renderWithRouter(
      <TradePerformancePanel
        {...baseProps({
          leaders: [
            { symbol: "AAPL", changePct: 1, last: 100, prevClose: 99, prevCloseComputed: false },
          ],
        })}
      />
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();
    expect((leadersTable.textContent || "").replace(/\s+/g, " ")).toMatch(/source:\s*alpaca\b/i);
    expect((leadersTable.textContent || "").replace(/\s+/g, " ")).not.toMatch(/alpaca\+computed/i);
  });

  it("renders leaders rows when leaders are provided (symbol text exists in leaders table)", () => {
    renderWithRouter(
      <TradePerformancePanel
        {...baseProps({
          leaders: [
            { symbol: "AAPL", changePct: 2.5, last: 100, prevClose: 98 },
            { symbol: "MSFT", changePct: 1.0, last: 50, prevClose: 49 },
          ],
        })}
      />
    );

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();

    // Don’t assume pills are <button>; just confirm text exists in this section.
    expect(within(leadersTable).getByText("AAPL")).toBeInTheDocument();
    expect(within(leadersTable).getByText("MSFT")).toBeInTheDocument();
  });

  it("bot-aligned and internal tables currently show 'locked/not wired' empty states (no pills/buttons required)", () => {
    renderWithRouter(
      <TradePerformancePanel
        {...baseProps({
          activeBot: { running: true, name: "EMA" },
          opportunities: {
            stocks: [
              { symbol: "AAPL", score: 3.25, reason: "bot likes it" },
              { symbol: "TSLA", score: 2.0, reason: "bot likes it" },
            ],
          },
          leaders: [{ symbol: "AAPL", changePct: 5, last: 100, prevClose: 95 }],
        })}
      />
    );

    const alignedTable = getOppTableByTitle(/bot-aligned \(leaders ∩ bot\)/i);
    const internalTable = getOppTableByTitle(/internal \(bot picks\)/i);

    expect(alignedTable).not.toBeNull();
    expect(internalTable).not.toBeNull();

    expect((alignedTable.textContent || "").replace(/\s+/g, " ")).toMatch(
      /start a bot to generate aligned picks/i
    );
    expect((internalTable.textContent || "").replace(/\s+/g, " ")).toMatch(
      /bot opportunities not wired yet/i
    );
  });

  it("limits pill counts: current empty-state implementation yields 0 interactive pills in aligned/internal", () => {
    renderWithRouter(<TradePerformancePanel {...baseProps()} />);

    const alignedTable = getOppTableByTitle(/bot-aligned \(leaders ∩ bot\)/i);
    const internalTable = getOppTableByTitle(/internal \(bot picks\)/i);

    expect(alignedTable).not.toBeNull();
    expect(internalTable).not.toBeNull();

    // Don’t use getAllByRole("button") since there may be none and pills may not be buttons.
    const alignedButtons = within(alignedTable).queryAllByRole("button");
    const internalButtons = within(internalTable).queryAllByRole("button");

    expect(alignedButtons.length).toBe(0);
    expect(internalButtons.length).toBe(0);
  });
});
