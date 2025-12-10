// src/components/landing/LandingPage.jsx
import { useNavigate } from "react-router-dom";
import "./LandingPage.css";
import landingIllustration from "../../assets/landing-illustration.jpg";
import AppShell from "../layout/AppShell";

export default function LandingPage() {
  const navigate = useNavigate();

  const goAuth = () => navigate("/auth");

  return (
    <AppShell>
    <div className="landing-page">
      {/* HERO */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-left">
            <h1 className="landing-hero-title">
              Trade smarter.
              <br />
              Build your own edge.
            </h1>
            <p className="landing-hero-subtitle">
              U-Stock pulls together prices, signals, and sentiment into a
              single workspace so you can focus on the decisions, not the
              data plumbing.
            </p>

            <div className="landing-hero-ctas">
              <button className="landing-cta-primary" onClick={goAuth}>
                Sign in / Sign up
              </button>
            </div>
          </div>

          {/* RIGHT: static illustration image */}
          <div className="landing-hero-right">
            <img
              src={landingIllustration}
              alt="U-Stock illustration"
              className="landing-hero-img"
            />
          </div>
        </div>
      </section>

      {/* ABOUT / VALUE SECTION */}
      <section className="landing-section landing-about">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">Why U-Stock?</h2>
          <p className="landing-section-text">
            U-Stock is your personal research cockpit. Start with a clean
            dashboard of price history and technical signals, then layer on
            sentiment and data-scout insights as you grow.
          </p>

          <div className="landing-grid-3">
            <div className="landing-feature-card">
              <h3>Clean market view</h3>
              <p>
                See prices, returns, and index baselines in one place without
                hopping between apps.
              </p>
            </div>
            <div className="landing-feature-card">
              <h3>Signals that evolve</h3>
              <p>
                The current version focuses on price-based signals, with hooks
                ready for options flow, news, and sentiment down the line.
              </p>
            </div>
            <div className="landing-feature-card">
              <h3>Your future co-pilot</h3>
              <p>
                Long-term, U-Stock grows into a day-trading assistant that can
                scan, rank, and eventually automate parts of your strategy.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ROADMAP SECTION */}
      <section className="landing-section landing-roadmap">
        <div className="landing-section-inner landing-roadmap-inner">
          <div className="landing-roadmap-left"> 
            <h2 className="landing-section-title">Where this is going</h2>
            <p className="landing-section-text">
              Think of this as a living lab. Right now you can explore charts
              and snapshots. Next: strategy backtests, paper trading, and hooks
              into live brokers like Alpaca and Polygon.
            </p>

            <ul className="landing-roadmap-list">
              <li>Short-term: price + technical sentiment options.</li>
              <li>Mid-term: portfolio views and paper trading.</li>
              <li>Long-term: automated signals and execution per user.</li>
            </ul>

            <button className="landing-cta-outline" onClick={goAuth}>
              Get early access
            </button>
          </div>

          <div className="landing-roadmap-right">
            <div className="landing-roadmap-card">
              <div className="landing-roadmap-pill">Roadmap</div>
              <div className="landing-roadmap-steps">
                <div className="landing-roadmap-step">
                  <span className="landing-step-dot" />
                  <span>Dashboard + signals (now)</span>
                </div>
                <div className="landing-roadmap-step">
                  <span className="landing-step-dot" />
                  <span>Paper trading sandbox</span>
                </div>
                <div className="landing-roadmap-step">
                  <span className="landing-step-dot" />
                  <span>Live broker integrations</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
    </AppShell>
  );
}
