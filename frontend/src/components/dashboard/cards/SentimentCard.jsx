// frontend/src/components/dashboard/cards/SentimentCard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import "../../../css/dashboard/cards/SentimentCard.css";

import DashboardCard from "./shared/DashboardCard.jsx";

import { SENTIMENT_CARD_COPY as COPY } from "../../../content/dashboard/cards/sentimentCard.content.ts";

import { nOrNull, fmtPctSigned } from "../../../lib/format/marketFormat.js";
import { fmtPct1FromRatio } from "../../../lib/format/number.js";

const SENTIMENT_MODES = COPY.modes;

export default function SentimentCard({
  symbol,
  historyBySymbol,
  loading = false,
  backendSnapshot = null,
}) {
  const [mode, setMode] = useState("ALL");
  const [showHelp, setShowHelp] = useState(false);
  const closeBtnRef = useRef(null);

  const safeHistoryBySymbol =
    historyBySymbol && typeof historyBySymbol === "object" ? historyBySymbol : {};
  const history = symbol ? safeHistoryBySymbol[symbol] || [] : [];

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
      overallLabel: COPY.labels.notEnoughData,
      overallScore: 0,
    };
  }, [backendSnapshot, localSentiment]);

  const hasData = Boolean(sentiment.hasEnoughData);
  const displayTicker = symbol || COPY.header.tickerFallback;

  // Help modal: ESC closes + focus close button
  useEffect(() => {
    if (!showHelp) return;

    closeBtnRef.current?.focus?.();

    const onKey = (e) => {
      if (e.key === "Escape") setShowHelp(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHelp]);

  return (
    <DashboardCard className="sentiment-card">
      <header className="card-header">
        <div className="card-header-left">
          <div className="sentiment-card__title-row">
            <h2 className="panel-title">
              {COPY.header.titlePrefix}{" "}
              <span className="sentiment-card__ticker">{displayTicker}</span>
            </h2>

            <button
              type="button"
              className="help-icon-button"
              aria-label={COPY.header.helpButtonAria}
              onClick={() => setShowHelp(true)}
            >
              ?
            </button>
          </div>

          {!symbol && !loading && (
            <p className="card-subtitle">{COPY.header.subtitles.noSymbol}</p>
          )}

          {symbol && loading && (
            <p className="card-subtitle">{COPY.header.subtitles.loading}</p>
          )}

          {symbol && !loading && !hasData && (
            <p className="card-subtitle">
              {COPY.header.subtitles.notEnoughHistory}
            </p>
          )}

          {symbol && !loading && hasData && (
            <p className="card-subtitle">
              {COPY.header.subtitles.overallPrefix}{" "}
              <span className="sentiment-card__overall">
                {sentiment.overallLabel}
              </span>{" "}
              <span className="sentiment-card__overall-score">
                {COPY.header.subtitles.scorePrefix} {sentiment.overallScore}
                {sentiment.source === "backend"
                  ? COPY.header.subtitles.scoreSuffixBackend
                  : COPY.header.subtitles.scoreSuffixLocal}
              </span>
            </p>
          )}

          {sentiment.source === "backend" && sentiment.style && (
            <p className="card-subtitle">
              {COPY.header.subtitles.stylePrefix}{" "}
              <span className="sentiment-chip sentiment-chip--style">
                {sentiment.style.label}
              </span>
              {sentiment.risk && (
                <>
                  {COPY.header.subtitles.dot}
                  {COPY.header.subtitles.riskPrefix}{" "}
                  <span className="sentiment-chip sentiment-chip--risk">
                    {sentiment.risk.label}
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        <div className="card-header-right">
          <SentimentModeDropdown mode={mode} onChange={setMode} />
        </div>
      </header>

      {showHelp && (
        <div
          className="help-popover-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={COPY.help.dialogAria}
          onClick={() => setShowHelp(false)}
        >
          <div className="help-popover" onClick={(e) => e.stopPropagation()}>
            <button
              ref={closeBtnRef}
              type="button"
              className="help-popover__close"
              aria-label={COPY.help.closeAria}
              onClick={() => setShowHelp(false)}
            >
              ×
            </button>

            <h3 className="help-popover__title">{COPY.help.title}</h3>

            <p className="help-popover__text">
              {COPY.help.p1.a}
              <strong>{COPY.help.p1.strong1}</strong>
              {COPY.help.p1.b}
              <strong>{COPY.help.p1.strong2}</strong>
              {COPY.help.p1.c}
            </p>

            <ul className="help-popover__list">
              {COPY.help.bullets.map((b) => (
                <li key={b.strong}>
                  <strong>{b.strong}</strong>
                  {b.text}
                </li>
              ))}
            </ul>

            <p className="help-popover__note">
              <strong>{COPY.help.note.strong}</strong>
              {COPY.help.note.text}
            </p>
          </div>
        </div>
      )}

      {symbol && !loading && hasData && (
        <div className="sentiment-card__body">
          {(mode === "ALL" || mode === "PRICE") && sentiment.priceBased && (
            <div className="sentiment-section sentiment-section--price">
              <h3 className="sentiment-section__title">
                {COPY.sections.price.title}
              </h3>
              <p className="sentiment-section__label">
                <span className="sentiment-chip sentiment-chip--price">
                  {sentiment.priceBased.label}
                </span>
              </p>

              <dl className="sentiment-metrics">
                <div className="sentiment-metric">
                  <dt>{COPY.sections.price.metricLabels.change1d}</dt>
                  <dd
                    className={classForPct(
                      pctFromPriceBased(sentiment.priceBased, "1d")
                    )}
                  >
                    {fmtPctSigned(
                      pctFromPriceBased(sentiment.priceBased, "1d")
                    )}
                  </dd>
                </div>

                <div className="sentiment-metric">
                  <dt>{COPY.sections.price.metricLabels.change5d}</dt>
                  <dd
                    className={classForPct(
                      pctFromPriceBased(sentiment.priceBased, "5d")
                    )}
                  >
                    {fmtPctSigned(
                      pctFromPriceBased(sentiment.priceBased, "5d")
                    )}
                  </dd>
                </div>

                <div className="sentiment-metric">
                  <dt>{COPY.sections.price.metricLabels.change20d}</dt>
                  <dd
                    className={classForPct(
                      pctFromPriceBased(sentiment.priceBased, "20d")
                    )}
                  >
                    {fmtPctSigned(
                      pctFromPriceBased(sentiment.priceBased, "20d")
                    )}
                  </dd>
                </div>

                {sentiment.crossSection?.ret_20d_pct != null && (
                  <div className="sentiment-metric">
                    <dt>{COPY.sections.price.metricLabels.rank20d}</dt>
                    <dd>
                      {fmtPct1FromRatio(sentiment.crossSection.ret_20d_pct)}
                      {COPY.misc.pctileSuffix}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {(mode === "ALL" || mode === "VOL") && sentiment.volatility && (
            <div className="sentiment-section sentiment-section--vol">
              <h3 className="sentiment-section__title">
                {COPY.sections.vol.title}
              </h3>
              <p className="sentiment-section__label">
                <span className="sentiment-chip sentiment-chip--vol">
                  {sentiment.volatility.label}
                </span>
              </p>

              <dl className="sentiment-metrics">
                <div className="sentiment-metric">
                  <dt>{COPY.sections.vol.metricLabels.realizedVol}</dt>
                  <dd>
                    {fmtNum2(
                      sentiment.volatility.realized_vol ??
                        sentiment.volatility.realizedVol
                    )}
                    %
                  </dd>
                </div>

                {sentiment.crossSection?.realized_vol_pct != null && (
                  <div className="sentiment-metric">
                    <dt>{COPY.sections.vol.metricLabels.volRank}</dt>
                    <dd>
                      {fmtPct1FromRatio(
                        sentiment.crossSection.realized_vol_pct
                      )}
                      {COPY.misc.pctileSuffix}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {(mode === "ALL" || mode === "TECH") && sentiment.technical && (
            <div className="sentiment-section sentiment-section--tech">
              <h3 className="sentiment-section__title">
                {COPY.sections.tech.title}
              </h3>
              <p className="sentiment-section__label">
                <span className="sentiment-chip sentiment-chip--tech">
                  {sentiment.technical.label}
                </span>
              </p>

              <dl className="sentiment-metrics">
                <div className="sentiment-metric">
                  <dt>{COPY.sections.tech.metricLabels.lastClose}</dt>
                  <dd>
                    {fmtNum2(
                      sentiment.technical.last_close ??
                        sentiment.technical.lastClose
                    )}
                  </dd>
                </div>

                <div className="sentiment-metric">
                  <dt>{COPY.sections.tech.metricLabels.ma20}</dt>
                  <dd>{fmtNum2(sentiment.technical.ma_short)}</dd>
                </div>

                <div className="sentiment-metric">
                  <dt>{COPY.sections.tech.metricLabels.ma50}</dt>
                  <dd>{fmtNum2(sentiment.technical.ma_long)}</dd>
                </div>

                {sentiment.technical.rsi_14 != null && (
                  <div className="sentiment-metric">
                    <dt>{COPY.sections.tech.metricLabels.rsi14}</dt>
                    <dd>{fmtNum2(sentiment.technical.rsi_14)}</dd>
                  </div>
                )}

                {sentiment.technical.bb_position != null && (
                  <div className="sentiment-metric">
                    <dt>{COPY.sections.tech.metricLabels.bbPos}</dt>
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
    </DashboardCard>
  );
}

/* ---------- Dropdown for VIEW (keyboard + click-outside) ------------------- */

function SentimentModeDropdown({ mode, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef(null);

  const current =
    SENTIMENT_MODES.find((m) => m.value === mode) || SENTIMENT_MODES[0];
  const labelText = mode === "ALL" ? COPY.dropdown.viewLabel : current.label;

  const handleSelect = (value) => {
    onChange(value);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const onDocClick = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setIsOpen(false);
    };

    const onKey = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  return (
    <div ref={wrapRef} className="chart-search-dropdown sentiment-mode-dropdown">
      <button
        type="button"
        className="chart-select chart-select--button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={COPY.dropdown.aria}
      >
        <span className="chart-select-label">{labelText}</span>
        <span className="chart-select-caret">▾</span>
      </button>

      {isOpen && (
        <div className="chart-select-menu">
          <ul
            className="chart-select-options"
            role="listbox"
            aria-label={COPY.dropdown.modesAria}
          >
            {SENTIMENT_MODES.map((option) => (
              <li
                key={option.value}
                role="option"
                tabIndex={0}
                aria-selected={option.value === mode}
                className={
                  "chart-select-option" +
                  (option.value === mode ? " chart-select-option--active" : "")
                }
                onClick={() => handleSelect(option.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(option.value);
                  }
                }}
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

/* ---------- Shared-ish formatting helpers ------------------- */

function fmtNum2(v) {
  const x = nOrNull(v);
  return x === null ? "—" : x.toFixed(2);
}

// backend supports both snake_case + camelCase keys; normalize to a percent number
function pctFromPriceBased(pb, horizon) {
  if (!pb || typeof pb !== "object") return null;
  if (horizon === "1d") return nOrNull(pb.change_1d ?? pb.change1D);
  if (horizon === "5d") return nOrNull(pb.change_5d ?? pb.change5D);
  if (horizon === "20d") return nOrNull(pb.change_20d ?? pb.change20D);
  return null;
}

function formatBollinger(pos) {
  const p = nOrNull(pos);
  if (p === null) return "—";
  if (p >= 0.8) return COPY.labels.bollinger.nearUpper;
  if (p <= -0.8) return COPY.labels.bollinger.nearLower;
  if (p > 0.2) return COPY.labels.bollinger.aboveMid;
  if (p < -0.2) return COPY.labels.bollinger.belowMid;
  return COPY.labels.bollinger.aroundMid;
}

function classForPct(v) {
  const x = nOrNull(v);
  if (x === null) return "sentiment-pct";
  if (x > 0.1) return "sentiment-pct sentiment-pct--up";
  if (x < -0.1) return "sentiment-pct sentiment-pct--down";
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
      overallLabel: COPY.labels.notEnoughData,
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
      overallLabel: COPY.labels.notEnoughData,
      overallScore: 0,
    };
  }

  const lastIdx = closes.length - 1;
  const lastClose = closes[lastIdx];
  const prevClose = closes[lastIdx - 1];
  const close5 = closes[Math.max(0, lastIdx - 5)];
  const close20 = closes[Math.max(0, lastIdx - 20)];

  const pct = (from, to) => (from && from !== 0 ? ((to - from) / from) * 100 : 0);

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
    priceLabel = COPY.labels.price.stronglyBullish;
    priceScore = 2;
  } else if (smallUp) {
    priceLabel = COPY.labels.price.bullish;
    priceScore = 1;
  } else if (bigDown) {
    priceLabel = COPY.labels.price.stronglyBearish;
    priceScore = -2;
  } else if (smallDown) {
    priceLabel = COPY.labels.price.bearish;
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

  const meanVal = returns.reduce((acc, r) => acc + r, 0) / (returns.length || 1);
  const variance =
    returns.reduce((acc, r) => acc + (r - meanVal) * (r - meanVal), 0) /
    (returns.length || 1);
  const stdev = Math.sqrt(variance);
  const realizedVol = stdev * Math.sqrt(252) * 100;

  let volLabel = COPY.labels.vol.normal;
  let volScore = 0;

  if (realizedVol < 20) {
    volLabel = COPY.labels.vol.calm;
    volScore = 1;
  } else if (realizedVol > 60) {
    volLabel = COPY.labels.vol.stressed;
    volScore = -2;
  } else if (realizedVol > 40) {
    volLabel = COPY.labels.vol.elevated;
    volScore = -1;
  }

  const volatility = { label: volLabel, score: volScore, realizedVol };

  const windowShort = 20;
  const windowLong = 50;

  const recentShort = closes.slice(-windowShort);
  const recentLong = closes.slice(-windowLong);

  const avg = (arr) => (arr.length ? arr.reduce((acc, v) => acc + v, 0) / arr.length : lastClose);

  const maShort = avg(recentShort);
  const maLong = avg(recentLong.length ? recentLong : recentShort);

  let techLabel = COPY.labels.tech.rangeMixed;
  let techScore = 0;

  const aboveShort = lastClose > maShort;
  const aboveLong = lastClose > maLong;

  if (aboveShort && aboveLong) {
    techLabel = COPY.labels.tech.uptrend;
    techScore = 2;
  } else if (!aboveShort && !aboveLong) {
    techLabel = COPY.labels.tech.downtrend;
    techScore = -2;
  } else if (aboveShort && !aboveLong) {
    techLabel = COPY.labels.tech.earlyUptrend;
    techScore = 1;
  } else if (!aboveShort && aboveLong) {
    techLabel = COPY.labels.tech.earlyBreakdown;
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
  let overallLabel = COPY.labels.overall.neutralMixed;

  if (overallScore >= 3) overallLabel = COPY.labels.overall.stronglyBullish;
  else if (overallScore >= 1) overallLabel = COPY.labels.overall.bullishTilt;
  else if (overallScore <= -3) overallLabel = COPY.labels.overall.stronglyBearish;
  else if (overallScore <= -1) overallLabel = COPY.labels.overall.bearishTilt;

  return { hasEnoughData: true, priceBased, volatility, technical, overallLabel, overallScore };
}