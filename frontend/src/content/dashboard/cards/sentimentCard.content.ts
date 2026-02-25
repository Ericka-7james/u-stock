// frontend/src/content/dashboard/cards/sentimentCard.content.ts

export const SENTIMENT_CARD_COPY = {
  modes: [
    { value: "ALL", label: "All" },
    { value: "PRICE", label: "Price-based Sentiment" },
    { value: "VOL", label: "Volatility Sentiment" },
    { value: "TECH", label: "Technical Pattern Sentiment" },
  ],

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
      scoreSuffixLocal: ")",
      scoreSuffixBackend: ", from snapshot)",
      stylePrefix: "Style:",
      riskPrefix: "Risk:",
      dot: " • ",
    },
  },

  help: {
    dialogAria: "Sentiment explanation",
    closeAria: "Close explanation",
    title: "What does this “Sentiment” mean?",

    p1: {
      a: "Right now, this card is ",
      strong1: "price-derived sentiment",
      b: " — it summarizes what the price has been doing recently. It does ",
      strong2: "not",
      c: " include news, social media, fundamentals, or macro data yet.",
    },

    bullets: [
      {
        strong: "Price-based",
        text: " looks at recent returns (1D, 5D, ~20D) and labels the move as bullish/bearish/neutral.",
      },
      {
        strong: "Volatility",
        text: " uses realized volatility from daily returns to describe whether price action is calm, normal, or stressed.",
      },
      {
        strong: "Technical",
        text: " compares the latest close to moving averages (20/50-day) to detect trend vs mixed/range behavior.",
      },
    ],

    note: {
      strong: "Exploration only.",
      text:
        " This is not a trading signal or investment advice. Next upgrades: combine price signals with news + social sentiment + fundamentals, and store decision logs with confidence + outcome tracking.",
    },
  },

  sections: {
    price: {
      title: "Price-based Sentiment",
      metricLabels: {
        change1d: "1D Change",
        change5d: "5D Change",
        change20d: "≈1M Change",
        rank20d: "20D Return Rank",
      },
    },
    vol: {
      title: "Volatility Sentiment",
      metricLabels: {
        realizedVol: "Realized Volatility",
        volRank: "Volatility Rank",
      },
    },
    tech: {
      title: "Technical Pattern Sentiment",
      metricLabels: {
        lastClose: "Last Close",
        ma20: "20-day MA",
        ma50: "50-day MA",
        rsi14: "RSI (14)",
        bbPos: "Bollinger Position",
      },
    },
  },

  dropdown: {
    aria: "Sentiment view mode",
    viewLabel: "View",
    modesAria: "Sentiment modes",
  },

  misc: {
    clickToLoad: "Click to load this ticker",
    pctileSuffix: " pctile",
  },

  // ✅ Centralized labels used by local fallback + small formatters
  labels: {
    notEnoughData: "Not enough data",

    price: {
      neutral: "Neutral",
      bullish: "Bullish",
      stronglyBullish: "Strongly Bullish",
      bearish: "Bearish",
      stronglyBearish: "Strongly Bearish",
    },

    vol: {
      calm: "Calm",
      normal: "Normal",
      elevated: "Elevated",
      stressed: "Stressed",
    },

    tech: {
      rangeMixed: "Range-Bound / Mixed",
      uptrend: "Uptrend",
      downtrend: "Downtrend",
      earlyUptrend: "Potential Early Uptrend",
      earlyBreakdown: "Potential Early Breakdown",
    },

    overall: {
      neutralMixed: "Neutral / Mixed",
      bullishTilt: "Bullish Tilt",
      stronglyBullish: "Strongly Bullish",
      bearishTilt: "Bearish Tilt",
      stronglyBearish: "Strongly Bearish",
    },

    bollinger: {
      nearUpper: "Near upper band",
      nearLower: "Near lower band",
      aboveMid: "Above mid band",
      belowMid: "Below mid band",
      aroundMid: "Around mid band",
    },
  },
} as const;