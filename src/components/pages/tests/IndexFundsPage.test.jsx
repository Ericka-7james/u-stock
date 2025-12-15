import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock AuthContext so AppShell/NavBar can safely use useAuth
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null, // logged out is fine for this page
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
}));

// Mock fundamentals hook
vi.mock("../../../hooks/raw/useFundamentalsSnapshot", () => ({
  useFundamentalsSnapshot: vi.fn(),
}));

import IndexFundsPage from "../IndexFundsPage";
import { useFundamentalsSnapshot } from "../../../hooks/raw/useFundamentalsSnapshot";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/index-funds"]}>
      <IndexFundsPage />
    </MemoryRouter>
  );
}

describe("IndexFundsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the hero title and shows the About tab by default", () => {
    useFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: false,
      meta: null,
    });

    renderPage();

    // Hero title
    expect(
      screen.getByRole("heading", { name: /index funds & quant foundations/i })
    ).toBeInTheDocument();

    // About tab active by default
    const aboutTab = screen.getByRole("button", {
      name: /index funds & core exposure/i,
    });
    expect(aboutTab.className).toContain("tab-btn--active");

    // About content should be visible
    expect(screen.getByText(/how index funds work/i)).toBeInTheDocument();
    expect(
      screen.getByText(/how quants source data & find "the gold mine"/i)
    ).toBeInTheDocument();
  });

  it("shows snapshot meta line when fundamentalsMeta.generatedAt is present", () => {
    const generatedAt = "2025-11-24T12:00:00Z";

    useFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: false,
      meta: { generatedAt },
    });

    renderPage();

    expect(
      screen.getByText(/fundamentals snapshot:/i)
    ).toBeInTheDocument();

    // locale-safe: compute the expected string the same way the component does
    const expected = new Date(generatedAt).toLocaleString();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows loading message when switching to Funds tab while loading", () => {
    useFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: true,
      meta: null,
    });

    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /funds in this snapshot/i })
    );

    expect(
      screen.getByText(/loading fundamentals snapshot \(pe, market cap\)…/i)
    ).toBeInTheDocument();
  });

  it("renders fund cards in Funds tab and formats PE + Market Cap when data exists", () => {
    useFundamentalsSnapshot.mockReturnValue({
      loading: false,
      meta: { generatedAt: "2025-11-24T12:00:00Z" },
      data: [
        { ticker: "VTI", pe: 20.11, marketCap: 1_250_000_000_000 }, // 1.3T (toFixed(1))
        { ticker: "VOO", pe: 19.9, marketCap: 900_000_000_000 },     // 900.0B
      ],
    });

    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /funds in this snapshot/i })
    );

    // Cards should exist (INDEX_FUNDS is 5 items)
    const cards = document.querySelectorAll(".fund-card");
    expect(cards.length).toBe(5);

    // VTI visible + correct name
    expect(screen.getByText("VTI")).toBeInTheDocument();
    expect(
      screen.getByText(/vanguard total stock market etf/i)
    ).toBeInTheDocument();

    // PE formatting: toFixed(1)
    expect(screen.getByText("20.1")).toBeInTheDocument();
    expect(screen.getByText("19.9")).toBeInTheDocument();

    // Market cap formatting: T/B/M with 1 decimal
    expect(screen.getByText("1.3T")).toBeInTheDocument();
    expect(screen.getByText("900.0B")).toBeInTheDocument();
  });

  it("shows N/A for PE and Market Cap when fundamentals are missing", () => {
    // Return no fundamentals data → all funds will have fundamentals:null
    useFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: false,
      meta: null,
    });

    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /funds in this snapshot/i })
    );

    // There are 5 funds; each card has PE + Market Cap values.
    // We should see several "N/A" values.
    const na = screen.getAllByText("N/A");
    expect(na.length).toBeGreaterThanOrEqual(5); // at least one per card
  });
});
