// frontend/src/components/dashboard/pages/AboutPage.jsx
import AppShell from "../layout/AppShell";
import "../../css/pages/AboutPage.css";

import headshot from "../../assets/ericka-headshot.jpeg";
import MarketBaselinesSquirrel from "../../assets/pages/MarketBaselinesSquirrel.png";

import { Link } from "react-router-dom";
import PageHeaderCard from "../common/PageHeaderCard";

import { ABOUT_PAGE_COPY } from "../../content/aboutpage.content";

export default function AboutPage() {
  const c = ABOUT_PAGE_COPY;

  return (
    <AppShell>
      <div className="about-page">
        <PageHeaderCard
          title={c.header.title}
          subtitle={<span className="about-tagline">{c.header.tagline}</span>}
          right={
            <img
              src={MarketBaselinesSquirrel}
              alt="Lucent Financial mascot"
              className="about-hero-logo"
            />
          }
        >
          <p className="muted">{c.intro.primary}</p>
          <p className="muted small">{c.intro.secondary}</p>
          <p className="muted small">{c.intro.tertiary}</p>

          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
        </PageHeaderCard>

        <section className="about-grid">
          <article className="about-card">
            <h2>{c.sections.howItWorks.title}</h2>
            <ul className="about-list">
              {c.sections.howItWorks.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="about-card">
            <h2>{c.sections.transparency.title}</h2>
            <p className="muted">{c.sections.transparency.body}</p>
            <p className="muted small">{c.sections.transparency.note}</p>
          </article>

          <article className="about-card">
            <h2>{c.sections.coreFeatures.title}</h2>
            <ul className="about-list">
              {c.sections.coreFeatures.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="about-card">
            <h2>{c.sections.techStack.title}</h2>
            <ul className="about-pill-list">
              {c.sections.techStack.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="about-card">
            <h2>{c.sections.provides.title}</h2>
            <ul className="about-list">
              {c.sections.provides.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="about-card">
            <h2>{c.sections.defaults.title}</h2>
            <div className="about-kv">
              {c.sections.defaults.kv.map((row) => (
                <div className="about-kv-row" key={row.k}>
                  <span className="k">{row.k}</span>
                  <span className="v">{row.v}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="about-card about-span2">
            <div className="about-builderHead">
              <h2>{c.sections.builder.title}</h2>
            </div>

            <div className="about-builderRow">
              <div className="about-avatarWrap" title="Ericka James">
                <img
                  src={headshot}
                  alt="Ericka James headshot"
                  className="about-avatar-image"
                />
              </div>

              <div className="about-builderText">
                <p className="muted small" style={{ marginTop: 0 }}>
                  {c.sections.builder.bio}
                </p>

                <ul className="about-links-inline">
                  {c.sections.builder.links.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} target="_blank" rel="noreferrer">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}