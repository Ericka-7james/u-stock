// src/lib/candles/candleAggregator.ts
import type { Candle, MarketTick } from "../../types/market";

type BucketKey = string; // `${symbol}:${intervalMs}:${bucketStart}`

export class CandleAggregator {
  private buckets = new Map<BucketKey, Candle>();

  constructor(private intervalMs: number) {}

  ingest(tick: MarketTick): Candle {
    const bucketStart = Math.floor(tick.ts / this.intervalMs) * this.intervalMs;
    const key: BucketKey = `${tick.symbol}:${this.intervalMs}:${bucketStart}`;

    const existing = this.buckets.get(key);

    if (!existing) {
      const c: Candle = {
        symbol: tick.symbol,
        intervalMs: this.intervalMs,
        t: bucketStart,
        o: tick.price,
        h: tick.price,
        l: tick.price,
        c: tick.price,
        v: tick.size ?? 0,
        n: 1,
        source: "derived",
      };
      this.buckets.set(key, c);
      return c;
    }

    existing.h = Math.max(existing.h, tick.price);
    existing.l = Math.min(existing.l, tick.price);
    existing.c = tick.price;
    existing.v += tick.size ?? 0;
    existing.n += 1;

    return existing;
  }

  // optional: fetch recent candles for a symbol (for chart)
  getCandles(symbol: string, limit = 300): Candle[] {
    const arr = [...this.buckets.values()].filter((c) => c.symbol === symbol);
    arr.sort((a, b) => a.t - b.t);
    return arr.slice(-limit);
  }

  // optional: memory control (important for long sessions)
  pruneOlderThan(msAgo: number) {
    const cutoff = Date.now() - msAgo;
    for (const [key, candle] of this.buckets) {
      if (candle.t < cutoff) this.buckets.delete(key);
    }
  }
}
