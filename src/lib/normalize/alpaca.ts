// src/lib/normalize/alpaca.ts
import type { MarketTick } from "../../types/market";

export function normalizeAlpacaLatestTrade(symbol: string, raw: any): MarketTick {
  // raw example-ish: { trade: { p: 189.12, s: 2, t: "2025-12-14T..." } }
  const tISO = raw?.trade?.t ?? raw?.t;
  const ts = tISO ? Date.parse(tISO) : Date.now();

  const price = Number(raw?.trade?.p ?? raw?.p);
  const size = raw?.trade?.s != null ? Number(raw.trade.s) : undefined;

  return {
    source: "alpaca",
    symbol,
    ts,
    price,
    size,
    kind: "trade",
  };
}

export function normalizeAlpacaLatestQuote(symbol: string, raw: any): MarketTick {
  // raw example-ish: { quote: { bp: 189.10, ap: 189.14, t: "..." } }
  const tISO = raw?.quote?.t ?? raw?.t;
  const ts = tISO ? Date.parse(tISO) : Date.now();

  const bid = raw?.quote?.bp ?? raw?.bp;
  const ask = raw?.quote?.ap ?? raw?.ap;

  // choose a "price" for UI when only quote exists:
  const price =
    bid != null && ask != null ? (Number(bid) + Number(ask)) / 2 : Number(bid ?? ask ?? NaN);

  return {
    source: "alpaca",
    symbol,
    ts,
    price,
    bid: bid != null ? Number(bid) : undefined,
    ask: ask != null ? Number(ask) : undefined,
    kind: "quote",
  };
}
