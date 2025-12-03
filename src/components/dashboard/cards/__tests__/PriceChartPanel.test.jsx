import { render, screen } from "@testing-library/react";
import PriceChartPanel from "../PriceChartPanel.jsx";

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

  it("renders title, subtitle, and ticker label", () => {
    render(<PriceChartPanel {...baseProps} />);

    expect(
      screen.getByText(/Price action viewer/i)
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Select a ticker or type to filter the universe\./i)
    ).toBeInTheDocument();

    // Use exact match for the label text to avoid the subtitle "ticker" collision
    expect(screen.getByText("Ticker")).toBeInTheDocument();
  });

  it("renders the help icon with correct aria-label", () => {
    render(<PriceChartPanel {...baseProps} />);

    // HelpTooltip renders a button with aria-label equal to the title
    const helpButton = screen.getByLabelText(
      /What is the Price action viewer\?/i
    );
    expect(helpButton).toBeInTheDocument();
    expect(helpButton).toHaveClass("help-icon-button");
  });

  it("renders the chart wrapper via PriceChart", () => {
    const { container } = render(<PriceChartPanel {...baseProps} />);

    const wrapper = container.querySelector(".chart-wrapper");
    expect(wrapper).not.toBeNull();
  });
});
