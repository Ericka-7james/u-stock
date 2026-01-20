import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, vi } from "vitest";

function makeDefaultFetch() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  }));
}

let defaultFetch = makeDefaultFetch();

function ensureMockFetch() {
  if (!vi.isMockFunction(globalThis.fetch)) {
    defaultFetch = makeDefaultFetch();
    Object.defineProperty(globalThis, "fetch", {
      value: defaultFetch,
      writable: true,
      configurable: true,
    });
  }
}

ensureMockFetch();

beforeEach(() => {
  ensureMockFetch();
  globalThis.fetch.mockClear();
});

afterEach(() => {
  ensureMockFetch();
  globalThis.fetch.mockReset();
  globalThis.fetch.mockImplementation(defaultFetch);
});
