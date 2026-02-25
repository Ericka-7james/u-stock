// frontend/src/components/dashboard/tests/SentimentCard.test.jsx
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

/* ---------------------------------------------------------
   MOCK DashboardCard (fixes "Element type is invalid" crash)
   SentimentCard imports: "./shared/DashboardCard.jsx"
   From this test file, that resolves to: "../cards/shared/DashboardCard.jsx"
---------------------------------------------------------- */
vi.mock("../cards/shared/DashboardCard.jsx", () => ({
  default: ({ children, className = "" }) => (
    <section data-testid="DashboardCard" className={className}>
      {children}
    </section>
  ),
}));

/* -----------------------------------------
   Stable COPY mock (tests should not break on copy tweaks)
------------------------------------------ */
vi.mock("../../../content/dashboard/cards/sentimentCard.content.ts", () => ({
  SENTIMENT_CARD_COPY: {
    header: {
      titlePrefix: "Sentiment for",
      tickerFallback: "—",
      helpButtonAria: "Explain this sentiment card",
      subtitles: {
        noSymbol: "Select a ticker to view sentiment.",
        loading: "Loading price & sentiment…",
        notEnoughHistory: "Not enough history to compute sentiment yet.",
        overallPrefix: "Overall:",
        scorePrefix: "(score",
        scoreSuffixBackend: ", from snapshot)",
        scoreSuffixLocal: ", computed locally)",
        stylePrefix: "Style:",
        dot: " · ",
        riskPrefix: "Risk:",
      },
    },

    dropdown: {
      aria: "Sentiment view mode",
      viewLabel: "Sentiment View Mode",
      modesAria: "Sentiment modes",
    },

    modes: [
      { value: "ALL", label: "All" },
      { value: "PRICE", label: "Price-based Sentiment" },
      { value: "VOL", label: "Volatility Sentiment" },
      { value: "TECH", label: "Technical Pattern Sentiment" },
    ],

    help: {
      dialogAria: "Sentiment explanation",
      closeAria: "Close explanation",
      title: "What does this “sentiment” mean?",
      p1: {
        a: "We summarize ",
        strong1: "price",
        b: ", ",
        strong2: "volatility",
        c: ", and patterns.",
      },
      bullets: [
        { strong: "Price:", text: "Directional moves." },
        { strong: "Volatility:", text: "Stability vs stress." },
        { strong: "Technical:", text: "Trend/range signals." },
      ],
      note: { strong: "Note:", text: "Not advice." },
    },

    sections: {
      price: {
        title: "Price-based Sentiment",
        metricLabels: {
          change1d: "1d",
          change5d: "5d",
          change20d: "20d",
          rank20d: "20d rank",
        },
      },
      vol: {
        title: "Volatility Sentiment",
        metricLabels: {
          realizedVol: "Realized vol",
          volRank: "Vol rank",
        },
      },
      tech: {
        title: "Technical Pattern Sentiment",
        metricLabels: {
          lastClose: "Last close",
          ma20: "MA20",
          ma50: "MA50",
          rsi14: "RSI14",
          bbPos: "BB pos",
        },
      },
    },

    labels: {
      notEnoughData: "Not enough data",
      bollinger: {
        nearUpper: "Near upper band",
        nearLower: "Near lower band",
        aboveMid: "Above mid",
        belowMid: "Below mid",
        aroundMid: "Around mid",
      },
      price: {
        stronglyBullish: "Strongly Bullish",
        bullish: "Bullish",
        stronglyBearish: "Strongly Bearish",
        bearish: "Bearish",
      },
      vol: {
        calm: "Calm",
        elevated: "Elevated",
        stressed: "Stressed",
        normal: "Normal",
      },
      tech: {
        uptrend: "Uptrend",
        downtrend: "Downtrend",
        earlyUptrend: "Early Uptrend",
        earlyBreakdown: "Early Breakdown",
        rangeMixed: "Range / Mixed",
      },
      overall: {
        stronglyBullish: "Strongly Bullish",
        bullishTilt: "Bullish Tilt",
        neutralMixed: "Neutral / Mixed",
        bearishTilt: "Bearish Tilt",
        stronglyBearish: "Strongly Bearish",
      },
    },

    misc: {
      pctileSuffix: " pctile",
    },
  },
}));

// IMPORTANT: import AFTER mocks
import SentimentCard from "../cards/SentimentCard.jsx";

