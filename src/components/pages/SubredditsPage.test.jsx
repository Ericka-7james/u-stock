import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ------------------------------------------------------------------

// Mock hook
vi.mock("../hooks/raw/useRedditMentions", () => ({
  useRedditMentions: vi.fn(),
}));

// Mock layout shell
vi.mock("../components/layout/AppShell", () => ({
  default: ({ children }) => (
    <div data-testid="app-shell-mock">{children}</div>
  ),
}));

// Mock config sources with deterministic arrays
vi.mock("../config/pricesSources", () => ({
  PRICE_SOURCES: [
    {
      id: "yfinance",
      name: "Yahoo Finance (yfinance)",
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
      name: "Yahoo Finance fundamentals",
      role: "primary",
      url: "https://yfinance-fundamentals.example",
      notes: "Basic ratios via Yahoo.",
    },
    {
      id: "fmp",
      name: "Financial Modeling Prep (FMP)",
      role: "secondary",
      url: "https://financialmodelingprep.com",
      notes: "SEC filings, extended ratios, peers.",
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
import { useRedditMentions } from "../hooks/raw/useRedditMentions";
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

    // Snapshot window text
    expect(screen.getByText(/snapshot window:/i)).toBeInTheDocument();
    expect(screen.getByText(/last 24 hours/i)).toBeInTheDocument();

    // Back link
    expect(
      screen.getByRole("link", { name: /back to dashboard/i })
    ).toBeInTheDocument();

    // Summary counts (match actual SubredditsPage text)
    const summary = screen
      .getByText(/configuration at a glance/i)
      .closest("section");
    const summaryText = summary.textContent;

    // Directly match rendered counts (18 tickers, 14 subs, 2 price, 2 fundamentals, 2 macro)
    expect(summaryText).toMatch(/18/);
    expect(summaryText).toMatch(/14/);
    expect(summaryText).toMatch(/2 price feeds/i);
    expect(summaryText).toMatch(/2 fundamentals apis/i);
    expect(summaryText).toMatch(/2 macro/i);
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

    //
    // Prices section
    //
    expect(
      screen.getByRole("heading", { name: /market prices/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/yahoo finance \(yfinance\)/i)
    ).toBeInTheDocument();

    expect(
      screen.getByText(/alpha vantage/i)
    ).toBeInTheDocument();

    //
    // Fundamentals section
    //
    expect(
      screen.getByRole("heading", { name: /fundamentals/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/yahoo finance fundamentals/i)
    ).toBeInTheDocument();

    expect(
      screen.getByText(/financial modeling prep \(fmp\)/i)
    ).toBeInTheDocument();

    //
    // Macro section
    //
    expect(
      screen.getByRole("heading", { name: /macro & state of the economy/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/fred/i)).toBeInTheDocument();

    //
    // Reddit communities
    //
    expect(
      screen.getByRole("heading", { name: /reddit communities/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/r\/stocks/i)).toBeInTheDocument();
    expect(screen.getByText(/r\/investing/i)).toBeInTheDocument();
    expect(screen.getByText(/r\/wallstreetbets/i)).toBeInTheDocument();

    // Tiers
    expect(screen.getAllByText(/core/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/high buzz/i).length).toBeGreaterThanOrEqual(1);

    // Links to each subreddit
    const subredditLinks = screen.getAllByRole("link", {
      name: /open subreddit →/i,
    });
    expect(subredditLinks.length).toBeGreaterThanOrEqual(3);

    expect(
      subredditLinks.some((link) =>
        /^https:\/\/www\.reddit\.com\/r\/[a-z0-9_]+/i.test(
          link.getAttribute("href") || ""
        )
      )
    ).toBe(true);
  });
});
