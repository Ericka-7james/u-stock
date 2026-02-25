// frontend/src/components/dashboard/tests/DashboardPage.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "../DashboardPage.jsx";

import { LS } from "../../../lib/storage/keys.js";

/* -------------------------
   Auth (mocked)
-------------------------- */
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "t@t.com" },
    loading: false,
    isAuthed: true,
    refreshSession: vi.fn(),
    authFetch: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
}));

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
  default: ({ onTimeframeChange, onPickSymbol, ...props }) => (
    <div data-testid="trade-performance-panel">
      <pre data-testid="trade-perf-props">{JSON.stringify(props)}</pre>

      <button data-testid="tp-range-month" onClick={() => onTimeframeChange?.("Month")}>
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

vi.mock("../cards/MarketLeadersCard.jsx", () => ({
  default: ({ items, meta, loading }) => (
    <div data-testid="market-leaders-card">
      <pre data-testid="leaders-props">{JSON.stringify({ items, meta, loading })}</pre>
    </div>
  ),
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
const getChartProps = () =>
  JSON.parse(screen.getByTestId("price-chart-props").textContent);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardPage />
    </MemoryRouter>
  );
}

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

    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);

      if (u.includes("/api/opportunities/bot/top")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ crypto: [], stocks: [], funds: [] }),
          text: async () => "",
        };
      }

      if (u.includes("/api/market/leaders")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            items: [],
            meta: { source: "ALPACA", source_label: "ALPACA" },
            asOf: null,
          }),
          text: async () => "",
        };
      }

      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
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
    expect(screen.getByTestId("market-leaders-card")).toBeInTheDocument();
  });

  it("loads ticker from localStorage and normalizes", () => {
    localStorage.setItem(LS.LAST_TICKER, "msft");
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

  // From TradePerformancePanel: guarded by isTvSafe, so should NOT update.
  fireEvent.click(screen.getByTestId("tp-pick-brkb"));

  await waitFor(() => {
    expect(getChartProps().currentTicker).toBe("AAPL");
  });

  // From PriceChartPanel: NOT guarded in DashboardPage (onSelectTicker is direct setState)
  fireEvent.click(screen.getByTestId("chart-select-brkb"));

  await waitFor(() => {
    expect(getChartProps().currentTicker).toBe("BRK.B");
  });
});

  it("fetches bot opportunities + leaders on mount", async () => {
    renderPage();

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([u]) =>
          String(u).includes("/api/opportunities/bot/top")
        )
      ).toBe(true);

      expect(
        fetchSpy.mock.calls.some(([u]) => String(u).includes("/api/market/leaders"))
      ).toBe(true);
    });
  });

  it("does NOT update ticker from TradingView postMessage events (handled inside chart widget, not DashboardPage)", async () => {
    renderPage();

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.tradingview.com",
        data: { name: "quoteUpdate", data: { symbol: "MSFT" } },
      })
    );

    // DashboardPage doesn't subscribe to postMessage anymore, so ticker should remain the default.
    await waitFor(() => {
      expect(getChartProps().currentTicker).toBe("AAPL");
    });
  });
});