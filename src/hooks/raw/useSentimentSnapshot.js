// src/hooks/raw/useSentimentSnapshot.js
import { useMemo } from "react";

/**
 * Compute simple sentiment metrics from daily OHLC history for a single symbol.
 * history should be an array like:
 * [{ date, open, high, low, close, volume }, ...]
 */
function computeSentimentFromHistory(history = []) {
  if (!Array.isArray(history) || history.length < 3) {
    return {
      hasEnoughData: false,
      priceBased: null,
      volatility: null,
      technical: null,
      overallLabel: "Not enough data",
      overallScore: 0,
    };
  }

  const closes = history.map((bar) => Number(bar.close)).filter((v) => !isNaN(v));
  if (closes.length < 3) {
    return {
      hasEnoughData: false,
      priceBased: null,
      volatility: null,
      technical: null,
      overallLabel: "Not enough data",
      overallScore: 0,
    };
  }

  const lastIdx = closes.length - 1;
  const lastClose = closes[lastIdx];

  const prevClose = closes[lastIdx - 1];
  const close5 = closes[Math.max(0, lastIdx - 5)];
  const close20 = closes[Math.max(0, lastIdx - 20)];

  const pct = (from, to) =>
    from && from !== 0 ? ((to - from) / from) * 100 : 0;

  const change1D = pct(prevClose, lastClose);
  const change5D = pct(close5, lastClose);
  const change20D = pct(close20, lastClose);

  // ----- Price-based label + score -----------------------------------------
  let priceLabel = "Neutral";
  let priceScore = 0;

  const bigUp = change1D > 2 || change5D > 5;
  const smallUp = change1D > 0 || change5D > 0;
  const bigDown = change1D < -2 || change5D < -5;
  const smallDown = change1D < 0 || change5D < 0;

  if (bigUp) {
    priceLabel = "Strongly Bullish";
    priceScore = 2;
  } else if (smallUp) {
    priceLabel = "Bullish";
    priceScore = 1;
  } else if (bigDown) {
    priceLabel = "Strongly Bearish";
    priceScore = -2;
  } else if (smallDown) {
    priceLabel = "Bearish";
    priceScore = -1;
  }

  const priceBased = {
    label: priceLabel,
    score: priceScore,
    change1D,
    change5D,
    change20D,
  };

  // ----- Volatility sentiment ----------------------------------------------
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    const r = closes[i - 1] ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
    returns.push(r);
  }

  const mean =
    returns.reduce((acc, r) => acc + r, 0) / (returns.length || 1);
  const variance =
    returns.reduce((acc, r) => acc + (r - mean) * (r - mean), 0) /
    (returns.length || 1);
  const stdev = Math.sqrt(variance);
  // Annualized-ish realized volatility
  const realizedVol = stdev * Math.sqrt(252) * 100;

  let volLabel = "Normal";
  let volScore = 0;

  if (realizedVol < 20) {
    volLabel = "Calm";
    volScore = 1;
  } else if (realizedVol > 60) {
    volLabel = "Stressed";
    volScore = -2;
  } else if (realizedVol > 40) {
    volLabel = "Elevated";
    volScore = -1;
  }

  const volatility = {
    label: volLabel,
    score: volScore,
    realizedVol,
  };

  // ----- Technical pattern sentiment (very simple trend check) -------------
  const windowShort = 20;
  const windowLong = 50;

  const recentShort = closes.slice(-windowShort);
  const recentLong = closes.slice(-windowLong);

  const avg = (arr) =>
    arr.length
      ? arr.reduce((acc, v) => acc + v, 0) / arr.length
      : lastClose;

  const maShort = avg(recentShort);
  const maLong = avg(recentLong.length ? recentLong : recentShort);

  let techLabel = "Range-Bound / Mixed";
  let techScore = 0;

  const aboveShort = lastClose > maShort;
  const aboveLong = lastClose > maLong;

  if (aboveShort && aboveLong) {
    techLabel = "Uptrend";
    techScore = 2;
  } else if (!aboveShort && !aboveLong) {
    techLabel = "Downtrend";
    techScore = -2;
  } else if (aboveShort && !aboveLong) {
    techLabel = "Potential Early Uptrend";
    techScore = 1;
  } else if (!aboveShort && aboveLong) {
    techLabel = "Potential Early Breakdown";
    techScore = -1;
  }

  const technical = {
    label: techLabel,
    score: techScore,
    maShort,
    maLong,
    lastClose,
    aboveShort,
    aboveLong,
  };

  // ----- Overall -----------------------------------------------------------
  const overallScore = priceScore + volScore + techScore;
  let overallLabel = "Neutral / Mixed";

  if (overallScore >= 3) overallLabel = "Strongly Bullish";
  else if (overallScore >= 1) overallLabel = "Bullish Tilt";
  else if (overallScore <= -3) overallLabel = "Strongly Bearish";
  else if (overallScore <= -1) overallLabel = "Bearish Tilt";

  return {
    hasEnoughData: true,
    priceBased,
    volatility,
    technical,
    overallLabel,
    overallScore,
  };
}

/**
 * Hook: derive sentiment snapshot for the given symbol
 * from the provided historyBySymbol map.
 *
 * @param {string} symbol
 * @param {Object.<string, Array>} historyBySymbol
 */
export function useSentimentSnapshot(symbol, historyBySymbol = {}) {
  const history = symbol ? historyBySymbol[symbol] || [] : [];

  const snapshot = useMemo(
    () => computeSentimentFromHistory(history),
    [history]
  );

  return snapshot;
}