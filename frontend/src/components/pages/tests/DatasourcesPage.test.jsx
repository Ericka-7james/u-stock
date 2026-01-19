// src/components/pages/tests/DatasourcesPage.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// --------------------
// Mocks (MUST be before importing the page)
// --------------------

// ✅ Make useAuth "shape-safe" for AppShell + Nav + any other consumers.
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    isAuthed: false,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
    authFetch: vi.fn(),
  }),
}));

// ✅ Mock Modal to avoid portal/body issues and keep assertions easy
// IMPORTANT: define the component INSIDE the factory (vi.mock is hoisted)
vi.mock("../../common/Modal.jsx", () => ({
  default: function MockModal({ open, title, children, footer, onClose }) {
    if (!open) return null;
    return (
      <div role="dialog" aria-label={title}>
        <div>{title}</div>
        <button type="button" onClick={onClose}>
          Close
        </button>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    );
  },
}));

// Mock useNavigate so we can assert it
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Import AFTER mocks
import DatasourcesPage from "../DatasourcesPage";

// --------------------
// Helpers
// --------------------
function makeLeadersResponse() {
  return {
    items: [
      { symbol: "VERO", last: 8.0, prevClose: 7.65 },
      { symbol: "JFBR", last: 1.29, prevClose: 0.56 },
    ],
    source: { code: "alpaca_movers", label: "Alpaca market movers (today)" },
    // ✅ valid ISO so we don't render "Invalid Date"
    asOf: "2025-01-18T21:10:00Z",
  };
}

function makeLogsResponse() {
  return {
    items: [
      {
        ts: 1737253802,
        level: "error",
        message: "Runner error",
        meta: { code: "E_RUN" },
        bot_id: "ema_trend",
      },
      {
        ts: 1737253847,
        level: "info",
        message: "State changed",
        meta: { from: "running", to: "paused" },
        bot_id: "ema_trend",
      },
      {
        ts: 1737253900,
        level: "warn",
        message: "Retrying submit",
        meta: { attempt: 1 },
        bot_id: "ema_trend",
      },
    ],
  };
}

function mockFetchRouter() {
  return vi.fn(async (input) => {
    const url = String(input);

    if (url.startsWith("/api/market/leaders")) {
      return { ok: true, status: 200, json: async () => makeLeadersResponse() };
    }

    if (url.startsWith("/api/bots/log")) {
      return { ok: true, status: 200, json: async () => makeLogsResponse() };
    }

    return { ok: false, status: 404, json: async () => ({ detail: "Not found" }) };
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/data-sources"]}>
      <DatasourcesPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  localStorage.clear();
  globalThis.fetch = mockFetchRouter();
});

// --------------------
// Tests
// --------------------
describe("DatasourcesPage", () => {
  it("renders hero title + description + top links", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /market leaders & bot logs/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/see today’s top movers and review bot activity/i)
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /back to dashboard/i })).toHaveAttribute(
      "href",
      "/"
    );

    // One in hero, one inside Bot Logs header (Connected apps →)
    expect(screen.getAllByRole("link", { name: /connected apps/i }).length).toBeGreaterThanOrEqual(
      1
    );
  });

  it("renders Market leaders and loads symbols", async () => {
    renderPage();

    expect(await screen.findByText("VERO")).toBeInTheDocument();
    expect(screen.getByText("JFBR")).toBeInTheDocument();

    expect(screen.getByText(/alpaca market movers \(today\)/i)).toBeInTheDocument();
  });

  it("clicking a leader stores ticker and navigates to dashboard", async () => {
    renderPage();

    await screen.findByText("VERO");

    // Buttons have no accessible name; click via title attribute (matches your DOM)
    const veroBtn = document.querySelector('button.mlRow[title="VERO"]');
    expect(veroBtn).toBeTruthy();

    fireEvent.click(veroBtn);

    expect(localStorage.getItem("ustock:last_ticker")).toBe("VERO");
    expect(mockNavigate).toHaveBeenCalledWith("/?ticker=VERO");
  });

  it("renders Bot Logs card + preview rows", async () => {
    renderPage();

    // ✅ Use role-based query (more robust than findByText)
    expect(
      await screen.findByRole("heading", { name: /bot logs/i })
    ).toBeInTheDocument();

    // Preview rows (fetched)
    expect(await screen.findByText("Retrying submit")).toBeInTheDocument();
    expect(screen.getByText("State changed")).toBeInTheDocument();
    expect(screen.getByText("Runner error")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view all/i })).toBeInTheDocument();
  });

  it('opens modal when clicking "View all"', async () => {
    renderPage();

    // Wait for the card to exist (role-based)
    await screen.findByRole("heading", { name: /bot logs/i });

    fireEvent.click(screen.getByRole("button", { name: /view all/i }));

    // Modal title comes from the component: "Bot log · ema_trend · YYYY-MM-DD"
    expect(screen.getByRole("dialog", { name: /bot log/i })).toBeInTheDocument();
    expect(screen.getByText("Runner error")).toBeInTheDocument();
  });
});
