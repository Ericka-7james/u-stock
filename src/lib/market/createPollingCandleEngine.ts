import { CandleAggregator } from "../candles/candleAggregator";
import { SymbolCap } from "../throttle/symbolCap";
import { TokenBucket } from "../throttle/tokenBucket";
import { withBackoff } from "../throttle/backoff";
import { TickBuffer } from "../throttle/tickBuffer";
import type { Candle, MarketTick } from "../../types/market";

type Fetcher = (symbols: string[]) => Promise<{ ticks: MarketTick[] }>;

export function createPollingCandleEngine(opts: {
  maxSymbols: number;
  requestsPerSecond: number;
  burst: number;
  pollIntervalMs: number;
  uiFlushMs: number;

  enable1sCandles?: boolean; // feature flag

  fetcher: Fetcher;

  onTicks?: (ticks: MarketTick[]) => void;
  onCandles?: (symbol: string, candles1m: Candle[], candles1s?: Candle[]) => void;
}) {
  const cap = new SymbolCap(opts.maxSymbols);
  const bucket = new TokenBucket(opts.burst, opts.requestsPerSecond);
  const buf = new TickBuffer();

  const agg1m = new CandleAggregator(60_000);

  const ENABLE_1S = Boolean(opts.enable1sCandles);
  const agg1s = ENABLE_1S ? new CandleAggregator(1_000) : null;

  let pollTimer: any = null;
  let flushTimer: any = null;

  function addSymbol(symbol: string) {
    return cap.tryAdd(symbol);
  }
  function removeSymbol(symbol: string) {
    cap.remove(symbol);
  }

  async function pollOnce() {
    const symbols = cap.list();
    if (!symbols.length) return;

    // Throttle requests (rate-limit guard)
    await bucket.consumeOrWait(1);

    // Backoff on 429/5xx/network
    const payload = await withBackoff(() => opts.fetcher(symbols));

    // Normalize is already done by backend; we just ingest
    for (const tick of payload.ticks) {
      buf.push(tick);
      agg1m.ingest(tick);
      if (agg1s) agg1s.ingest(tick);
    }

    // Prune memory
    agg1m.pruneOlderThan(24 * 60 * 60 * 1000);
    if (agg1s) agg1s.pruneOlderThan(2 * 60 * 60 * 1000);
  }

  function flushUI() {
    const ticks = buf.drain();
    if (ticks.length) opts.onTicks?.(ticks);

    const symbols = cap.list();
    for (const s of symbols) {
      const c1m = agg1m.getCandles(s, 300);
      const c1s = agg1s ? agg1s.getCandles(s, 300) : undefined;
      opts.onCandles?.(s, c1m, c1s);
    }
  }

  function start() {
    if (pollTimer) return;
    pollTimer = setInterval(() => pollOnce().catch(() => {}), opts.pollIntervalMs);
    flushTimer = setInterval(() => flushUI(), opts.uiFlushMs);
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer);
    if (flushTimer) clearInterval(flushTimer);
    pollTimer = null;
    flushTimer = null;
  }

  return { start, stop, addSymbol, removeSymbol };
}
