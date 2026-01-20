// src/charts/tests/PriceChart.test.jsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../TradingViewEmbed", () => ({
  default: ({ symbol, interval, theme, height }) => (
    <div
      data-testid="tv-embed"
      data-symbol={symbol}
      data-interval={interval}
      data-theme={theme}
      data-height={String(height)}
    />
  ),
}));

// IMPORTANT: adjust this path if your tests live elsewhere
import PriceChart, { toTradingViewSymbol } from "../PriceChart.jsx";

describe("PriceChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state with accessible status", () => {
    render(<PriceChart ticker="AAPL" loading={true} />);

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/loading chart/i);
  });

  test("renders TradingViewEmbed with default symbol when ticker is empty", () => {
    render(<PriceChart ticker="" loading={false} />);

    const embed = screen.getByTestId("tv-embed");
    expect(embed).toBeInTheDocument();
    expect(embed.getAttribute("data-symbol")).toBe("NASDAQ:AAPL");
  });

  test("maps plain equity ticker to NASDAQ:SYMBOL", () => {
    render(<PriceChart ticker="msft" />);

    const embed = screen.getByTestId("tv-embed");
    expect(embed.getAttribute("data-symbol")).toBe("NASDAQ:MSFT");
  });

  test("keeps already-qualified TradingView symbols and uppercases them", () => {
    render(<PriceChart ticker="nyse:ibm" />);

    const embed = screen.getByTestId("tv-embed");
    expect(embed.getAttribute("data-symbol")).toBe("NYSE:IBM");
  });

  test("maps crypto pairs BTC/USD and btc-usd to BITSTAMP:BTCUSD", () => {
    render(<PriceChart ticker="BTC/USD" />);
    expect(screen.getByTestId("tv-embed").getAttribute("data-symbol")).toBe(
      "BITSTAMP:BTCUSD"
    );

    render(<PriceChart ticker="btc-usd" />);
    expect(screen.getAllByTestId("tv-embed")[1].getAttribute("data-symbol")).toBe(
      "BITSTAMP:BTCUSD"
    );
  });

  test("passes interval/theme/height through with normalization + clamping", () => {
    render(
      <PriceChart
        ticker="AAPL"
        interval={5}
        theme="dark"
        height={50} // should clamp up to 180
      />
    );

    const embed = screen.getByTestId("tv-embed");
    expect(embed.getAttribute("data-interval")).toBe("5");
    expect(embed.getAttribute("data-theme")).toBe("dark");
    expect(embed.getAttribute("data-height")).toBe("180");
  });

  test("height clamps down to max 1200 and floors decimals", () => {
    render(<PriceChart ticker="AAPL" height={1300.9} />);

    const embed = screen.getByTestId("tv-embed");
    expect(embed.getAttribute("data-height")).toBe("1200");
  });

  test("theme defaults to light for unknown values", () => {
    render(<PriceChart ticker="AAPL" theme="neon" />);

    const embed = screen.getByTestId("tv-embed");
    expect(embed.getAttribute("data-theme")).toBe("light");
  });
});

describe("toTradingViewSymbol", () => {
  test("returns default when falsy ticker", () => {
    expect(toTradingViewSymbol("")).toBe("NASDAQ:AAPL");
    expect(toTradingViewSymbol(null)).toBe("NASDAQ:AAPL");
  });

  test("maps plain ticker to NASDAQ", () => {
    expect(toTradingViewSymbol("aapl")).toBe("NASDAQ:AAPL");
  });

  test("keeps full symbol and uppercases", () => {
    expect(toTradingViewSymbol("nasdaq:tsla")).toBe("NASDAQ:TSLA");
  });

  test("maps crypto pairs with slash or dash", () => {
    expect(toTradingViewSymbol("eth/usd")).toBe("BITSTAMP:ETHUSD");
    expect(toTradingViewSymbol("eth-usd")).toBe("BITSTAMP:ETHUSD");
  });
});
