import { Link } from "react-router-dom";
import { useRedditMentions } from "../hooks/useRedditMentions";
import AppShell from "../components/layout/AppShell";
import "./SubredditsPage.css";

export default function SubredditsPage() {
  const { meta, loading } = useRedditMentions();
  const subreddits = meta?.subreddits ?? [];

  return (
    <AppShell>
      <div className="dashboard subreddits-page">
        <header className="subreddit-hero">
          <div className="subreddit-hero-text">
            <h1 className="page-title">Subreddit breakdown</h1>
            <p className="muted">
              These are the communities feeding your current U-Stock radar
              snapshot.
            </p>
          </div>

          <Link to="/" className="back-link-pill">
            ← Back to dashboard
          </Link>
        </header>

        {loading ? (
          <p className="muted">Loading subreddit details…</p>
        ) : subreddits.length === 0 ? (
          <p className="muted">No subreddit metadata found.</p>
        ) : (
          <section className="subreddit-layout">
            <div className="subreddit-summary-card">
              <h2>Communities in this snapshot</h2>
              <p className="muted">
                U-Stock is currently tracking{" "}
                <span className="highlight-count">
                  {subreddits.length}
                </span>{" "}
                subreddits for this pull.
              </p>
            </div>

            <div className="subreddit-card-grid">
              {subreddits.map((sub) => (
                <a
                  key={sub}
                  className="subreddit-card"
                  href={`https://www.reddit.com/r/${sub}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="subreddit-chip">r/{sub}</div>
                  <div className="subreddit-card-footer">
                    Open on Reddit →
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
