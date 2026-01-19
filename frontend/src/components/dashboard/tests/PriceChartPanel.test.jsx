// src/components/dashboard/tests/PriceChartPanel.test.jsx
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import PriceChartPanel from "../cards/PriceChartPanel.jsx";

// keep tests focused on PriceChartPanel; tooltip tested elsewhere
vi.mock("../../common/HelpTooltip.jsx", () => ({
  default: ({ title, children }) => (
    <div data-testid="help-tooltip">
      <span>{title}</span>
      <div>{children}</div>
    </div>
  ),
}));

function stubTradingView() {
  window.TradingView = {
    widget: vi.fn(),
  };
}

describe("PriceChartPanel", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.TradingView;
    document.querySelectorAll('script[data-tv="true"]').forEach((n) => n.remove());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.TradingView;
  });

  test("renders title + subtitle", () => {
    stubTradingView();

    render(<PriceChartPanel currentTicker="AAPL" isDarkMode={false} />);

    expect(
      screen.getByRole("heading", { name: /price action viewer/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/search any symbol directly in the chart/i)
    ).toBeInTheDocument();
  });

  test("injects tv.js script when TradingView.widget is not available yet", async () => {
    const appendSpy = vi.spyOn(document.head, "appendChild");

    render(<PriceChartPanel currentTicker="AAPL" isDarkMode={false} />);

    await waitFor(() => {
      expect(appendSpy).toHaveBeenCalled();
    });

    const script = document.querySelector('script[data-tv="true"]');
    expect(script).toBeTruthy();
    expect(script.getAttribute("src")).toBe("https://s3.tradingview.com/tv.js");
  });

  test("does not inject tv.js script when one already exists", async () => {
    const existing = document.createElement("script");
    existing.src = "https://s3.tradingview.com/tv.js";
    existing.async = true;
    existing.dataset.tv = "true";
    document.head.appendChild(existing);

    const appendSpy = vi.spyOn(document.head, "appendChild");

    render(<PriceChartPanel currentTicker="AAPL" isDarkMode={false} />);

    await Promise.resolve();

    expect(appendSpy).not.toHaveBeenCalled();
    expect(document.querySelectorAll('script[data-tv="true"]').length).toBe(1);
  });

  test("creates TradingView widget with normalized symbol + light theme", async () => {
    stubTradingView();

    render(<PriceChartPanel currentTicker="nasdaq:msft" isDarkMode={false} />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(1);
    });

    const args = window.TradingView.widget.mock.calls[0][0];

    expect(args.symbol).toBe("MSFT");
    expect(args.theme).toBe("light");
    expect(args.interval).toBe("D");
    expect(args.autosize).toBe(true);
    expect(args.allow_symbol_change).toBe(true);
    expect(String(args.container_id)).toMatch(/^tv-/);
  });

  test("rebuilds widget when ticker changes", async () => {
    stubTradingView();

    const { rerender } = render(
      <PriceChartPanel currentTicker="AAPL" isDarkMode={false} />
    );

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(1);
    });

    rerender(<PriceChartPanel currentTicker="TSLA" isDarkMode={false} />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(2);
    });

    const call2 = window.TradingView.widget.mock.calls[1][0];
    expect(call2.symbol).toBe("TSLA");
    expect(call2.theme).toBe("light");
  });

  test("rebuilds widget when theme changes", async () => {
    stubTradingView();

    const { rerender } = render(
      <PriceChartPanel currentTicker="AAPL" isDarkMode={false} />
    );

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(1);
    });

    rerender(<PriceChartPanel currentTicker="AAPL" isDarkMode={true} />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(2);
    });

    const call2 = window.TradingView.widget.mock.calls[1][0];
    expect(call2.theme).toBe("dark");
    expect(call2.symbol).toBe("AAPL");
  });

  test("falls back to AAPL when currentTicker is empty", async () => {
    stubTradingView();

    render(<PriceChartPanel currentTicker="" isDarkMode={false} />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(1);
    });

    const args = window.TradingView.widget.mock.calls[0][0];
    expect(args.symbol).toBe("AAPL");
  });
});
