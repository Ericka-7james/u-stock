// frontend/src/components/dashboard/tests/TopSignalsCard.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import TopSignalsCard from "../cards/TopSignalsCard.jsx";

/* -----------------------------------------
   Stable COPY mock (don’t couple tests to copy files)
------------------------------------------ */
vi.mock("../../../content/dashboard/cards/topSignalsCard.content.ts", () => {
  return {
    TOP_SIGNALS_CARD_COPY: {
      title: "Top Signals",
      tooltip: {
        title: "How are top signals ranked?",
        intro: "Intro text",
        bullets: [
          { label: "Daily", text: "Daily text" },
          { label: "Intraday", text: "Intraday text" },
          { label: "Multiday", text: "Multiday text" },
        ],
        footer: "Footer text",
      },
      states: {
        loading: "Loading signals…",
        empty: {
          line1: "No signals available yet.",
          line2: "Start your backend ranking endpoint or run your pipeline.",
        },
      },
      table: {
        headers: {
          ticker: "Ticker",
          score: "Score",
          d1: "1d",
          intraday: "Intraday",
          d5: "5d",
        },
        rowTitle: "Click to select ticker",
      },
    },
  };
});

// Mock HelpTooltip so we don't depend on its internal DOM
vi.mock("../../common/HelpTooltip", () => ({
  default: ({ title, children }) => (
    <div data-testid="help-tooltip">
      <button type="button" aria-label={title}>
        Help
      </button>
      <div>{children}</div>
    </div>
  ),
}));

describe("TopSignalsCard", () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    logSpy.mockRestore();
  });

  it("renders title and help tooltip trigger", () => {
    render(
      <TopSignalsCard
        signals={[]}
        signalsMeta={null}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    expect(screen.getByText(/top signals/i)).toBeInTheDocument();

    // HelpTooltip mock provides a button with aria-label === title
    expect(screen.getByRole("button", { name: /how are top signals ranked\?/i })).toBeInTheDocument();
  });

  it("shows loading message when loading is true", () => {
    render(
      <TopSignalsCard
        signals={[]}
        signalsMeta={null}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={true}
      />
    );

    expect(screen.getByText(/loading signals/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    // log once for loading state
    expect(logSpy).toHaveBeenCalled();
  });

  it("shows empty state when no signals and not loading", () => {
    render(
      <TopSignalsCard
        signals={[]}
        signalsMeta={null}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    expect(screen.getByText(/no signals available yet\./i)).toBeInTheDocument();
    expect(screen.getByText(/start your backend ranking endpoint or run your pipeline/i)).toBeInTheDocument();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(logSpy).toHaveBeenCalled();
  });

  it("renders a table with expected headers when signals exist", () => {
    const signals = [
      {
        ticker: "AAPL",
        score: 1.2345,
        components: {
          daily: { close_return_1d: 0.0123 },
          intraday: { intraday_return: 0.0045 },
          multiday: { return_5d: 0.0678 },
        },
      },
    ];

    render(
      <TopSignalsCard
        signals={signals}
        signalsMeta={null}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    const table = screen.getByRole("table");
    const headerRow = within(table).getAllByRole("row")[0];

    expect(within(headerRow).getByText(/ticker/i)).toBeInTheDocument();
    expect(within(headerRow).getByText(/score/i)).toBeInTheDocument();
    expect(within(headerRow).getByText(/^1d$/i)).toBeInTheDocument();
    expect(within(headerRow).getByText(/intraday/i)).toBeInTheDocument();
    expect(within(headerRow).getByText(/^5d$/i)).toBeInTheDocument();
  });

  it("renders at most 5 rows and calls onSelectTicker when a row is clicked", () => {
    const onSelectTicker = vi.fn();

    const signals = [
      { ticker: "AAPL", score: 1.2345, components: {} },
      { ticker: "MSFT", score: 0.9876, components: {} },
      { ticker: "GOOG", score: 0.5, components: {} },
      { ticker: "TSLA", score: -0.4, components: {} },
      { ticker: "AMZN", score: 2.0, components: {} },
      // 6th row should be truncated
      { ticker: "META", score: 3.0, components: {} },
    ];

    render(
      <TopSignalsCard
        signals={signals}
        signalsMeta={null}
        currentTicker="AAPL"
        onSelectTicker={onSelectTicker}
        loading={false}
      />
    );

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row"); // header + 5 rows
    expect(rows.length).toBe(1 + 5);

    // Ensure META is not present
    expect(screen.queryByText("META")).not.toBeInTheDocument();

    // Active row class applied for currentTicker
    const aaplCell = within(table).getByText("AAPL");
    const aaplRow = aaplCell.closest("tr");
    expect(aaplRow).not.toBeNull();
    expect(aaplRow).toHaveClass("mini-table-row--active");

    fireEvent.click(aaplRow);
    expect(onSelectTicker).toHaveBeenCalledTimes(1);
    expect(onSelectTicker).toHaveBeenCalledWith("AAPL");
  });

  it("normalizes alternative row shapes (symbol + daily/return fields)", () => {
    const signals = [
      // Uses `symbol` instead of `ticker`
      // Uses daily.return_1d, intraday.return_intraday, multiday.r5d
      {
        symbol: "msft",
        score: "2.5",
        daily: { return_1d: 0.01 }, // 1.0%
        intraday: { return_intraday: 0.005 }, // 0.5%
        multiday: { r5d: 0.02 }, // 2.0%
      },
    ];

    render(
      <TopSignalsCard
        signals={signals}
        signalsMeta={null}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    const table = screen.getByRole("table");

    // ticker uppercased
    expect(within(table).getByText("MSFT")).toBeInTheDocument();

    // score numeric string -> toFixed(2)
    expect(within(table).getByText("2.50")).toBeInTheDocument();

    // returns shown as pct with one decimal
    expect(within(table).getByText("1.0%")).toBeInTheDocument();
    expect(within(table).getByText("0.5%")).toBeInTheDocument();
    expect(within(table).getByText("2.0%")).toBeInTheDocument();
  });

  it("shows dashes when numeric fields missing", () => {
    const signals = [{ ticker: "ZZZZ", components: {} }]; // score missing, components missing

    render(
      <TopSignalsCard
        signals={signals}
        signalsMeta={null}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    const table = screen.getByRole("table");
    const row = within(table).getByText("ZZZZ").closest("tr");
    expect(row).not.toBeNull();

    // score + 1d + intraday + 5d => should include multiple dashes
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("renders rankingDescription caption when provided", () => {
    render(
      <TopSignalsCard
        signals={[{ ticker: "AAPL", score: 1, components: {} }]}
        signalsMeta={{ rankingDescription: "Ranked by composite signal score." }}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    expect(screen.getByText(/ranked by composite signal score\./i)).toBeInTheDocument();
  });

  it("does not spam logs when rerendered with same state", () => {
    const signals = [{ ticker: "AAPL", score: 1, components: {} }];

    const { rerender } = render(
      <TopSignalsCard
        signals={signals}
        signalsMeta={null}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    const firstCalls = logSpy.mock.calls.length;

    // rerender with same inputs should not log again due to internal key tracking
    rerender(
      <TopSignalsCard
        signals={signals}
        signalsMeta={null}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    expect(logSpy.mock.calls.length).toBe(firstCalls);
  });
});