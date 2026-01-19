import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi } from "vitest";
import OpportunitiesCard from "../cards/OpportunitiesCard.jsx";

describe("OpportunitiesCard", () => {
  test("renders title + subtitle defaults", () => {
    render(<OpportunitiesCard />);
    expect(screen.getByRole("heading", { name: /opportunities/i })).toBeInTheDocument();
    expect(screen.getByText(/bot-ranked picks/i)).toBeInTheDocument();
  });

  test("renders custom title + subtitle", () => {
    render(<OpportunitiesCard title="My Opps" subtitle="Custom subtitle" />);
    expect(screen.getByRole("heading", { name: /my opps/i })).toBeInTheDocument();
    expect(screen.getByText(/custom subtitle/i)).toBeInTheDocument();
  });

  test("shows loading text when loading=true", () => {
    render(<OpportunitiesCard loading={true} data={{ items: [] }} />);
    expect(screen.getByText(/loading…/i)).toBeInTheDocument();
  });

  test("shows requires-bot message when requiresBotRunning=true and not loading", () => {
    render(
      <OpportunitiesCard
        loading={false}
        data={{ requiresBotRunning: true, message: "Run a bot first!" }}
      />
    );

    expect(screen.getByText(/run a bot first!/i)).toBeInTheDocument();
    expect(screen.queryByText(/no opportunities returned yet/i)).not.toBeInTheDocument();
  });

  test("uses default requires-bot message when message missing", () => {
    render(<OpportunitiesCard loading={false} data={{ requiresBotRunning: true }} />);

    expect(
      screen.getByText(/start a bot to generate opportunities/i)
    ).toBeInTheDocument();
  });

  test("shows empty state when not loading, bot not required, and items empty", () => {
    render(<OpportunitiesCard loading={false} data={{ items: [] }} />);

    expect(screen.getByText(/no opportunities returned yet/i)).toBeInTheDocument();
  });

  test("renders items with symbol uppercased and score shown", () => {
    render(
      <OpportunitiesCard
        data={{
          items: [
            { symbol: "aapl", score: 7, reason: "Strong trend" },
            { symbol: "msft", edge: 3.5 },
          ],
        }}
      />
    );

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText(/score:\s*7/i)).toBeInTheDocument();
    expect(screen.getByText(/strong trend/i)).toBeInTheDocument();

    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText(/score:\s*3\.5/i)).toBeInTheDocument();
  });

  test("does not render score text when score is null/undefined", () => {
    render(
      <OpportunitiesCard
        data={{
          items: [{ symbol: "AAPL" }], // no score/edge
        }}
      />
    );

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    // "Score:" should not appear anywhere
    expect(screen.queryByText(/score:/i)).not.toBeInTheDocument();
  });

  test("clicking an item calls onSelectSymbol with the normalized symbol", async () => {
    const user = userEvent.setup();
    const onSelectSymbol = vi.fn();

    render(
      <OpportunitiesCard
        onSelectSymbol={onSelectSymbol}
        data={{
          items: [{ symbol: "aapl", score: 7 }],
        }}
      />
    );

    // Button's accessible name includes the symbol text
    const btn = screen.getByRole("button", { name: /aapl/i });
    await user.click(btn);

    expect(onSelectSymbol).toHaveBeenCalledTimes(1);
    expect(onSelectSymbol).toHaveBeenCalledWith("AAPL");
  });

  test("does not show empty state if items exist", () => {
    render(
      <OpportunitiesCard
        data={{
          items: [{ symbol: "AAPL", score: 1 }],
        }}
      />
    );

    expect(screen.queryByText(/no opportunities returned yet/i)).not.toBeInTheDocument();
  });
});
