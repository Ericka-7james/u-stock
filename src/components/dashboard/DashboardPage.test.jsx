// src/components/dashboard/DashboardPage.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";

// ---- Mock hooks (MATCHING DashboardPage.jsx IMPORT PATHS) ----
vi.mock("../../hooks/derived/useJoinedMentions", () => ({
  useJoinedMentions: vi.fn(),
}));

vi.mock("../../hooks/raw/useRedditMentions", () => ({
  useRedditMentions: vi.fn(),
}));

vi.mock("../../hooks/raw/usePricesSnapshot", () => ({
  usePricesSnapshot: vi.fn(),
}));

vi.mock("../../hooks/raw/useMacroSnapshot", () => ({
  useMacroSnapshot: vi.fn(),
}));

// ---- Mock AppShell layout ----
vi.mock("../layout/AppShell", () => ({
  default: ({ children }) => (
    <div data-testid="app-shell-mock">{children}</div>
  ),
}));

// Import mocked hooks so we can set return values
import { useJoinedMentions } from "../../hooks/derived/useJoinedMentions";
import { useRedditMentions } from "../../hooks/raw/useRedditMentions";
import { usePricesSnapshot } from "../../hooks/raw/usePricesSnapshot";
import { useMacroSnapshot } from "../../hooks/raw/useMacroSnapshot";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading states when data is still loading", () => {
    // All hooks in loading state
    useRedditMentions.mockReturnValue({
      rawData: [],
      meta: null,
      loading: true,
    });

    useJoinedMentions.mockReturnValue({
      rawData: [],
      meta: null,
      loading: true,
    });

    usePricesSnapshot.mockReturnValue({
      data: [],
      meta: null,
      loading: true,
    });

    useMacroSnapshot.mockReturnValue({
      series: [],
      loading: true,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    // Left column loading copy
    expect(
      screen.getByText(/loading index fund mentions/i)
    ).toBeInTheDocument();

    expect(screen.getByText(/loading prices/i)).toBeInTheDocument();
    expect(screen.getByText(/loading macro data/i)).toBeInTheDocument();

    // Chart should be in loading mode — message comes from RedditMentionsChart
    expect(
      screen.getByText(/loading reddit mentions/i)
    ).toBeInTheDocument();
  });

  it("lets you switch to 'choose' mode and add ticker chips", () => {
    // Reddit mentions for index funds + meta
    useRedditMentions.mockReturnValue({
      rawData: [
        { ticker: "VTI", count: 5 },
        { ticker: "VOO", count: 3 },
      ],
      meta: {
        generatedAt: new Date("2025-01-01T12:00:00Z").toISOString(),
      },
      loading: false,
    });

    // Joined mentions (reddit + news) for chart
    useJoinedMentions.mockReturnValue({
      rawData: [
        { ticker: "TSLA", count: 10 },
        { ticker: "AAPL", count: 7 },
        { ticker: "VTI", count: 5 },
      ],
      meta: {
        windowDescription: "Last 24 hours",
      },
      loading: false,
    });

    // Prices + macro snapshot
    usePricesSnapshot.mockReturnValue({
      data: [
        { ticker: "TSLA", price: 250, currency: "USD" },
        { ticker: "AAPL", price: 190, currency: "USD" },
      ],
      meta: {
        generatedAt: new Date("2025-01-01T12:00:00Z").toISOString(),
      },
      loading: false,
    });

    useMacroSnapshot.mockReturnValue({
      series: [
        { id: "CPIAUCSL", latest: 310.2, lastUpdated: "2025-01-01" },
        { id: "UNRATE", latest: 3.9, lastUpdated: "2025-01-01" },
        { id: "DFF", latest: 5.25, lastUpdated: "2025-01-01" },
      ],
      loading: false,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    // Switch select to "choose" mode
    const select = screen.getByLabelText(/view/i);
    fireEvent.change(select, { target: { value: "choose" } });

    // Type a ticker and press Enter
    const input = screen.getByPlaceholderText(
      /type a ticker from this snapshot/i
    );

    fireEvent.change(input, { target: { value: "TSLA" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Chip for TSLA should appear
    const tslaElements = screen.getAllByText("TSLA");
    expect(tslaElements.length).toBeGreaterThan(0);
  });
});
