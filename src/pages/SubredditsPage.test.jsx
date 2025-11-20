// src/pages/SubredditsPage.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ------------------------------------------------------------------

// Mock hook
vi.mock("../hooks/useRedditMentions", () => ({
  useRedditMentions: vi.fn(),
}));

// Mock layout shell
vi.mock("../components/layout/AppShell", () => ({
  default: ({ children }) => (
    <div data-testid="app-shell-mock">{children}</div>
  ),
}));

// Mock config sources with small deterministic arrays
vi.mock("../config/pricesSources", () => ({
  PRICE_SOURCES: [
    {
      id: "yfinance",
      name: "Yahoo Finance",
      role: "primary",
      url: "https://yfinance-docs.example",
      notes: "Free EOD prices.",
    },
    {
      id: "alpha-vantage",
      name: "Alpha Vantage",
      role: "secondary",
      url: "https://alpha-vantage-docs.example",
      notes: "Free tier, limited calls.",
    },
  ],
}));

vi.mock("../config/fundamentalsSources", () => ({
  FUNDAMENTAL_SOURCES: [
    {
      id: "yfinance-info",
      name: "yfinance .info",
      role: "primary",
      url: "https://yfinance-fundamentals.example",
      notes: "Basic ratios via Yahoo.",
    },
  ],
}));

vi.mock("../config/macroSources", () => ({
  MACRO_SOURCES: [
    {
      id: "fred",
      name: "FRED",
      role: "macro",
      url: "https://fred.stlouisfed.org/",
      notes: "US macroeconomic data.",
    },
  ],
}));

vi.mock("../config/redditSources", () => ({
  REDDIT_SOURCES: [
    { subreddit: "stocks", tier: "core", notes: "Broad equity discussion." },
    { subreddit: "investing", tier: "core" },
    { subreddit: "wallstreetbets", tier: "noise", notes: "High-volatility sentiment." },
  ],
}));

vi.mock("../config/trackedTickers", () => ({
  TRACKED_TICKERS: ["AAPL", "MSFT", "TSLA", "SPY"],
}));

// Import after mocks
import { useRedditMentions } from "../hooks/useRedditMentions";
import SubredditsPage from "./SubredditsPage";

describe("SubredditsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders hero, back link, and summary counts", () => {
    useRedditMentions.mockReturnValue({
      meta: { windowDescription: "Last 24 hours" },
      loading: false,
    });

    render(
      <MemoryRouter>
        <SubredditsPage />
      </MemoryRouter>
    );

    // Hero title
    expect(
      screen.getByRole("heading", { name: /data sources & communities/i })
    ).toBeInTheDocument();

    // Snapshot window
    expect(
      screen.getByText(/snapshot window:/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/last 24 hours/i)
    ).toBeInTheDocument();

    // Back link
    expect(
      screen.getByRole("link", { name: /back to dashboard/i })
    ).toBeInTheDocument();

    // Summary card text includes our mocked counts:
    // trackedTickers: 4
    // reddit communities: 3
    // price sources: 2
    // fundamental sources: 1
    // macro sources: 1
    const summary = screen
      .getByText(/configuration at a glance/i)
      .closest("section");
    expect(summary).toBeInTheDocument();
    const summaryText = summary.textContent;

    expect(summaryText).toMatch(/4/); // tickers
    expect(summaryText).toMatch(/3/); // Reddit communities
    expect(summaryText).toMatch(/2/); // price feeds
    expect(summaryText).toMatch(/1/); // fundamentals
    // second "1" for macro; we're fine just checking presence
  });

  it("shows loading note when Reddit metadata is loading", () => {
    useRedditMentions.mockReturnValue({
      meta: null,
      loading: true,
    });

    render(
      <MemoryRouter>
        <SubredditsPage />
      </MemoryRouter>
    );

    expect(
      screen.getByText(/loading live snapshot metadata from reddit/i)
    ).toBeInTheDocument();
  });

  it("renders lists for prices, fundamentals, macro, and Reddit communities", () => {
    useRedditMentions.mockReturnValue({
      meta: null,
      loading: false,
    });

    render(
      <MemoryRouter>
        <SubredditsPage />
      </MemoryRouter>
    );

    // Prices section
    expect(
      screen.getByRole("heading", { name: /market prices/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/yahoo finance/i)).toBeInTheDocument();
    expect(screen.getByText(/alpha vantage/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/api docs →/i)[0]
    ).toBeInTheDocument();

    // Fundamentals section
    expect(
      screen.getByRole("heading", { name: /fundamentals/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/yfinance \.info/i)).toBeInTheDocument();

    // Macro section
    expect(
      screen.getByRole("heading", { name: /macro & state of the economy/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/fred/i)).toBeInTheDocument();

    // Reddit communities section
    expect(
      screen.getByRole("heading", { name: /reddit communities/i })
    ).toBeInTheDocument();

    // All three mocked subs should render with r/ prefix
    expect(screen.getByText(/r\/stocks/i)).toBeInTheDocument();
    expect(screen.getByText(/r\/investing/i)).toBeInTheDocument();
    expect(screen.getByText(/r\/wallstreetbets/i)).toBeInTheDocument();

    // Tiers as pills
    expect(screen.getAllByText(/core/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/noise/i)).toBeInTheDocument();

    // Links to Reddit subs should be present
    const subredditLinks = screen.getAllByRole("link", {
      name: /open subreddit →/i,
    });
    expect(subredditLinks.length).toBe(3);

    // Check that at least one of them has the expected Reddit href shape
    expect(
      subredditLinks.some((link) =>
        link.getAttribute("href")?.match(
          /^https:\/\/www\.reddit\.com\/r\/[a-z0-9_]+\/?/i
        )
      )
    ).toBe(true);
  });
});
