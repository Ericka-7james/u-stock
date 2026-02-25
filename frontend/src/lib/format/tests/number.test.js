// frontend/src/lib/format/tests/number.test.js
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fmtPct2,
  fmtRate2,
  fmtInt0,
  fmtPctFromRatio,
  fmtPct1FromRatio,
} from "../number.js";

describe("lib/format/number", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fmtPct2 returns dash for null/undefined/NaN, otherwise formats with 2 decimals", () => {
    expect(fmtPct2(null)).toBe("—");
    expect(fmtPct2(undefined)).toBe("—");
    expect(fmtPct2("nope")).toBe("—");

    expect(fmtPct2(1)).toBe("1.00%");
    expect(fmtPct2("2.5")).toBe("2.50%");
    expect(fmtPct2(-0.1)).toBe("-0.10%");
  });

  it("fmtRate2 mirrors fmtPct2 behavior", () => {
    expect(fmtRate2(null)).toBe("—");
    expect(fmtRate2(undefined)).toBe("—");
    expect(fmtRate2("nope")).toBe("—");

    expect(fmtRate2(3)).toBe("3.00%");
  });

  it("fmtInt0 returns dash for null/undefined/non-finite, formats rounded integer otherwise", () => {
    expect(fmtInt0(null)).toBe("—");
    expect(fmtInt0(undefined)).toBe("—");
    expect(fmtInt0(Number.POSITIVE_INFINITY)).toBe("—");
    expect(fmtInt0(Number.NaN)).toBe("—");

    // normal behavior (round + thousands separators if available)
    expect(fmtInt0(1234.56)).toMatch(/1,?235/); // locale-dependent commas
    expect(fmtInt0(-2.2)).toBe("-2");
  });

  it("fmtInt0 falls back to String(round) if Intl.NumberFormat throws", () => {
    const realIntl = globalThis.Intl;

    // Force Intl.NumberFormat() to throw
    globalThis.Intl = {
      ...realIntl,
      NumberFormat: () => {
        throw new Error("boom");
      },
    };

    expect(fmtInt0(12.7)).toBe("13");

    // restore
    globalThis.Intl = realIntl;
  });

  it("fmtPctFromRatio returns dash for null/undefined/non-finite", () => {
    expect(fmtPctFromRatio(null)).toBe("—");
    expect(fmtPctFromRatio(undefined)).toBe("—");
    expect(fmtPctFromRatio(Number.NaN)).toBe("—");
    expect(fmtPctFromRatio(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("fmtPctFromRatio uses decimals within [0..6], otherwise defaults to 1", () => {
    expect(fmtPctFromRatio(0.0123, 2)).toBe("1.23%");
    expect(fmtPctFromRatio(0.0123, 0)).toBe("1%"); // 0 decimals
    expect(fmtPctFromRatio(0.0123, 6)).toBe("1.230000%");

    // invalid decimals -> default to 1
    expect(fmtPctFromRatio(0.0123, -1)).toBe("1.2%");
    expect(fmtPctFromRatio(0.0123, 7)).toBe("1.2%");
    expect(fmtPctFromRatio(0.0123, "nope")).toBe("1.2%");
  });

  it("fmtPct1FromRatio delegates to fmtPctFromRatio with 1 decimal", () => {
    expect(fmtPct1FromRatio(0.0123)).toBe("1.2%");
  });
});