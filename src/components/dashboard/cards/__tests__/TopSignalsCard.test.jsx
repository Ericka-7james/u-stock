// src/components/dashboard/cards/__tests__/TopSignalsCard.test.jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TopSignalsCard from "../TopSignalsCard.jsx";

describe("TopSignalsCard", () => {
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

    expect(screen.getByText(/Loading signals…/i)).toBeInTheDocument();
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
      screen.getByText(
        /No signals available\. Run your fetchers \+ indicator scripts\./i
      )
    ).toBeInTheDocument();
  });

  it("renders at most five signal rows and calls onSelectTicker when a row is clicked", () => {
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

    // header row + 5 body rows
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(1 + 5);

    // AAPL row is active
    const aaplCell = screen.getByText("AAPL");
    const aaplRow = aaplCell.closest("tr");
    expect(aaplRow).not.toBeNull();
    expect(aaplRow).toHaveClass("mini-table-row--active");

    fireEvent.click(aaplRow);
    expect(onSelectTicker).toHaveBeenCalledTimes(1);
    expect(onSelectTicker).toHaveBeenCalledWith("AAPL");

    // META should not render
    expect(screen.queryByText("META")).not.toBeInTheDocument();
  });

  it("renders the help tooltip button with the correct aria-label", () => {
    render(
      <TopSignalsCard
        signals={[]}
        signalsMeta={{
          rankingDescription: "Ranked by composite signal score.",
        }}
        currentTicker=""
        onSelectTicker={vi.fn()}
        loading={false}
      />
    );

    const helpButton = screen.getByRole("button", {
      name: /How are top signals ranked\?/i,
    });

    expect(helpButton).toBeInTheDocument();
  });
});
