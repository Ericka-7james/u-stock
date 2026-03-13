import { Link } from "react-router-dom";

import AppShell from "../layout/AppShell";
import PageHeaderCard from "../common/PageHeaderCard";
import ContentCard from "../common/ContentCard";
import "../../css/pages/AboutPage.css";

import headshot from "../../assets/ericka-headshot.jpeg";
import AboutPageSquirrel from "../../assets/pages/AboutPageSquirrel.png";

import { ABOUT_PAGE_COPY } from "../../content/pages/aboutPage.content.ts";

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
              src={AboutPageSquirrel}
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
          <ContentCard title={c.sections.howItWorks.title} className="about-card">
            <ul className="about-list">
              {c.sections.howItWorks.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ContentCard>

          <ContentCard title={c.sections.transparency.title} className="about-card">
            <p className="muted">{c.sections.transparency.body}</p>
            <p className="muted small">{c.sections.transparency.note}</p>
          </ContentCard>

          <ContentCard title={c.sections.coreFeatures.title} className="about-card">
            <ul className="about-list">
              {c.sections.coreFeatures.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ContentCard>

          {c.sections.safety ? (
            <ContentCard title={c.sections.safety.title} className="about-card">
              <ul className="about-list">
                {c.sections.safety.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </ContentCard>
          ) : null}

          <ContentCard title={c.sections.techStack.title} className="about-card">
            <ul className="about-pill-list">
              {c.sections.techStack.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ContentCard>

          <ContentCard title={c.sections.provides.title} className="about-card">
            <ul className="about-list">
              {c.sections.provides.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ContentCard>

          <ContentCard title={c.sections.defaults.title} className="about-card">
            <div className="about-kv">
              {c.sections.defaults.kv.map((row) => (
                <div className="about-kv-row" key={row.k}>
                  <span className="k">{row.k}</span>
                  <span className="v">{row.v}</span>
                </div>
              ))}
            </div>
          </ContentCard>

          <ContentCard className="about-card about-span2">
            <div className="about-builderHead">
              <h2 className="content-card-title">{c.sections.builder.title}</h2>
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
          </ContentCard>
        </section>
      </div>
    </AppShell>
  );
}