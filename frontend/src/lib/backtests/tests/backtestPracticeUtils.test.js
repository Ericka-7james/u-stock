// frontend/src/lib/backtests/tests/backtestPracticeUtils.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  TF_OPTIONS,
  asStr,
  asInt,
  splitSymbols,
  todayISO,
  daysAgoISO,
  validateBacktestConfig,
} from "../backtestPracticeUtils.js";

describe("backtestPracticeUtils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exports TF_OPTIONS in expected order", () => {
    expect(TF_OPTIONS).toEqual(["1Min", "5Min", "15Min", "30Min", "1Hour", "1Day"]);
  });

  describe("asStr", () => {
    it("returns trimmed string for common inputs", () => {
      expect(asStr("  SPY ")).toBe("SPY");
      expect(asStr("")).toBe("");
    });

    it("handles null/undefined and non-strings", () => {
      expect(asStr(null)).toBe("");
      expect(asStr(undefined)).toBe("");
      expect(asStr(123)).toBe("123");
      expect(asStr(false)).toBe("false");
    });
  });

  describe("asInt", () => {
    it("parses integers from strings (base 10)", () => {
      expect(asInt("42", 0)).toBe(42);
      expect(asInt("  42  ", 0)).toBe(42);
      expect(asInt("042", 0)).toBe(42);
    });

    it("parses until first non-digit (parseInt semantics)", () => {
      expect(asInt("12px", 0)).toBe(12);
      expect(asInt("9.7", 0)).toBe(9);
    });

    it("returns fallback for non-numeric input", () => {
      expect(asInt("", 7)).toBe(7);
      expect(asInt("nope", 7)).toBe(7);
      expect(asInt(undefined, 7)).toBe(7);
      expect(asInt(null, 7)).toBe(7);
    });
  });

  describe("splitSymbols", () => {
    it("splits by comma, trims, uppercases, and filters empties", () => {
      expect(splitSymbols(" spy, qqq , ,Aapl, msft ")).toEqual(["SPY", "QQQ", "AAPL", "MSFT"]);
    });

    it("returns [] for empty-ish input", () => {
      expect(splitSymbols("")).toEqual([]);
      expect(splitSymbols("   ")).toEqual([]);
      expect(splitSymbols(null)).toEqual([]);
    });

    it("enforces UI guardrail max 25 symbols", () => {
      const raw = Array.from({ length: 40 }, (_, i) => `s${i + 1}`).join(",");
      const out = splitSymbols(raw);

      expect(out.length).toBe(25);
      expect(out[0]).toBe("S1");
      expect(out[24]).toBe("S25");
    });
  });

  describe("todayISO / daysAgoISO", () => {
    it("todayISO returns YYYY-MM-DD for local date", () => {
      // Freeze system time deterministically
      vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));
      expect(todayISO()).toBe("2026-03-03");
    });

    it("daysAgoISO subtracts N days and returns YYYY-MM-DD", () => {
      vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));

      expect(daysAgoISO(0)).toBe("2026-03-03");
      expect(daysAgoISO(1)).toBe("2026-03-02");
      expect(daysAgoISO(180)).toBe("2025-09-04"); // matches your page default shown in DOM
    });

    it("daysAgoISO treats falsy days as 0", () => {
      vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));

      expect(daysAgoISO()).toBe("2026-03-03");
      expect(daysAgoISO(null)).toBe("2026-03-03");
      expect(daysAgoISO(undefined)).toBe("2026-03-03");
      expect(daysAgoISO("")).toBe("2026-03-03");
    });
  });

  describe("validateBacktestConfig", () => {
    function base(overrides = {}) {
      return validateBacktestConfig({
        symbols: ["SPY"],
        tfEntry: "5Min",
        tfBias: "15Min",
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        warmup: 320,
        steps: 200000,
        qty: 1,
        tfOptions: TF_OPTIONS,
        ...overrides,
      });
    }

    it("returns ok=true for a valid config", () => {
      const r = base();
      expect(r.ok).toBe(true);
      expect(r.issues).toEqual([]);
    });

    it("requires at least one symbol", () => {
      const r = base({ symbols: [] });
      expect(r.ok).toBe(false);
      expect(r.issues).toContain("Add at least one symbol.");
    });

    it("validates timeframes against tfOptions", () => {
      const r = base({ tfEntry: "2Min", tfBias: "9Min" });
      expect(r.ok).toBe(false);
      expect(r.issues).toContain("Entry timeframe is invalid.");
      expect(r.issues).toContain("Bias timeframe is invalid.");
    });

    it("requires start and end dates", () => {
      const r1 = base({ startDate: "", endDate: "2025-02-01" });
      expect(r1.ok).toBe(false);
      expect(r1.issues).toContain("Start and end dates are required.");

      const r2 = base({ startDate: "2025-01-01", endDate: "" });
      expect(r2.ok).toBe(false);
      expect(r2.issues).toContain("Start and end dates are required.");
    });

    it("requires startDate <= endDate (lexicographic ISO compare)", () => {
      const r = base({ startDate: "2025-03-01", endDate: "2025-02-01" });
      expect(r.ok).toBe(false);
      expect(r.issues).toContain("Start date must be before end date.");
    });

    it("validates warmup, steps, qty numeric rules", () => {
      const r = base({ warmup: -1, steps: 0, qty: 0 });
      expect(r.ok).toBe(false);
      expect(r.issues).toContain("Warmup must be 0 or greater.");
      expect(r.issues).toContain("Steps must be greater than 0.");
      expect(r.issues).toContain("Qty must be greater than 0.");
    });

    it("coerces numeric inputs via asInt behavior", () => {
      // warmup "10px" -> 10 (ok), steps "1" -> 1 (ok), qty "2" -> 2 (ok)
      const r = base({ warmup: "10px", steps: "1", qty: "2" });
      expect(r.ok).toBe(true);
      expect(r.issues).toEqual([]);
    });

    it("handles non-array symbols safely", () => {
      const r = base({ symbols: null });
      expect(r.ok).toBe(false);
      expect(r.issues).toContain("Add at least one symbol.");
    });

    it("allows overriding tfOptions", () => {
      const r = validateBacktestConfig({
        symbols: ["SPY"],
        tfEntry: "X",
        tfBias: "Y",
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        warmup: 0,
        steps: 1,
        qty: 1,
        tfOptions: ["X", "Y"],
      });

      expect(r.ok).toBe(true);
      expect(r.issues).toEqual([]);
    });
  });
});