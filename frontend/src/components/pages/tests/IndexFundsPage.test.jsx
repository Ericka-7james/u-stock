// frontend/src/components/pages/tests/IndexFundsPage.test.jsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock AuthContext so AppShell/NavBar can safely use useAuth
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

import IndexFundsPage from "../IndexFundsPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/index-funds"]}>
      <IndexFundsPage />
    </MemoryRouter>
  );
}

describe("IndexFundsPage", () => {
  it("renders the hero title and shows the baselines tab content by default", () => {
    renderPage();

    // Hero title
    expect(
      screen.getByRole("heading", { name: /market baselines/i })
    ).toBeInTheDocument();

    // Default tab button exists + is active
    const baselinesTab = screen.getByRole("button", {
      name: /how lucent uses baselines/i,
    });
    expect(baselinesTab.className).toContain("tab-btn--active");

    // Default content visible
    expect(
      screen.getByRole("heading", { name: /what “baseline context” means/i })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: /how this connects to bots \+ runner states/i,
      })
    ).toBeInTheDocument();
  });

  it('switches to "Baseline universe" tab and renders baseline fund cards', () => {
    renderPage();

    // Switch tab
    fireEvent.click(
      screen.getByRole("button", { name: /baseline universe/i })
    );

    // Universe tab should now be active
    const universeTab = screen.getByRole("button", { name: /baseline universe/i });
    expect(universeTab.className).toContain("tab-btn--active");

    // Fund cards exist
    const cards = document.querySelectorAll(".fund-card");
    expect(cards.length).toBeGreaterThan(0);

    // A few known tickers from BASELINES should be present
    expect(screen.getByText("SPY")).toBeInTheDocument();
    expect(screen.getByText("QQQ")).toBeInTheDocument();
    expect(screen.getByText("IWM")).toBeInTheDocument();
    expect(screen.getByText("VTI")).toBeInTheDocument();
    expect(screen.getByText("TLT")).toBeInTheDocument();
  });

  it('renders the "Back to dashboard" link', () => {
    renderPage();

    const back = screen.getByRole("link", { name: /back to dashboard/i });
    expect(back).toHaveAttribute("href", "/");
  });
});
