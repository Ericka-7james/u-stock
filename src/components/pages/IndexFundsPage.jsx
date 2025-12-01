// src/components/pages/IndexFundsPage.jsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useFundamentalsSnapshot } from "../../hooks/raw/useFundamentalsSnapshot";
import AppShell from "../layout/AppShell";

import "./IndexFundsPage.css";

const INDEX_FUNDS = [
  {
    ticker: "VTI",
    name: "Vanguard Total Stock Market ETF",
    blurb: "Tracks the entire U.S. stock market with very low fees.",
  },
  {
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    blurb: "Follows the S&P 500; classic diversified U.S. large-cap exposure.",
  },
  {
    ticker: "VTSAX",
    name: "Vanguard Total Stock Market Index Fund Admiral Shares",
    blurb: "Mutual fund version of VTI; simple ‘own the market’ core holding.",
  },
  {
    ticker: "FXAIX",
    name: "Fidelity 500 Index Fund",
    blurb: "Fidelity’s S&P 500 index fund with a rock-bottom expense ratio.",
  },
  {
    ticker: "SWTSX",
    name: "Schwab Total Stock Market Index Fund",
    blurb: "Schwab’s low-cost total U.S. market index alternative.",
  },
];

function formatMarketCap(value) {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  return n.toLocaleString();
}

export default function IndexFundsPage() {
  const [activeTab, setActiveTab] = useState("about"); // "about" | "funds"

  const {
    data: fundamentalsData,
    loading: fundamentalsLoading,
    meta: fundamentalsMeta,
  } = useFundamentalsSnapshot();

  const fundamentalsMap = useMemo(() => {
    const map = {};
    const data = Array.isArray(fundamentalsData) ? fundamentalsData : [];
    for (const f of data) {
      if (!f?.ticker) continue;
      map[f.ticker.toUpperCase()] = f;
    }
    return map;
  }, [fundamentalsData]);

  const fundsWithData = useMemo(
    () =>
      INDEX_FUNDS.map((fund) => {
        const tickerKey = fund.ticker.toUpperCase();
        return {
          ...fund,
          fundamentals: fundamentalsMap[tickerKey] || null,
        };
      }),
    [fundamentalsMap],
  );

  return (
    <AppShell>
      <div className="index-funds-page">
        {/* Hero card */}
        <header className="index-hero">
          <div className="index-hero-text">
            <h1 className="page-title">Index Funds & Quant Foundations</h1>
            <p className="muted">
              This page highlights broad index funds that often sit at the core
              of systematic trading and portfolio strategies. It combines simple
              fundamentals with educational context on how quants think about
              diversified &quot;building blocks&quot; before hunting for niche
              alpha.
            </p>
            {fundamentalsMeta?.generatedAt && (
              <p className="index-hero-meta">
                Fundamentals snapshot:{" "}
                <span>
                  {new Date(fundamentalsMeta.generatedAt).toLocaleString()}
                </span>
              </p>
            )}
          </div>

          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
        </header>

        {/* Tabs row */}
        <div className="index-tabs-row">
          <div className="tabs">
            <button
              type="button"
              className={"tab-btn " + (activeTab === "about" ? "tab-btn--active" : "")}
              onClick={() => setActiveTab("about")}
            >
              Index funds & core exposure
            </button>
            <button
              type="button"
              className={"tab-btn " + (activeTab === "funds" ? "tab-btn--active" : "")}
              onClick={() => setActiveTab("funds")}
            >
              Funds in this snapshot
            </button>
          </div>
        </div>

        {/* Content below tabs */}
        {activeTab === "about" ? (
          <>
            {/* CARD 1 — How index funds work */}
            <section className="panel index-about-panel">
              <h3>How index funds work</h3>
              <p className="muted">
                An index fund is a basket of stocks that tracks a specific
                market index like the S&amp;P 500 or the total U.S. stock
                market. Instead of trying to pick individual winners, you buy a
                slice of the entire market.
              </p>

              <ul className="about-list">
                <li>
                  <strong>Passive exposure:</strong> the fund mirrors an index
                  instead of being actively traded.
                </li>
                <li>
                  <strong>Low costs:</strong> fewer trades and less research
                  overhead usually mean low fees.
                </li>
                <li>
                  <strong>Diversification:</strong> a single fund can hold
                  hundreds or thousands of companies.
                </li>
                <li>
                  <strong>Core holding:</strong> many quants treat broad index
                  funds as the &quot;beta&quot; or market baseline their
                  strategies build on top of.
                </li>
              </ul>
            </section>

            {/* CARD 2 — How quants source data & find “gold mines” */}
            <section className="panel index-about-panel">
              <h3 className="fundamentals-title">
                How quants source data & find &quot;the gold mine&quot;
              </h3>

              <div className="fundamentals-explain">
                <p>
                  Before chasing complex signals, quantitative researchers build
                  a clean, reliable data foundation. This u-Stock prototype
                  mirrors that approach:
                </p>

                <ul className="metrics-list">
                  <li>
                    <strong>Market prices:</strong> daily and intraday OHLCV
                    data fetched via APIs (e.g. Yahoo Finance wrappers) to
                    understand trend, volatility, and liquidity.
                  </li>
                  <li>
                    <strong>Fundamentals:</strong> company-level metrics like PE
                    ratios, market caps, margins, and balance sheet strength to
                    layer in quality and valuation.
                  </li>
                  <li>
                    <strong>Macro context:</strong> inflation, rates, and growth
                    data to explain why entire sectors or factors might move
                    together.
                  </li>
                  <li>
                    <strong>Alternative data (future layer):</strong> news,
                    social, and behavior data to identify pockets of attention
                    or stress that might not show up in prices yet.
                  </li>
                </ul>

                <p className="muted">
                  The &quot;gold mine&quot; isn&apos;t a single magical signal.
                  It&apos;s the combination of clean inputs, sensible
                  indicators, and disciplined ranking of opportunities—exactly
                  what this project is designed to demonstrate.
                </p>
              </div>
            </section>
          </>
        ) : (
          <section className="panel">
            {fundamentalsLoading ? (
              <p className="muted">
                Loading fundamentals snapshot (PE, market cap)…{" "}
              </p>
            ) : (
              <div className="fund-grid">
                {fundsWithData.map((fund) => (
                  <article key={fund.ticker} className="fund-card">
                    <header className="fund-card-header">
                      <div>
                        <div className="fund-ticker">{fund.ticker}</div>
                        <div className="fund-name">{fund.name}</div>
                      </div>
                    </header>

                    <p className="fund-blurb">{fund.blurb}</p>

                    <div className="fund-metrics-row">
                      <div className="fund-metric">
                        <span className="fund-metric-label">PE:</span>
                        <span className="fund-metric-value">
                          {fund.fundamentals?.pe != null &&
                          Number.isFinite(Number(fund.fundamentals.pe))
                            ? Number(fund.fundamentals.pe).toFixed(1)
                            : "N/A"}
                        </span>
                      </div>

                      <div className="fund-metric">
                        <span className="fund-metric-label">Market Cap:</span>
                        <span className="fund-metric-value">
                          {fund.fundamentals?.marketCap != null
                            ? formatMarketCap(fund.fundamentals.marketCap)
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
