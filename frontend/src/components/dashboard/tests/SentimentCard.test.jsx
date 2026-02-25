// frontend/src/components/dashboard/tests/SentimentCard.test.jsx
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import SentimentCard from "../cards/SentimentCard.jsx";

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

describe("SentimentCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders placeholder when no symbol and not loading", () => {
    render(<SentimentCard symbol="" historyBySymbol={{}} loading={false} backendSnapshot={null} />);

    expect(screen.getByText(/sentiment for/i)).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    expect(screen.getByText(/select a ticker to view sentiment\./i)).toBeInTheDocument();

    expect(screen.queryByRole("heading", { name: /price-based sentiment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /volatility sentiment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /technical pattern sentiment/i })).not.toBeInTheDocument();
  });

  it("does not crash if historyBySymbol is null/undefined", () => {
    render(<SentimentCard symbol="AAPL" historyBySymbol={null} loading={false} backendSnapshot={null} />);

    expect(screen.getByText(/sentiment for/i)).toBeInTheDocument();
    expect(screen.getByText(/not enough history to compute sentiment yet/i)).toBeInTheDocument();
  });

  it("shows loading subtitle when loading is true", () => {
    render(<SentimentCard symbol="AAPL" historyBySymbol={{}} loading={true} backendSnapshot={null} />);

    expect(screen.getByText(/loading price & sentiment/i)).toBeInTheDocument();
  });

  it("renders backend snapshot overall line + style/risk chips + all sections in ALL mode", () => {
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

    render(<SentimentCard symbol="AAPL" historyBySymbol={{}} loading={false} backendSnapshot={backendSnapshot} />);

    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);

    expect(screen.getByText(/overall:/i)).toBeInTheDocument();
    expect(screen.getByText(/strongly bullish/i)).toBeInTheDocument();
    expect(screen.getByText(/\(score 5, from snapshot\)/i)).toBeInTheDocument();

    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();

    // headings are <h3> inside sections
    expect(screen.getByRole("heading", { level: 3, name: /price-based sentiment/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /volatility sentiment/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /technical pattern sentiment/i })).toBeInTheDocument();
  });

  it("opens and closes the help modal (close button + Escape)", () => {
    render(<SentimentCard symbol="AAPL" historyBySymbol={{}} loading={false} backendSnapshot={null} />);

    expect(screen.queryByText(/what does this “sentiment” mean\?/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/explain this sentiment card/i));

    // title is an <h3>, but role query is fine too
    expect(screen.getByText(/what does this “sentiment” mean\?/i)).toBeInTheDocument();

    // Escape closes
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByText(/what does this “sentiment” mean\?/i)).not.toBeInTheDocument();

    // Open again and close using X button
    fireEvent.click(screen.getByLabelText(/explain this sentiment card/i));
    fireEvent.click(screen.getByLabelText(/close explanation/i));

    expect(screen.queryByText(/what does this “sentiment” mean\?/i)).not.toBeInTheDocument();
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

    render(<SentimentCard symbol="AAPL" historyBySymbol={{}} loading={false} backendSnapshot={backendSnapshot} />);

    expect(screen.getByRole("heading", { level: 3, name: /price-based sentiment/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /volatility sentiment/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /technical pattern sentiment/i })).toBeInTheDocument();

    // Open dropdown
    const modeBtn = screen.getByRole("button", { name: /sentiment view mode/i });
    fireEvent.click(modeBtn);

    // Select Volatility Sentiment (option role)
    const opt = screen.getByRole("option", { name: /volatility sentiment/i });
    fireEvent.click(opt);

    // Now only volatility section should remain
    expect(screen.queryByRole("heading", { level: 3, name: /price-based sentiment/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /volatility sentiment/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: /technical pattern sentiment/i })).not.toBeInTheDocument();
  });
});