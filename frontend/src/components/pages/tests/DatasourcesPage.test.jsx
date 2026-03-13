// frontend/src/components/pages/tests/DatasourcesPage.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ✅ Mock auth hook (AppShell/NavBar uses it)
vi.mock("../../../context/authContextBase.js", () => ({
  useAuth: () => ({
    user: null,
    isAuthed: false,
    refreshSession: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("../../../config/config", () => ({
  API_BASE: "",
  API_PREFIX: "/api",
}));

import DatasourcesPage from "../DatasourcesPage";

function jsonOk(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

describe("DatasourcesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const u = String(url);

        if (u.includes("/api/market/leaders")) {
          return jsonOk({
            items: [
              { symbol: "VERO", last: 8.0, prev_close: 8.0 },
              { symbol: "JFBR", last: 1.29, prev_close: 1.29 },
            ],
            source: { code: "alpaca_movers", label: "Alpaca market movers (today)" },
            asOf: "2025-01-18T21:00:00Z",
          });
        }

        return jsonOk({});
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/data-sources"]}>
        <DatasourcesPage />
      </MemoryRouter>
    );
  }

  it("renders the page header + market movers rows + system logs section", async () => {
    renderPage();

    // ✅ Page header is now "Data + Logs"
    expect(await screen.findByRole("heading", { name: /data \+ logs/i })).toBeInTheDocument();

    // ✅ market movers render as ticker buttons; wait for one to appear
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/market/leaders"),
        expect.anything()
      )
    );
    expect(await screen.findByRole("button", { name: /^vero\b/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^jfbr\b/i })).toBeInTheDocument();

    // ✅ logs section is present
    expect(await screen.findByRole("heading", { name: /system logs/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /search/i })).toBeInTheDocument();
  });

  it("renders market leader rows and allows clicking a ticker button", async () => {
    renderPage();

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/market/leaders"),
        expect.anything()
      )
    );

    const jfbrBtn = await screen.findByRole("button", { name: /^jfbr\b/i });
    fireEvent.click(jfbrBtn);

    expect(screen.getByRole("heading", { name: /data \+ logs/i })).toBeInTheDocument();
  });

  it("shows system logs controls (stable UI assertions)", async () => {
    renderPage();

    await screen.findByRole("heading", { name: /system logs/i });

    expect(screen.getByRole("combobox", { name: /bot/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /day/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /outcome/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /limit/i })).toBeInTheDocument();

    expect(screen.getByRole("textbox", { name: /search/i })).toBeInTheDocument();
  });
});