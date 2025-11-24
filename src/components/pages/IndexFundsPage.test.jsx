// src/pages/IndexFundsPage.test.jsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import IndexFundsPage from "./IndexFundsPage";

// Mock hooks
// Mock hooks
vi.mock("../hooks/raw/useRedditMentions", () => ({
  useRedditMentions: vi.fn(),
}));

vi.mock("../hooks/raw/useFundamentalsSnapshot", () => ({
  useFundamentalsSnapshot: vi.fn(),
}));

// Mock AppShell layout
vi.mock("../components/layout/AppShell", () => ({
  default: ({ children }) => (
    <div data-testid="app-shell-mock">{children}</div>
  ),
}));

// Import mocked hooks so we can set return values
import { useRedditMentions } from "../hooks/raw/useRedditMentions";
import { useFundamentalsSnapshot } from "../hooks/raw/useFundamentalsSnapshot";

describe("IndexFundsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the About tab content by default", () => {
    useRedditMentions.mockReturnValue({
      rawData: [],
      meta: { windowDescription: "Last 7 days" },
      loading: false,
    });

    useFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: false,
    });

    render(
      <MemoryRouter>
        <IndexFundsPage />
      </MemoryRouter>
    );

    // Hero title
    expect(
      screen.getByRole("heading", { name: /index funds radar/i })
    ).toBeInTheDocument();

    // About tab heading
    expect(
      screen.getByRole("heading", { name: /how index funds work/i })
    ).toBeInTheDocument();

    // Fundamentals guide heading
    expect(
      screen.getByRole("heading", {
        name: /understanding pe & market cap/i,
      })
    ).toBeInTheDocument();

    // Snapshot meta text
    expect(
      screen.getByText(/snapshot window:/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/last 7 days/i)).toBeInTheDocument();

    // Back link to dashboard
    expect(
      screen.getByRole("link", { name: /back to dashboard/i })
    ).toBeInTheDocument();
  });

  it("shows fund cards with mentions and fundamentals in the Funds tab", () => {
    // Reddit mentions data
    useRedditMentions.mockReturnValue({
      rawData: [
        { ticker: "VTI", count: 3 },
        { ticker: "VOO", count: 1 },
      ],
      meta: null,
      loading: false,
    });

    // Fundamentals snapshot
    useFundamentalsSnapshot.mockReturnValue({
      data: [
        {
          ticker: "VTI",
          pe: 18.234,
          marketCap: 1_500_000_000_000, // 1.5T
        },
        {
          ticker: "VOO",
          pe: 20.0,
          marketCap: 900_000_000_000, // 900B → 0.9T or 900B depending on threshold
        },
        // Intentionally leave out fundamentals for VTSAX/FXAIX/SWTSX
      ],
      loading: false,
    });

    render(
      <MemoryRouter>
        <IndexFundsPage />
      </MemoryRouter>
    );

    // Switch to "Top funds in this snapshot" tab
    fireEvent.click(
      screen.getByRole("button", { name: /top funds in this snapshot/i })
    );

    // We should now see fund cards instead of the about content
    // Check one specific fund (VTI) has its ticker, name, mentions, and formatted metrics
    expect(screen.getByText("VTI")).toBeInTheDocument();
    expect(
      screen.getByText("Vanguard Total Stock Market ETF")
    ).toBeInTheDocument();

    // Mentions count for VTI (3)
    expect(
      screen.getAllByText("3").some((el) =>
        el.closest(".fund-card")
      )
    ).toBe(true);

    // PE for VTI should be formatted to 1 decimal place: 18.2
    expect(screen.getByText("18.2")).toBeInTheDocument();

    // Market cap for VTI: 1.5T
    expect(screen.getByText("1.5T")).toBeInTheDocument();

    // Funds missing fundamentals should show "N/A" somewhere
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("shows loading message when Reddit mentions are still loading in Funds tab", () => {
    useRedditMentions.mockReturnValue({
      rawData: [],
      meta: null,
      loading: true,
    });

    useFundamentalsSnapshot.mockReturnValue({
      data: [],
      loading: false,
    });

    render(
      <MemoryRouter>
        <IndexFundsPage />
      </MemoryRouter>
    );

    // Switch to funds tab
    fireEvent.click(
      screen.getByRole("button", { name: /top funds in this snapshot/i })
    );

    // Should show live mentions loading state
    expect(
      screen.getByText(/loading live mention counts/i)
    ).toBeInTheDocument();
  });
});
