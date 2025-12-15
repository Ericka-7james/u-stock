import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";

// Mock AuthContext so NavBar/AppShell can call useAuth safely
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
}));

/**
 * Mock config modules used by the page so tests are stable.
 * Adjust paths if your project structure differs.
 */
vi.mock("../../../config/raw/pricesSources", () => ({
  PRICE_SOURCES: [
    { id: "yahoo", name: "Yahoo Finance", url: "https://example.com/yahoo" },
    { id: "alpaca", name: "Alpaca", url: "https://example.com/alpaca" },
  ],
}));

vi.mock("../../../config/raw/fundamentalsSources", () => ({
  FUNDAMENTAL_SOURCES: [
    { id: "fmp", name: "Financial Modeling Prep", url: "https://example.com/fmp" },
  ],
}));

vi.mock("../../../config/raw/macroSources", () => ({
  MACRO_SOURCES: [
    { id: "fred", name: "FRED", url: "https://example.com/fred" },
    { id: "bea", name: "BEA", url: "https://example.com/bea" },
    { id: "bls", name: "BLS", url: "https://example.com/bls" },
  ],
}));

// Imported but not used in your current JSX, but you import it — so mock it anyway.
vi.mock("../../../config/raw/redditSources", () => ({
  REDDIT_SOURCES: [{ id: "reddit", name: "Reddit" }],
}));

vi.mock("../../../config/raw/trackedTickers", () => ({
  TRACKED_TICKERS: ["AAPL", "MSFT", "TSLA", "NVDA"],
}));

// ✅ IMPORTANT: make sure this import matches your real file name/path.
// If your file is actually DatasourcesPage.jsx, use "../DatasourcesPage".
// If it's DatasourcePage.jsx, use "../DatasourcePage".
import DatasourcePage from "../DatasourcesPage"; // <-- change if needed

describe("DatasourcesPage", () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <DatasourcePage />
      </MemoryRouter>
    );
  }

  it("renders the page title and hero description", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: /data sources & quant pipeline/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/this page documents the core inputs/i)
    ).toBeInTheDocument();
  });

  it('renders the "Back to dashboard" link', () => {
    renderPage();

    const back = screen.getByRole("link", { name: /back to dashboard/i });
    expect(back).toHaveAttribute("href", "/");
  });

  it("renders the configuration summary with correct counts", () => {
    renderPage();

    // Based on our mocks:
    // tracked tickers = 4
    // price feeds = 2
    // fundamentals APIs = 1
    // macro sources = 3
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    expect(
      screen.getByText(/configuration at a glance/i)
    ).toBeInTheDocument();
  });

  it("renders each category section headers", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /market prices/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /fundamentals/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /macro & state of the economy/i })
    ).toBeInTheDocument();
  });

  it('renders "API docs →" links for sources that include urls', () => {
    renderPage();

    // We mocked 2 + 1 + 3 sources with urls => 6 links total
    const apiLinks = screen.getAllByRole("link", { name: /api docs →/i });
    expect(apiLinks.length).toBe(6);
  });
});
