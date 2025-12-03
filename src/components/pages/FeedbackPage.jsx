// src/components/settings/SettingsPage.jsx
import AppShell from "../layout/AppShell";
import "./FeedbackPage.css";

export default function SettingsPage() {
  return (
    <AppShell title="Settings">
      <div className="settings-page">
        <div className="settings-card">
          <header className="settings-header">
            <h2 className="settings-title">Feedback</h2>
            <p className="settings-subtitle">
              Share ideas, report issues, or ask questions about how U-Stock works.
              Messages here will be routed straight to my inbox.
            </p>
          </header>

          <form className="settings-form">
            <div className="settings-field">
              <label className="settings-label" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                type="text"
                className="settings-input"
                placeholder="Your name"
              />
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="email">
                Contact email
              </label>
              <input
                id="email"
                type="email"
                className="settings-input"
                placeholder="you@example.com"
              />
              <p className="settings-hint">
                I&apos;ll use this if I need to follow up about your feedback.
              </p>
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="feedbackType">
                Feedback type
              </label>
              <select id="feedbackType" className="settings-select">
                <option value="feature">Feature idea</option>
                <option value="bug">Bug report</option>
                <option value="question">Question</option>
                <option value="other">Something else</option>
              </select>
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="message">
                Message
              </label>
              <textarea
                id="message"
                className="settings-textarea"
                placeholder="Tell me what you’d like to learn, improve, or fix in U-Stock."
                rows={6}
              />
            </div>

            <p className="settings-footer-hint">
              Think of this as your suggestion box. I use these notes to decide what
              to build next.
            </p>

            <div className="settings-actions">
              <button type="submit" className="settings-btn settings-btn--primary">
                Send feedback
              </button>
              <button
                type="button"
                className="settings-btn settings-btn--ghost"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
