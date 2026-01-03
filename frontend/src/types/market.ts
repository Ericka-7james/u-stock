// src/types/market.ts
export type MarketTick = {
  source: "alpaca" | "polygon" | "webull";
  symbol: string;              // "AAPL", "BTC/USD"
  ts: number;                  // epoch ms (always)
  price: number;               // last trade or mid/last known
  bid?: number;
  ask?: number;
  size?: number;               // trade size if available
  kind: "trade" | "quote";     // what it represents
};

export type Candle = {
  symbol: string;
  intervalMs: number;          // 60_000 for 1m, 1_000 for 1s, etc.
  t: number;                   // bucket start epoch ms
  o: number; h: number; l: number; c: number;
  v: number;                   // volume (if you have it; else 0)
  n: number;                   // number of ticks aggregated
  source: "derived";           // candle is derived from ticks
};
