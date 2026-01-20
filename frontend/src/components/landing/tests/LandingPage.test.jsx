// src/components/landing/tests/LandingPage.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";

import LandingPage from "../LandingPage";

// --- Mocks --- //

// Mock useNavigate so we can assert redirects
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock AuthContext so NavBar can call useAuth() without needing AuthProvider
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    logout: vi.fn(),
  }),
}));

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LandingPage />
    </MemoryRouter>
  );
}

describe("LandingPage", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders the hero heading, subtitle, and CTA button", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { name: /transparent automation\./i })
    ).toBeInTheDocument();

    expect(screen.getByText(/clear “what happened/i)).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /sign in \/ sign up/i })
    ).toBeInTheDocument();
  });

  it("renders the illustration image", () => {
    renderLanding();

    const img = screen.getByAltText(/u-stock illustration/i);
    expect(img).toBeInTheDocument();
  });

  it("renders the 'Why U-Stock?' section and feature cards", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { name: /why u-stock\?/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/transparency you can trust/i)).toBeInTheDocument();
    expect(screen.getByText(/automation with guardrails/i)).toBeInTheDocument();
    expect(screen.getByText(/protect your edge/i)).toBeInTheDocument();
  });

  it("renders the roadmap section content", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { name: /what.?s shipping next/i })
    ).toBeInTheDocument();

    // Appears in BOTH the left list and the right steps
    expect(screen.getAllByText(/paper trading \+ journaling/i).length).toBeGreaterThan(0);

    // Also appears at least once (left list)
    expect(
      screen.getByText(/multi-bot scanning \+ broker execution/i)
    ).toBeInTheDocument();

    // Right card steps
    expect(
      screen.getByText(/research cockpit \+ transparency/i)
    ).toBeInTheDocument();

    expect(
      screen.getByText(/automation \+ broker execution/i)
    ).toBeInTheDocument();
  });

  it("navigates to /auth when 'Sign in / Sign up' is clicked", () => {
    renderLanding();

    fireEvent.click(
      screen.getByRole("button", { name: /sign in \/ sign up/i })
    );

    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("navigates to /auth when 'Get early access' is clicked", () => {
    renderLanding();

    fireEvent.click(
      screen.getByRole("button", { name: /get early access/i })
    );

    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });
});
