// src/types/market.ts
export type Candle = {
  symbol: string;
  timestamp: string; // ISO string from backend
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
