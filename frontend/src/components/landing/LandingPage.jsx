// src/components/landing/LandingPage.jsx
import { useNavigate } from "react-router-dom";
import "../../css/landing/LandingPage.css";
import landingIllustration from "../../assets/images/LandingPageIcon_v2.png";
import AppShell from "../layout/AppShell";

export default function LandingPage() {
  const navigate = useNavigate();

  const goAuth = () => navigate("/auth");

  return (
    <AppShell>
              {/* HERO */}
        <section className="landing-hero">
          <div className="landing-hero-inner">
            <div className="landing-hero-left">
              <h1 className="landing-hero-title">
                Your trading workspace.
                <br />
                One plan. Many bots.
              </h1>

              <p className="landing-hero-subtitle">
                U-Stock brings charts, levels, and signal logic into one clean
                cockpit — so you spend less time tab-hopping and more time
                executing your edge with discipline.
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
        
      <div className="landing-page">
        {/* ABOUT / VALUE SECTION */}
        <section className="landing-section landing-about">
          <div className="landing-section-inner">
            <h2 className="landing-section-title">Why U-Stock?</h2>
            <p className="landing-section-text">
              Most traders don’t lose because they “don’t know enough.” They lose
              because decisions get sloppy: unclear levels, inconsistent rules,
              and no repeatable process. U-Stock keeps your workflow tight —
              your watchlist, your chart context, and your decision trail in one place.
            </p>

            <div className="landing-grid-3">
              <div className="landing-feature-card">
                <h3>Clarity over chaos</h3>
                <p>
                  Fast chart context with price history, trend structure, and key
                  reference levels — so entries aren’t vibes.
                </p>
              </div>

              <div className="landing-feature-card">
                <h3>Rules-first signals</h3>
                <p>
                  Signals are built to be auditable: what triggered, where the
                  invalidation is, and what “good execution” looks like.
                </p>
              </div>

              <div className="landing-feature-card">
                <h3>From manual → assisted</h3>
                <p>
                  Start with research and snapshots. Grow into paper trading,
                  bot-based scanning, and eventually automated execution
                  (only when your rules prove themselves).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ROADMAP SECTION */}
        <section className="landing-section landing-roadmap">
          <div className="landing-section-inner landing-roadmap-inner">
            <div className="landing-roadmap-left">
              <h2 className="landing-section-title">What’s shipping next</h2>
              <p className="landing-section-text">
                U-Stock is built like a lab: ship small, test fast, and keep
                what improves real execution. The goal isn’t “more indicators” —
                it’s higher-quality decisions with strict risk control.
              </p>

              <ul className="landing-roadmap-list">
                <li>
                  <strong>Now:</strong> charts, market snapshots, and signal-ready structure.
                </li>
                <li>
                  <strong>Next:</strong> paper trading sandbox + trade journaling (R-multiples, screenshots, notes).
                </li>
                <li>
                  <strong>Soon:</strong> multi-bot scanner that ranks setups by market state + your rules.
                </li>
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
                    <span>Research cockpit + snapshots (now)</span>
                  </div>

                  <div className="landing-roadmap-step">
                    <span className="landing-step-dot" />
                    <span>Paper trading + journaling</span>
                  </div>

                  <div className="landing-roadmap-step">
                    <span className="landing-step-dot" />
                    <span>Bot ranking + broker execution</span>
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
