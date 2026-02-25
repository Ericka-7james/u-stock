// frontend/src/components/dashboard/tests/PriceChartPanel.test.jsx
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import PriceChartPanel from "../cards/PriceChartPanel.jsx";

/* -----------------------------------------
   Stable COPY mock (avoid copy drift)
------------------------------------------ */
vi.mock("../../../content/dashboard/cards/priceChartPanel.content.ts", () => ({
  PRICE_CHART_PANEL_COPY: {
    title: "Price Action Viewer",
    fallbacks: {
      symbol: "AAPL",
      interval: "D",
    },
    subtitle: {
      candleIntervalPrefix: "Candles:",
      dot: " · ",
    },
    tooltip: {
      title: "Chart Help",
      body: ["Search any symbol directly in the chart."],
      note: "Note text",
    },
    errors: {
      initFailedPrefix: "PriceChartPanel init failed:",
    },
  },
}));

// keep tests focused on PriceChartPanel; tooltip tested elsewhere
vi.mock("../../common/HelpTooltip.jsx", () => ({
  default: ({ title, children }) => (
    <div data-testid="help-tooltip">
      <span>{title}</span>
      <div>{children}</div>
    </div>
  ),
}));

/* -----------------------------------------
   Normalize symbol + interval label deterministically
------------------------------------------ */
vi.mock("../../../lib/symbols.js", () => ({
  normalizeSymbol: (sym) => {
    const s = String(sym || "").trim();
    if (!s) return "";
    // support "nasdaq:msft" -> "MSFT"
    return s.includes(":") ? s.split(":").pop().toUpperCase() : s.toUpperCase();
  },
}));

vi.mock("../../../lib/format/tradingview.js", () => ({
  prettyTvInterval: (interval) => {
    const x = String(interval || "").toUpperCase();
    if (!x) return "—";
    if (x === "D") return "Daily";
    if (x === "W") return "Weekly";
    if (x === "60") return "1h";
    return x;
  },
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

  test("renders title + subtitle (interval label) + tooltip title", () => {
    stubTradingView();

    render(<PriceChartPanel currentTicker="AAPL" isDarkMode={false} interval="D" />);

    expect(screen.getByRole("heading", { name: /price action viewer/i })).toBeInTheDocument();

    // subtitle prefix + interval label (from prettyTvInterval mock)
    expect(screen.getByText(/candles:/i)).toBeInTheDocument();
    expect(screen.getByText(/daily/i)).toBeInTheDocument();

    // tooltip title visible via mock
    expect(screen.getByText(/chart help/i)).toBeInTheDocument();
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

    // allow effect microtask
    await Promise.resolve();

    expect(appendSpy).not.toHaveBeenCalled();
    expect(document.querySelectorAll('script[data-tv="true"]').length).toBe(1);
  });

  test("creates TradingView widget with normalized symbol + light theme + interval", async () => {
    stubTradingView();

    render(<PriceChartPanel currentTicker="nasdaq:msft" isDarkMode={false} interval="D" />);

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

    const { rerender } = render(<PriceChartPanel currentTicker="AAPL" isDarkMode={false} interval="D" />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(1);
    });

    rerender(<PriceChartPanel currentTicker="TSLA" isDarkMode={false} interval="D" />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(2);
    });

    const call2 = window.TradingView.widget.mock.calls[1][0];
    expect(call2.symbol).toBe("TSLA");
    expect(call2.theme).toBe("light");
  });

  test("rebuilds widget when theme changes", async () => {
    stubTradingView();

    const { rerender } = render(<PriceChartPanel currentTicker="AAPL" isDarkMode={false} interval="D" />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(1);
    });

    rerender(<PriceChartPanel currentTicker="AAPL" isDarkMode={true} interval="D" />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(2);
    });

    const call2 = window.TradingView.widget.mock.calls[1][0];
    expect(call2.theme).toBe("dark");
    expect(call2.symbol).toBe("AAPL");
  });

  test("rebuilds widget when interval changes", async () => {
    stubTradingView();

    const { rerender } = render(<PriceChartPanel currentTicker="AAPL" isDarkMode={false} interval="D" />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(1);
    });

    rerender(<PriceChartPanel currentTicker="AAPL" isDarkMode={false} interval="W" />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(2);
    });

    const call2 = window.TradingView.widget.mock.calls[1][0];
    expect(call2.interval).toBe("W");
    expect(call2.symbol).toBe("AAPL");
  });

  test("falls back to COPY.fallbacks.symbol when currentTicker is empty", async () => {
    stubTradingView();

    render(<PriceChartPanel currentTicker="" isDarkMode={false} interval="D" />);

    await waitFor(() => {
      expect(window.TradingView.widget).toHaveBeenCalledTimes(1);
    });

    const args = window.TradingView.widget.mock.calls[0][0];
    expect(args.symbol).toBe("AAPL");
  });

  test("renders activeRangeLabel in subtitle when provided", () => {
    stubTradingView();

    render(
      <PriceChartPanel currentTicker="AAPL" isDarkMode={false} interval="D" activeRangeLabel="7 days" />
    );

    // " · 7 days" block appears
    expect(screen.getByText(/7 days/i)).toBeInTheDocument();
  });
});