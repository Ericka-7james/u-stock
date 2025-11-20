// src/components/dashboard/DashboardPage.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";

// 🔧 Mock hooks so we fully control the data/loading states
vi.mock("../../hooks/useRedditMentions", () => ({
  useRedditMentions: vi.fn(),
}));

vi.mock("../../hooks/usePricesSnapshot", () => ({
  usePricesSnapshot: vi.fn(),
}));

vi.mock("../../hooks/useMacroSnapshot", () => ({
  useMacroSnapshot: vi.fn(),
}));

// 🔧 Mock layout + child components so we don't pull in their implementations
vi.mock("../layout/AppShell", () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("./StatSummary", () => ({
  default: () => <div data-testid="stat-summary">StatSummaryMock</div>,
}));

vi.mock("../RedditMentionsChart", () => ({
  default: ({ rawData = [], loading = false }) => (
    <div data-testid="reddit-chart">
      {loading ? "chart loading" : `chart with ${rawData.length} rows`}
    </div>
  ),
}));

// Grab the mocked hook functions so we can set return values
import { useRedditMentions } from "../../hooks/useRedditMentions";
import { usePricesSnapshot } from "../../hooks/usePricesSnapshot";
import { useMacroSnapshot } from "../../hooks/useMacroSnapshot";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading states when data is still loading", () => {
    useRedditMentions.mockReturnValue({
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
      meta: null,
      loading: true,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    // Left column loading messages
    expect(
      screen.getByText(/loading index fund mentions/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/loading prices/i)).toBeInTheDocument();
    expect(screen.getByText(/loading macro data/i)).toBeInTheDocument();

    // Chart should be in loading state via our mock
    expect(screen.getByTestId("reddit-chart")).toHaveTextContent(
      /chart loading/i
    );
  });

  it("renders spotlight, prices, macro snapshot and chart when data is available", () => {
    // Reddit mentions snapshot including an index fund
    useRedditMentions.mockReturnValue({
      rawData: [
        { ticker: "VTI", count: 5 },
        { ticker: "VOO", count: 2 },
        { ticker: "TSLA", count: 10 },
      ],
      meta: {
        generatedAt: "2025-11-18T12:00:00Z",
        windowDescription: "Last 24 hours",
      },
      loading: false,
    });

    // Prices snapshot
    usePricesSnapshot.mockReturnValue({
      data: [
        { ticker: "AAPL", price: 123.456, currency: "USD" },
        { ticker: "TSLA", price: 250.0, currency: "USD" },
      ],
      meta: {
        generatedAt: "2025-11-18T12:05:00Z",
      },
      loading: false,
    });

    // Macro series snapshot
    useMacroSnapshot.mockReturnValue({
      series: [
        {
          id: "CPIAUCSL",
          latest: 3.1,
          lastUpdated: "2025-11-01",
        },
        {
          id: "UNRATE",
          latest: 4.2,
          lastUpdated: "2025-11-01",
        },
        {
          id: "DFF",
          latest: 5.25,
          lastUpdated: "2025-11-01",
        },
      ],
      meta: {
        generatedAt: "2025-11-18T12:10:00Z",
      },
      loading: false,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    // Index fund spotlight should show VTI with mentions
    expect(screen.getByText("VTI")).toBeInTheDocument();
    expect(
      screen.getByText(/5 mentions in this snapshot/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /see more →/i })
    ).toBeInTheDocument();

    // Prices mini-table
    expect(
      screen.getByRole("heading", { name: /live prices \(snapshot\)/i })
    ).toBeInTheDocument();
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("123.46 USD")).toBeInTheDocument();

    // Macro snapshot tiles
    expect(screen.getByText(/cpi \(all items\)/i)).toBeInTheDocument();
    expect(screen.getByText("3.1")).toBeInTheDocument();
    expect(screen.getByText(/unemployment rate/i)).toBeInTheDocument();
    expect(screen.getByText("4.2%")).toBeInTheDocument();
    expect(screen.getByText(/fed funds rate/i)).toBeInTheDocument();
    expect(screen.getByText("5.25")).toBeInTheDocument();

    // Chart receives filteredRawData via our mock and should show row count
    const chart = screen.getByTestId("reddit-chart");
    expect(chart).toHaveTextContent("chart with 3 rows");

    // Snapshot window description
    expect(
      screen.getByText(/snapshot window: last 24 hours/i)
    ).toBeInTheDocument();

    // Last updated footer exists (exact date string is locale-dependent)
    expect(
      screen.getByText(/last updated:/i)
    ).toBeInTheDocument();
  });
});
