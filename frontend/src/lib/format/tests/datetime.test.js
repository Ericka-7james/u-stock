// frontend/src/lib/format/tests/datetime.test.js
import { describe, it, expect } from "vitest";
import {
  fmtEpochSeconds,
  dayKeyFromEpochSeconds,
  dateStrToEpochSec,
} from "../datetime.js";

describe("fmtEpochSeconds", () => {
  it("returns dash for non-finite values", () => {
    expect(fmtEpochSeconds("nope")).toBe("—");
    expect(fmtEpochSeconds(NaN)).toBe("—");
    expect(fmtEpochSeconds(Infinity)).toBe("—");
  });

  it("returns dash for <= 0 values", () => {
    expect(fmtEpochSeconds(0)).toBe("—");
    expect(fmtEpochSeconds(-100)).toBe("—");
  });

  it("returns a local date string for valid epoch seconds", () => {
    const out = fmtEpochSeconds(1700000000);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    // Don’t assert exact content because locale output varies by environment.
  });
});

describe("dayKeyFromEpochSeconds", () => {
  it("returns empty string for invalid values", () => {
    expect(dayKeyFromEpochSeconds("bad")).toBe("");
    expect(dayKeyFromEpochSeconds(0)).toBe("");
    expect(dayKeyFromEpochSeconds(-1)).toBe("");
  });

  it("returns YYYY-MM-DD (local) and matches the Date computed in test", () => {
    // Use a stable epoch and derive expected via the same local Date logic.
    const epoch = 1700000000;
    const d = new Date(epoch * 1000);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

    expect(dayKeyFromEpochSeconds(epoch)).toBe(expected);
    expect(dayKeyFromEpochSeconds(epoch)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("dateStrToEpochSec", () => {
  it("returns 0 for empty or invalid strings", () => {
    expect(dateStrToEpochSec("")).toBe(0);
    expect(dateStrToEpochSec("   ")).toBe(0);
    expect(dateStrToEpochSec("not-a-date")).toBe(0);
  });

  it("returns start-of-day epoch seconds by default (local time)", () => {
    const ts = dateStrToEpochSec("2024-01-01");
    expect(typeof ts).toBe("number");
    expect(ts).toBeGreaterThan(0);

    const d = new Date(ts * 1000);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);

    // Ensure it really is Jan 1 in local terms.
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0); // January
    expect(d.getDate()).toBe(1);
  });

  it("returns end-of-day epoch seconds when endOfDay=true (local time)", () => {
    const ts = dateStrToEpochSec("2024-01-01", { endOfDay: true });
    expect(ts).toBeGreaterThan(0);

    const d = new Date(ts * 1000);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);

    // Still same local calendar day.
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("endOfDay is always >= startOfDay for the same date", () => {
    const start = dateStrToEpochSec("2024-01-01");
    const end = dateStrToEpochSec("2024-01-01", { endOfDay: true });
    expect(end).toBeGreaterThanOrEqual(start);

    // Should be about one day minus a second (allow DST weirdness by using a range)
    const diff = end - start;
    expect(diff).toBeGreaterThan(60 * 60 * 20); // > 20h
    expect(diff).toBeLessThan(60 * 60 * 28); // < 28h
  });
});