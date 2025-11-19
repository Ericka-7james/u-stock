// pricesSources.js
export const PRICE_SOURCES = [
  {
    id: "yfinance",
    name: "Yahoo Finance (yfinance)",
    role: "Primary price feed",
    notes: "Free, no key, used for core OHLC + fundamentals.",
    url: "https://pypi.org/project/yfinance/",
  },
  {
    id: "alphaVantage",
    name: "Alpha Vantage",
    role: "Backup price API",
    notes: "Free tier, rate-limited; we cache responses.",
    url: "https://www.alphavantage.co/",
  },
];
