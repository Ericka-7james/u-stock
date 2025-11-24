// src/components/dashboard/StatSummary.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StatSummary from "./StatSummary";

describe("StatSummary", () => {
  it("renders correct totals and placeholders when rawData is empty", () => {
    render(
      <MemoryRouter>
        <StatSummary meta={{}} rawData={[]} />
      </MemoryRouter>
    );

    // There are two "0" values: total mentions and subreddits
    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(2);

    // Top ticker should be em-dash
    expect(screen.getByText("—")).toBeInTheDocument();

    // Caption should show "No mentions this run"
    expect(
      screen.getByText(/no mentions this run/i)
    ).toBeInTheDocument();

    // Subreddits label should exist (count is 0 here)
    expect(screen.getByText(/datasources/i)).toBeInTheDocument();
  });

  it("renders correct totals and top ticker from rawData", () => {
    const rawData = [
      { ticker: "TSLA", count: 10 },
      { ticker: "AAPL", count: 5 },
      { ticker: "SPY", count: 1 },
    ];

    render(
      <MemoryRouter>
        <StatSummary meta={{ subreddits: [] }} rawData={rawData} />
      </MemoryRouter>
    );

    // Total mentions = 10 + 5 + 1 = 16
    expect(screen.getByText("16")).toBeInTheDocument();

    // Top ticker is first in list: TSLA
    expect(screen.getByText("TSLA")).toBeInTheDocument();

    // Top ticker caption: "10 mentions"
    expect(screen.getByText(/10 mentions/i)).toBeInTheDocument();
  });

  it("renders subreddit count from meta", () => {
    const meta = {
      subreddits: ["stocks", "wallstreetbets", "investing"],
    };

    render(
      <MemoryRouter>
        <StatSummary meta={meta} rawData={[]} />
      </MemoryRouter>
    );

    // Should show "3" as the stat-value for subreddits
    expect(screen.getByText("3")).toBeInTheDocument();

    // Should render link tile text
    expect(
      screen.getByText(/see more details/i)
    ).toBeInTheDocument();
  });
});
