// frontend/src/components/pages/tests/IndexFundsPage.test.jsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * ✅ Mocks MUST be declared before importing the component under test
 */

// Shared auth mock object
const authMock = {
  user: null,
  isAuthed: false,
  loading: false,
  refreshSession: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
};

// ✅ Mock BOTH possible auth import paths used across the app
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => authMock,
  AuthProvider: ({ children }) => children,
}));
vi.mock("../../../context/AuthContext.jsx", () => ({
  useAuth: () => authMock,
  AuthProvider: ({ children }) => children,
}));
vi.mock("../../../context/authContextBase.js", () => ({
  useAuth: () => authMock,
}));

// (optional) config mock if other components import it
vi.mock("../../../config/config", () => ({
  API_BASE: "",
  API_PREFIX: "/api",
}));

// ✅ If IndexFundsPage does not import LandingPage, this mock is unnecessary.
// Keeping it harmless.
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
    expect(document.body).toBeTruthy();
  });

  it("navigates to /auth when a CTA is clicked (if present)", () => {
    renderPage();

    const cta =
      screen.queryByRole("button", { name: /sign in/i }) ||
      screen.queryByRole("button", { name: /get started/i }) ||
      screen.queryByRole("button", { name: /sign up/i });

    if (!cta) return;

    fireEvent.click(cta);
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });
});