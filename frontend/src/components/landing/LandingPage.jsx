// src/components/landing/LandingPage.jsx

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/landing/LandingPage.css";

import AppShell from "../layout/AppShell";
import Modal from "../common/Modal";
import AppImage from "../common/AppImage.jsx";
import PillButton from "../common/PillButton.jsx";
import DashboardCard from "../dashboard/cards/shared/DashboardCard.jsx";

import { LANDING_PAGE_CONTENT } from "../../content/landing/landingpage.content.ts";

import headshotImg from "../../assets/ericka-headshot.jpeg";
import jpmLogo from "../../assets/trusted-logos/jpmorgan-chase-trusted-gray.png";
import spelmanLogo from "../../assets/trusted-logos/spelman-innovation-lab-trusted-gray.png";
import gpcLogo from "../../assets/trusted-logos/gpc-trusted-gray.png";
import mltLogo from "../../assets/trusted-logos/mlt-trusted-gray.png";
import welcomeSquirrel from "../../assets/icons/LucentAppIcon.png";

/**
 * Returns normalized logo metadata for the trusted-work strip.
 *
 * The CSS classes control scale and vertical alignment so the component
 * avoids inline styles and remains easier to maintain.
 *
 * @param {Object} tooltips Landing content tooltip strings.
 * @return {Array<{src: string, alt: string, slotClassName: string}>}
 */
function buildWorkedAtLogos(tooltips) {
  return [
    {
      src: jpmLogo,
      alt: tooltips.jpm,
      slotClassName: "landing-logo-slot landing-logo-slot--jpm",
    },
    {
      src: spelmanLogo,
      alt: tooltips.spelman,
      slotClassName: "landing-logo-slot landing-logo-slot--spelman",
    },
    {
      src: gpcLogo,
      alt: tooltips.gpc,
      slotClassName: "landing-logo-slot landing-logo-slot--gpc",
    },
    {
      src: mltLogo,
      alt: tooltips.mlt,
      slotClassName: "landing-logo-slot landing-logo-slot--mlt",
    },
  ];
}

/**
 * Normalizes hero metric content from static landing-page content.
 *
 * If content-driven metrics are missing, this returns a safe fallback so
 * the page remains stable in production.
 *
 * @param {Array<{top: string, bottom: string}> | undefined} metrics
 * @return {Array<{top: string, bottom: string, sub: string}>}
 */
function buildProjectMetrics(metrics) {
  if (Array.isArray(metrics) && metrics.length > 0) {
    return metrics.map((metric) => ({
      top: metric.top,
      bottom: metric.bottom,
      sub: "project metric",
    }));
  }

  return [
    { top: "3", bottom: "Bots shipped", sub: "project metric" },
    { top: "120+", bottom: "Backtests run", sub: "project metric" },
    { top: "~350ms", bottom: "Pipeline latency", sub: "project metric" },
    { top: "AWS", bottom: "Cloud deployed", sub: "project metric" },
    { top: "6", bottom: "Dashboards built", sub: "project metric" },
  ];
}

/**
 * Renders the U-Stock landing page.
 *
 * This page serves as the portfolio-style public landing experience for
 * U-Stock / Lucent Financial. It presents the hero section, trust strip,
 * feature summary, roadmap teaser, and roadmap modal.
 *
 * Responsibilities:
 * - Read content from `LANDING_PAGE_CONTENT`
 * - Handle navigation to auth and about pages
 * - Manage roadmap modal visibility
 * - Render production-safe fallback content where needed
 *
 * @return {JSX.Element} Landing page view.
 */
