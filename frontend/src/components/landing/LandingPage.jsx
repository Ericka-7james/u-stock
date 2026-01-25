// src/components/landing/LandingPage.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/landing/LandingPage.css";

import landingIllustration from "../../assets/images/LandingPageIcon_v2.png";
import companyHopeImg from "../../assets/images/companyHope.png";

import AppShell from "../layout/AppShell";
import Modal from "../common/Modal";

export default function LandingPage() {
  const navigate = useNavigate();
  const goAuth = () => navigate("/auth");

  const [roadmapOpen, setRoadmapOpen] = useState(false);

  const roadmapFooter = useMemo(() => {
    return (
      <div className="landing-modal-footer">
        <button
          className="landing-modal-btn landing-modal-btn--ghost"
          type="button"
          onClick={() => setRoadmapOpen(false)}
        >
          Close
        </button>
        <button className="landing-modal-btn landing-modal-btn--primary" type="button" onClick={goAuth}>
          Get early access
        </button>
      </div>
    );
  }, [goAuth]);

  return (
    <AppShell>
      {/* HERO */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-left">
            <div className="landing-hero-kicker">Beginner-friendly • Risk-first • Transparent by design</div>

            <h1 className="landing-hero-title">
              Trading clarity for people
              <br />
              who don’t want to guess.
            </h1>

            <p className="landing-hero-subtitle">
              U-Stock helps everyday users trade and invest with structure — not hype. You get a clean workspace
              for charts, context, and risk controls, plus an explainable “what happened / why” trail so you can
              learn, stay consistent, and build confidence over time.
            </p>

            <div className="landing-hero-ctas">
              <button className="landing-btn landing-btn--primary" type="button" onClick={goAuth}>
                Sign in / Sign up
              </button>

              <button className="landing-btn landing-btn--ghost" type="button" onClick={() => navigate("/about")}>
                Learn more
              </button>
            </div>

            <div className="landing-hero-metrics">
              <div className="landing-metric">
                <div className="landing-metric-top">Made for beginners</div>
                <div className="landing-metric-bottom">Start guided + paper first</div>
              </div>
              <div className="landing-metric">
                <div className="landing-metric-top">Risk-first</div>
                <div className="landing-metric-bottom">Guardrails before automation</div>
              </div>
              <div className="landing-metric">
                <div className="landing-metric-top">Explainable</div>
                <div className="landing-metric-bottom">Clarity without exposing IP</div>
              </div>
            </div>
          </div>

          {/* RIGHT: static illustration image */}
          <div className="landing-hero-right">
            <img src={landingIllustration} alt="U-Stock illustration" className="landing-hero-img" />
          </div>
        </div>
      </section>

      <div className="landing-page">
        {/* WHY SECTION — now inside a modern large card */}
        <section className="landing-section landing-about">
          <div className="landing-section-inner">
            <div className="landing-about-shell">
              <div className="landing-about-head">
                <h2 className="landing-section-title landing-about-title">Why U-Stock?</h2>
                <p className="landing-section-text landing-about-text">
                  Most people aren’t trying to become full-time day traders — they just want a real edge: a system
                  that reduces guesswork, keeps risk visible, and teaches better decision-making. U-Stock is built
                  for that: a clear cockpit you can understand, monitor, and improve — whether you’re investing,
                  swing trading, or learning intraday.
                </p>
              </div>

              <div className="landing-grid-3 landing-grid-3--about">
                <div className="landing-feature-card landing-feature-card--green">
                  <div className="landing-feature-tag">Clarity</div>
                  <h3>Clarity you can understand</h3>
                  <p>
                    Clear status, readable workflows, and decision breadcrumbs so users can learn what changed and
                    why — without needing “trader jargon.”
                  </p>
                </div>

                <div className="landing-feature-card landing-feature-card--green">
                  <div className="landing-feature-tag">Risk-first</div>
                  <h3>Risk controls by default</h3>
                  <p>
                    U-Stock emphasizes guardrails: position sizing, safety gates, and “paper-first” progression so
                    users build confidence responsibly.
                  </p>
                </div>

                <div className="landing-feature-card landing-feature-card--green">
                  <div className="landing-feature-tag">Transparency</div>
                  <h3>Transparency without oversharing</h3>
                  <p>
                    You get explainability and accountability without exposing proprietary internals. The goal is
                    trust and supervision — not reverse-engineering.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* “BIG MARKETING CARD” SECTION */}
        <section className="landing-section landing-bigcard">
          <div className="landing-section-inner">
            <div className="landing-bigcard-shell">
              <div className="landing-bigcard-left">
                <div className="landing-bigcard-eyebrow">Where this is going</div>

                <h2 className="landing-bigcard-title">
                  Level up your investments with
                  <br />
                  <span className="landing-bigcard-titleAccent">Smart Financial Insights</span>
                </h2>

                <p className="landing-bigcard-subtitle">
                  U-Stock is built for everyday users who want clearer decisions — with transparent signals,
                  visible risk, and a guided path from learning → paper → supervised automation.
                </p>

                <ul className="landing-roadmap-list landing-roadmap-list--card">
                  <li>
                    <strong>Now:</strong> charts, snapshots, bot status + logs, and a decision-ready cockpit.
                  </li>
                  <li>
                    <strong>Next:</strong> paper trading + journaling (wins/losses, R-multiples, screenshots, notes).
                  </li>
                  <li>
                    <strong>Soon:</strong> guided automation: scanning + broker execution with strict safety gates.
                  </li>
                </ul>

                <div className="landing-roadmap-ctas">
                  <button className="landing-bigcard-cta" type="button" onClick={goAuth}>
                    Get Started
                  </button>

                  <button className="landing-cta-pill" type="button" onClick={() => setRoadmapOpen(true)}>
                    Roadmap
                  </button>
                </div>
              </div>

              <div className="landing-bigcard-right">
                <div className="landing-bigcard-media">
                  <img src={companyHopeImg} alt="U-Stock vision" className="landing-bigcard-img" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Roadmap modal */}
      <Modal open={roadmapOpen} title="U-Stock Roadmap" onClose={() => setRoadmapOpen(false)} footer={roadmapFooter}>
        <div className="landing-modal-block">
          <div className="landing-modal-pill">Now</div>
          <div className="landing-modal-text">
            Charts, market snapshots, bot status + logs, and a decision-ready cockpit focused on clarity.
          </div>
        </div>

        <div className="landing-modal-block">
          <div className="landing-modal-pill">Next</div>
          <div className="landing-modal-text">
            Paper trading + journaling: wins/losses, R-multiples, screenshots, notes, and “what happened / why”
            playback to help users improve.
          </div>
        </div>

        <div className="landing-modal-block">
          <div className="landing-modal-pill">Soon</div>
          <div className="landing-modal-text">
            Guided automation: scanning + broker execution with strict safety gates, monitoring, and transparent
            decision trails — built for trust and supervision.
          </div>
        </div>

        <div className="landing-modal-note">
          Interested in partnerships, pilots, or investment? The roadmap is intentionally production-first.
        </div>
      </Modal>
    </AppShell>
  );
}
