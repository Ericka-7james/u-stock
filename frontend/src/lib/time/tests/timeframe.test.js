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
} from "../timeframe";

// Use local-safe timestamps in tests: midday UTC avoids date slipping when interpreted locally.
const MIDDAY_Z = "T12:00:00.000Z";

describe("timeframe utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`2026-02-01${MIDDAY_Z}`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("toDateStr", () => {
    it("returns YYYY-MM-DD for a Date", () => {
      expect(toDateStr(new Date(`2026-02-01${MIDDAY_Z}`))).toBe("2026-02-01");
      expect(toDateStr(new Date(`2026-01-09${MIDDAY_Z}`))).toBe("2026-01-09");
    });

    it("returns empty string for non-Date", () => {
      expect(toDateStr(null)).toBe("");
      expect(toDateStr("2026-02-01")).toBe("");
      expect(toDateStr({})).toBe("");
    });
  });

  describe("todayStr", () => {
    it("returns today's date string based on system time", () => {
      expect(todayStr()).toBe("2026-02-01");
    });
  });

  describe("addDays", () => {
    it("adds positive days (timezone-safe)", () => {
      const d = addDays(`2026-02-01${MIDDAY_Z}`, 2);
      expect(toDateStr(d)).toBe("2026-02-03");
    });

    it("adds negative days (timezone-safe)", () => {
      const d = addDays(`2026-02-01${MIDDAY_Z}`, -6);
      expect(toDateStr(d)).toBe("2026-01-26");
    });

    it("treats falsy days as 0 (timezone-safe)", () => {
      const d = addDays(`2026-02-01${MIDDAY_Z}`, null);
      expect(toDateStr(d)).toBe("2026-02-01");
    });
  });

  describe("startOfYear", () => {
    it("returns Jan 1 00:00:00.000 of the given date's year", () => {
      const d = startOfYear(`2026-09-20${MIDDAY_Z}`);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(1);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    });
  });

  describe("clampRange", () => {
    it("returns same range if start <= end", () => {
      const a = new Date(`2026-01-01${MIDDAY_Z}`);
      const b = new Date(`2026-01-02${MIDDAY_Z}`);
      expect(clampRange(a, b)).toEqual({ start: a, end: b });
    });

    it("swaps if start > end", () => {
      const a = new Date(`2026-01-03${MIDDAY_Z}`);
      const b = new Date(`2026-01-02${MIDDAY_Z}`);
      expect(clampRange(a, b)).toEqual({ start: b, end: a });
    });

    it("passes through if start or end missing", () => {
      expect(clampRange(null, new Date())).toEqual({
        start: null,
        end: expect.any(Date),
      });
      expect(clampRange(new Date(), null)).toEqual({
        start: expect.any(Date),
        end: null,
      });
    });
  });

  describe("parseDateLoose", () => {
    it("returns null for empty", () => {
      expect(parseDateLoose("")).toBeNull();
      expect(parseDateLoose("   ")).toBeNull();
      expect(parseDateLoose(null)).toBeNull();
    });

    it("returns Date for valid input", () => {
      const d = parseDateLoose("2026-02-01");
      expect(d).toBeInstanceOf(Date);
      expect(Number.isFinite(d.getTime())).toBe(true);
    });

    it("returns null for invalid date", () => {
      expect(parseDateLoose("not-a-date")).toBeNull();
      expect(parseDateLoose("2026-99-99")).toBeNull();
    });
  });

  describe("computeInclusiveDays", () => {
    it("computes inclusive days (Jan 28 -> Feb 1 = 5)", () => {
      expect(computeInclusiveDays("2026-01-28", "2026-02-01")).toBe(5);
    });

    it("returns null if either date is invalid", () => {
      expect(computeInclusiveDays("bad", "2026-02-01")).toBeNull();
      expect(computeInclusiveDays("2026-02-01", "bad")).toBeNull();
    });

    it("returns null if end is before start", () => {
      expect(computeInclusiveDays("2026-02-01", "2026-01-28")).toBeNull();
    });
  });

  describe("computeRangeDaysLabel", () => {
    it("defaults to 7 days when timeframe missing", () => {
      expect(computeRangeDaysLabel(null)).toEqual({ days: 7, label: "7 days" });
      expect(computeRangeDaysLabel(undefined)).toEqual({
        days: 7,
        label: "7 days",
      });
    });

    it("uses start/end keys (inclusive) and pluralizes", () => {
      expect(
        computeRangeDaysLabel({ start: "2026-01-28", end: "2026-02-01" })
      ).toEqual({
        days: 5,
        label: "5 days",
      });
    });

    it("uses alternate keys (from/to, date_from/date_to, time_min/time_max)", () => {
      expect(computeRangeDaysLabel({ from: "2026-02-01", to: "2026-02-01" })).toEqual({
        days: 1,
        label: "1 day",
      });

      expect(
        computeRangeDaysLabel({ date_from: "2026-01-01", date_to: "2026-01-02" })
      ).toEqual({
        days: 2,
        label: "2 days",
      });

      expect(
        computeRangeDaysLabel({ time_min: "2026-01-28", time_max: "2026-02-01" })
      ).toEqual({
        days: 5,
        label: "5 days",
      });
    });

    it("returns em dash label when it cannot compute", () => {
      expect(
        computeRangeDaysLabel({ start: "bad", end: "also-bad" })
      ).toEqual({
        days: null,
        label: "—",
      });
    });
  });

  describe("mapDaysToTvInterval", () => {
    it("handles invalid or <=0 days", () => {
      expect(mapDaysToTvInterval(0)).toBe("60");
      expect(mapDaysToTvInterval(-1)).toBe("60");
      expect(mapDaysToTvInterval("nope")).toBe("60");
    });

    it("maps thresholds correctly", () => {
      expect(mapDaysToTvInterval(1)).toBe("15");
      expect(mapDaysToTvInterval(2)).toBe("15");
      expect(mapDaysToTvInterval(3)).toBe("60");
      expect(mapDaysToTvInterval(10)).toBe("60");
      expect(mapDaysToTvInterval(11)).toBe("240");
      expect(mapDaysToTvInterval(45)).toBe("240");
      expect(mapDaysToTvInterval(46)).toBe("D");
      expect(mapDaysToTvInterval(180)).toBe("D");
      expect(mapDaysToTvInterval(181)).toBe("W");
    });
  });

  describe("buildPreset", () => {
    it("builds today preset", () => {
      const p = buildPreset("today");
      expect(p).toMatchObject({
        preset: "today",
        start: "2026-02-01",
        end: "2026-02-01",
        label: "Today",
        days: 1,
        tvInterval: "15",
      });
    });

    it("builds 24h preset (still 1 day)", () => {
      const p = buildPreset("24h");
      expect(p).toMatchObject({
        preset: "24h",
        start: "2026-02-01",
        end: "2026-02-01",
        label: "Last 24h",
        days: 1,
        tvInterval: "15",
      });
    });

    it("builds 7d preset (inclusive: today + 6 prior days)", () => {
      const p = buildPreset("7d");
      expect(p).toMatchObject({
        preset: "7d",
        start: "2026-01-26",
        end: "2026-02-01",
        label: "Past week",
        days: 7,
        tvInterval: "60",
      });
    });

    it("builds 30d preset", () => {
      const p = buildPreset("30d");
      expect(p.preset).toBe("30d");
      expect(p.start).toBe("2026-01-03");
      expect(p.end).toBe("2026-02-01");
      expect(p.label).toBe("Past 30 days");
      expect(p.days).toBe(30);
      expect(p.tvInterval).toBe("240"); // <=45 => 4h candles
    });

    it("builds 90d preset", () => {
      const p = buildPreset("90d");
      expect(p).toMatchObject({
        preset: "90d",
        end: "2026-02-01",
        label: "Past 90 days",
        days: 90,
        tvInterval: "D",
      });
    });

    it("builds ytd preset", () => {
      const p = buildPreset("ytd");
      expect(p.preset).toBe("ytd");
      expect(p.start).toBe("2026-01-01");
      expect(p.end).toBe("2026-02-01");
      expect(p.label).toBe("Year to date");
      expect(p.days).toBe(32); // Jan 31 + Feb 1
      expect(p.tvInterval).toBe("240"); // 32 <= 45 => 4h
    });

    it("falls back to 7d for unknown preset", () => {
      const p = buildPreset("???");
      expect(p).toMatchObject({
        preset: "7d",
        start: "2026-01-26",
        end: "2026-02-01",
        label: "Past week",
        days: 7,
        tvInterval: "60",
      });
    });
  });
});