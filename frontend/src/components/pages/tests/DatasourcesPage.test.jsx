// frontend/src/components/pages/tests/DatasourcesPage.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * ✅ Mocks MUST be declared before importing the component under test
 */

// ✅ Mock AuthContext (AppShell/NavBar uses it)
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

// (optional) config mock if other components import it
vi.mock("../../../config/config", () => ({
  API_BASE: "",
  API_PREFIX: "/api",
}));

/**
 * ✅ Mock BotLogsCard so DatasourcesPage tests don't depend on BotLogsCard internals.
 * IMPORTANT: Do NOT use new URL(import.meta.url) here — it can trigger hoisting/init issues.
 * Mock using the literal module path the page imports.
 */
vi.mock("../../dashboard/cards/BotLogsCard.jsx", () => ({
  default: function MockBotLogsCard(props) {
    return (
      <section data-testid="bot-logs-card">
        <h2>{props.title || "Bot logs"}</h2>
        <p>{props.subtitle || ""}</p>

        {/* Deterministic preview text for assertions */}
        <ul>
          <li>Retrying submit</li>
          <li>State changed</li>
          <li>Runner error</li>
        </ul>
      </section>
    );
  },
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

        // ✅ endpoint used by useMarketLeaders()
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

  it("renders the page header + both sections", async () => {
    renderPage();

    // PageHeaderCard title
    expect(await screen.findByRole("heading", { name: /data sources/i })).toBeInTheDocument();

    // Market leaders card title prop is "Market leaders"
    expect(await screen.findByText(/market leaders/i)).toBeInTheDocument();

    // BotLogsCard is mocked
    expect(await screen.findByRole("heading", { name: /bot logs/i })).toBeInTheDocument();
    expect(screen.getByTestId("bot-logs-card")).toBeInTheDocument();
  });

  it("renders market leader rows and allows clicking a ticker button", async () => {
    renderPage();

    // ensure leaders loaded
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/market/leaders"),
        expect.any(Object)
      )
    );

    // MarketLeadersCard usually renders the symbol as a button
    const jfbrBtn = await screen.findByRole("button", { name: /jfbr/i });
    fireEvent.click(jfbrBtn);

    // still on the page (not asserting navigation here)
    expect(screen.getByRole("heading", { name: /data sources/i })).toBeInTheDocument();
  });

  it("shows bot log preview entries (from mocked BotLogsCard)", async () => {
    renderPage();

    await screen.findByRole("heading", { name: /bot logs/i });

    expect(screen.getByText(/retrying submit/i)).toBeInTheDocument();
    expect(screen.getByText(/state changed/i)).toBeInTheDocument();
    expect(screen.getByText(/runner error/i)).toBeInTheDocument();
  });
});
