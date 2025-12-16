// src/components/pages/FeedbackPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../layout/AppShell";
import "../../css/pages/FeedbackPage.css";
import { API_BASE, API_PREFIX } from "../../config/config";
import { useAuth } from "../../context/AuthContext";

const MAX_MESSAGE_CHARS = 1200;

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function throwReadable(res) {
  const data = await safeJson(res);
  const msg = data?.detail || `Request failed (${res.status})`;
  throw new Error(msg);
}

export default function FeedbackPage() {
  const navigate = useNavigate();
  const { user, isAuthed } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [feedbackType, setFeedbackType] = useState("feature");
  const [message, setMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | success | error
  const [error, setError] = useState("");

  const remaining = useMemo(
    () => MAX_MESSAGE_CHARS - message.length,
    [message]
  );

  // ✅ Autofill if logged in (best-effort)
  useEffect(() => {
    if (!isAuthed || !user) return;

    // Only fill if user hasn't typed yet
    if (!email && user.email) setEmail(user.email);
    if (!name && (user.username || user.name)) setName(user.username || user.name);
  }, [isAuthed, user, email, name]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setStatus("idle");

    const trimmedMsg = message.trim();
    if (!trimmedMsg) {
      setStatus("error");
      setError("Please enter a message.");
      return;
    }

    if (message.length > MAX_MESSAGE_CHARS) {
      setStatus("error");
      setError(`Message is too long (max ${MAX_MESSAGE_CHARS} characters).`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}${API_PREFIX}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ok even for anon; harmless
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim() || null,
          feedback_type: feedbackType,
          message: trimmedMsg,
          user_id: user?.id || null,
          user_agent: navigator.userAgent,
          page_url: window.location.href,
        }),
      });

      if (!res.ok) await throwReadable(res);

      setStatus("success");
      setName("");
      setEmail("");
      setFeedbackType("feature");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Failed to send feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <section className="feedback-card">
        <header className="feedback-header">
          <h2 className="feedback-title">Feedback</h2>
          <p className="feedback-subtitle">
            Share ideas, report issues, or ask questions about how U-Stock works.
            Messages here will be routed straight to my inbox.
          </p>
        </header>

        <form className="feedback-form" onSubmit={handleSubmit}>
          <div className="feedback-field">
            <label className="feedback-label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              type="text"
              className="feedback-input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="feedback-hint">
              I&apos;ll use this if I need to follow up about your feedback.
            </p>
          </div>

          <div className="feedback-field">
            <label className="feedback-label" htmlFor="feedbackType">
              Feedback type
            </label>
            <select
              id="feedbackType"
              className="feedback-select"
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value)}
            >
              <option value="feature">Feature idea</option>
              <option value="bug">Bug report</option>
              <option value="question">Question</option>
              <option value="other">Something else</option>
            </select>
          </div>

          <div className="feedback-field">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <label className="feedback-label" htmlFor="message">
                Message
              </label>
              <span
                style={{
                  fontSize: 12,
                  opacity: 0.7,
                  fontFamily: "monospace",
                }}
              >
                {message.length}/{MAX_MESSAGE_CHARS}
              </span>
            </div>

            <textarea
              id="message"
              className="feedback-textarea"
              placeholder="Tell me what you’d like to learn, improve, or fix in U-Stock."
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_CHARS))}
            />
            {remaining <= 100 ? (
              <p className="feedback-hint" style={{ marginTop: 8 }}>
                {remaining} characters left
              </p>
            ) : null}
          </div>

          <p className="feedback-footer-hint">
            Think of this as your suggestion box. I use these notes to decide what to build next.
          </p>

          {status === "success" ? (
            <div className="feedback-success">
              ✅ Thanks! Your feedback was sent.
            </div>
          ) : null}

          {status === "error" && error ? (
            <div className="feedback-error">
              ⚠️ {error}
            </div>
          ) : null}

          <div className="feedback-actions">
            <button
              type="submit"
              className="feedback-btn feedback-btn--primary"
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Send feedback"}
            </button>

            <button
              type="button"
              className="feedback-btn feedback-btn--ghost"
              onClick={() => navigate(-1)}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
