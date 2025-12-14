// src/components/dashboard/tests/TopSignalsCard.test.jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import TopSignalsCard from "../cards/TopSignalsCard.jsx";

describe("TopSignalsCard", () => {
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

    // HelpTooltip renders a button with aria-label === title
    expect(
      screen.getByRole("button", { name: /how are top signals ranked\?/i })
    ).toBeInTheDocument();
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

    expect(
      screen.getByText(/no signals available\. run your fetchers \+ indicator scripts\./i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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
      {
        ticker: "AAPL",
        score: 1.2345,
        components: {
          daily: { close_return_1d: 0.0123 },
          intraday: { intraday_return: 0.0045 },
          multiday: { return_5d: 0.0678 },
        },
      },
      {
        ticker: "MSFT",
        score: 0.9876,
        components: {
          daily: { close_return_1d: -0.001 },
          intraday: { intraday_return: 0.002 },
          multiday: { return_5d: -0.0123 },
        },
      },
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

    // Click AAPL row triggers selection
    fireEvent.click(aaplRow);
    expect(onSelectTicker).toHaveBeenCalledTimes(1);
    expect(onSelectTicker).toHaveBeenCalledWith("AAPL");
  });

  it("formats numeric fields and shows dashes when missing", () => {
    const signals = [
      {
        ticker: "AAPL",
        score: 1.2,
        components: {
          daily: { close_return_1d: 0.0123 }, // 1.2%
          intraday: { intraday_return: 0.0045 }, // 0.5%
          multiday: { return_5d: 0.0678 }, // 6.8%
        },
      },
      {
        ticker: "ZZZZ",
        // score missing -> —
        components: {
          daily: {}, // —
          intraday: {}, // —
          multiday: {}, // —
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

    // AAPL formatted values
    expect(within(table).getByText("1.20")).toBeInTheDocument(); // score toFixed(2)
    expect(within(table).getByText("1.2%")).toBeInTheDocument();
    expect(within(table).getByText("0.4%")).toBeInTheDocument();
    expect(within(table).getByText("6.8%")).toBeInTheDocument();

    // Missing values show "—" (at least one present in that row)
    // We scope to the ZZZZ row so we don't accidentally match other dashes.
    const zRow = within(table).getByText("ZZZZ").closest("tr");
    expect(zRow).not.toBeNull();
    expect(within(zRow).getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("renders rankingDescription caption when provided", () => {
    render(
      <TopSignalsCard
        signals={[
          { ticker: "AAPL", score: 1, components: {} },
        ]}
        signalsMeta={{ rankingDescription: "Ranked by composite signal score." }}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    expect(
      screen.getByText(/ranked by composite signal score\./i)
    ).toBeInTheDocument();
  });
});
