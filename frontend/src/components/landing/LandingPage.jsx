// src/components/landing/LandingPage.jsx
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/landing/LandingPage.css";

import landingIllustration from "../../assets/images/LandingPageIcon_v2.png";
import companyHopeImg from "../../assets/images/companyHope.png";

import AppShell from "../layout/AppShell";
import Modal from "../common/Modal";

import { LANDING_COPY } from "../../content/landingpage.content";

export default function LandingPage() {
  const navigate = useNavigate();

  const goAuth = useCallback(() => navigate("/auth"), [navigate]);
  const goAbout = useCallback(() => navigate("/about"), [navigate]);

  const [roadmapOpen, setRoadmapOpen] = useState(false);

  const roadmapFooter = useMemo(() => {
    return (
      <div className="landing-modal-footer">
        <button
          className="landing-modal-btn landing-modal-btn--ghost"
          type="button"
          onClick={() => setRoadmapOpen(false)}
        >
          {LANDING_COPY.modal.footer.close}
        </button>

        <button className="landing-modal-btn landing-modal-btn--primary" type="button" onClick={goAuth}>
          {LANDING_COPY.modal.footer.earlyAccess}
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
            <div className="landing-hero-kicker">{LANDING_COPY.hero.kicker}</div>

            <h1 className="landing-hero-title">
              {LANDING_COPY.hero.titleLines[0]}
              <br />
              {LANDING_COPY.hero.titleLines[1]}
            </h1>

            <p className="landing-hero-subtitle">{LANDING_COPY.hero.subtitle}</p>

            <div className="landing-hero-ctas">
              <button className="landing-btn landing-btn--primary" type="button" onClick={goAuth}>
                {LANDING_COPY.hero.ctas.primary}
              </button>

              <button className="landing-btn landing-btn--ghost" type="button" onClick={goAbout}>
                {LANDING_COPY.hero.ctas.secondary}
              </button>
            </div>

            <div className="landing-hero-metrics">
              {LANDING_COPY.hero.metrics.map((m) => (
                <div className="landing-metric" key={m.top}>
                  <div className="landing-metric-top">{m.top}</div>
                  <div className="landing-metric-bottom">{m.bottom}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: static illustration image */}
          <div className="landing-hero-right">
            <img src={landingIllustration} alt="U-Stock illustration" className="landing-hero-img" />
          </div>
        </div>
      </section>

      <div className="landing-page">
        {/* WHY SECTION */}
        <section className="landing-section landing-about">
          <div className="landing-section-inner">
            <div className="landing-about-shell">
              <div className="landing-about-head">
                <h2 className="landing-section-title landing-about-title">{LANDING_COPY.why.title}</h2>
                <p className="landing-section-text landing-about-text">{LANDING_COPY.why.body}</p>
              </div>

              <div className="landing-grid-3 landing-grid-3--about">
                {LANDING_COPY.why.cards.map((c) => (
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

        {/* “BIG MARKETING CARD” SECTION */}
        <section className="landing-section landing-bigcard">
          <div className="landing-section-inner">
            <div className="landing-bigcard-shell">
              <div className="landing-bigcard-left">
                <div className="landing-bigcard-eyebrow">{LANDING_COPY.bigCard.eyebrow}</div>

                <h2 className="landing-bigcard-title">
                  {LANDING_COPY.bigCard.titleLines[0]}
                  <br />
                  <span className="landing-bigcard-titleAccent">{LANDING_COPY.bigCard.titleLines[1]}</span>
                </h2>

                <p className="landing-bigcard-subtitle">{LANDING_COPY.bigCard.subtitle}</p>

                <ul className="landing-roadmap-list landing-roadmap-list--card">
                  {LANDING_COPY.bigCard.roadmap.map((r) => (
                    <li key={r.label}>
                      <strong>{r.label}:</strong> {r.text}
                    </li>
                  ))}
                </ul>

                <div className="landing-roadmap-ctas">
                  <button className="landing-bigcard-cta" type="button" onClick={goAuth}>
                    {LANDING_COPY.bigCard.ctas.primary}
                  </button>

                  <button className="landing-cta-pill" type="button" onClick={() => setRoadmapOpen(true)}>
                    {LANDING_COPY.bigCard.ctas.roadmap}
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
      <Modal
        open={roadmapOpen}
        title={LANDING_COPY.modal.title}
        onClose={() => setRoadmapOpen(false)}
        footer={roadmapFooter}
      >
        {LANDING_COPY.modal.blocks.map((b) => (
          <div className="landing-modal-block" key={b.pill}>
            <div className="landing-modal-pill">{b.pill}</div>
            <div className="landing-modal-text">{b.text}</div>
          </div>
        ))}

        <div className="landing-modal-note">{LANDING_COPY.modal.note}</div>
      </Modal>
    </AppShell>
  );
}
