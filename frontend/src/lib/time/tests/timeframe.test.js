// frontend/src/lib/time/tests/timeframe.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  toDateStr,
  todayStr,
  addDays,
  startOfYear,
  clampRange,
  parseDateLoose,
  computeInclusiveDays,
  computeRangeDaysLabel,
  mapDaysToTvInterval,
  buildPreset,
} from "../timeframe.js";

describe("timeframe helpers", () => {
  const fixedNow = new Date("2026-02-25T12:34:56Z"); // stable

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("toDateStr formats YYYY-MM-DD and returns empty string for non-Date", () => {
    expect(toDateStr(new Date(2026, 1, 5))).toBe("2026-02-05"); // Feb is month 1
    expect(toDateStr("2026-02-05")).toBe("");
    expect(toDateStr(null)).toBe("");
  });

  it("todayStr returns today's date in YYYY-MM-DD based on system time", () => {
    expect(todayStr()).toBe("2026-02-25");
  });

  it("addDays returns a new Date shifted by N days (does not mutate input)", () => {
    const d = new Date(2026, 1, 25); // Feb is month 1
    const out = addDays(d, -6);

    expect(toDateStr(out)).toBe("2026-02-19");
    expect(toDateStr(d)).toBe("2026-02-25"); // unchanged
  });

  it("startOfYear returns Jan 1, 00:00:00.000 of the given date's year", () => {
    const d = new Date("2026-02-25T18:00:00Z");
    const y = startOfYear(d);

    expect(y.getFullYear()).toBe(2026);
    expect(y.getMonth()).toBe(0);
    expect(y.getDate()).toBe(1);
    expect(y.getHours()).toBe(0);
    expect(y.getMinutes()).toBe(0);
    expect(y.getSeconds()).toBe(0);
    expect(y.getMilliseconds()).toBe(0);
  });

  it("clampRange returns range as-is if start <= end, otherwise swaps", () => {
    expect(clampRange("2026-02-01", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-10" });
    expect(clampRange("2026-02-10", "2026-02-01")).toEqual({ start: "2026-02-01", end: "2026-02-10" });
  });

  it("clampRange returns {start,end} even if one side is missing", () => {
    expect(clampRange(null, "2026-02-10")).toEqual({ start: null, end: "2026-02-10" });
    expect(clampRange("2026-02-10", null)).toEqual({ start: "2026-02-10", end: null });
  });

  it("parseDateLoose returns Date for parseable values, null for empty/invalid", () => {
    expect(parseDateLoose("2026-02-25")).toBeInstanceOf(Date);
    expect(parseDateLoose("   2026-02-25   ")).toBeInstanceOf(Date);
    expect(parseDateLoose("")).toBeNull();
    expect(parseDateLoose("not-a-date")).toBeNull();
    expect(parseDateLoose(null)).toBeNull();
  });

  it("computeInclusiveDays computes inclusive day counts and returns null for invalid/negative", () => {
    // Jan 28 -> Feb 1 = 5 days inclusive
    expect(computeInclusiveDays("2026-01-28", "2026-02-01")).toBe(5);

    // same day => 1
    expect(computeInclusiveDays("2026-02-01", "2026-02-01")).toBe(1);

    // end before start => null
    expect(computeInclusiveDays("2026-02-10", "2026-02-01")).toBeNull();

    // invalid input => null
    expect(computeInclusiveDays("bad", "2026-02-01")).toBeNull();
    expect(computeInclusiveDays("2026-02-01", "bad")).toBeNull();
  });

  it("computeRangeDaysLabel uses flexible timeframe keys and pluralization", () => {
    expect(computeRangeDaysLabel(null)).toEqual({ days: 7, label: "7 days" });

    expect(computeRangeDaysLabel({ start: "2026-02-01", end: "2026-02-01" })).toEqual({ days: 1, label: "1 day" });

    // alternate keys
    expect(computeRangeDaysLabel({ from: "2026-02-01", to: "2026-02-03" })).toEqual({ days: 3, label: "3 days" });

    expect(computeRangeDaysLabel({ date_from: "2026-02-01", date_to: "2026-02-10" })).toEqual({
      days: 10,
      label: "10 days",
    });

    expect(computeRangeDaysLabel({ time_min: "bad", time_max: "2026-02-10" })).toEqual({ days: null, label: "—" });
  });

  it("mapDaysToTvInterval maps days to TradingView intervals with defaults", () => {
    expect(mapDaysToTvInterval(undefined)).toBe("60");
    expect(mapDaysToTvInterval(0)).toBe("60");
    expect(mapDaysToTvInterval(-5)).toBe("60");

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

  it("buildPreset returns stable ranges + labels for known presets", () => {
    // today
    expect(buildPreset("today")).toEqual({
      preset: "today",
      start: "2026-02-25",
      end: "2026-02-25",
      label: "Today",
      days: 1,
      tvInterval: "15",
    });

    // 24h (same-day date range)
    expect(buildPreset("24h")).toEqual({
      preset: "24h",
      start: "2026-02-25",
      end: "2026-02-25",
      label: "Last 24h",
      days: 1,
      tvInterval: "15",
    });

    // 7d => now - 6 days to today inclusive
    const p7 = buildPreset("7d");
    expect(p7.preset).toBe("7d");
    expect(p7.start).toBe("2026-02-19");
    expect(p7.end).toBe("2026-02-25");
    expect(p7.label).toBe("Past week");
    expect(p7.days).toBe(7);
    expect(p7.tvInterval).toBe("60");

    // 30d
    const p30 = buildPreset("30d");
    expect(p30.start).toBe("2026-01-27");
    expect(p30.end).toBe("2026-02-25");
    expect(p30.label).toBe("Past 30 days");
    expect(p30.days).toBe(30);
    expect(p30.tvInterval).toBe("240");

    // 90d
    const p90 = buildPreset("90d");
    expect(p90.start).toBe("2025-11-28");
    expect(p90.end).toBe("2026-02-25");
    expect(p90.label).toBe("Past 90 days");
    expect(p90.days).toBe(90);
    expect(p90.tvInterval).toBe("D");

    // ytd
    const ytd = buildPreset("ytd");
    expect(ytd.start).toBe("2026-01-01");
    expect(ytd.end).toBe("2026-02-25");
    expect(ytd.label).toBe("Year to date");
    // Inclusive days from Jan 1 to Feb 25, 2026:
    // Jan (31) + Feb (25) = 56
    expect(ytd.days).toBe(56);
    expect(ytd.tvInterval).toBe("D");
  });

  it("buildPreset falls back to 7d when preset is unknown", () => {
    const out = buildPreset("wat");
    expect(out.preset).toBe("7d");
    expect(out.start).toBe("2026-02-19");
    expect(out.end).toBe("2026-02-25");
    expect(out.label).toBe("Past week");
    expect(out.days).toBe(7);
    expect(out.tvInterval).toBe("60");
  });
});