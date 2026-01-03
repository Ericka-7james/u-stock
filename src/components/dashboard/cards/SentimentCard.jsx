// src/components/dashboard/SentimentCard.jsx
import { useMemo, useState } from "react";
import "../../../css/dashboard/cards/SentimentCard.css";

const SENTIMENT_MODES = [
  { value: "ALL", label: "All" },
  { value: "PRICE", label: "Price-based Sentiment" },
  { value: "VOL", label: "Volatility Sentiment" },
  { value: "TECH", label: "Technical Pattern Sentiment" },
];

export default function SentimentCard({
  symbol,
  historyBySymbol,
  loading = false,
  backendSnapshot = null,
}) {
  const [mode, setMode] = useState("ALL");
  const [showHelp, setShowHelp] = useState(false);

  const history = symbol ? historyBySymbol[symbol] || [] : [];

  // Local fallback sentiment from price history only
  const localSentiment = useMemo(
    () => computeSentimentFromHistory(history),
    [history]
  );

  // Choose backend if available, else local
  const sentiment = useMemo(() => {
    if (backendSnapshot) {
      return {
        source: "backend",
        hasEnoughData: true,
        priceBased: backendSnapshot.price_based,
        volatility: backendSnapshot.volatility,
        technical: backendSnapshot.technical,
        risk: backendSnapshot.risk,
        style: backendSnapshot.style,
        crossSection: backendSnapshot.cross_section,
        overallLabel: backendSnapshot.overall_label,
        overallScore: backendSnapshot.overall_score,
      };
    }
    // local fallback
    if (localSentiment?.hasEnoughData) {
      return {
        source: "local",
        ...localSentiment,
        risk: null,
        style: null,
        crossSection: null,
      };
    }
    return {
      source: "none",
      hasEnoughData: false,
      priceBased: null,
      volatility: null,
      technical: null,
      risk: null,
      style: null,
      crossSection: null,
      overallLabel: "Not enough data",
      overallScore: 0,
    };
  }, [backendSnapshot, localSentiment]);

  const hasData = sentiment.hasEnoughData;
  const displayTicker = symbol || "—";

  return (
    <section className="sentiment-card">
      <header className="sentiment-card__header">
        <div className="sentiment-card__header-left">
          <div className="sentiment-card__title-row">
            <h2 className="sentiment-card__title">
              Sentiment for{" "}
              <span className="sentiment-card__ticker">{displayTicker}</span>
            </h2>
            <button
              type="button"
              className="help-icon-button"
              aria-label="Explain this sentiment card"
              onClick={() => setShowHelp(true)}
            >
              ?
            </button>
          </div>

          {!symbol && !loading && (
            <p className="sentiment-card__subtitle">
              Select a ticker to view sentiment.
            </p>
          )}

          {symbol && loading && (
            <p className="sentiment-card__subtitle">
              Loading price &amp; sentiment…
            </p>
          )}

          {symbol && !loading && !hasData && (
            <p className="sentiment-card__subtitle">
              Not enough history to compute sentiment yet.
            </p>
          )}

          {symbol && !loading && hasData && (
            <p className="sentiment-card__subtitle">
              Overall:{" "}
              <span className="sentiment-card__overall">
                {sentiment.overallLabel}
              </span>{" "}
              <span className="sentiment-card__overall-score">
                (score {sentiment.overallScore}
                {sentiment.source === "backend" ? ", from snapshot" : ""})
              </span>
            </p>
          )}

          {sentiment.source === "backend" && sentiment.style && (
            <p className="sentiment-card__subtitle">
              Style:{" "}
              <span className="sentiment-chip sentiment-chip--style">
                {sentiment.style.label}
              </span>
              {sentiment.risk && (
                <>
                  {" • "}
                  Risk:{" "}
                  <span className="sentiment-chip sentiment-chip--risk">
                    {sentiment.risk.label}
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        {/* VIEW dropdown – same style as chart dropdown */}
        <SentimentModeDropdown mode={mode} onChange={setMode} />
      </header>

      {/* FULL-SCREEN HELP MODAL */}
      {showHelp && (
        <div
          className="help-popover-backdrop"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="help-popover"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="help-popover__close"
              aria-label="Close explanation"
              onClick={() => setShowHelp(false)}
            >
              ×
            </button>
            <h3 className="help-popover__title">What does this “Sentiment” mean?</h3>

              <p className="help-popover__text">
                Right now, this card is <strong>price-derived sentiment</strong> — it summarizes what the
                price has been doing recently. It does <strong>not</strong> include news, social media,
                fundamentals, or macro data yet.
              </p>

              <ul className="help-popover__list">
                <li>
                  <strong>Price-based</strong> looks at recent returns (1D, 5D, ~20D) and labels the move
                  as bullish/bearish/neutral.
                </li>
                <li>
                  <strong>Volatility</strong> uses realized volatility from daily returns to describe
                  whether price action is calm, normal, or stressed.
                </li>
                <li>
                  <strong>Technical</strong> compares the latest close to moving averages (20/50-day) to
                  detect trend vs mixed/range behavior.
                </li>
              </ul>

              <p className="help-popover__note">
                <strong>Exploration only.</strong> This is not a trading signal or investment advice.
                Next upgrades: combine price signals with news + social sentiment + fundamentals, and
                store decision logs with confidence + outcome tracking.
              </p>
          </div>
        </div>
      )}

      {symbol && !loading && hasData && (
        <div className="sentiment-card__body">
          {(mode === "ALL" || mode === "PRICE") && sentiment.priceBased && (
            <div className="sentiment-section sentiment-section--price">
              <h3 className="sentiment-section__title">
                Price-based Sentiment
              </h3>
              <p className="sentiment-section__label">
                <span className="sentiment-chip sentiment-chip--price">
                  {sentiment.priceBased.label}
                </span>
              </p>
              <dl className="sentiment-metrics">
                <div className="sentiment-metric">
                  <dt>1D Change</dt>
                  <dd
                    className={classForPct(
                      sentiment.priceBased.change_1d ??
                        sentiment.priceBased.change1D
                    )}
                  >
                    {formatPct(
                      sentiment.priceBased.change_1d ??
                        sentiment.priceBased.change1D
                    )}
                  </dd>
                </div>
                <div className="sentiment-metric">
                  <dt>5D Change</dt>
                  <dd
                    className={classForPct(
                      sentiment.priceBased.change_5d ??
                        sentiment.priceBased.change5D
                    )}
                  >
                    {formatPct(
                      sentiment.priceBased.change_5d ??
                        sentiment.priceBased.change5D
                    )}
                  </dd>
                </div>
                <div className="sentiment-metric">
                  <dt>≈1M Change</dt>
                  <dd
                    className={classForPct(
                      sentiment.priceBased.change_20d ??
                        sentiment.priceBased.change20D
                    )}
                  >
                    {formatPct(
                      sentiment.priceBased.change_20d ??
                        sentiment.priceBased.change20D
                    )}
                  </dd>
                </div>
                {sentiment.crossSection?.ret_20d_pct != null && (
                  <div className="sentiment-metric">
                    <dt>20D Return Rank</dt>
                    <dd>
                      {formatPercentile(
                        sentiment.crossSection.ret_20d_pct
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {(mode === "ALL" || mode === "VOL") && sentiment.volatility && (
            <div className="sentiment-section sentiment-section--vol">
              <h3 className="sentiment-section__title">
                Volatility Sentiment
              </h3>
              <p className="sentiment-section__label">
                <span className="sentiment-chip sentiment-chip--vol">
                  {sentiment.volatility.label}
                </span>
              </p>
              <dl className="sentiment-metrics">
                <div className="sentiment-metric">
                  <dt>Realized Volatility</dt>
                  <dd>
                    {formatNumber(
                      sentiment.volatility.realized_vol ??
                        sentiment.volatility.realizedVol
                    )}
                    %
                  </dd>
                </div>
                {sentiment.crossSection?.realized_vol_pct != null && (
                  <div className="sentiment-metric">
                    <dt>Volatility Rank</dt>
                    <dd>
                      {formatPercentile(
                        sentiment.crossSection.realized_vol_pct
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {(mode === "ALL" || mode === "TECH") && sentiment.technical && (
            <div className="sentiment-section sentiment-section--tech">
              <h3 className="sentiment-section__title">
                Technical Pattern Sentiment
              </h3>
              <p className="sentiment-section__label">
                <span className="sentiment-chip sentiment-chip--tech">
                  {sentiment.technical.label}
                </span>
              </p>
              <dl className="sentiment-metrics">
                <div className="sentiment-metric">
                  <dt>Last Close</dt>
                  <dd>
                    {formatNumber(
                      sentiment.technical.last_close ??
                        sentiment.technical.lastClose
                    )}
                  </dd>
                </div>
                <div className="sentiment-metric">
                  <dt>20-day MA</dt>
                  <dd>{formatNumber(sentiment.technical.ma_short)}</dd>
                </div>
                <div className="sentiment-metric">
                  <dt>50-day MA</dt>
                  <dd>{formatNumber(sentiment.technical.ma_long)}</dd>
                </div>
                {sentiment.technical.rsi_14 != null && (
                  <div className="sentiment-metric">
                    <dt>RSI (14)</dt>
                    <dd>{formatNumber(sentiment.technical.rsi_14)}</dd>
                  </div>
                )}
                {sentiment.technical.bb_position != null && (
                  <div className="sentiment-metric">
                    <dt>Bollinger Position</dt>
                    <dd>
                      {formatBollinger(sentiment.technical.bb_position)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- Dropdown for VIEW (matches ticker styles) ---------------------- */

function SentimentModeDropdown({ mode, onChange }) {
  const [isOpen, setIsOpen] = useState(false);

  const current =
    SENTIMENT_MODES.find((m) => m.value === mode) || SENTIMENT_MODES[0];
  const labelText = mode === "ALL" ? "View" : current.label;

  const handleSelect = (value) => {
    onChange(value);
    setIsOpen(false);
  };

  return (
    <div className="chart-search-dropdown sentiment-mode-dropdown">
      <button
        type="button"
        className="chart-select chart-select--button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Sentiment view mode"
      >
        <span className="chart-select-label">{labelText}</span>
        <span className="chart-select-caret">▾</span>
      </button>

      {isOpen && (
        <div className="chart-select-menu">
          <ul className="chart-select-options" role="listbox">
            {SENTIMENT_MODES.map((option) => (
              <li
                key={option.value}
                role="option"
                className={
                  "chart-select-option" +
                  (option.value === mode
                    ? " chart-select-option--active"
                    : "")
                }
                onClick={() => handleSelect(option.value)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Formatting helpers & fallback sentiment (unchanged) ------------ */
// (keep everything from formatPct down exactly as in your current file)
function formatPct(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function formatNumber(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return v.toFixed(2);
}

function formatPercentile(p) {
  if (p === null || p === undefined || isNaN(p)) return "—";
  return `${(p * 100).toFixed(1)} pctile`;
}

function formatBollinger(pos) {
  if (pos === null || pos === undefined || isNaN(pos)) return "—";
  if (pos >= 0.8) return "Near upper band";
  if (pos <= -0.8) return "Near lower band";
  if (pos > 0.2) return "Above mid band";
  if (pos < -0.2) return "Below mid band";
  return "Around mid band";
}

function classForPct(v) {
  if (v === null || v === undefined || isNaN(v)) return "sentiment-pct";
  if (v > 0.1) return "sentiment-pct sentiment-pct--up";
  if (v < -0.1) return "sentiment-pct sentiment-pct--down";
  return "sentiment-pct";
}

/* ---------- Local fallback sentiment (unchanged from your original) ------- */

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

  const closes = history
    .map((bar) => Number(bar.close))
    .filter((v) => !isNaN(v));
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

  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    const r = closes[i - 1] ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
    returns.push(r);
  }

  const meanVal =
    returns.reduce((acc, r) => acc + r, 0) / (returns.length || 1);
  const variance =
    returns.reduce((acc, r) => acc + (r - meanVal) * (r - meanVal), 0) /
    (returns.length || 1);
  const stdev = Math.sqrt(variance);
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

  const windowShort = 20;
  const windowLong = 50;

  const recentShort = closes.slice(-windowShort);
  const recentLong = closes.slice(-windowLong);

  const avg = (arr) =>
    arr.length ? arr.reduce((acc, v) => acc + v, 0) / arr.length : lastClose;

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
