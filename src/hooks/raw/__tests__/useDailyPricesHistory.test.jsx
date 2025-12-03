// src/hooks/raw/__tests__/useDailyPricesHistory.test.jsx
import { renderHook, waitFor } from "@testing-library/react";
import { useDailyPricesHistory } from "../useDailyPricesHistory";

describe("useDailyPricesHistory", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in a loading state with empty data", () => {
    const { result } = renderHook(() => useDailyPricesHistory());

    expect(result.current.loading).toBe(true);
    expect(result.current.historyBySymbol).toEqual({});
    expect(result.current.symbols).toEqual([]);
    expect(result.current.meta).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("loads prices history, symbols, and meta when fetch succeeds", async () => {
    const mockJson = {
      generated_at: "2025-01-01T00:00:00Z",
      symbols: ["AAPL", "MSFT"],
      prices: {
        AAPL: [
          {
            date: "2024-01-01",
            open: 100,
            high: 110,
            low: 95,
            close: 105,
            volume: 1000000,
          },
          {
            date: "2024-01-02",
            open: 106,
            high: 112,
            low: 101,
            close: 110,
            volume: 1200000,
          },
        ],
        MSFT: [
          {
            date: "2024-01-01",
            open: 200,
            high: 210,
            low: 195,
            close: 205,
            volume: 900000,
          },
        ],
      },
    };

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockJson),
    });

    const { result } = renderHook(() => useDailyPricesHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // historyBySymbol should have mapped + sorted series
    const { historyBySymbol, symbols, meta, error } = result.current;

    expect(Object.keys(historyBySymbol)).toEqual(["AAPL", "MSFT"]);
    expect(symbols).toEqual(["AAPL", "MSFT"]);

    // Check one mapped row shape
    const aaplSeries = historyBySymbol.AAPL;
    expect(Array.isArray(aaplSeries)).toBe(true);
    expect(aaplSeries[0]).toEqual(
      expect.objectContaining({
        date: "2024-01-01",
        dateLabel: "2024-01-01",
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        volume: 1000000,
      })
    );

    // meta should be normalized
    expect(meta).toEqual({
      generatedAt: "2025-01-01T00:00:00Z",
      universe: ["AAPL", "MSFT"],
    });

    expect(error).toBeNull();
  });

  it("handles fetch errors and returns empty state", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(
      new Error("Network error")
    );

    const { result } = renderHook(() => useDailyPricesHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    expect(result.current.historyBySymbol).toEqual({});
    expect(result.current.symbols).toEqual([]);
    expect(result.current.meta).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
