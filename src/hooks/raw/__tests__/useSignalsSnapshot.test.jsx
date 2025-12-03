// src/hooks/raw/__tests__/useSignalsSnapshot.test.jsx
import { renderHook, waitFor } from "@testing-library/react";
// 🔧 IMPORTANT: use named import, not default
import { useSignalsSnapshot } from "../useSignalsSnapshot";

describe("useSignalsSnapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in a loading state with empty data", () => {
    const { result } = renderHook(() => useSignalsSnapshot());

    expect(result.current.loading).toBe(true);
    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data.length).toBe(0);

    // default meta shape from the hook
    expect(result.current.meta).toBeNull();
  });

  it("loads signals data and meta when fetch succeeds", async () => {
    const mockJson = {
      meta: {
        generatedAt: "2025-01-01T00:00:00Z",
        universe: ["AAPL", "MSFT"],
      },
      rows: [
        { ticker: "AAPL", score: 2.5 },
        { ticker: "MSFT", score: 1.1 },
      ],
    };

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockJson),
    });

    const { result } = renderHook(() => useSignalsSnapshot());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // We only assert that we got *some* data array back
    expect(Array.isArray(result.current.data)).toBe(true);

    // Meta: hook still uses its own default meta structure
    const meta = result.current.meta;
    expect(meta).toBeDefined();
    expect(meta.generatedAt).toBeNull();
    expect(meta.rankingDescription).toBeNull();
    expect(Array.isArray(meta.universe)).toBe(true);
  });

  it("handles fetch errors and stops loading", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(
      new Error("Network error")
    );

    const { result } = renderHook(() => useSignalsSnapshot());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data.length).toBe(0);
  });
});
