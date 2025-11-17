import { TRACKED_TICKERS } from "../config/trackedTickers.js";

// Match things like: $TSLA, $AAPL, $SPY
export const TICKER_REGEX = /\$[A-Z]{1,5}\b/g;

/**
 * Extract tickers from a single text string.
 * - Finds $TICKER mentions (e.g., $TSLA)
 * - Also finds tracked tickers (e.g., TSLA) even without the '$'
 * Returns array like ["TSLA", "AAPL"]
 */
export function extractTickersFromText(text) {
  if (!text) return [];

  const found = new Set();

  // 1) $TICKER mentions
  const matches = text.match(TICKER_REGEX) || [];
  for (const m of matches) {
    const ticker = m.slice(1).toUpperCase(); // strip '$'
    found.add(ticker);
  }

  // 2) Bare tracked tickers (TSLA, AAPL, etc.)
  if (TRACKED_TICKERS && TRACKED_TICKERS.length > 0) {
    const upperText = text.toUpperCase();

    for (const ticker of TRACKED_TICKERS) {
      const upperTicker = ticker.toUpperCase();

      // Require whole-word-ish match to avoid false positives in random strings
      const pattern = new RegExp(`\\b${upperTicker}\\b`, "g");
      if (pattern.test(upperText)) {
        found.add(upperTicker);
      }
    }
  }

  return Array.from(found);
}

/**
 * Given an array of Reddit post objects, tally ticker mentions.
 * Each post should have at least .title and .selftext
 *
 * options:
 * - trackedOnly: if true, only keep tickers in TRACKED_TICKERS
 */
export function tallyTickerMentions(posts, options = {}) {
  const { trackedOnly = false } = options;
  const counts = {}; // { TICKER: count }

  for (const post of posts) {
    const textsToScan = [post.title, post.selftext];

    for (const text of textsToScan) {
      const tickers = extractTickersFromText(text);

      for (const t of tickers) {
        const upper = t.toUpperCase();

        if (trackedOnly && !TRACKED_TICKERS.includes(upper)) {
          continue;
        }

        counts[upper] = (counts[upper] || 0) + 1;
      }
    }
  }

  return counts;
}

/**
 * Turn { TICKER: count } into sorted array [{ ticker, count }]
 */
export function sortTickerCounts(counts) {
  return Object.entries(counts)
    .map(([ticker, count]) => ({ ticker, count }))
    .sort((a, b) => b.count - a.count);
}
