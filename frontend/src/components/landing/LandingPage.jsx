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
              Transparent automation.
              <br />
              Built for disciplined execution.
            </h1>

            <p className="landing-hero-subtitle">
              U-Stock keeps your trading workflow clean: charts, context, risk controls, and execution status
              in one place. You get clear “what happened / why” visibility — without exposing proprietary
              strategy internals.
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
              Most traders don’t fail because they lack intelligence — they fail because the process breaks:
              inconsistent rules, unclear risk, and decisions that drift over time. U-Stock helps you stay
              consistent with auditable actions, visible risk controls, and automation that’s designed to be
              monitored (not blindly trusted).
            </p>

            <div className="landing-grid-3">
              <div className="landing-feature-card">
                <h3>Transparency you can trust</h3>
                <p>
                  See the state of your system, what it’s doing right now, and what changed — with clear status,
                  logs, and decision breadcrumbs.
                </p>
              </div>

              <div className="landing-feature-card">
                <h3>Automation with guardrails</h3>
                <p>
                  Start manual, graduate to paper, then automate only when your rules prove themselves.
                  Risk controls are first-class — not an afterthought.
                </p>
              </div>

              <div className="landing-feature-card">
                <h3>Protect your edge</h3>
                <p>
                  You get clarity on behavior and risk without oversharing proprietary strategy IP. U-Stock
                  aims for explainability, not reverse-engineering.
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
                U-Stock is built like a lab: ship small, test fast, and keep what improves real execution.
                The goal isn’t “more indicators” — it’s cleaner decisions, stronger risk control, and automation
                you can supervise with confidence.
              </p>

              <ul className="landing-roadmap-list">
                <li>
                  <strong>Now:</strong> charts, snapshots, bot status + logs, and a decision-ready cockpit.
                </li>
                <li>
                  <strong>Next:</strong> paper trading + journaling (R-multiples, screenshots, notes).
                </li>
                <li>
                  <strong>Soon:</strong> scalable automation: multi-bot scanning + broker execution with strict
                  safety gates.
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
                    <span>Research cockpit + transparency (now)</span>
                  </div>

                  <div className="landing-roadmap-step">
                    <span className="landing-step-dot" />
                    <span>Paper trading + journaling</span>
                  </div>

                  <div className="landing-roadmap-step">
                    <span className="landing-step-dot" />
                    <span>Automation + broker execution (guardrails)</span>
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
