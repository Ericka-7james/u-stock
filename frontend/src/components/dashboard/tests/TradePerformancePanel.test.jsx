// frontend/src/components/dashboard/tests/TradePerformancePanel.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import TradePerformancePanel from "../cards/TradePerformancePanel.jsx";

describe("TradePerformancePanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  const getMiniCardByLabel = (label) => {
    const labelEl = screen.getByText(label);
    return labelEl.closest(".tpMiniCard");
  };

  const getOppTableByTitle = (titleRegex) => {
    const titleEl = screen.getByText(titleRegex);
    return titleEl.closest(".tpOppMiniTable");
  };

  it("renders header + range tabs and calls onChangeRange with Week/Month/Year", () => {
    const onChangeRange = vi.fn();
    render(<TradePerformancePanel {...baseProps({ onChangeRange })} />);

    expect(screen.getByRole("heading", { name: /opportunities/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    fireEvent.click(screen.getByRole("button", { name: "Year" }));

    expect(onChangeRange).toHaveBeenCalledTimes(3);
    expect(onChangeRange).toHaveBeenNthCalledWith(1, "Week");
    expect(onChangeRange).toHaveBeenNthCalledWith(2, "Month");
    expect(onChangeRange).toHaveBeenNthCalledWith(3, "Year");
  });

  it("shows bot OFF state + locked message when no bot is running", () => {
    render(<TradePerformancePanel {...baseProps({ activeBot: { running: false, name: "EMA" } })} />);

    expect(screen.getByText(/no bot running/i)).toBeInTheDocument();
    expect(screen.getByText("OFF")).toBeInTheDocument();
    expect(screen.getByText(/leaders-only/i)).toBeInTheDocument();

    // Bot-aligned table should show lock message
    expect(screen.getByText(/start a bot to generate aligned picks/i)).toBeInTheDocument();
  });

  it("shows bot LIVE state + bot name when running", () => {
    render(<TradePerformancePanel {...baseProps({ activeBot: { running: true, name: "EMA Trend" } })} />);

    expect(screen.getByText(/bot running:\s*ema trend/i)).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/using bot alignment/i)).toBeInTheDocument();
  });

  it("renders Trades Context count and computes win rate percent", () => {
    render(
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

    // Trades Context should show count 3 somewhere in that big stat
    expect(screen.getByText(/trades context/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    // win rate: 2/3 -> 67%
    expect(screen.getByText(/win rate 67%/i)).toBeInTheDocument();
  });

  it("filters leaders and opportunities to STRICT A–Z symbols only (scoped assertions)", () => {
    render(
      <TradePerformancePanel
        {...baseProps({
          activeBot: { running: true, name: "EMA" },
          opportunities: {
            stocks: [
              { symbol: "AAPL", score: 1.1, reason: "ok" },
              { symbol: "BRK.B", score: 9.9, reason: "invalid" }, // filtered out
              { symbol: "tsla", score: 0.5, reason: "ok" }, // normalized uppercase
              { symbol: "123", score: 2.2, reason: "invalid" }, // filtered out
            ],
          },
          leaders: [
            { symbol: "AAPL", changePct: 2.5, last: 100, prevClose: 98 },
            { symbol: "MSFT", changePct: 1.0, last: 50, prevClose: 49 },
            { symbol: "RIVN-WS", changePct: 3.0, last: 10 }, // filtered out
          ],
        })}
      />
    );

    const internalTable = getOppTableByTitle(/internal \(bot picks\)/i);
    expect(internalTable).not.toBeNull();

    // Internal picks should have AAPL + TSLA
    expect(within(internalTable).getByText("AAPL")).toBeInTheDocument();
    expect(within(internalTable).getByText("TSLA")).toBeInTheDocument();

    // Invalid symbols should not render anywhere (they are filtered out)
    expect(screen.queryByText("BRK.B")).not.toBeInTheDocument();
    expect(screen.queryByText("123")).not.toBeInTheDocument();

    // Leaders table should include MSFT, and not include RIVN-WS
    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    expect(leadersTable).not.toBeNull();
    expect(within(leadersTable).getByText("MSFT")).toBeInTheDocument();
    expect(screen.queryByText("RIVN-WS")).not.toBeInTheDocument();
  });

  it("computes ALPACA+Computed source label when prevClose is back-calculated (fallback)", () => {
    render(
      <TradePerformancePanel
        {...baseProps({
          leaders: [{ symbol: "AAPL", changePct: 10, last: 110, prevClose: null }],
        })}
      />
    );

    expect(screen.getByText(/source:\s*alpaca\+computed/i)).toBeInTheDocument();

    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    const aaplPill = within(leadersTable).getByRole("button", { name: /aapl/i });
    const title = aaplPill.getAttribute("title") || "";

    expect(title).toMatch(/AAPL/);
    expect(title).toMatch(/Score:/);
    expect(title).toMatch(/Last price/);
    expect(title).toMatch(/Prev close/);
  });

  it("uses ALPACA+Computed source label when backend marks prevCloseComputed=true", () => {
    render(
      <TradePerformancePanel
        {...baseProps({
          leaders: [{ symbol: "AAPL", changePct: 1, last: 100, prevClose: 99, prevCloseComputed: true }],
        })}
      />
    );

    expect(screen.getByText(/source:\s*alpaca\+computed/i)).toBeInTheDocument();
  });

  it("uses ALPACA source label when no computed prevClose is involved", () => {
    render(
      <TradePerformancePanel
        {...baseProps({
          leaders: [{ symbol: "AAPL", changePct: 1, last: 100, prevClose: 99, prevCloseComputed: false }],
        })}
      />
    );

    expect(screen.getByText(/source:\s*alpaca$/i)).toBeInTheDocument();
  });

  it("creates aligned picks only when leaders ∩ opportunities overlaps (and clicking pill calls onPickSymbol)", () => {
    const onPickSymbol = vi.fn();

    render(
      <TradePerformancePanel
        {...baseProps({
          onPickSymbol,
          activeBot: { running: true, name: "EMA" },
          opportunities: {
            stocks: [
              { symbol: "AAPL", score: 3.25, reason: "bot likes it" },
              { symbol: "TSLA", score: 2.0, reason: "bot likes it" },
            ],
          },
          leaders: [
            { symbol: "AAPL", changePct: 5, last: 100, prevClose: 95 },
            { symbol: "MSFT", changePct: 4, last: 200, prevClose: 192 },
          ],
        })}
      />
    );

    const alignedTile = getMiniCardByLabel("Aligned");
    expect(alignedTile).not.toBeNull();
    expect(within(alignedTile).getByText("1")).toBeInTheDocument();

    const alignedTable = getOppTableByTitle(/bot-aligned \(leaders ∩ bot\)/i);
    expect(alignedTable).not.toBeNull();

    const aaplPill = within(alignedTable).getByRole("button", { name: /aapl/i });
    fireEvent.click(aaplPill);

    expect(onPickSymbol).toHaveBeenCalledTimes(1);
    expect(onPickSymbol).toHaveBeenCalledWith("AAPL");
  });

  it("when bot is NOT running, aligned table is locked and renders no pills (even if aligned count > 0)", () => {
    // NOTE: aligned computation does NOT depend on botRunning, so mini-stat may be > 0.
    // This test focuses on UX: aligned table should be empty/locked.
    render(
      <TradePerformancePanel
        {...baseProps({
          activeBot: { running: false, name: "EMA" },
          opportunities: { stocks: [{ symbol: "AAPL", score: 3 }] },
          leaders: [{ symbol: "AAPL", changePct: 2, last: 100, prevClose: 98 }],
        })}
      />
    );

    const alignedTable = getOppTableByTitle(/bot-aligned \(leaders ∩ bot\)/i);
    expect(alignedTable).not.toBeNull();

    // Locked message should be present
    expect(within(alignedTable).getByText(/start a bot to generate aligned picks/i)).toBeInTheDocument();

    // And there should be no pill buttons inside this table
    expect(within(alignedTable).queryAllByRole("button").length).toBe(0);
  });

  it("limits each OpportunityTable to at most 6 pills (leaders + aligned + internal)", () => {
    const mk = (sym, i) => ({ symbol: sym, score: i + 1, reason: `r${i}` });

    const oppStocks = ["AAPL", "MSFT", "GOOG", "TSLA", "AMZN", "META", "NFLX", "NVDA"].map((s, i) =>
      mk(s, i)
    );

    const leaders = ["AAPL", "MSFT", "GOOG", "TSLA", "AMZN", "META", "NFLX", "NVDA"].map((s, i) => ({
      symbol: s,
      changePct: i + 1,
      last: 100 + i,
      prevClose: 99 + i,
    }));

    render(
      <TradePerformancePanel
        {...baseProps({
          activeBot: { running: true, name: "EMA" },
          opportunities: { stocks: oppStocks },
          leaders,
        })}
      />
    );

    const alignedTable = getOppTableByTitle(/bot-aligned \(leaders ∩ bot\)/i);
    const leadersTable = getOppTableByTitle(/market leaders \(today\)/i);
    const internalTable = getOppTableByTitle(/internal \(bot picks\)/i);

    expect(alignedTable).not.toBeNull();
    expect(leadersTable).not.toBeNull();
    expect(internalTable).not.toBeNull();

    const alignedButtons = within(alignedTable).getAllByRole("button");
    const leadersButtons = within(leadersTable).getAllByRole("button");
    const internalButtons = within(internalTable).getAllByRole("button");

    expect(alignedButtons.length).toBeLessThanOrEqual(6);
    expect(leadersButtons.length).toBeLessThanOrEqual(6);
    expect(internalButtons.length).toBeLessThanOrEqual(6);
  });
});
