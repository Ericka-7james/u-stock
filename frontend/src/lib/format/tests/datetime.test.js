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
  });
});

describe("dayKeyFromEpochSeconds", () => {
  it("returns empty string for invalid values", () => {
    expect(dayKeyFromEpochSeconds("bad")).toBe("");
    expect(dayKeyFromEpochSeconds(0)).toBe("");
    expect(dayKeyFromEpochSeconds(-1)).toBe("");
  });

  it("returns YYYY-MM-DD for valid epoch", () => {
    const epoch = 1700000000;
    const key = dayKeyFromEpochSeconds(epoch);

    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("dateStrToEpochSec", () => {
  it("returns 0 for empty or invalid strings", () => {
    expect(dateStrToEpochSec("")).toBe(0);
    expect(dateStrToEpochSec("   ")).toBe(0);
    expect(dateStrToEpochSec("not-a-date")).toBe(0);
  });

  it("returns start-of-day epoch seconds by default", () => {
    const ts = dateStrToEpochSec("2024-01-01");
    expect(typeof ts).toBe("number");
    expect(ts).toBeGreaterThan(0);

    const d = new Date(ts * 1000);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("returns end-of-day epoch seconds when endOfDay=true", () => {
    const ts = dateStrToEpochSec("2024-01-01", { endOfDay: true });

    const d = new Date(ts * 1000);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
  });
});