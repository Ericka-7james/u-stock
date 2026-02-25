// frontend/src/components/dashboard/tests/TopDayTradesCard.test.jsx
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import TopDayTradesCard from "../cards/TopDayTradesCard.jsx";

/* -----------------------------------------
   Stable COPY mock (avoid brittle copy drift)
------------------------------------------ */
vi.mock("../../../content/dashboard/cards/topDayTradesCard.content.ts", () => ({
  TOP_DAY_TRADES_CARD_COPY: {
    header: {
      title: "Top Day Trades",
      subtitle: "Live from Alpaca screener",
    },
    tabs: {
      mostActive: "Most Active",
      topGainers: "Top Gainers",
    },
    states: {
      loading: "Loading top tickers…",
      empty: {
        line1: "No results yet.",
        line2: "Connect a broker in Connected Apps.",
      },
    },
    table: {
      columns: {
        symbol: "Symbol",
        price: "Price",
        chgPct: "Chg%",
        volume: "Volume",
      },
    },
    limits: {
      maxRows: 10,
    },
  },
}));

vi.mock("../../../lib/format/marketFormat.js", async () => {
  const actual = await vi.importActual("../../../lib/format/marketFormat.js");
  return {
    ...actual,
    fmtMoney: (v) => (v == null ? "—" : actual.fmtMoney(v)),
  };
});

vi.mock("../../../lib/format/number.js", async () => {
  const actual = await vi.importActual("../../../lib/format/number.js");
  return {
    ...actual,
    fmtPct2: (v) => (v == null ? "—" : actual.fmtPct2(v)),
    fmtInt0: (v) => (v == null ? "—" : actual.fmtInt0(v)),
  };
});

describe("TopDayTradesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("renders title + subtitle + toggle buttons", () => {
    render(<TopDayTradesCard />);

    expect(screen.getByRole("heading", { name: /top day trades/i })).toBeInTheDocument();
    expect(screen.getByText(/live from alpaca screener/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /most active/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /top gainers/i })).toBeInTheDocument();
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

    // table headers (from COPY mock)
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

    render(<TopDayTradesCard list="most_active" onChangeList={onChangeList} />);

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
    expect(screen.getByRole("button", { name: /top gainers/i })).toHaveStyle({ background: "white" });
  });

  test("formats null values as em dash (or placeholder)", () => {
    const items = [{ symbol: "AAPL", price: null, changePct: null, volume: null }];

    render(<TopDayTradesCard loading={false} items={items} />);

    // Find the row for AAPL
    const row = screen.getByText("AAPL").closest("tr");
    expect(row).not.toBeNull();

    const cells = row.querySelectorAll("td");
    // [0]=symbol, [1]=price, [2]=chg%, [3]=volume
    expect(cells.length).toBeGreaterThanOrEqual(4);

    // Expect "missing" placeholders (accept either em dash or empty-ish fallback)
    const priceText = cells[1].textContent?.trim();
    const chgText = cells[2].textContent?.trim();
    const volText = cells[3].textContent?.trim();

    expect(["—", "", "–"]).toContain(priceText);
    expect(["—", "", "–"]).toContain(chgText);
    expect(["—", "", "–"]).toContain(volText);
  });
});