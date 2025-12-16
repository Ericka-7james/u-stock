// src/lib/redditMentions.test.js

// Mock the tracked tickers so tests are deterministic.
// IMPORTANT: this path string must match what redditMentions.js uses.
vi.mock("../config/raw/trackedTickers.js", () => ({
  TRACKED_TICKERS: ["AAPL", "TSLA", "SPY"],
}));

import {
  TICKER_REGEX,
  extractTickersFromText,
  tallyTickerMentions,
  sortTickerCounts,
} from "./redditMentions";

describe("redditMentions utilities", () => {
  describe("TICKER_REGEX", () => {
    it("matches $TICKER patterns with 1–5 uppercase letters", () => {
      const text = "I like $TSLA and $AAPL but not $TSLAX or $aapl.";
      const matches = text.match(TICKER_REGEX) || [];

      // Your regex is /\$[A-Z]{1,5}\b/g, so it correctly matches:
      // $TSLA (4 letters), $AAPL (4), and $TSLAX (5).
      // It should NOT match lowercase $aapl.
      expect(matches).toEqual(["$TSLA", "$AAPL", "$TSLAX"]);
    });
  });

  describe("extractTickersFromText", () => {
    it("returns empty array for falsy input", () => {
      expect(extractTickersFromText("")).toEqual([]);
      expect(extractTickersFromText(null)).toEqual([]);
      expect(extractTickersFromText(undefined)).toEqual([]);
    });

    it("extracts tickers from $TICKER mentions", () => {
      const text = "Thinking about $TSLA and $AAPL today.";
      const result = extractTickersFromText(text);

      expect(result).toEqual(expect.arrayContaining(["TSLA", "AAPL"]));
    });

    it("extracts bare tracked tickers (no $) from text", () => {
      const text = "tsla is wild but I also like AAPL and SPY.";
      const result = extractTickersFromText(text);

      // We mocked TRACKED_TICKERS to ["AAPL", "TSLA", "SPY"]
      expect(result).toEqual(
        expect.arrayContaining(["TSLA", "AAPL", "SPY"])
      );
    });

    it("does not include untracked bare tickers", () => {
      const text = "MSFT is cool but not in our tracked list.";
      const result = extractTickersFromText(text);

      expect(result).toEqual([]); // MSFT is not in mocked TRACKED_TICKERS
    });

    it("returns unique tickers per text (no duplicates)", () => {
      const text = "$TSLA tsla TSLA $TSLA again";
      const result = extractTickersFromText(text);

      expect(result).toEqual(["TSLA"]);
    });
  });

  describe("tallyTickerMentions", () => {
    it("tallies ticker mentions across posts (title + selftext)", () => {
      const posts = [
        {
          title: "Loading up on $TSLA and AAPL",
          selftext: "TSLA is my largest position.",
        },
        {
          title: "SPY vs TSLA?",
          selftext: "I think $SPY is safer than $TSLA.",
        },
      ];

      const counts = tallyTickerMentions(posts);

      // TSLA appears once in EACH of the 4 texts:
      // - post[0].title
      // - post[0].selftext
      // - post[1].title
      // - post[1].selftext
      // so total = 4
      expect(counts.TSLA).toBe(4);

      // AAPL appears once (post[0].title)
      expect(counts.AAPL).toBe(1);

      // SPY appears in post[1].title and post[1].selftext => 2
      expect(counts.SPY).toBe(2);
    });

    it("respects trackedOnly option", () => {
      const posts = [
        {
          title: "MSFT vs AAPL",
          selftext: "I like MSFT and $AAPL both.",
        },
      ];

      const countsAll = tallyTickerMentions(posts, { trackedOnly: false });
      const countsTrackedOnly = tallyTickerMentions(posts, {
        trackedOnly: true,
      });

      // With our mock, only AAPL is tracked
      expect(countsAll).toHaveProperty("AAPL");
      // MSFT is untracked, so should not appear when trackedOnly = true
      expect(countsTrackedOnly).toHaveProperty("AAPL");
      expect(countsTrackedOnly).not.toHaveProperty("MSFT");
    });
  });

  describe("sortTickerCounts", () => {
    it("converts an object to a sorted array of {ticker, count}", () => {
      const counts = {
        TSLA: 5,
        AAPL: 10,
        SPY: 3,
      };

      const result = sortTickerCounts(counts);

      expect(result).toEqual([
        { ticker: "AAPL", count: 10 },
        { ticker: "TSLA", count: 5 },
        { ticker: "SPY", count: 3 },
      ]);
    });

    it("handles empty counts object", () => {
      const result = sortTickerCounts({});
      expect(result).toEqual([]);
    });
  });
});