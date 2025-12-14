import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PriceChartPanel from "../cards/PriceChartPanel.jsx";

/**
 * Mock child components so we only test PriceChartPanel wiring
 */
vi.mock("../../common/SearchableTickerDropdown.jsx", () => ({
  default: ({ currentTicker }) => (
    <div data-testid="ticker-dropdown">
      Dropdown: {currentTicker || "none"}
    </div>
  ),
}));

vi.mock("../../common/HelpTooltip.jsx", () => ({
  default: ({ title, children }) => (
    <button aria-label={title} data-testid="help-tooltip">
      ?
      <div hidden>{children}</div>
    </button>
  ),
}));

vi.mock("../cards/PriceChart.jsx", () => ({
  default: ({ ticker, data, loading }) => (
    <div data-testid="price-chart">
      Chart: {ticker} | points: {data?.length ?? 0} | loading:{" "}
      {String(loading)}
    </div>
  ),
}));

describe("PriceChartPanel", () => {
  const baseProps = {
    allTickers: ["AAPL", "MSFT", "TSLA"],
    currentTicker: "AAPL",
    onSelectTicker: vi.fn(),
    currentSeries: [
      { dateLabel: "2024-01-01", close: 100 },
      { dateLabel: "2024-01-02", close: 101 },
    ],
    loading: false,
    pricesMeta: { generatedAt: "2024-01-03T12:00:00Z" },
  };

  it("renders title and subtitle text", () => {
    render(<PriceChartPanel {...baseProps} />);

    expect(
      screen.getByRole("heading", { name: /price action viewer/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/select a ticker or type to filter the universe/i)
    ).toBeInTheDocument();
  });

  it("renders HelpTooltip with correct aria-label", () => {
    render(<PriceChartPanel {...baseProps} />);

    const helpButton = screen.getByLabelText(
      /what is the price action viewer\?/i
    );

    expect(helpButton).toBeInTheDocument();
    expect(helpButton).toHaveAttribute("data-testid", "help-tooltip");
  });

  it("renders SearchableTickerDropdown with current ticker", () => {
    render(<PriceChartPanel {...baseProps} />);

    expect(screen.getByTestId("ticker-dropdown")).toHaveTextContent(
      "AAPL"
    );
  });

  it("passes props through to PriceChart", () => {
    render(<PriceChartPanel {...baseProps} />);

    const chart = screen.getByTestId("price-chart");
    expect(chart).toHaveTextContent("Chart: AAPL");
    expect(chart).toHaveTextContent("points: 2");
    expect(chart).toHaveTextContent("loading: false");
  });

  it("handles empty series + loading state", () => {
    render(
      <PriceChartPanel
        {...baseProps}
        currentSeries={[]}
        loading={true}
      />
    );

    const chart = screen.getByTestId("price-chart");
    expect(chart).toHaveTextContent("points: 0");
    expect(chart).toHaveTextContent("loading: true");
  });
});
