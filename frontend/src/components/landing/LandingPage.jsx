// src/components/landing/LandingPage.jsx
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/landing/LandingPage.css";

import AppShell from "../layout/AppShell";
import Modal from "../common/Modal";

import { LANDING_PAGE_CONTENT } from "../../content/landing/landingPage.content";

export default function LandingPage() {
  const navigate = useNavigate();

  const goAuth = useCallback(() => navigate("/auth"), [navigate]);
  const goAbout = useCallback(() => navigate("/about"), [navigate]);

  const [roadmapOpen, setRoadmapOpen] = useState(false);

  const COPY = LANDING_PAGE_CONTENT.copy;
  const ASSETS = LANDING_PAGE_CONTENT.assets;

  const roadmapFooter = useMemo(() => {
    return (
      <div className="landing-modal-footer">
        <button
          className="landing-modal-btn landing-modal-btn--ghost"
          type="button"
          onClick={() => setRoadmapOpen(false)}
        >
          {COPY.modal.footer.close}
        </button>

        <button className="landing-modal-btn landing-modal-btn--primary" type="button" onClick={goAuth}>
          {COPY.modal.footer.earlyAccess}
        </button>
      </div>
    );
  }, [goAuth, COPY.modal.footer.close, COPY.modal.footer.earlyAccess]);

  return (
    <AppShell>
      {/* HERO */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-left">
            <div className="landing-hero-kicker">{COPY.hero.kicker}</div>

            <h1 className="landing-hero-title">
              {COPY.hero.titleLines[0]}
              <br />
              {COPY.hero.titleLines[1]}
            </h1>

            <p className="landing-hero-subtitle">{COPY.hero.subtitle}</p>

            <div className="landing-hero-ctas">
              <button className="landing-btn landing-btn--primary" type="button" onClick={goAuth}>
                {COPY.hero.ctas.primary}
              </button>

              <button className="landing-btn landing-btn--ghost" type="button" onClick={goAbout}>
                {COPY.hero.ctas.secondary}
              </button>
            </div>

            <div className="landing-hero-metrics">
              {COPY.hero.metrics.map((m) => (
                <div className="landing-metric" key={m.top}>
                  <div className="landing-metric-top">{m.top}</div>
                  <div className="landing-metric-bottom">{m.bottom}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: static illustration image */}
          <div className="landing-hero-right">
            <img
              src={ASSETS.heroIllustration}
              alt="U-Stock illustration"
              className="landing-hero-img"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <div className="landing-page">
        {/* WHY SECTION */}
        <section className="landing-section landing-about">
          <div className="landing-section-inner">
            <div className="landing-about-shell">
              <div className="landing-about-head">
                <h2 className="landing-section-title landing-about-title">{COPY.why.title}</h2>
                <p className="landing-section-text landing-about-text">{COPY.why.body}</p>
              </div>

              <div className="landing-grid-3 landing-grid-3--about">
                {COPY.why.cards.map((c) => (
                  <div className="landing-feature-card landing-feature-card--green" key={c.title}>
                    <div className="landing-feature-tag">{c.tag}</div>
                    <h3>{c.title}</h3>
                    <p>{c.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* BIG MARKETING CARD */}
        <section className="landing-section landing-bigcard">
          <div className="landing-section-inner">
            <div className="landing-bigcard-shell">
              <div className="landing-bigcard-left">
                <div className="landing-bigcard-eyebrow">{COPY.bigCard.eyebrow}</div>

                <h2 className="landing-bigcard-title">
                  {COPY.bigCard.titleLines[0]}
                  <br />
                  <span className="landing-bigcard-titleAccent">{COPY.bigCard.titleLines[1]}</span>
                </h2>

                <p className="landing-bigcard-subtitle">{COPY.bigCard.subtitle}</p>

                <ul className="landing-roadmap-list landing-roadmap-list--card">
                  {COPY.bigCard.roadmap.map((r) => (
                    <li key={r.label}>
                      <strong>{r.label}:</strong> {r.text}
                    </li>
                  ))}
                </ul>

                <div className="landing-roadmap-ctas">
                  <button className="landing-bigcard-cta" type="button" onClick={goAuth}>
                    {COPY.bigCard.ctas.primary}
                  </button>

                  <button className="landing-cta-pill" type="button" onClick={() => setRoadmapOpen(true)}>
                    {COPY.bigCard.ctas.roadmap}
                  </button>
                </div>
              </div>

              <div className="landing-bigcard-right">
                <div className="landing-bigcard-media">
                  <img
                    src={ASSETS.visionImage}
                    alt="U-Stock vision"
                    className="landing-bigcard-img"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Roadmap modal */}
      <Modal
        open={roadmapOpen}
        title={COPY.modal.title}
        onClose={() => setRoadmapOpen(false)}
        footer={roadmapFooter}
      >
        {COPY.modal.blocks.map((b) => (
          <div className="landing-modal-block" key={b.pill}>
            <div className="landing-modal-pill">{b.pill}</div>
            <div className="landing-modal-text">{b.text}</div>
          </div>
        ))}

        <div className="landing-modal-note">{COPY.modal.note}</div>
      </Modal>
    </AppShell>
  );
}
