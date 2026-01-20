// frontend/src/components/pages/tests/DatasourcesPage.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock AuthContext (AppShell uses it in your app)
vi.mock("../../../context/AuthContext", () => ({
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
    vi.restoreAllMocks();

    global.fetch = vi.fn(async (url) => {
      const u = String(url);

      // Market leaders (REAL endpoint your page uses)
      if (u.includes("/api/market/leaders")) {
        return jsonOk({
          items: [
            { symbol: "VERO", last: 8.0, prev_close: 7.65 },
            { symbol: "JFBR", last: 1.29, prev_close: 0.56 },
          ],
          source: { code: "alpaca_movers", label: "Alpaca market movers (today)" },
          asOf: "2025-01-18T21:00:00Z",
        });
      }

      // Bot logs (REAL endpoint your page uses)
      if (u.includes("/api/bots/log")) {
        return jsonOk({
          items: [
            {
              ts: 1737235900,
              level: "WARN",
              message: "Retrying submit",
              meta: { attempt: 1 },
              bot_id: "ema_trend",
            },
            {
              ts: 1737235847,
              level: "INFO",
              message: "State changed",
              meta: { from: "running", to: "paused" },
              bot_id: "ema_trend",
            },
            {
              ts: 1737235802,
              level: "ERROR",
              message: "Runner error",
              meta: { code: "E_RUN" },
              bot_id: "ema_trend",
            },
          ],
        });
      }

      // Bot status is called too
      if (u.includes("/api/bots/status")) {
        return jsonOk({ effective_state: "unknown" });
      }

      return jsonOk({});
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/data-sources"]}>
        <DatasourcesPage />
      </MemoryRouter>
    );
  }

  it("renders the page title and the Bot Logs panel", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /market leaders & bot logs/i })
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Bot Logs" })
    ).toBeInTheDocument();
  });

  it("renders market leader rows and allows clicking a symbol button", async () => {
    renderPage();

    // ensure leaders loaded
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const jfbrBtn = await screen.findByRole("button", { name: /jfbr/i });
    expect(jfbrBtn).toBeInTheDocument();

    fireEvent.click(jfbrBtn);

    // ✅ Avoid ambiguous "market leaders" text (exists in multiple places).
    // Just verify the hero heading is still present after click.
    expect(
      screen.getByRole("heading", { name: /market leaders & bot logs/i })
    ).toBeInTheDocument();
  });

  it("renders bot log preview entries", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "Bot Logs" });

    expect(await screen.findByText(/retrying submit/i)).toBeInTheDocument();
    expect(await screen.findByText(/state changed/i)).toBeInTheDocument();
    expect(await screen.findByText(/runner error/i)).toBeInTheDocument();
  });
});
