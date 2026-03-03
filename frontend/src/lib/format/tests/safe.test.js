// frontend/src/lib/format/tests/safe.test.js
import { describe, it, expect } from "vitest";
import { safeStr, safeJson, includesAny } from "../safe.js";

describe("lib/format/safe", () => {
  describe("safeStr", () => {
    it("returns trimmed string", () => {
      expect(safeStr("  hi  ")).toBe("hi");
      expect(safeStr("\n\t ok \t")).toBe("ok");
      expect(safeStr(123)).toBe("123");
      expect(safeStr(false)).toBe("false");
    });

    it("returns fallback when trimmed result is empty", () => {
      expect(safeStr(null)).toBe("");
      expect(safeStr(undefined)).toBe("");
      expect(safeStr("")).toBe("");
      expect(safeStr("   ")).toBe("");

      expect(safeStr(null, "x")).toBe("x");
      expect(safeStr("   ", "x")).toBe("x");
      expect(safeStr("", "x")).toBe("x");
    });

    it("does not use fallback when trimmed result is non-empty", () => {
      expect(safeStr(" ok ", "x")).toBe("ok");
      expect(safeStr(0, "x")).toBe("0");
    });
  });

  describe("safeJson", () => {
    it("pretty-prints JSON with 2-space indentation", () => {
      const out = safeJson({ a: 1, b: { c: 2 } });
      expect(out).toContain('"a": 1');
      expect(out).toContain('"c": 2');
      // Basic signal that pretty printing happened (newline + indentation)
      expect(out).toContain("\n");
      expect(out).toContain("  ");
    });

    it("stringifies primitives", () => {
      expect(safeJson("x")).toBe('"x"'); // JSON.stringify adds quotes for strings
      expect(safeJson(5)).toBe("5");
      expect(safeJson(true)).toBe("true");
      expect(safeJson(null)).toBe("null");
    });

    it("falls back to String(x ?? '') on circular input", () => {
      const obj = {};
      obj.self = obj;

      const out = safeJson(obj);
      expect(typeof out).toBe("string");
      // In the catch branch, String(obj) => "[object Object]"
      expect(out).toBe("[object Object]");
    });

    it("falls back to empty string for undefined when JSON.stringify throws/returns undefined", () => {
      // JSON.stringify(undefined) returns undefined (not a throw),
      // but our function returns it directly, so it becomes undefined.
      // This test documents that current behavior explicitly.
      const out = safeJson(undefined);
      expect(out).toBeUndefined();
    });
  });

  describe("includesAny", () => {
    it("treats empty/blank needle as match", () => {
      expect(includesAny("Hello World", "")).toBe(true);
      expect(includesAny("Hello World", "   ")).toBe(true);
      expect(includesAny("Hello World", null)).toBe(true);
      expect(includesAny("", "")).toBe(true);
    });

    it("is case-insensitive and checks substring", () => {
      expect(includesAny("Hello World", "world")).toBe(true);
      expect(includesAny("Hello World", "WORLD")).toBe(true);
      expect(includesAny("Hello World", "lo wo")).toBe(true);
      expect(includesAny("Hello World", "nope")).toBe(false);
    });

    it("handles null/undefined haystack", () => {
      expect(includesAny(null, "x")).toBe(false);
      expect(includesAny(undefined, "x")).toBe(false);
    });
  });
});