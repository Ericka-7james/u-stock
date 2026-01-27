// src/components/landing/tests/LandingPage.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, vi } from "vitest";

import LandingPage from "../../landing/LandingPage";

// Mock useNavigate so we can assert redirects
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock AuthContext so NavBar/AppShell can call useAuth() without needing AuthProvider
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

  it("renders the hero heading, subtitle, and CTA buttons", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { name: /trading clarity for people/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/u-stock helps everyday users trade and invest/i)
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /sign in \/ sign up/i })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /learn more/i })
    ).toBeInTheDocument();
  });

  it("renders the illustration image", () => {
    renderLanding();
    expect(screen.getByAltText(/u-stock illustration/i)).toBeInTheDocument();
  });

  it("renders the 'Why U-Stock?' section and feature cards", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { name: /why u-stock\?/i })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /clarity you can understand/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /risk controls by default/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /transparency without oversharing/i })
    ).toBeInTheDocument();
  });

  it("renders the big roadmap marketing card content (handles split <strong> text)", () => {
    renderLanding();

    expect(screen.getByText(/where this is going/i)).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /level up your investments with/i })
    ).toBeInTheDocument();

    // The list items are split because of <strong>Now:</strong> etc.
    // So assert the label and the body separately.

    expect(screen.getByText(/^now:$/i)).toBeInTheDocument();
    expect(screen.getByText(/charts, snapshots, bot status \+ logs/i)).toBeInTheDocument();

    expect(screen.getByText(/^next:$/i)).toBeInTheDocument();
    expect(screen.getByText(/paper trading \+ journaling/i)).toBeInTheDocument();

    expect(screen.getByText(/^soon:$/i)).toBeInTheDocument();
    expect(screen.getByText(/guided automation/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^roadmap$/i })).toBeInTheDocument();
  });

  it("navigates to /auth when 'Sign in / Sign up' is clicked", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /sign in \/ sign up/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("navigates to /auth when 'Get Started' is clicked", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("opens the Roadmap modal, then navigates to /auth when 'Get early access' is clicked", () => {
    renderLanding();

    fireEvent.click(screen.getByRole("button", { name: /^roadmap$/i }));

    // Modal title should appear (your Modal renders title text somewhere)
    expect(screen.getByText(/u-stock roadmap/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });
});
