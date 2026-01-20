// frontend/src/components/dashboard/tests/MarketLeadersCard.test.jsx
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import MarketLeadersCard from "../cards/MarketLeadersCard.jsx";

describe("MarketLeadersCard", () => {
  let timeSpy;

  beforeEach(() => {
    timeSpy = vi
      .spyOn(Date.prototype, "toLocaleTimeString")
      .mockImplementation(() => "12:34:56 PM");
  });

  afterEach(() => {
    timeSpy?.mockRestore?.();
  });

  test("renders title, subtitle, and table head", () => {
    render(
      <MarketLeadersCard
        title="Market leaders"
        subtitle="Top movers"
        items={[]}
        loading={false}
      />
    );

    expect(screen.getByText(/market leaders/i)).toBeInTheDocument();
    expect(screen.getByText(/top movers/i)).toBeInTheDocument();
    expect(screen.getByText(/^symbol$/i)).toBeInTheDocument();
    expect(screen.getByText(/^move$/i)).toBeInTheDocument();
  });

  test("renders loading skeleton rows when loading=true", () => {
    const { container } = render(<MarketLeadersCard items={[]} loading={true} />);
    const skeletons = container.querySelectorAll(".mlRowSkeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test("renders empty state when not loading and no rows", () => {
    render(<MarketLeadersCard items={[]} loading={false} />);
    expect(screen.getByText(/no leaders returned yet/i)).toBeInTheDocument();
  });

  test("filters out non A–Z tickers and normalizes symbol to uppercase", () => {
    render(
      <MarketLeadersCard
        items={[
          { symbol: " aapl ", score: 1.23, last: 100, prevClose: 99 },
          { symbol: "BRK.B", score: 1.0, last: 10, prevClose: 9 },
          { symbol: "TSLA1", score: 1.0, last: 10, prevClose: 9 },
          { symbol: "MSFT", score: 1.0, last: 10, prevClose: 9 },
        ]}
      />
    );

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.queryByText("BRK.B")).not.toBeInTheDocument();
    expect(screen.queryByText("TSLA1")).not.toBeInTheDocument();
  });

  test("clicking a row calls onSelectSymbol with the symbol", async () => {
    const user = userEvent.setup();
    const onSelectSymbol = vi.fn();

    render(
      <MarketLeadersCard
        items={[{ symbol: "AAPL", score: 2.5, last: 100, prevClose: 99 }]}
        onSelectSymbol={onSelectSymbol}
      />
    );

    // Use the real accessible name (derived from the button text)
    const rowBtn = screen.getByRole("button", { name: /aapl/i });
    await user.click(rowBtn);

    expect(onSelectSymbol).toHaveBeenCalledTimes(1);
    expect(onSelectSymbol).toHaveBeenCalledWith("AAPL");
  });

  test("formats pct with sign and arrow (positive)", () => {
    render(
      <MarketLeadersCard
        items={[{ symbol: "AAPL", score: 1.234, last: 100, prevClose: 99 }]}
      />
    );

    expect(screen.getByText("+1.23%")).toBeInTheDocument();
    expect(screen.getByText("↑")).toBeInTheDocument();
  });

  test("formats pct and arrow (negative)", () => {
    render(
      <MarketLeadersCard
        items={[{ symbol: "AAPL", score: -0.5, last: 100, prevClose: 101 }]}
      />
    );

    expect(screen.getByText("-0.50%")).toBeInTheDocument();
    expect(screen.getByText("↓")).toBeInTheDocument();
  });

  test("shows muted dash line when both last and prev are null", () => {
    render(<MarketLeadersCard items={[{ symbol: "AAPL", score: 1.0 }]} />);

    // Grab the only row button and assert its subline contains "—"
    const rowBtn = screen.getByRole("button", { name: /aapl/i });
    expect(within(rowBtn).getByText("—")).toBeInTheDocument();
  });

  test("renders last + prev when present (money formatting)", () => {
    render(
      <MarketLeadersCard
        items={[
          { symbol: "AAPL", score: 1.0, last: 123.456, prevClose: 120.1 },
        ]}
      />
    );

    expect(
      screen.getByText(/last price:\s*\$123\.46 \(usd\/share\)/i)
    ).toBeInTheDocument();

    expect(
      screen.getByText(/prev close:\s*\$120\.10 \(usd\/share\)/i)
    ).toBeInTheDocument();
  });

  test("computes prevClose fallback from last + pctMove when prevClose missing", () => {
    render(
      <MarketLeadersCard
        items={[{ symbol: "AAPL", score: 10, last: 110, prevClose: null }]}
        meta={{ source: "ALPACA" }}
      />
    );

    expect(
      screen.getByText(/prev close:\s*\$100\.00 \(usd\/share\)/i)
    ).toBeInTheDocument();

    expect(screen.getByText(/source:\s*alpaca\+computed/i)).toBeInTheDocument();
  });

  test("uses meta.source_label when provided (overrides computed label)", () => {
    render(
      <MarketLeadersCard
        items={[{ symbol: "AAPL", score: 10, last: 110, prevClose: null }]}
        meta={{ source_label: "CUSTOM_SOURCE" }}
      />
    );

    expect(screen.getByText(/source:\s*custom_source/i)).toBeInTheDocument();
    expect(screen.queryByText(/alpaca\+computed/i)).not.toBeInTheDocument();
  });

  test("uses ALPACA+Computed when backend marks prevCloseComputed=true", () => {
    render(
      <MarketLeadersCard
        items={[
          {
            symbol: "AAPL",
            score: 1,
            last: 100,
            prevClose: 99,
            prevCloseComputed: true,
          },
        ]}
        meta={{ source: "ALPACA" }}
      />
    );

    expect(screen.getByText(/source:\s*alpaca\+computed/i)).toBeInTheDocument();
  });

  test("renders As of time when meta.asOf is provided", () => {
    render(
      <MarketLeadersCard
        items={[{ symbol: "AAPL", score: 1, last: 100, prevClose: 99 }]}
        meta={{ source: "ALPACA", asOf: 1700000000 }}
      />
    );

    expect(screen.getByText(/as of 12:34:56 pm/i)).toBeInTheDocument();
  });
});
