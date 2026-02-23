// src/components/landing/LandingPage.jsx
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/landing/LandingPage.css";

import AppShell from "../layout/AppShell";
import Modal from "../common/Modal";

import { LANDING_PAGE_CONTENT } from "../../content/landing/landingPage.content.ts";

// Headshot (optional)
import headshotImg from "../../assets/ericka-headshot.jpeg";

// Trusted logos
import jpmLogo from "../../assets/trusted-logos/jpmorgan-chase-trusted-gray.png";
import spelmanLogo from "../../assets/trusted-logos/spelman-innovation-lab-trusted-gray.png";
import gpcLogo from "../../assets/trusted-logos/gpc-trusted-gray.png";
import mltLogo from "../../assets/trusted-logos/mlt-trusted-gray.png";

// ✅ Replace ▲ with WelcomeSquirrel asset
// If your filename/extension differs, update this import path.
import welcomeSquirrel from "../../assets/images/WelcomeSquirrel.png";

export default function LandingPage() {
  const navigate = useNavigate();

  const goAuth = useCallback(() => navigate("/auth"), [navigate]);
  const goAbout = useCallback(() => navigate("/about"), [navigate]);

  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const COPY = LANDING_PAGE_CONTENT.copy;
  const ASSETS = LANDING_PAGE_CONTENT.assets;

  const heroImageSrc = headshotImg || ASSETS.heroIllustration;

  const workedAt = useMemo(
    () => [
      { src: jpmLogo, alt: "JPMorgan Chase & Co", zoom: 1.95, y: 1 },
      { src: spelmanLogo, alt: "Spelman Innovation Lab", zoom: 1.85, y: 0 },
      { src: gpcLogo, alt: "Genuine Parts Company", zoom: 2.05, y: 0 },
      { src: mltLogo, alt: "MLT", zoom: 2.15, y: 1 },
    ],
    []
  );

  const projectMetrics = useMemo(
    () => [
      { top: "3", bottom: "Bots shipped", sub: "project metric" },
      { top: "120+", bottom: "Backtests run", sub: "project metric" },
      { top: "~350ms", bottom: "Pipeline latency", sub: "project metric" },
      { top: "AWS", bottom: "Cloud deployed", sub: "project metric" },
      { top: "6", bottom: "Dashboards built", sub: "project metric" },
    ],
    []
  );

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

  // ✅ Demo "coming soon" modal footer
  const demoFooter = useMemo(() => {
    return (
      <div className="landing-modal-footer">
        <button className="landing-modal-btn landing-modal-btn--ghost" type="button" onClick={() => setDemoOpen(false)}>
          Close
        </button>

        <button className="landing-modal-btn landing-modal-btn--primary" type="button" onClick={goAuth}>
          Sign in / Sign up
        </button>
      </div>
    );
  }, [goAuth]);

  return (
    <AppShell>
      {/* HERO */}
      <section className="landing-hero landing-hero--portfolio">
        <div className="landing-hero-inner landing-hero-inner--portfolio">
          <div className="landing-hero-left">
            {/* Brand line */}
            <div className="landing-brandline">
              <img
                src={welcomeSquirrel}
                alt=""
                aria-hidden="true"
                className="landing-brandicon"
              />
              <div className="landing-brandtext">
                <div className="landing-brandtop">U-STOCK</div>
                <div className="landing-brandsub">Lucent Financial</div>
              </div>
            </div>

            {/* Headline */}
            <h1 className="landing-hero-title landing-hero-title--portfolio">
              Hello, I’m <span className="landing-name">Ericka James</span>
              <br />
              <span className="landing-role">Software Engineer</span>
            </h1>

            <p className="landing-hero-subtitle landing-hero-subtitle--portfolio">{COPY.hero.subtitle}</p>

            {/* CTAs */}
            <div className="landing-hero-ctas landing-hero-ctas--portfolio">
              {/* ✅ Orange primary like original: goAuth */}
              <button className="landing-btn landing-btn--primary" type="button" onClick={goAuth}>
                {COPY.hero.ctas?.primary || "Sign in / Sign up"}
              </button>

              {/* ✅ Watch Demo opens “coming soon” modal */}
              <button className="landing-btn landing-btn--ghost" type="button" onClick={() => setDemoOpen(true)}>
                Watch Demo
              </button>

              <button className="landing-btn landing-btn--ghost landing-btn--thin" type="button" onClick={goAbout}>
                {COPY.hero.ctas?.secondary || "Learn more"}
              </button>
            </div>

            {/* Metrics */}
            <div className="landing-hero-metrics landing-hero-metrics--portfolio" aria-label="Project metrics">
              {projectMetrics.map((m) => (
                <div className="landing-metric landing-metric--portfolio" key={m.bottom}>
                  <div className="landing-metric-top">{m.top}</div>
                  <div className="landing-metric-bottom">{m.bottom}</div>
                  <div className="landing-metric-sub">{m.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: headshot (✅ removed play button overlay) */}
          <div className="landing-hero-right landing-hero-right--portfolio">
            <div className="landing-hero-shapes" aria-hidden="true">
              <div className="landing-shape landing-shape--a" />
              <div className="landing-shape landing-shape--b" />
              <div className="landing-shape landing-shape--c" />
            </div>

            <div className="landing-photo-frame">
              <img
                src={heroImageSrc}
                alt="Ericka James headshot"
                className="landing-hero-img landing-hero-img--portfolio"
                loading="eager"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Trusted / Worked at strip */}
      <section className="landing-logo-strip landing-logo-strip--hug" aria-label="Trusted by / Experience">
        <div className="landing-logo-strip-inner">
          {workedAt.map((x) => (
            <div
              className="landing-logo-slot"
              key={x.alt}
              title={x.alt}
              style={{
                "--z": x.zoom,
                "--y": `${x.y || 0}px`,
              }}
            >
              <img className="landing-trusted-logo" src={x.src} alt={x.alt} loading="lazy" decoding="async" />
            </div>
          ))}
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
      <Modal open={roadmapOpen} title={COPY.modal.title} onClose={() => setRoadmapOpen(false)} footer={roadmapFooter}>
        {COPY.modal.blocks.map((b) => (
          <div className="landing-modal-block" key={b.pill}>
            <div className="landing-modal-pill">{b.pill}</div>
            <div className="landing-modal-text">{b.text}</div>
          </div>
        ))}

        <div className="landing-modal-note">{COPY.modal.note}</div>
      </Modal>

      {/* ✅ Demo “coming soon” modal */}
      <Modal open={demoOpen} title="Demo on the way" onClose={() => setDemoOpen(false)} footer={demoFooter}>
        <div className="landing-modal-block">
          <div className="landing-modal-pill">Coming soon</div>
          <div className="landing-modal-text">
            The demo is being packaged up now.
            <br />
            In the meantime, you can sign in or sign up to get early access when it drops.
          </div>
        </div>

        <div className="landing-modal-note">
          Tip: if you want, we can replace this with an embedded Loom/YouTube video later.
        </div>
      </Modal>
    </AppShell>
  );
}