export default function LandingPage() {
  const navigate = useNavigate();
  const [roadmapOpen, setRoadmapOpen] = useState(false);

  const COPY = LANDING_PAGE_CONTENT.copy;
  const ASSETS = LANDING_PAGE_CONTENT.assets;

  const goAuth = useCallback(() => {
    navigate("/auth");
  }, [navigate]);

  const goAbout = useCallback(() => {
    navigate("/about");
  }, [navigate]);

  const openRoadmap = useCallback(() => {
    setRoadmapOpen(true);
  }, []);

  const closeRoadmap = useCallback(() => {
    setRoadmapOpen(false);
  }, []);

  const heroImageSrc = headshotImg || ASSETS.heroIllustration;

  const workedAt = useMemo(() => {
    return buildWorkedAtLogos(COPY.workedAt.tooltips);
  }, [COPY.workedAt.tooltips]);

  const projectMetrics = useMemo(() => {
    return buildProjectMetrics(COPY?.hero?.metrics);
  }, [COPY?.hero?.metrics]);

  const roadmapFooter = useMemo(() => {
    return (
      <div className="landing-modal-footer">
        <button
          className="landing-modal-btn landing-modal-btn--ghost"
          type="button"
          onClick={closeRoadmap}
        >
          {COPY.modal.footer.close}
        </button>

        <button
          className="landing-modal-btn landing-modal-btn--primary"
          type="button"
          onClick={goAuth}
        >
          {COPY.modal.footer.earlyAccess}
        </button>
      </div>
    );
  }, [COPY.modal.footer.close, COPY.modal.footer.earlyAccess, closeRoadmap, goAuth]);

  return (
    <AppShell>
      <div className="landing-page">
        <div className="landing-page-wrap">
          <DashboardCard
            as="section"
            className="landing-hero landing-hero--portfolio"
            title={null}
            subtitle={null}
            headerClassName=""
            headerLeftClassName=""
          >
            <div className="landing-hero-inner landing-hero-inner--portfolio">
              <div className="landing-hero-left">
                <div className="landing-brandline">
                  <AppImage
                    src={welcomeSquirrel}
                    alt=""
                    ariaHidden
                    className="landing-brandicon"
                    loading="eager"
                    decoding="async"
                  />

                  <div className="landing-brandtext">
                    <div className="landing-brandtop">U-STOCK</div>
                    <div className="landing-brandsub">Lucent Financial</div>
                  </div>
                </div>

                <h1 className="landing-hero-title landing-hero-title--portfolio">
                  Hello, I’m <span className="landing-name">Ericka James</span>
                  <br />
                  <span className="landing-role">Software Engineer</span>
                </h1>

                <p className="landing-hero-subtitle landing-hero-subtitle--portfolio">
                  {COPY.hero.subtitle}
                </p>

                <div className="landing-hero-ctas landing-hero-ctas--portfolio">
                  <button
                    className="btn btn--primary landing-btn landing-btn--primary"
                    type="button"
                    onClick={goAuth}
                  >
                    {COPY.hero.ctas?.primary}
                  </button>

                  <button
                    className="btn btn--ghost landing-btn landing-btn--ghost"
                    type="button"
                    onClick={openRoadmap}
                  >
                    {COPY.hero.ctas?.roadmap || "See roadmap"}
                  </button>

                  <button
                    className="btn btn--ghost btn--thin landing-btn landing-btn--ghost landing-btn--thin"
                    type="button"
                    onClick={goAbout}
                  >
                    {COPY.hero.ctas?.secondary}
                  </button>
                </div>

                <div
                  className="landing-hero-metrics landing-hero-metrics--portfolio"
                  aria-label="Project metrics"
                >
                  {projectMetrics.map((metric) => (
                    <div
                      className="landing-metric landing-metric--portfolio"
                      key={`${metric.top}-${metric.bottom}`}
                    >
                      <div className="landing-metric-top">{metric.top}</div>
                      <div className="landing-metric-bottom">{metric.bottom}</div>
                      <div className="landing-metric-sub">{metric.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="landing-hero-right landing-hero-right--portfolio">
                <div className="landing-hero-shapes" aria-hidden="true">
                  <div className="landing-shape landing-shape--a" />
                  <div className="landing-shape landing-shape--b" />
                  <div className="landing-shape landing-shape--c" />
                </div>

                <div className="landing-photo-frame">
                  <AppImage
                    src={heroImageSrc}
                    alt="Ericka James headshot"
                    className="landing-hero-img landing-hero-img--portfolio"
                    loading="eager"
                    decoding="async"
                  />
                </div>
              </div>
            </div>
          </DashboardCard>

          <section
            className="landing-logo-strip landing-logo-strip--hug"
            aria-label={COPY.workedAt.ariaLabel}
          >
            <div className="landing-logo-strip-inner">
              {workedAt.map((logo) => (
                <AppImage
                  key={logo.alt}
                  src={logo.src}
                  alt={logo.alt}
                  className="landing-trusted-logo"
                  wrapperClassName={logo.slotClassName}
                  wrapperProps={{ "data-tooltip": logo.alt }}
                  loading="lazy"
                  decoding="async"
                />
              ))}

              <div className="landing-logo-strip-caption">{COPY.workedAt.caption}</div>
            </div>
          </section>

          <section className="app-section landing-section landing-about">
            <div className="app-section-inner landing-section-inner">
              <DashboardCard
                as="section"
                className="surface surface--pad-lg landing-about-shell"
                title={null}
                subtitle={null}
                headerClassName=""
                headerLeftClassName=""
              >
                <div className="landing-about-head">
                  <h2 className="section-title landing-section-title landing-about-title">
                    {COPY.why.title}
                  </h2>
                  <p className="section-text landing-section-text landing-about-text">
                    {COPY.why.body}
                  </p>
                </div>

                <div className="landing-grid-3 landing-grid-3--about">
                  {COPY.why.cards.map((card) => (
                    <div
                      className="surface-card interactive-lift landing-feature-card landing-feature-card--green"
                      key={card.title}
                    >
                      <PillButton
                        as="span"
                        variant="accent"
                        size="sm"
                        className="landing-feature-tag"
                      >
                        {card.tag}
                      </PillButton>

                      <h3>{card.title}</h3>
                      <p>{card.body}</p>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </div>
          </section>

          <section className="app-section landing-section landing-bigcard">
            <div className="app-section-inner landing-section-inner">
              <DashboardCard
                as="section"
                className="surface surface--pad-lg landing-bigcard-shell"
                title={null}
                subtitle={null}
                headerClassName=""
                headerLeftClassName=""
              >
                <div className="landing-bigcard-left">
                  <div className="landing-bigcard-eyebrow">{COPY.bigCard.eyebrow}</div>

                  <h2 className="landing-bigcard-title">
                    {COPY.bigCard.titleLines[0]}
                    <br />
                    <span className="landing-bigcard-titleAccent">
                      {COPY.bigCard.titleLines[1]}
                    </span>
                  </h2>

                  <p className="landing-bigcard-subtitle">{COPY.bigCard.subtitle}</p>

                  <ul className="landing-roadmap-list landing-roadmap-list--card">
                    {COPY.bigCard.roadmap.map((item) => (
                      <li key={item.label}>
                        <strong>{item.label}:</strong> {item.text}
                      </li>
                    ))}
                  </ul>

                  <div className="landing-roadmap-ctas">
                    <button className="landing-bigcard-cta" type="button" onClick={goAuth}>
                      {COPY.bigCard.ctas.primary}
                    </button>

                    <PillButton
                      variant="accent"
                      size="md"
                      className="landing-cta-pill"
                      onClick={openRoadmap}
                    >
                      {COPY.bigCard.ctas.roadmap}
                    </PillButton>
                  </div>
                </div>

                <div className="landing-bigcard-right">
                  <div className="landing-bigcard-media">
                    <AppImage
                      src={ASSETS.visionImage}
                      alt="U-Stock vision"
                      className="landing-bigcard-img"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              </DashboardCard>
            </div>
          </section>
        </div>

        <Modal
          open={roadmapOpen}
          title={COPY.modal.title}
          onClose={closeRoadmap}
          footer={roadmapFooter}
        >
          {COPY.modal.blocks.map((block) => (
            <div className="landing-modal-block" key={block.pill}>
              <PillButton
                as="span"
                variant="accent"
                size="sm"
                className="landing-modal-pill"
              >
                {block.pill}
              </PillButton>

              <div className="landing-modal-text">{block.text}</div>
            </div>
          ))}

          <div className="landing-modal-note">{COPY.modal.note}</div>
        </Modal>
      </div>
    </AppShell>
  );
}