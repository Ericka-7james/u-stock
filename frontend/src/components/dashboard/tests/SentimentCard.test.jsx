import { render, screen, fireEvent, within } from "@testing-library/react";
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

    // "—" can appear more than once depending on layout; just assert it's present.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    expect(
      screen.getByText(/select a ticker to view sentiment\./i)
    ).toBeInTheDocument();

    // Sections should not render without a symbol/snapshot
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

    // Header
    expect(screen.getByText(/sentiment for/i)).toBeInTheDocument();
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);

    // Overall line
    expect(screen.getByText(/overall:/i)).toBeInTheDocument();
    expect(screen.getByText(/strongly bullish/i)).toBeInTheDocument();
    expect(screen.getByText(/\(score 5, from snapshot\)/i)).toBeInTheDocument();

    // Style + risk labels (avoid assuming unique)
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();

    // ALL mode sections visible (use headings to avoid matching dropdown items)
    expect(
      screen.getByRole("heading", { name: /price-based sentiment/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /volatility sentiment/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /technical pattern sentiment/i })
    ).toBeInTheDocument();

    // Section chips / labels (may appear in multiple places; assert >= 1)
    expect(screen.getAllByText("Bullish").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Calm").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Uptrend").length).toBeGreaterThan(0);
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

    expect(
      screen.queryByText(/how is sentiment calculated\?/i)
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/explain this sentiment card/i));

    expect(
      screen.getByText(/how is sentiment calculated\?/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/close explanation/i));

    expect(
      screen.queryByText(/how is sentiment calculated\?/i)
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

    // Initially ALL mode: headings present
    expect(
      screen.getByRole("heading", { name: /price-based sentiment/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /volatility sentiment/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /technical pattern sentiment/i })
    ).toBeInTheDocument();

    // Support BOTH implementations:
    // 1) <select aria-label="Sentiment view mode">
    // 2) custom button that opens a menu/listbox
    const modeControl =
      screen.queryByRole("combobox", { name: /sentiment view mode/i }) ||
      screen.getByLabelText(/sentiment view mode/i);

    // If it's a native select, change value directly
    if (modeControl.tagName.toLowerCase() === "select") {
      fireEvent.change(modeControl, { target: { value: "volatility" } });
    } else {
      // If it's a custom control: click to open, then click the option by role or text
      fireEvent.click(modeControl);

      // Try role=option first (some menus use it), else fallback to clicking text
      const opt =
        screen.queryByRole("option", { name: /volatility sentiment/i }) ||
        screen.queryByText(/volatility sentiment/i);

      if (opt) fireEvent.click(opt);
    }

    // After selecting Volatility mode:
    expect(
      screen.queryByRole("heading", { name: /price-based sentiment/i })
    ).not.toBeInTheDocument();

    // Keep Volatility heading visible
    expect(
      screen.getByRole("heading", { name: /volatility sentiment/i })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", { name: /technical pattern sentiment/i })
    ).not.toBeInTheDocument();
  });
});
