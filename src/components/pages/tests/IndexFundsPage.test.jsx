// src/components/pages/tests/IndexFundsPage.test.jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mock AuthContext so AppShell/NavBar can safely use useAuth ---
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "test@example.com", avatar: "📈" },
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
}));

// --- Mock fundamentals hook ---
vi.mock("../../../hooks/raw/useFundamentalsSnapshot", () => {
  const mockUseFundamentalsSnapshot = vi.fn();
  return {
    useFundamentalsSnapshot: mockUseFundamentalsSnapshot,
    mockUseFundamentalsSnapshot,
  };
});

import IndexFundsPage from "../IndexFundsPage";
import { mockUseFundamentalsSnapshot } from "../../../hooks/raw/useFundamentalsSnapshot";

describe("IndexFundsPage", () => {
  it("renders the about tab by default", () => {
    mockUseFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      meta: null,
    });

    render(
      <MemoryRouter initialEntries={["/index-funds"]}>
        <IndexFundsPage />
      </MemoryRouter>
    );

    // The "about" tab is actually labeled "Index funds & core exposure"
    const aboutTab = screen.getByRole("button", {
      name: /index funds & core exposure/i,
    });

    expect(aboutTab).toBeInTheDocument();
    // Uses CSS class for active state, not aria-pressed
    expect(aboutTab.className).toContain("tab-btn--active");

    // Sanity check: content from the about panel
    expect(
      screen.getByText(/how index funds work/i)
    ).toBeInTheDocument();
  });

  it("shows loading message when switching to Funds tab", () => {
    mockUseFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      meta: null,
    });

    render(
      <MemoryRouter initialEntries={["/index-funds"]}>
        <IndexFundsPage />
      </MemoryRouter>
    );

    // Click the "Funds in this snapshot" tab explicitly
    const fundsTab = screen.getByRole("button", {
      name: /funds in this snapshot/i,
    });
    fireEvent.click(fundsTab);

    // Adjust this text if your loading copy is different
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders fund cards when data is present", () => {
    mockUseFundamentalsSnapshot.mockReturnValue({
      loading: false,
      error: null,
      meta: { generatedAt: "2025-11-24T12:00:00Z" },
      data: [
        {
          symbol: "VTI",
          name: "Vanguard Total Stock Market ETF",
          expenseRatio: 0.03,
          aum: 1000000000,
        },
        {
          symbol: "VOO",
          name: "Vanguard S&P 500 ETF",
          expenseRatio: 0.03,
          aum: 900000000,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/index-funds"]}>
        <IndexFundsPage />
      </MemoryRouter>
    );

    // Click the "Funds in this snapshot" tab explicitly
    const fundsTab = screen.getByRole("button", {
      name: /funds in this snapshot/i,
    });
    fireEvent.click(fundsTab);

    // Cards for both funds should render
    const vtiMatches = screen.getAllByText(/VTI/);
    expect(vtiMatches.length).toBeGreaterThan(0);

    expect(
      screen.getByText(/Vanguard Total Stock Market ETF/i)
    ).toBeInTheDocument();

    const vooMatches = screen.getAllByText(/VOO/);
    expect(vooMatches.length).toBeGreaterThan(0);
  });
});
