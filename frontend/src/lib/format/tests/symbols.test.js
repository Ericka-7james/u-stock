// frontend/src/lib/tests/symbols.test.js
import { describe, it, expect } from "vitest";
import { normalizeSymbol, isTvSafe } from "../../symbols.js";

describe("lib/symbols", () => {
  it("normalizeSymbol trims, uppercases, and returns empty for blank", () => {
    expect(normalizeSymbol(null)).toBe("");
    expect(normalizeSymbol(undefined)).toBe("");
    expect(normalizeSymbol("")).toBe("");
    expect(normalizeSymbol("   ")).toBe("");

    expect(normalizeSymbol("aapl")).toBe("AAPL");
    expect(normalizeSymbol("  msft ")).toBe("MSFT");
  });

  it("normalizeSymbol strips provider prefixes like 'NASDAQ:AAPL'", () => {
    expect(normalizeSymbol("NASDAQ:AAPL")).toBe("AAPL");
    expect(normalizeSymbol("nyse:tsla")).toBe("TSLA");

    // note: your implementation uses split(':').pop()
    expect(normalizeSymbol("X:Y:btc")).toBe("BTC");
  });

  it("isTvSafe accepts A-Z only (after uppercasing)", () => {
    expect(isTvSafe("AAPL")).toBe(true);
    expect(isTvSafe("msft")).toBe(true);

    expect(isTvSafe("BRK.B")).toBe(false);
    expect(isTvSafe("BTC-USD")).toBe(false);
    expect(isTvSafe("AAPL1")).toBe(false);
    expect(isTvSafe("")).toBe(false);
    expect(isTvSafe(null)).toBe(false);
  });
});