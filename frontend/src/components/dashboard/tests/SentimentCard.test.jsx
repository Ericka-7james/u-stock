import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import SentimentCard from "../cards/SentimentCard.jsx";

describe("SentimentCard", () => {
  it("renders placeholder when no symbol and not loading", () => {
    render(
      <SentimentCard
        symbol=""
        historyBySymbol={{}}
        loading={false}
        backendSnapshot={null}
      />
    );

    expect(screen.getByText(/sentiment for/i)).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    expect(
      screen.getByText(/select a ticker to view sentiment\./i)
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", { name: /price-based sentiment/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /volatility sentiment/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /technical pattern sentiment/i })
    ).not.toBeInTheDocument();
  });

  it("does not crash if historyBySymbol is null/undefined", () => {
    render(
      <SentimentCard
        symbol="AAPL"
        historyBySymbol={null}
        loading={false}
        backendSnapshot={null}
      />
    );

    // should render, but not enough data
    expect(screen.getByText(/sentiment for/i)).toBeInTheDocument();
    expect(
      screen.getByText(/not enough history to compute sentiment yet/i)
    ).toBeInTheDocument();
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
      screen.getByText(/loading price & sentiment/i)
    ).toBeInTheDocument();
  });

  it("renders backend snapshot overall line + all sections in ALL mode", () => {
    const backendSnapshot = {
      price_based: {
        label: "Bullish",
        change_1d: 1.23,
        change_5d: 3.45,
        change_20d: 5.67,
      },
      volatility: { label: "Calm", realized_vol: 15.2 },
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
      cross_section: { ret_20d_pct: 0.85, realized_vol_pct: 0.4 },
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

    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);

    expect(screen.getByText(/overall:/i)).toBeInTheDocument();
    expect(screen.getByText(/strongly bullish/i)).toBeInTheDocument();
    expect(screen.getByText(/\(score 5, from snapshot\)/i)).toBeInTheDocument();

    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /price-based sentiment/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /volatility sentiment/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /technical pattern sentiment/i })
    ).toBeInTheDocument();
  });

  it("opens and closes the help modal (close button + Escape)", () => {
    render(
      <SentimentCard
        symbol="AAPL"
        historyBySymbol={{}}
        loading={false}
        backendSnapshot={null}
      />
    );

    expect(
      screen.queryByRole("heading", { name: /what does this “sentiment” mean\?/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/explain this sentiment card/i));

    expect(
      screen.getByRole("heading", { name: /what does this “sentiment” mean\?/i })
    ).toBeInTheDocument();

    // Escape closes
    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("heading", { name: /what does this “sentiment” mean\?/i })
    ).not.toBeInTheDocument();

    // Open again and close using X button
    fireEvent.click(screen.getByLabelText(/explain this sentiment card/i));
    fireEvent.click(screen.getByLabelText(/close explanation/i));

    expect(
      screen.queryByRole("heading", { name: /what does this “sentiment” mean\?/i })
    ).not.toBeInTheDocument();
  });

  it("mode control filters sections when selecting Volatility Sentiment", () => {
    const backendSnapshot = {
      price_based: { label: "Bullish", change_1d: 1.23, change_5d: 3.45, change_20d: 5.67 },
      volatility: { label: "Calm", realized_vol: 15.2 },
      technical: { label: "Uptrend", last_close: 100, ma_short: 98, ma_long: 95 },
      risk: null,
      style: null,
      cross_section: {},
      overall_label: "Bullish Tilt",
      overall_score: 2,
    };

    render(
      <SentimentCard
        symbol="AAPL"
        historyBySymbol={{}}
        loading={false}
        backendSnapshot={backendSnapshot}
      />
    );

    expect(
      screen.getByRole("heading", { name: /price-based sentiment/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /volatility sentiment/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /technical pattern sentiment/i })
    ).toBeInTheDocument();

    // Open dropdown
    const modeBtn = screen.getByRole("button", { name: /sentiment view mode/i });
    fireEvent.click(modeBtn);

    // Select Volatility Sentiment
    const opt = screen.getByRole("option", { name: /volatility sentiment/i });
    fireEvent.click(opt);

    // Now only volatility section should remain
    expect(
      screen.queryByRole("heading", { name: /price-based sentiment/i })
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /volatility sentiment/i })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", { name: /technical pattern sentiment/i })
    ).not.toBeInTheDocument();
  });
});
