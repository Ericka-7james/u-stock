import AppShell from "../layout/AppShell";
import "../../css/pages/AboutPage.css";
import headshot from "../../assets/ericka-headshot.jpeg";
import lucentLogo from "../../assets/images/companyLogo-logoOnly.png";
import { Link } from "react-router-dom";
import PageHeaderCard from "../common/PageHeaderCard";

export default function AboutPage() {
  return (
    <AppShell>
      <div className="app-page about-page">
        {/* HERO / HEADER CARD (reusable) */}
        <PageHeaderCard
          title="About Lucent Financial"
          subtitle={<span className="about-tagline">Access to smarter financial decisions.</span>}
          right={
            <img
              src={lucentLogo}
              alt="Lucent Financial logo"
              className="about-hero-logo"
            />
          }
        >
          <p className="muted">
            Lucent Financial is a financial intelligence dashboard that organizes market data into a clear,
            explainable decision workflow: discover what’s moving, understand context, and translate signals into action.
          </p>

          <p className="muted small">
            Transparency is the product. Signals are labeled, sources are visible, and the system separates
            <strong> analysis</strong> (what it thinks) from <strong>execution</strong> (what it trades).
            The goal is consistency and control, not hype.
          </p>

          <p className="muted small">
            Paper trading is supported by default, with live execution available through connected brokers.
          </p>

          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
        </PageHeaderCard>

        {/* GRID SECTIONS */}
        <section className="about-grid">
          <article className="about-card">
            <h2>How it works</h2>
            <ul className="about-list">
              <li>Dashboard UI for discovery, charting, and quick context</li>
              <li>Backend APIs for market data, integrations, and bot runtime status</li>
              <li>Runner loop that produces intents and routes execution</li>
              <li>Execution engine that records transaction events</li>
            </ul>
          </article>

          <article className="about-card">
            <h2>Designed to be transparent</h2>
            <p className="muted">
              Every output should be inspectable: what moved, why a symbol is ranked, and what a bot is trying to do.
              “Waiting for market” is treated as a healthy state, not a failure.
            </p>
            <p className="muted small">
              Clear separation between ideas and actions helps keep automation safe and understandable.
            </p>
          </article>

          <article className="about-card">
            <h2>Core features</h2>
            <ul className="about-list">
              <li>Market leaders + opportunities with labeling</li>
              <li>Chart-first workflow (click a symbol and load context)</li>
              <li>Bot status controls + runner health model</li>
              <li>Intent feed: a visible log of strategy suggestions</li>
            </ul>
          </article>

          <article className="about-card">
            <h2>Tech stack</h2>
            <ul className="about-pill-list">
              <li>React</li>
              <li>Python (FastAPI)</li>
              <li>Runner + execution engine</li>
              <li>APIs + data pipelines</li>
              <li>Pytest</li>
              <li>Vercel + GitHub</li>
            </ul>
          </article>

          <article className="about-card">
            <h2>What Lucent provides</h2>
            <ul className="about-list">
              <li>
                <strong>Market leaders</strong> + movers with clean formatting and strict symbol validation
              </li>
              <li>
                <strong>Bot “intents”</strong> (suggestions) that can be reviewed before execution
              </li>
              <li>
                <strong>Runner health</strong> status model (Running, Armed/Waiting, Paused, Offline)
              </li>
              <li>
                <strong>Paper vs live</strong> execution routing with transaction events tracked end-to-end
              </li>
            </ul>
          </article>

          <article className="about-card">
            <h2>Defaults</h2>
            <div className="about-kv">
              <div className="about-kv-row">
                <span className="k">Default mode</span>
                <span className="v">Paper</span>
              </div>
              <div className="about-kv-row">
                <span className="k">Data sources</span>
                <span className="v">APIs + pipelines</span>
              </div>
              <div className="about-kv-row">
                <span className="k">Focus</span>
                <span className="v">Transparency + control</span>
              </div>
            </div>
          </article>

          {/* Builder card spans 2 columns */}
          <article className="about-card about-span2">
            <div className="about-builderHead">
              <h2>About the builder</h2>
            </div>

            <div className="about-builderRow">
              <div className="about-avatarWrap" title="Ericka James">
                <img src={headshot} alt="Ericka James headshot" className="about-avatar-image" />
              </div>

              <div className="about-builderText">
                <p className="muted small" style={{ marginTop: 0 }}>
                  Built by <strong>Ericka James</strong> (Software Engineer). Focused on clean UX, transparent automation,
                  and production-grade workflows.
                </p>

                <ul className="about-links-inline">
                  <li>
                    <a href="https://github.com/ericka-7james" target="_blank" rel="noreferrer">
                      GitHub → ericka-7james
                    </a>
                  </li>
                  <li>
                    <a href="https://www.linkedin.com/in/erickasmileyjames" target="_blank" rel="noreferrer">
                      LinkedIn → erickasmileyjames
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
