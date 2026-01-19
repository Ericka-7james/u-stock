// frontend/src/components/dashboard/tests/TopDayTradesCard.test.jsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import TopDayTradesCard from "../cards/TopDayTradesCard.jsx";

describe("TopDayTradesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders title + subtitle + toggle buttons", () => {
    render(<TopDayTradesCard />);

    expect(
      screen.getByRole("heading", { name: /top day trades/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/live from alpaca screener/i)).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /most active/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /top gainers/i })
    ).toBeInTheDocument();
  });

  test("shows loading message when loading=true", () => {
    render(<TopDayTradesCard loading={true} items={[]} />);
    expect(screen.getByText(/loading top tickers/i)).toBeInTheDocument();
  });

  test("shows empty state when not loading and items empty", () => {
    render(<TopDayTradesCard loading={false} items={[]} />);

    expect(screen.getByText(/no results yet/i)).toBeInTheDocument();
    expect(screen.getByText(/connected apps/i)).toBeInTheDocument();
  });

  test("renders table with headers when items exist", () => {
    const items = [
      { symbol: "AAPL", price: 100, changePct: 1.234, volume: 123456 },
      { symbol: "MSFT", price: 250.5, changePct: -0.5, volume: 987654 },
    ];

    render(<TopDayTradesCard loading={false} items={items} />);

    // table headers
    expect(screen.getByText("Symbol")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Chg%")).toBeInTheDocument();
    expect(screen.getByText("Volume")).toBeInTheDocument();

    // row values formatted
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("1.23%")).toBeInTheDocument();
    expect(screen.getByText("123,456")).toBeInTheDocument();

    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText("$250.50")).toBeInTheDocument();
    expect(screen.getByText("-0.50%")).toBeInTheDocument();
    expect(screen.getByText("987,654")).toBeInTheDocument();
  });

  test("renders only first 10 items", () => {
    const items = Array.from({ length: 12 }).map((_, i) => ({
      symbol: `SYM${i}`,
      price: 10 + i,
      changePct: i,
      volume: 1000 + i,
    }));

    render(<TopDayTradesCard loading={false} items={items} />);

    // SYM0..SYM9 should appear, SYM10..SYM11 should not
    for (let i = 0; i < 10; i++) {
      expect(screen.getByText(`SYM${i}`)).toBeInTheDocument();
    }
    expect(screen.queryByText("SYM10")).not.toBeInTheDocument();
    expect(screen.queryByText("SYM11")).not.toBeInTheDocument();
  });

  test("calls onChangeList when toggle buttons clicked", async () => {
    const user = userEvent.setup();
    const onChangeList = vi.fn();

    render(
      <TopDayTradesCard list="most_active" onChangeList={onChangeList} />
    );

    await user.click(screen.getByRole("button", { name: /top gainers/i }));
    expect(onChangeList).toHaveBeenCalledWith("top_gainers");

    await user.click(screen.getByRole("button", { name: /most active/i }));
    expect(onChangeList).toHaveBeenCalledWith("most_active");
  });

  test("applies active styling to selected list (smoke check via inline style)", () => {
    const { rerender } = render(<TopDayTradesCard list="most_active" />);

    const mostActive = screen.getByRole("button", { name: /most active/i });
    const topGainers = screen.getByRole("button", { name: /top gainers/i });

    // active has background "white" per component
    expect(mostActive).toHaveStyle({ background: "white" });
    expect(topGainers).not.toHaveStyle({ background: "white" });

    rerender(<TopDayTradesCard list="top_gainers" />);
    expect(screen.getByRole("button", { name: /top gainers/i })).toHaveStyle({
      background: "white",
    });
  });

  test("formats null values as em dash", () => {
    const items = [
      { symbol: "AAPL", price: null, changePct: null, volume: null },
    ];

    render(<TopDayTradesCard loading={false} items={items} />);

    // price, chg%, volume should be "—"
    // We expect at least 3 occurrences in that one row
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
