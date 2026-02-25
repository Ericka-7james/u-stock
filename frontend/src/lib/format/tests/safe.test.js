// frontend/src/lib/format/tests/safe.test.js
import { describe, it, expect } from "vitest";
import { safeStr, safeJson, includesAny } from "../safe.js";

describe("lib/format/safe", () => {
  it("safeStr returns trimmed string or fallback", () => {
    expect(safeStr(null)).toBe("");
    expect(safeStr(undefined)).toBe("");
    expect(safeStr("")).toBe("");
    expect(safeStr("   ")).toBe("");

    expect(safeStr("  hi  ")).toBe("hi");
    expect(safeStr(123)).toBe("123");

    expect(safeStr(null, "x")).toBe("x");
    expect(safeStr("   ", "x")).toBe("x");
    expect(safeStr(" ok ", "x")).toBe("ok");
  });

  it("safeJson pretty-prints JSON and falls back to String on circular", () => {
    expect(safeJson({ a: 1 })).toContain('"a": 1');
    expect(safeJson([1, 2])).toContain("1");
    expect(safeJson("x")).toContain("x");

    const obj = {};
    obj.self = obj; // circular
    // should not throw
    const out = safeJson(obj);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("includesAny is case-insensitive and treats empty needle as match", () => {
    expect(includesAny("Hello World", "")).toBe(true);
    expect(includesAny("Hello World", "   ")).toBe(true);
    expect(includesAny("Hello World", null)).toBe(true);

    expect(includesAny("Hello World", "world")).toBe(true);
    expect(includesAny("Hello World", "WORLD")).toBe(true);
    expect(includesAny("Hello World", "nope")).toBe(false);

    expect(includesAny(null, "x")).toBe(false);
    expect(includesAny(undefined, "x")).toBe(false);
  });
});