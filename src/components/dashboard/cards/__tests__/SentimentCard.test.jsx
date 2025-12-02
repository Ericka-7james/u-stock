import { render, screen, fireEvent } from "@testing-library/react";
import SentimentCard from "../SentimentCard.jsx";

describe("SentimentCard", () => {
  it("renders placeholder when no symbol and not loading", () => {
    const { queryByText } = render(
      <SentimentCard
        symbol=""
        historyBySymbol={{}}
        loading={false}
        backendSnapshot={null}
      />
    );

    // Header with placeholder ticker
    expect(screen.getByText(/Sentiment for/i)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();

    // Subtitle instructing to select a ticker
    expect(
      screen.getByText(/Select a ticker to view sentiment\./i)
    ).toBeInTheDocument();

    // Body sections shouldn't render without data
    expect(
      queryByText(/Price-based Sentiment/i)
    ).not.toBeInTheDocument();
    expect(
      queryByText(/Volatility Sentiment/i)
    ).not.toBeInTheDocument();
    expect(
      queryByText(/Technical Pattern Sentiment/i)
    ).not.toBeInTheDocument();
  });

  it("shows loading subtitle when loading is true", () => {
    render(
      <SentimentCard
        symbol="AAPL"
        historyBySymbol={{}}
        loading={true}
        backendSnapshot={null}
      />
    );

    expect(
      screen.getByText(/Loading price & sentiment…/i)
    ).toBeInTheDocument();
  });

  it("renders backend snapshot overall text and sentiment sections in ALL mode", () => {
    const backendSnapshot = {
      price_based: {
        label: "Bullish",
        change_1d: 1.23,
        change_5d: 3.45,
        change_20d: 5.67,
      },
      volatility: {
        label: "Calm",
        realized_vol: 15.2,
      },
      technical: {
        label: "Uptrend",
        last_close: 100,
        ma_short: 98,
        ma_long: 95,
        rsi_14: 60,
        bb_position: 0.3,
      },
      risk: { label: "Moderate" },
      style: { label: "Growth" },
      cross_section: {
        ret_20d_pct: 0.85,
        realized_vol_pct: 0.4,
      },
      overall_label: "Strongly Bullish",
      overall_score: 5,
    };

    render(
      <SentimentCard
        symbol="AAPL"
        historyBySymbol={{}}
        loading={false}
        backendSnapshot={backendSnapshot}
      />
    );

    // Header
    expect(
      screen.getByText(/Sentiment for/i)
    ).toBeInTheDocument();
    expect(screen.getByText("AAPL")).toBeInTheDocument();

    // Overall line
    expect(screen.getByText(/Overall:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Strongly Bullish/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\(score 5, from snapshot\)/i)
    ).toBeInTheDocument();

    // Style + risk chips (backend-specific)
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();

    // Sections: ALL mode should show all three
    expect(
      screen.getByText(/Price-based Sentiment/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Volatility Sentiment/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Technical Pattern Sentiment/i)
    ).toBeInTheDocument();

    // Chips per section
    expect(screen.getByText("Bullish")).toBeInTheDocument();
    expect(screen.getByText("Calm")).toBeInTheDocument();
    expect(screen.getByText("Uptrend")).toBeInTheDocument();
  });

  it("opens and closes the help popover", () => {
    render(
      <SentimentCard
        symbol="AAPL"
        historyBySymbol={{}}
        loading={false}
        backendSnapshot={null}
      />
    );

    // Initially no help title
    expect(
      screen.queryByText(/How is sentiment calculated\?/i)
    ).not.toBeInTheDocument();

    // Click the help icon button
    const helpButton = screen.getByLabelText(
      /Explain this sentiment card/i
    );
    fireEvent.click(helpButton);

    // Popover should appear
    expect(
      screen.getByText(/How is sentiment calculated\?/i)
    ).toBeInTheDocument();

    // Close via the close button
    const closeButton = screen.getByLabelText(/Close explanation/i);
    fireEvent.click(closeButton);

    // Popover should be gone
    expect(
      screen.queryByText(/How is sentiment calculated\?/i)
    ).not.toBeInTheDocument();
  });

  it("mode dropdown filters sections when selecting Volatility Sentiment", () => {
    const backendSnapshot = {
      price_based: {
        label: "Bullish",
        change_1d: 1.23,
        change_5d: 3.45,
        change_20d: 5.67,
      },
      volatility: {
        label: "Calm",
        realized_vol: 15.2,
      },
      technical: {
        label: "Uptrend",
        last_close: 100,
        ma_short: 98,
        ma_long: 95,
      },
      risk: null,
      style: null,
      cross_section: {},
      overall_label: "Bullish Tilt",
      overall_score: 2,
    };

    const { queryByText } = render(
      <SentimentCard
        symbol="AAPL"
        historyBySymbol={{}}
        loading={false}
        backendSnapshot={backendSnapshot}
      />
    );

    // ALL mode: all three sections visible
    expect(
      screen.getByText(/Price-based Sentiment/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Volatility Sentiment/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Technical Pattern Sentiment/i)
    ).toBeInTheDocument();

    // Open dropdown
    const modeButton = screen.getByLabelText(
      /Sentiment view mode/i
    );
    fireEvent.click(modeButton);

    // Click the option "Volatility Sentiment"
    const volOption = screen.getByRole("option", {
      name: /Volatility Sentiment/i,
    });
    fireEvent.click(volOption);

    // Now only volatility section should remain
    expect(
      queryByText(/Price-based Sentiment/i)
    ).not.toBeInTheDocument();

    // Section heading (not the dropdown label)
    expect(
      screen.getByRole("heading", { name: /Volatility Sentiment/i })
    ).toBeInTheDocument();

    expect(
      queryByText(/Technical Pattern Sentiment/i)
    ).not.toBeInTheDocument();
  });
});
