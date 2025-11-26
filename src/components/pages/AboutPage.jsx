// src/components/pages/AboutPage.jsx
import AppShell from "../layout/AppShell";
import "./AboutPage.css";
import headshot from "../../assets/ericka-headshot.jpeg"; // ⬅ we'll add this file next

export default function AboutPage() {
  return (
    <AppShell>
      <div className="about-page">
        {/* HERO CARD */}
        <section className="about-hero-card">
          <div className="about-hero-text">
            <h1 className="page-title">About the author</h1>
            <p className="muted">
              Hi, I&apos;m <strong>Ericka James</strong> — a software engineer
              and builder behind the u-Stock prototype. I&apos;m obsessed with
              turning messy market data into clear, explainable stories that
              everyday people (and future me) can actually use.
            </p>
            <p className="muted small">
              This project is part playground, part proof-of-concept: a place to
              practice data engineering, quant-style thinking, and front-end
              craftsmanship in one space.
            </p>
          </div>

          <div className="about-hero-aside">
            {/* Headshot instead of EJ circle */}
            <img
              src={headshot}
              alt="Ericka James headshot"
              className="about-avatar-image"
            />

            <div className="about-meta">
              <div className="about-meta-row">
                <span className="label">Role</span>
                <span className="value">Software Engineer &amp; Builder</span>
              </div>
              <div className="about-meta-row">
                <span className="label">Focus</span>
                <span className="value">
                  Data, front-end, and AI-assisted tools
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* GRID SECTIONS */}
        <section className="about-grid">
          <article className="about-card">
            <h2>Why I&apos;m building u-Stock</h2>
            <p className="muted">
              u-Stock started as a way to practice building a serious data
              pipeline: ingesting prices, fundamentals, macro data, and later
              sentiment. Instead of just reading about quant strategies, I
              wanted a hands-on lab where I could design my own signals and
              dashboards.
            </p>
            <p className="muted">
              Long term, I want this project to feel like a{" "}
              <strong>personal research terminal</strong> — something that can
              grow into bots, screeners, and teaching tools.
            </p>
          </article>

          <article className="about-card">
            <h2>What&apos;s under the hood</h2>
            <ul className="about-list">
              <li>React front-end with a clean, card-based dashboard UI</li>
              <li>Python data-scout layer for prices, fundamentals, and macro</li>
              <li>Indicator engine for daily and intraday signals</li>
              <li>Room to plug in future sentiment &amp; news layers</li>
            </ul>
          </article>

          <article className="about-card">
            <h2>Tech I like working with</h2>
            <ul className="about-pill-list">
              <li>React &amp; TypeScript</li>
              <li>Python &amp; pandas</li>
              <li>Pytest &amp; testing culture</li>
              <li>APIs &amp; data pipelines</li>
              <li>Vercel &amp; GitHub workflows</li>
            </ul>
          </article>

          <article className="about-card">
            <h2>Find me online</h2>
            <p className="muted small">
              Want to see more of what I&apos;m building or reach out?
            </p>
            <ul className="about-links">
              <li>
                <a
                  href="https://github.com/ericka-7james"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub → ericka-7james
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/in/erickasmileyjames"
                  target="_blank"
                  rel="noreferrer"
                >
                  LinkedIn → erickasmileyjames
                </a>
              </li>
            </ul>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
