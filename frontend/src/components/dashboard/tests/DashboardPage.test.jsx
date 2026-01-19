// frontend/src/components/dashboard/tests/DashboardPage.test.jsx
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import DashboardPage from "../DashboardPage.jsx";

// -------------------- Mocks --------------------

// Mock AppShell wrapper
vi.mock("../../layout/AppShell.jsx", () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

// Mock router navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock hooks used by DashboardPage
const mockUseAlpacaDailyBars = vi.fn();
vi.mock("../../../hooks/useAlpacaDailyBars.js", () => ({
  useAlpacaDailyBars: (...args) => mockUseAlpacaDailyBars(...args),
}));

const mockUseAlpacaTradeSummary = vi.fn();
vi.mock("../../../hooks/useAlpacaTradeSummary.js", () => ({
  useAlpacaTradeSummary: (...args) => mockUseAlpacaTradeSummary(...args),
}));

// explainAnyError → stable deterministic UI model
const mockExplainAnyError = vi.fn();
vi.mock("../../common/errorMessages.js", () => ({
  explainAnyError: (...args) => mockExplainAnyError(...args),
}));

// Mock child components to (1) verify props, (2) give us control buttons
vi.mock("../cards/PriceChartPanel.jsx", () => ({
  default: (props) => (
    <div data-testid="price-chart-panel">
      <pre data-testid="price-chart-props">{JSON.stringify(props)}</pre>

      <button type="button" data-testid="chart-select-msft" onClick={() => props.onSelectTicker?.("MSFT")}>
        Chart select MSFT
      </button>

      <button type="button" data-testid="chart-select-brkb" onClick={() => props.onSelectTicker?.("BRK.B")}>
        Chart select BRK.B
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

vi.mock("../cards/MacroCard.jsx", () => ({
  default: () => <div data-testid="macro-card">Macro</div>,
}));

vi.mock("../cards/TradePerformancePanel.jsx", () => ({
  default: (props) => (
    <div data-testid="trade-performance-panel">
      <pre data-testid="trade-perf-props">{JSON.stringify(props)}</pre>

      <button type="button" data-testid="tp-range-month" onClick={() => props.onChangeRange?.("Month")}>
        Range Month
      </button>

      <button type="button" data-testid="tp-pick-aapl" onClick={() => props.onPickSymbol?.("AAPL")}>
        Pick AAPL
      </button>

      <button type="button" data-testid="tp-pick-brkb" onClick={() => props.onPickSymbol?.("BRK.B")}>
        Pick BRK.B
      </button>
    </div>
  ),
}));

vi.mock("../cards/MarketLeadersCard.jsx", () => ({
  default: (props) => (
    <div data-testid="market-leaders-card">
      <pre data-testid="leaders-props">{JSON.stringify(props)}</pre>

      <button type="button" data-testid="leaders-select-msft" onClick={() => props.onSelectSymbol?.("MSFT")}>
        Leaders select MSFT
      </button>

      <button type="button" data-testid="leaders-select-brkb" onClick={() => props.onSelectSymbol?.("BRK.B")}>
        Leaders select BRK.B
      </button>
    </div>
  ),
}));

// -------------------- Helpers --------------------

function setLocalStorageLastTicker(v) {
  try {
    localStorage.setItem("ustock:last_ticker", v);
  } catch {}
}

function getPriceChartProps() {
  return JSON.parse(screen.getByTestId("price-chart-props").textContent || "{}");
}

function getSentimentProps() {
  return JSON.parse(screen.getByTestId("sentiment-props").textContent || "{}");
}

function setup({
  lastTicker = null,
  bars = [],
  barsLoading = false,
  barsError = null,
  barsMeta = null,
  tradeData = { start: "—", end: "—", trades: [] },
  tradeLoading = false,
  tradeError = null,
  explainMap = {
    trade_summary: null,
    daily_bars: null,
    market_leaders: null,
    bot_opportunities: null,
  },
  fetchLeadersOk = true,
  fetchOppOk = true,
} = {}) {
  // localStorage boot
  localStorage.clear();
  if (lastTicker != null) setLocalStorageLastTicker(lastTicker);

  // hook mocks
  mockUseAlpacaDailyBars.mockReturnValue({
    bars,
    loading: barsLoading,
    error: barsError,
    meta: barsMeta,
  });

  mockUseAlpacaTradeSummary.mockReturnValue({
    data: tradeData,
    loading: tradeLoading,
    error: tradeError,
  });

  // explainAnyError mock based on feature
  mockExplainAnyError.mockImplementation((err, { feature }) => {
    const v = explainMap?.[feature] ?? null;
    return v;
  });

  // fetch mocks for internal hooks: leaders + opps
  global.fetch = vi.fn(async (url) => {
    const u = String(url);

    if (u.includes("/api/market/leaders")) {
      if (!fetchLeadersOk) {
        return {
          ok: false,
          status: 500,
          headers: { get: () => "application/json" },
          json: async () => ({ detail: "Leaders failed" }),
          text: async () => "Leaders failed",
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          items: [{ symbol: "AAPL", changePct: 1.2 }],
          source: { code: "alpaca_movers", label: "Alpaca market movers (today)" },
          asOf: "2026-01-13T00:00:00Z",
        }),
      };
    }

    if (u.includes("/api/opportunities/bot/top")) {
      if (!fetchOppOk) {
        return {
          ok: false,
          status: 500,
          headers: { get: () => "application/json" },
          json: async () => ({ detail: "Opps failed" }),
          text: async () => "Opps failed",
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ stocks: [{ symbol: "AAPL", score: 1.1 }] }),
      };
    }

    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({}),
    };
  });

  return render(<DashboardPage />);
}

// Stabilize MutationObserver for consistent tests
class MockMutationObserver {
  constructor(cb) {
    this.cb = cb;
  }
  observe() {}
  disconnect() {}
}
global.MutationObserver = MockMutationObserver;

// -------------------- Tests --------------------

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders key sections and cards (AppShell + left/right columns)", async () => {
    setup();

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByTestId("trade-performance-panel")).toBeInTheDocument();
    expect(screen.getByTestId("market-leaders-card")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart-panel")).toBeInTheDocument();
    expect(screen.getByTestId("sentiment-card")).toBeInTheDocument();
    expect(screen.getByTestId("macro-card")).toBeInTheDocument();
  });

  it("loads initial ticker from localStorage (ustock:last_ticker), normalizes to uppercase", async () => {
    setup({ lastTicker: "msft" });

    const props = getPriceChartProps();
    expect(props.currentTicker).toBe("MSFT");
  });

  it("defaults to AAPL when localStorage missing/unreadable", async () => {
    setup({ lastTicker: null });

    const props = getPriceChartProps();
    expect(props.currentTicker).toBe("AAPL");
  });

  it("calls useAlpacaDailyBars with (currentTicker, 220) and updates when ticker changes", async () => {
    setup({ lastTicker: "AAPL" });

    expect(mockUseAlpacaDailyBars).toHaveBeenCalledWith("AAPL", 220);

    fireEvent.click(screen.getByTestId("chart-select-msft"));

    expect(mockUseAlpacaDailyBars).toHaveBeenLastCalledWith("MSFT", 220);
  });

  it("persists ticker updates back to localStorage", async () => {
    setup({ lastTicker: "AAPL" });

    expect(localStorage.getItem("ustock:last_ticker")).toBe("AAPL");

    fireEvent.click(screen.getByTestId("chart-select-msft"));

    expect(localStorage.getItem("ustock:last_ticker")).toBe("MSFT");
  });

  it("SentimentCard receives symbol=currentTicker, historyBySymbol keyed by ticker, and loading from useAlpacaDailyBars", async () => {
    setup({
      lastTicker: "AAPL",
      bars: [{ close: 100 }, { close: 101 }],
      barsLoading: true,
    });

    const sentimentProps = getSentimentProps();
    expect(sentimentProps.symbol).toBe("AAPL");
    expect(sentimentProps.loading).toBe(true);
    expect(sentimentProps.historyBySymbol).toEqual({ AAPL: [{ close: 100 }, { close: 101 }] });
  });

  it("useAlpacaTradeSummary is called with initial preset 'Week' and updates when TradePerformancePanel requests a new range", async () => {
    setup();

    expect(mockUseAlpacaTradeSummary).toHaveBeenCalledWith("Week", { slippageBps: 0, feeBps: 0 });

    fireEvent.click(screen.getByTestId("tp-range-month"));

    expect(mockUseAlpacaTradeSummary).toHaveBeenLastCalledWith("Month", { slippageBps: 0, feeBps: 0 });
  });

  it("blocks non-TV-safe symbols (BRK.B) when selecting from TradePerformancePanel and MarketLeadersCard", async () => {
    setup({ lastTicker: "AAPL" });

    fireEvent.click(screen.getByTestId("tp-pick-brkb"));
    expect(getPriceChartProps().currentTicker).toBe("AAPL");

    fireEvent.click(screen.getByTestId("leaders-select-brkb"));
    expect(getPriceChartProps().currentTicker).toBe("AAPL");

    fireEvent.click(screen.getByTestId("leaders-select-msft"));
    expect(getPriceChartProps().currentTicker).toBe("MSFT");
  });

  it("shows ErrorBanner for trade summary errors and clicking inline action navigates", async () => {
    setup({
      tradeError: new Error("boom"),
      explainMap: {
        trade_summary: {
          title: "Trade summary failed",
          body: "Reconnect in Connected Apps",
          debug: { code: "x" },
          action: { label: "Connected Apps", href: "/connected-apps" },
        },
      },
    });

    expect(screen.getByText(/trade summary failed/i)).toBeInTheDocument();
    const actionBtn = screen.getByRole("button", { name: /connected apps/i });
    fireEvent.click(actionBtn);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/connected-apps");
  });

  it("fetches leaders + opportunities on mount (via internal hooks) and passes leaders props to MarketLeadersCard", async () => {
    setup();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const leadersProps = JSON.parse(screen.getByTestId("leaders-props").textContent || "{}");
    expect(Array.isArray(leadersProps.items)).toBe(true);
    expect(leadersProps.meta).toBeTruthy();
  });

  it("renders Alpaca fetched footer when alpacaMeta.fetchedAt is present", async () => {
    setup({
      barsMeta: { fetchedAt: "2026-01-13T12:34:56Z" },
    });

    expect(screen.getByText(/alpaca fetched:/i)).toBeInTheDocument();
  });

  it("updates ticker from TradingView postMessage quoteUpdate event (https://*.tradingview.com only)", async () => {
  setup({ lastTicker: "AAPL" });

  // Non-tradingview origin ignored
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: JSON.stringify({ name: "quoteUpdate", data: { short_name: "MSFT" } }),
      })
    );
  });

  expect(getPriceChartProps().currentTicker).toBe("AAPL");

  // TradingView origin updates
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.tradingview.com",
        data: JSON.stringify({ name: "quoteUpdate", data: { short_name: "MSFT" } }),
      })
    );
  });

  await waitFor(() => {
    expect(getPriceChartProps().currentTicker).toBe("MSFT");
  });
});
});
