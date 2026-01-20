// src/components/dashboard/tests/DashboardPage.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "../DashboardPage.jsx";

/* -------------------------
   Layout
-------------------------- */
vi.mock("../../layout/AppShell", () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

/* -------------------------
   Cards (stubbed)
-------------------------- */
vi.mock("../cards/TradePerformancePanel.jsx", () => ({
  default: ({ onChangeRange, onPickSymbol, ...props }) => (
    <div data-testid="trade-performance-panel">
      <pre data-testid="trade-perf-props">{JSON.stringify(props)}</pre>

      <button data-testid="tp-range-month" onClick={() => onChangeRange?.("Month")}>
        Range Month
      </button>

      <button data-testid="tp-pick-aapl" onClick={() => onPickSymbol?.("AAPL")}>
        Pick AAPL
      </button>

      <button data-testid="tp-pick-brkb" onClick={() => onPickSymbol?.("BRK.B")}>
        Pick BRK.B
      </button>
    </div>
  ),
}));

// ✅ IMPORTANT: DashboardPage passes onSelectTicker (not onSelectSymbol)
vi.mock("../cards/PriceChartPanel.jsx", () => ({
  default: ({ currentTicker, isDarkMode, onSelectTicker }) => (
    <div data-testid="price-chart-panel">
      <pre data-testid="price-chart-props">{JSON.stringify({ currentTicker, isDarkMode })}</pre>

      <button data-testid="chart-select-msft" onClick={() => onSelectTicker?.("MSFT")}>
        Chart select MSFT
      </button>

      <button data-testid="chart-select-brkb" onClick={() => onSelectTicker?.("BRK.B")}>
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

/* -------------------------
   Hooks
-------------------------- */
const mockDailyBars = vi.fn();
const mockTradeSummary = vi.fn();

vi.mock("../../hooks/useAlpacaDailyBars.js", () => ({
  useAlpacaDailyBars: (...args) => mockDailyBars(...args),
}));

vi.mock("../../hooks/useAlpacaTradeSummary.js", () => ({
  useAlpacaTradeSummary: (...args) => mockTradeSummary(...args),
}));

/* -------------------------
   Helpers
-------------------------- */
const getChartProps = () => JSON.parse(screen.getByTestId("price-chart-props").textContent);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardPage />
    </MemoryRouter>
  );
}

/* -------------------------
   Tests
-------------------------- */
describe("DashboardPage", () => {
  let fetchSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    mockDailyBars.mockReturnValue({
      bars: [],
      loading: false,
      error: null,
      meta: { fetchedAt: null },
    });

    mockTradeSummary.mockReturnValue({
      data: { trades: [], start: "—", end: "—" },
      loading: false,
      error: null,
    });

    // ✅ Stabilize internal fetches used by DashboardPage:
    // - /api/opportunities/bot/top?limit=8  (useBotOpportunities)
    // - /bots/status                        (useRunnerSummary)
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);

      if (u.includes("/api/opportunities/bot/top")) {
        return {
          ok: true,
          status: 200,
          headers: new Map([["content-type", "application/json"]]),
          json: async () => ({ crypto: [], stocks: [], funds: [] }),
          text: async () => "",
        };
      }

      if (u.includes("/bots/status")) {
        return {
          ok: true,
          status: 200,
          headers: new Map([["content-type", "application/json"]]),
          json: async () => ({ statuses: {} }),
          text: async () => "",
        };
      }

      // default safe response
      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => ({}),
        text: async () => "",
      };
    });
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    cleanup();
  });

  it("renders core layout and cards", () => {
    renderPage();

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByTestId("trade-performance-panel")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart-panel")).toBeInTheDocument();
    expect(screen.getByTestId("sentiment-card")).toBeInTheDocument();
    expect(screen.getByTestId("macro-card")).toBeInTheDocument();
  });

  it("loads ticker from localStorage and normalizes", () => {
    localStorage.setItem("ustock:last_ticker", "msft");
    renderPage();
    expect(getChartProps().currentTicker).toBe("MSFT");
  });

  it("defaults to AAPL if no saved ticker", () => {
    renderPage();
    expect(getChartProps().currentTicker).toBe("AAPL");
  });

  it("updates ticker via PriceChartPanel", async () => {
    renderPage();

    fireEvent.click(screen.getByTestId("chart-select-msft"));

    await waitFor(() => {
      expect(getChartProps().currentTicker).toBe("MSFT");
    });
  });

  it("blocks non TradingView-safe symbols (BRK.B)", async () => {
    renderPage();

    fireEvent.click(screen.getByTestId("tp-pick-brkb"));
    fireEvent.click(screen.getByTestId("chart-select-brkb"));

    await waitFor(() => {
      expect(getChartProps().currentTicker).toBe("AAPL");
    });
  });

  it("fetches bot opportunities + runner status on mount", async () => {
    renderPage();

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("/api/opportunities/bot/top"))).toBe(true);
      expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("/bots/status"))).toBe(true);
    });
  });

  it("updates ticker from TradingView postMessage events", async () => {
    renderPage();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://www.tradingview.com",
          data: { name: "quoteUpdate", data: { symbol: "MSFT" } },
        })
      );
    });

    await waitFor(() => {
      expect(getChartProps().currentTicker).toBe("MSFT");
    });
  });
});
