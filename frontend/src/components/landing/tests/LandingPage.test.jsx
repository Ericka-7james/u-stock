// src/components/landing/tests/LandingPage.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

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
      screen.getByRole("heading", {
        name: /trade smarter\.\s*build your own edge\./i,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/pulls together prices, signals, and sentiment/i)
    ).toBeInTheDocument();

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

    expect(screen.getByText(/clean market view/i)).toBeInTheDocument();
    expect(screen.getByText(/signals that evolve/i)).toBeInTheDocument();
    expect(screen.getByText(/your future co-pilot/i)).toBeInTheDocument();
  });

  it("renders the roadmap section content", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { name: /where this is going/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/dashboard \+ signals \(now\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/paper trading sandbox/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/live broker integrations/i)
    ).toBeInTheDocument();
  });

  it("navigates to /auth when 'Sign in / Sign up' is clicked", () => {
    renderLanding();

    const cta = screen.getByRole("button", {
      name: /sign in \/ sign up/i,
    });

    fireEvent.click(cta);
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("navigates to /auth when 'Get early access' is clicked", () => {
    renderLanding();

    const cta = screen.getByRole("button", {
      name: /get early access/i,
    });

    fireEvent.click(cta);
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });
});
