// src/components/dashboard/DashboardPage.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";

// 🔧 Mock hooks so we fully control the data/loading states
vi.mock("../../hooks/useJoinedMentions", () => ({
  useJoinedMentions: vi.fn(),
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
import { useJoinedMentions } from "../../hooks/useJoinedMentions";
import { usePricesSnapshot } from "../../hooks/usePricesSnapshot";
import { useMacroSnapshot } from "../../hooks/useMacroSnapshot";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading states when data is still loading", () => {
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

  it("renders prices, macro snapshot and chart when data is available", () => {
    // mock hooks — make sure these match your mocks above
    useJoinedMentions.mockReturnValue({
      rawData: [{ ticker: "TSLA", count: 3 }],
      meta: { generatedAt: "2025-11-18T17:05:00Z" },
      loading: false,
    });

    useJoinedMentions.mockReturnValue({
      rawData: [
        { ticker: "AAPL", count: 3 },
        { ticker: "TSLA", count: 1 },
        { ticker: "MSFT", count: 1 },
      ],
      meta: { windowDescription: "Last 24 hours" },
      loading: false,
    });

    usePricesSnapshot.mockReturnValue({
      data: [
        { ticker: "AAPL", price: 123.456, currency: "USD" },
        { ticker: "TSLA", price: 250.0, currency: "USD" },
      ],
      meta: { generatedAt: "2025-11-18T17:05:00Z" },
      loading: false,
    });

    useMacroSnapshot.mockReturnValue({
      series: [
        { id: "CPIAUCSL", latest: 3.1, lastUpdated: "2025-11-01" },
        { id: "UNRATE", latest: 4.2, lastUpdated: "2025-11-01" },
        { id: "DFF", latest: 5.25, lastUpdated: "2025-11-01" },
      ],
      loading: false,
    });

    render(<DashboardPage />);

    // We are no longer expecting the index spotlight (VTI)
    expect(screen.getByText(/Explore index funds/i)).toBeInTheDocument();

    // Prices should render
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("123.46")).toBeInTheDocument();

    // Macro tiles
    expect(screen.getByText("CPI (All items)")).toBeInTheDocument();
    expect(screen.getByText("3.1")).toBeInTheDocument();

    // Chart mock
    expect(screen.getByTestId("reddit-chart"))
      .toHaveTextContent("chart with 3 rows");
  });

    it("lets you switch to 'choose' mode and add ticker chips", () => {
      useJoinedMentions.mockReturnValue({
        rawData: [
          { ticker: "TSLA", count: 10 },
          { ticker: "AAPL", count: 5 },
        ],
        meta: { windowDescription: "Last 24 hours", generatedAt: new Date().toISOString() },
        loading: false,
      });

      usePricesSnapshot.mockReturnValue({
        data: [],
        meta: null,
        loading: false,
      });

      useMacroSnapshot.mockReturnValue({
        series: [],
        meta: null,
        loading: false,
      });

      render(
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      );

      // Switch the "View" select to "Choose…"
      const select = screen.getByLabelText(/view/i);
      fireEvent.change(select, { target: { value: "choose" } });

      // Type a ticker that exists in this snapshot and press Enter
      const input = screen.getByPlaceholderText(/type a ticker from this snapshot/i);
      fireEvent.change(input, { target: { value: "TSLA" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      // After adding, there should be a chip visible for TSLA
      expect(screen.getByRole("button", { name: /tsla/i })).toBeInTheDocument();

      // We should also see the helper text listing available tickers
      expect(
        screen.getByText(/available from this snapshot/i)
      ).toBeInTheDocument();
    });
});
