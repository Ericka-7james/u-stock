// frontend/src/lib/time/tests/timeframe.test.js
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  toDateStr,
  todayStr,
  addDays,
  startOfYear,
  clampRange,
  parseDateLoose,
  computeInclusiveDays,
  mapDaysToTvInterval,
  buildPreset,
} from "../../time/timeframe.js";

describe("lib/time/timeframe", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("toDateStr returns YYYY-MM-DD for Date, else empty", () => {
    expect(toDateStr("nope")).toBe("");
    expect(toDateStr(null)).toBe("");

    const d = new Date("2024-02-03T12:00:00Z");
    // beware timezone differences; force local date object components by constructing explicitly
    const local = new Date(2024, 1, 3); // Feb 3, 2024 (month is 0-based)
    expect(toDateStr(local)).toBe("2024-02-03");
    expect(toDateStr(new Date(2024, 0, 9))).toBe("2024-01-09"); // pad2 coverage
  });

  it("todayStr returns toDateStr(new Date())", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 4, 6, 10, 0, 0)); // May 6, 2025 local
    expect(todayStr()).toBe("2025-05-06");
  });

  it("addDays returns a new Date shifted by N days", () => {
    const d = new Date(2024, 0, 10); // Jan 10
    const plus2 = addDays(d, 2);
    const minus1 = addDays(d, -1);

    expect(toDateStr(plus2)).toBe("2024-01-12");
    expect(toDateStr(minus1)).toBe("2024-01-09");

    // original unchanged
    expect(toDateStr(d)).toBe("2024-01-10");
  });

  it("startOfYear resets date to Jan 1 00:00:00.000", () => {
    const d = new Date(2024, 6, 20, 15, 30, 10, 5); // July 20, 2024
    const s = startOfYear(d);

    expect(s.getFullYear()).toBe(2024);
    expect(s.getMonth()).toBe(0);
    expect(s.getDate()).toBe(1);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    expect(s.getMilliseconds()).toBe(0);
  });

  it("clampRange returns unchanged when ok, swaps when start > end, passes through if missing", () => {
    expect(clampRange("", "2024-01-01")).toEqual({ start: "", end: "2024-01-01" });
    expect(clampRange("2024-01-01", "")).toEqual({ start: "2024-01-01", end: "" });

    expect(clampRange("2024-01-01", "2024-01-02")).toEqual({
      start: "2024-01-01",
      end: "2024-01-02",
    });

    expect(clampRange("2024-01-10", "2024-01-02")).toEqual({
      start: "2024-01-02",
      end: "2024-01-10",
    });
  });

  it("parseDateLoose returns Date for parseable strings, else null", () => {
    expect(parseDateLoose("")).toBeNull();
    expect(parseDateLoose("   ")).toBeNull();
    expect(parseDateLoose(null)).toBeNull();

    const d = parseDateLoose("2024-01-02");
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d.getTime())).toBe(true);

    expect(parseDateLoose("not-a-date")).toBeNull();
  });

  it("computeInclusiveDays returns inclusive day count or null on bad input/negative", () => {
    expect(computeInclusiveDays("", "2024-01-02")).toBeNull();
    expect(computeInclusiveDays("2024-01-02", "")).toBeNull();
    expect(computeInclusiveDays("not-a-date", "2024-01-02")).toBeNull();

    expect(computeInclusiveDays("2024-01-28", "2024-02-01")).toBe(5);

    // end before start => ms negative => null
    expect(computeInclusiveDays("2024-02-01", "2024-01-28")).toBeNull();
  });

  it("mapDaysToTvInterval maps day counts to TradingView intervals (covers all branches)", () => {
    expect(mapDaysToTvInterval(null)).toBe("60");
    expect(mapDaysToTvInterval(0)).toBe("60");
    expect(mapDaysToTvInterval(-1)).toBe("60");

    expect(mapDaysToTvInterval(1)).toBe("15");
    expect(mapDaysToTvInterval(2)).toBe("15");

    expect(mapDaysToTvInterval(3)).toBe("60");
    expect(mapDaysToTvInterval(10)).toBe("60");

    expect(mapDaysToTvInterval(11)).toBe("240");
    expect(mapDaysToTvInterval(45)).toBe("240");

    expect(mapDaysToTvInterval(46)).toBe("D");
    expect(mapDaysToTvInterval(180)).toBe("D");

    expect(mapDaysToTvInterval(181)).toBe("W");
    expect(mapDaysToTvInterval(365)).toBe("W");
  });

  it("buildPreset returns expected shapes for known presets, and fallback to 7d", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 10, 9, 0, 0)); // Jan 10, 2025 local
    const today = "2025-01-10";

    const pToday = buildPreset("today");
    expect(pToday).toEqual({
      preset: "today",
      start: today,
      end: today,
      label: "Today",
      days: 1,
      tvInterval: "15",
    });

    const p24 = buildPreset("24h");
    expect(p24.label).toBe("Last 24h");
    expect(p24.start).toBe(today);
    expect(p24.end).toBe(today);
    expect(p24.days).toBe(1);
    expect(p24.tvInterval).toBe("15");

    const p7 = buildPreset("7d");
    expect(p7.preset).toBe("7d");
    expect(p7.end).toBe(today);
    expect(p7.label).toBe("Past week");
    expect(p7.days).toBe(7);
    expect(p7.tvInterval).toBe("60");

    const p30 = buildPreset("30d");
    expect(p30.preset).toBe("30d");
    expect(p30.end).toBe(today);
    expect(p30.label).toBe("Past 30 days");
    expect(p30.days).toBe(30);
    expect(p30.tvInterval).toBe("240");

    const p90 = buildPreset("90d");
    expect(p90.preset).toBe("90d");
    expect(p90.end).toBe(today);
    expect(p90.label).toBe("Past 90 days");
    expect(p90.days).toBe(90);
    expect(p90.tvInterval).toBe("D");

    const pytd = buildPreset("ytd");
    expect(pytd.preset).toBe("ytd");
    expect(pytd.start).toBe("2025-01-01");
    expect(pytd.end).toBe(today);
    expect(pytd.label).toBe("Year to date");
    expect(pytd.days).toBe(10); // inclusive: Jan 1..Jan 10
    expect(pytd.tvInterval).toBe("60");

    const pfallback = buildPreset("not-a-real-preset");
    expect(pfallback.preset).toBe("7d");
    expect(pfallback.label).toBe("Past week");
    expect(pfallback.end).toBe(today);
    expect(pfallback.days).toBe(7);
  });

  it("buildPreset tolerates computeInclusiveDays returning null (?? fallback)", () => {
    // Force computeInclusiveDays to return null by giving it an invalid Date
    // We can do that by making Date constructor yield "Invalid Date" once:
    const RealDate = Date;

    let callCount = 0;
    // eslint-disable-next-line no-global-assign
    Date = function (...args) {
      callCount += 1;
      if (callCount === 1) return new RealDate("not-a-date"); // now invalid
      // @ts-ignore
      return new RealDate(...args);
    };
    // Keep Date methods/props used by code
    // @ts-ignore
    Date.now = RealDate.now;
    // @ts-ignore
    Date.parse = RealDate.parse;
    // @ts-ignore
    Date.UTC = RealDate.UTC;
    // @ts-ignore
    Date.prototype = RealDate.prototype;

    const p = buildPreset("7d");
    expect(p.preset).toBe("7d");
    expect(p.days).toBe(7); // hits ?? 7 fallback

    // eslint-disable-next-line no-global-assign
    Date = RealDate;
  });
});