// src/components/pages/tests/DatasourcesPage.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// If DatasourcesPage imports charts/images/etc, you may need these mocks:
// vi.mock("recharts", async () => await import("./__mocks__/recharts")); // example if needed

// Mock AuthContext (AppShell uses it in your app)
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isAuthed: false,
    refreshSession: vi.fn(),
  }),
}));

// Mock any config used by DatasourcesPage if it hits API_BASE/API_PREFIX
vi.mock("../../../config/config", () => ({
  API_BASE: "",
  API_PREFIX: "/api",
}));

import DatasourcesPage from "../DatasourcesPage";

describe("DatasourcesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Global fetch mock
    global.fetch = vi.fn(async (url) => {
      const u = String(url);

      // ✅ Mock endpoints your page calls
      if (u.includes("/api/market/movers") || u.includes("/api/market/leaders")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            as_of: "2025-01-18T21:00:00Z",
            movers: [
              {
                symbol: "VERO",
                last: 8.0,
                prev_close: 7.65,
              },
              {
                symbol: "JFBR",
                last: 1.29,
                prev_close: 0.56,
              },
            ],
            source: "Alpaca market movers (today)",
          }),
        };
      }

      if (u.includes("/api/bots/logs")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            bot_id: "ema_trend",
            days: ["2025-01-18"],
            logs: [
              {
                ts: "2025-01-18T21:31:40Z",
                level: "WARN",
                message: "Retrying submit",
                meta: { attempt: 1 },
              },
              {
                ts: "2025-01-18T21:30:47Z",
                level: "INFO",
                message: "State changed",
                meta: { from: "running", to: "paused" },
              },
              {
                ts: "2025-01-18T21:30:02Z",
                level: "ERROR",
                message: "Runner error",
                meta: { code: "E_RUN" },
              },
            ],
            effective_state: "unknown",
          }),
        };
      }

      // Default fallback — keeps tests from hanging
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <DatasourcesPage />
      </MemoryRouter>
    );
  }

  it("renders the page title and the Bot Logs panel", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /market leaders & bot logs/i })
    ).toBeInTheDocument();

    // ✅ DO NOT use the “…” ellipsis character in regex.
    // Match exactly what the DOM has.
    expect(
      await screen.findByRole("heading", { name: "Bot Logs" })
    ).toBeInTheDocument();
  });

  it("renders market leader rows and allows clicking a symbol button", async () => {
    renderPage();

    // Wait for a row to exist
    const jfbrBtn = await screen.findByRole("button", { name: /jfbr/i });
    expect(jfbrBtn).toBeInTheDocument();

    fireEvent.click(jfbrBtn);

    // If clicking triggers navigation or callback, assert whatever YOUR component does.
    // At minimum, ensure it didn't crash:
    expect(screen.getByText(/market leaders/i)).toBeInTheDocument();
  });

  it("renders bot log preview entries", async () => {
    renderPage();

    // Ensure panel exists
    await screen.findByRole("heading", { name: "Bot Logs" });

    // Your DOM shows these messages, so these should be present
    expect(await screen.findByText(/retrying submit/i)).toBeInTheDocument();
    expect(await screen.findByText(/state changed/i)).toBeInTheDocument();
    expect(await screen.findByText(/runner error/i)).toBeInTheDocument();
  });
});
