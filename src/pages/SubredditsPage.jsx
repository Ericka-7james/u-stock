// src/pages/SubredditsPage.jsx
import { Link } from "react-router-dom";
import { useRedditMentions } from "../hooks/useRedditMentions";
import './SubredditsPage.css';

export default function SubredditsPage() {
  const { meta, loading } = useRedditMentions();
  const subreddits = meta?.subreddits ?? [];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="page-title">Subreddit Breakdown</h1>
          <p className="muted">
            View which communities are included in this U-Stock radar snapshot.
          </p>
        </div>

        {/* Back link lives in the header, on the right */}
        <Link to="/" className="back-link">
          ← Back to dashboard
        </Link>
      </header>

      {loading ? (
        <p className="muted">Loading subreddit details…</p>
      ) : subreddits.length === 0 ? (
        <p className="muted">No subreddit metadata found.</p>
      ) : (
        <div className="panel">
          <h3>Included subreddits</h3>
          <ul className="subreddit-list">
            {subreddits.map((sub) => (
              <li key={sub}>
                <a
                  href={`https://www.reddit.com/r/${sub}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  r/{sub}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