describe("SentimentCard", () => {
  afterEach(() => cleanup());

  it("renders placeholder when no symbol and not loading", () => {
    render(<SentimentCard symbol="" historyBySymbol={{}} loading={false} backendSnapshot={null} />);

    expect(screen.getByText(/sentiment for/i)).toBeInTheDocument();
    expect(screen.getByText(/select a ticker to view sentiment\./i)).toBeInTheDocument();
  });

  it("does not crash if historyBySymbol is null/undefined", () => {
    render(<SentimentCard symbol="AAPL" historyBySymbol={null} loading={false} backendSnapshot={null} />);
    expect(screen.getByText(/not enough history to compute sentiment yet/i)).toBeInTheDocument();
  });

  it("shows loading subtitle when loading is true", () => {
    render(<SentimentCard symbol="AAPL" historyBySymbol={{}} loading={true} backendSnapshot={null} />);
    expect(screen.getByText(/loading price & sentiment/i)).toBeInTheDocument();
  });

  it("renders backend snapshot overall line + style/risk chips + sections", () => {
    const backendSnapshot = {
      price_based: { label: "Bullish", change_1d: 1.23, change_5d: 3.45, change_20d: 5.67 },
      volatility: { label: "Calm", realized_vol: 15.2 },
      technical: { label: "Uptrend", last_close: 100, ma_short: 98, ma_long: 95, rsi_14: 60, bb_position: 0.3 },
      risk: { label: "Moderate" },
      style: { label: "Growth" },
      cross_section: { ret_20d_pct: 0.85, realized_vol_pct: 0.4 },
      overall_label: "Strongly Bullish",
      overall_score: 5,
    };

    render(<SentimentCard symbol="AAPL" historyBySymbol={{}} loading={false} backendSnapshot={backendSnapshot} />);

    expect(screen.getByText(/overall:/i)).toBeInTheDocument();
    expect(screen.getByText(/strongly bullish/i)).toBeInTheDocument();
    expect(screen.getByText(/growth/i)).toBeInTheDocument();
    expect(screen.getByText(/moderate/i)).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 3, name: /price-based sentiment/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /volatility sentiment/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /technical pattern sentiment/i })).toBeInTheDocument();
  });

  it("opens and closes the help modal (close button + Escape)", () => {
    render(<SentimentCard symbol="AAPL" historyBySymbol={{}} loading={false} backendSnapshot={null} />);

    fireEvent.click(screen.getByLabelText(/explain this sentiment card/i));
    expect(screen.getByRole("dialog", { name: /sentiment explanation/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /sentiment explanation/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/explain this sentiment card/i));
    fireEvent.click(screen.getByLabelText(/close explanation/i));
    expect(screen.queryByRole("dialog", { name: /sentiment explanation/i })).not.toBeInTheDocument();
  });

  it("closes help modal when clicking backdrop, but not when clicking inside popover", () => {
    render(<SentimentCard symbol="AAPL" historyBySymbol={{}} loading={false} backendSnapshot={null} />);

    fireEvent.click(screen.getByLabelText(/explain this sentiment card/i));
    const dialog = screen.getByRole("dialog", { name: /sentiment explanation/i });

    fireEvent.click(screen.getByText(/not advice/i));
    expect(screen.getByRole("dialog", { name: /sentiment explanation/i })).toBeInTheDocument();

    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog", { name: /sentiment explanation/i })).not.toBeInTheDocument();
  });

  it("mode control filters sections when selecting Volatility Sentiment", () => {
    const backendSnapshot = {
      price_based: { label: "Bullish", change_1d: 1.23, change_5d: 3.45, change_20d: 5.67 },
      volatility: { label: "Calm", realized_vol: 15.2 },
      technical: { label: "Uptrend", last_close: 100, ma_short: 98, ma_long: 95 },
      cross_section: {},
      overall_label: "Bullish Tilt",
      overall_score: 2,
    };

    render(<SentimentCard symbol="AAPL" historyBySymbol={{}} loading={false} backendSnapshot={backendSnapshot} />);

    fireEvent.click(screen.getByRole("button", { name: /sentiment view mode/i }));
    fireEvent.click(screen.getByRole("option", { name: /volatility sentiment/i }));

    expect(screen.queryByRole("heading", { level: 3, name: /price-based sentiment/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /volatility sentiment/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: /technical pattern sentiment/i })).not.toBeInTheDocument();
  });
});