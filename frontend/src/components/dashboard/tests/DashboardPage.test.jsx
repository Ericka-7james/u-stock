import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import DashboardPage from "../DashboardPage.jsx";

/**
 * We mock:
 * - AppShell (layout wrapper)
 * - child cards/panels (so we can inspect props easily)
 * - data hooks (so tests control data + loading)
 */

// ---------- Mock hooks ----------
const mockUseSignalsSnapshot = vi.fn();
const mockUseDailyPricesHistory = vi.fn();
const mockUseSentimentSnapshot = vi.fn();

vi.mock("../../../hooks/raw/useSignalsSnapshot.js", () => ({
  useSignalsSnapshot: () => mockUseSignalsSnapshot(),
}));

vi.mock("../../../hooks/raw/useDailyPricesHistory.js", () => ({
  useDailyPricesHistory: () => mockUseDailyPricesHistory(),
}));

vi.mock("../../../hooks/raw/useSentimentSnapshot.js", () => ({
  useSentimentSnapshot: () => mockUseSentimentSnapshot(),
}));

// ---------- Mock AppShell ----------
vi.mock("../../layout/AppShell.jsx", () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

// ---------- Mock cards/panels (we capture props + expose controls) ----------
vi.mock("../cards/StatSummary.jsx", () => ({
  default: (props) => (
    <div data-testid="stat-summary">
      <pre data-testid="stat-summary-props">{JSON.stringify(props)}</pre>
    </div>
  ),
}));

vi.mock("../cards/PriceChartPanel.jsx", () => ({
  default: (props) => (
    <div data-testid="price-chart-panel">
      <pre data-testid="price-chart-props">{JSON.stringify(props)}</pre>

      {/* test control: simulate selecting a ticker */}
      <button
        type="button"
        onClick={() => props.onSelectTicker?.("MSFT")}
        data-testid="select-msft"
      >
        Select MSFT
      </button>
    </div>
  ),
}));

vi.mock("../cards/SentimentCard.jsx", () => ({
  default: (props) => (
    <div data-testid="sentiment-card">
      <pre data-testid="sentiment-props">{JSON.stringify(props)}</pre>
    </div>
  ),
}));

vi.mock("../cards/TopSignalsCard.jsx", () => ({
  default: (props) => (
    <div data-testid="top-signals-card">
      <pre data-testid="top-signals-props">{JSON.stringify(props)}</pre>

      {/* test control: simulate selecting a ticker */}
      <button
        type="button"
        onClick={() => props.onSelectTicker?.("AAPL")}
        data-testid="select-aapl"
      >
        Select AAPL
      </button>
    </div>
  ),
}));

vi.mock("../cards/DataSnapshotsCard.jsx", () => ({
  default: (props) => (
    <div data-testid="data-snapshots-card">
      <pre data-testid="snapshots-props">{JSON.stringify(props)}</pre>
    </div>
  ),
}));

function setup({
  signals = [],
  signalsMeta = null,
  signalsLoading = false,
  historyBySymbol = {},
  priceSymbols = [],
  pricesMeta = null,
  pricesLoading = false,
  sentimentData = [],
  sentimentMeta = null,
  sentimentLoading = false,
} = {}) {
  mockUseSignalsSnapshot.mockReturnValue({
    data: signals,
    meta: signalsMeta,
    loading: signalsLoading,
  });

  mockUseDailyPricesHistory.mockReturnValue({
    historyBySymbol,
    symbols: priceSymbols,
    meta: pricesMeta,
    loading: pricesLoading,
  });

  mockUseSentimentSnapshot.mockReturnValue({
    data: sentimentData,
    meta: sentimentMeta,
    loading: sentimentLoading,
  });

  return render(<DashboardPage />);
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders main dashboard sections", () => {
    setup();

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByTestId("stat-summary")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart-panel")).toBeInTheDocument();
    expect(screen.getByTestId("sentiment-card")).toBeInTheDocument();
    expect(screen.getByTestId("top-signals-card")).toBeInTheDocument();
    expect(screen.getByTestId("data-snapshots-card")).toBeInTheDocument();
  });

  test("defaultTicker picks first ranked signal ticker when signals exist", () => {
    setup({
      signals: [{ ticker: "TSLA" }, { ticker: "AAPL" }],
      priceSymbols: ["MSFT"],
      historyBySymbol: { TSLA: [{ t: "x" }] },
    });

    const priceProps = JSON.parse(screen.getByTestId("price-chart-props").textContent);
    expect(priceProps.currentTicker).toBe("TSLA");
    expect(priceProps.currentSeries).toEqual([{ t: "x" }]);
  });

  test("defaultTicker falls back to first price symbol when signals are empty", () => {
    setup({
      signals: [],
      priceSymbols: ["MSFT", "AAPL"],
      historyBySymbol: { MSFT: [{ close: 100 }] },
    });

    const priceProps = JSON.parse(screen.getByTestId("price-chart-props").textContent);
    expect(priceProps.currentTicker).toBe("MSFT");
    expect(priceProps.currentSeries).toEqual([{ close: 100 }]);
  });

  test("allTickers merges signals + priceSymbols and sorts", () => {
    setup({
      signals: [{ ticker: "TSLA" }, { ticker: "AAPL" }],
      priceSymbols: ["MSFT", "AAPL"],
    });

    const priceProps = JSON.parse(screen.getByTestId("price-chart-props").textContent);
    expect(priceProps.allTickers).toEqual(["AAPL", "MSFT", "TSLA"]);
  });

  test("selecting a ticker overrides defaultTicker", () => {
    setup({
      signals: [{ ticker: "TSLA" }],
      priceSymbols: ["MSFT"],
      historyBySymbol: {
        TSLA: [{ close: 1 }],
        MSFT: [{ close: 2 }],
      },
    });

    // default should be TSLA
    let priceProps = JSON.parse(screen.getByTestId("price-chart-props").textContent);
    expect(priceProps.currentTicker).toBe("TSLA");

    // click mock button inside PriceChartPanel to select MSFT
    fireEvent.click(screen.getByTestId("select-msft"));

    priceProps = JSON.parse(screen.getByTestId("price-chart-props").textContent);
    expect(priceProps.currentTicker).toBe("MSFT");
    expect(priceProps.currentSeries).toEqual([{ close: 2 }]);
  });

  test("combinedLoading uses signalsLoading OR pricesLoading; sentiment adds sentimentLoading", () => {
    setup({
      signalsLoading: true,
      pricesLoading: false,
      sentimentLoading: true,
    });

    const priceProps = JSON.parse(screen.getByTestId("price-chart-props").textContent);
    expect(priceProps.loading).toBe(true); // combinedLoading

    const topSignalsProps = JSON.parse(screen.getByTestId("top-signals-props").textContent);
    expect(topSignalsProps.loading).toBe(true);

    const sentimentProps = JSON.parse(screen.getByTestId("sentiment-props").textContent);
    // combinedLoading(true) || sentimentLoading(true) => true
    expect(sentimentProps.loading).toBe(true);
  });

  test("passes the correct sentiment row for currentTicker (backendSnapshot)", () => {
    setup({
      signals: [{ ticker: "AAPL" }],
      sentimentData: [
        { ticker: "MSFT", score: 1 },
        { ticker: "AAPL", score: 99 },
      ],
    });

    const sentimentProps = JSON.parse(screen.getByTestId("sentiment-props").textContent);
    expect(sentimentProps.symbol).toBe("AAPL");
    expect(sentimentProps.backendSnapshot).toEqual({ ticker: "AAPL", score: 99 });
  });

  test('shows "Last updated:" when either meta has generatedAt', () => {
    setup({
      signalsMeta: { generatedAt: "2025-12-14T03:00:00.000Z" },
      pricesMeta: { generatedAt: "2025-12-14T02:00:00.000Z" },
    });

    // Don’t assert exact locale string (flaky across machines)
    expect(screen.getByText(/last updated:/i)).toBeInTheDocument();
  });
});
