import AppShell from "../layout/AppShell";
import "../../css/pages/FeedbackPage.css";

export default function FeedbackPage() {
  return (
    <AppShell>
      <section className="feedback-card">
        <header className="feedback-header">
          <h2 className="feedback-title">Feedback</h2>
          <p className="feedback-subtitle">
            Share ideas, report issues, or ask questions about how U-Stock
            works. Messages here will be routed straight to my inbox.
          </p>
        </header>

        <form
          className="feedback-form"
          onSubmit={(e) => {
            e.preventDefault();
            alert("Feedback submission is coming soon!");
          }}
        >
          <div className="feedback-field">
            <label className="feedback-label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              type="text"
              className="feedback-input"
              placeholder="Your name"
            />
          </div>

          <div className="feedback-field">
            <label className="feedback-label" htmlFor="email">
              Contact email
            </label>
            <input
              id="email"
              type="email"
              className="feedback-input"
              placeholder="you@example.com"
            />
            <p className="feedback-hint">
              I&apos;ll use this if I need to follow up about your feedback.
            </p>
          </div>

          <div className="feedback-field">
            <label className="feedback-label" htmlFor="feedbackType">
              Feedback type
            </label>
            <select id="feedbackType" className="feedback-select">
              <option value="feature">Feature idea</option>
              <option value="bug">Bug report</option>
              <option value="question">Question</option>
              <option value="other">Something else</option>
            </select>
          </div>

          <div className="feedback-field">
            <label className="feedback-label" htmlFor="message">
              Message
            </label>
            <textarea
              id="message"
              className="feedback-textarea"
              placeholder="Tell me what you’d like to learn, improve, or fix in U-Stock."
              rows={6}
            />
          </div>

          <p className="feedback-footer-hint">
            Think of this as your suggestion box. I use these notes to decide
            what to build next.
          </p>

          <div className="feedback-actions">
            <button
              type="submit"
              className="feedback-btn feedback-btn--primary"
            >
              Send feedback
            </button>
            <button
              type="button"
              className="feedback-btn feedback-btn--ghost"
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
