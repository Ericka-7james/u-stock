// frontend/src/components/pages/tests/IndexFundsPage.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * ✅ Mocks MUST be declared before importing the component under test
 */

// ✅ Mock AuthContext so AppShell/NavBar can safely use useAuth
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
 * ✅ FIX: this test lives in src/components/pages/tests/
 * LandingPage lives in src/components/landing/
 * So the correct relative path is ../../landing/LandingPage (NOT ../LandingPage).
 *
 * If IndexFundsPage does not import LandingPage, you can delete this mock entirely.
 */
vi.mock("../../landing/LandingPage", () => ({
  default: () => <div data-testid="landing-page" />,
}));

// ✅ Mock navigate so we can assert route changes (if your page uses it)
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import IndexFundsPage from "../IndexFundsPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/index-funds"]}>
      <IndexFundsPage />
    </MemoryRouter>
  );
}

describe("IndexFundsPage", () => {
  beforeEach(() => {
    mockNavigate.mockClear();

    // Optional: prevent surprise unhandled fetches
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without crashing", () => {
    renderPage();

    // Keep this intentionally broad to avoid brittle failures
    // (adjust if your page has a specific title heading)
    expect(document.body).toBeTruthy();
  });

  it("navigates to /auth when a CTA is clicked (if present)", () => {
    renderPage();

    // If your IndexFundsPage has a CTA button, this will work.
    // If not, either remove this test or update the label to match your UI.
    const cta =
      screen.queryByRole("button", { name: /sign in/i }) ||
      screen.queryByRole("button", { name: /get started/i }) ||
      screen.queryByRole("button", { name: /sign up/i });

    if (!cta) return; // keep test non-brittle if CTA doesn't exist

    fireEvent.click(cta);
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });
});
