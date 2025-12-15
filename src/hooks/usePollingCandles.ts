import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, MarketTick } from "../types/market";
import { createPollingCandleEngine } from "../lib/market/createPollingCandleEngine";

export function usePollingCandles(opts: {
  symbols: string[];
  fetcher: (symbols: string[]) => Promise<{ ticks: MarketTick[] }>;
  enable1s?: boolean;

  maxSymbols?: number;
  pollIntervalMs?: number;
}) {
  const [ticks, setTicks] = useState<MarketTick[]>([]);
  const [candles1m, setCandles1m] = useState<Record<string, Candle[]>>({});
  const [candles1s, setCandles1s] = useState<Record<string, Candle[]>>({});

  const engineRef = useRef<ReturnType<typeof createPollingCandleEngine> | null>(null);

  const engine = useMemo(() => {
    return createPollingCandleEngine({
      maxSymbols: opts.maxSymbols ?? 10,
      requestsPerSecond: 2,
      burst: 2,
      pollIntervalMs: opts.pollIntervalMs ?? 2000,
      uiFlushMs: 250,

      enable1sCandles: Boolean(opts.enable1s),
      fetcher: opts.fetcher,

      onTicks: (t) => setTicks((prev) => [...prev, ...t].slice(-200)),
      onCandles: (symbol, c1m, c1s) => {
        setCandles1m((prev) => ({ ...prev, [symbol]: c1m }));
        if (c1s) setCandles1s((prev) => ({ ...prev, [symbol]: c1s }));
      },
    });
  }, [opts.fetcher, opts.enable1s, opts.maxSymbols, opts.pollIntervalMs]);

  useEffect(() => {
    engineRef.current = engine;
    engine.start();
    return () => engine.stop();
  }, [engine]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    // subscribe
    for (const s of opts.symbols) eng.addSymbol(s);

    // (simple version) no unsubscribe tracking here yet; good enough for v1
  }, [opts.symbols]);

  return { ticks, candles1m, candles1s };
}
