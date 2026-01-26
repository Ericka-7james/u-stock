// src/components/pages/FeedbackPage.jsx
import { useEffect, useMemo, useState } from "react";
import Turnstile from "react-turnstile";
import AppShell from "../layout/AppShell";
import "../../css/pages/FeedbackPage.css";
import { API_BASE, API_PREFIX } from "../../config/config";
import { useAuth } from "../../context/AuthContext";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

// word count UI + validation
const WORD_LIMIT = 250;
const MIN_WORDS = 3;

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function countWords(s) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

export default function FeedbackPage() {
  const { user, isAuthed, refreshSession } = useAuth();

  const [honeypot, setHoneypot] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [feedbackType, setFeedbackType] = useState("feature");
  const [message, setMessage] = useState("");

  const [token, setToken] = useState(null);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ensure we have latest /auth/me info (email) after login
  useEffect(() => {
    if (isAuthed) refreshSession?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  // Autofill if signed in + fields empty
  useEffect(() => {
    if (!isAuthed || !user) return;

    const userEmail = user.email || "";
    const fallbackName = userEmail ? userEmail.split("@")[0] : "";

    setEmail((prev) => prev || userEmail);
    setName((prev) => prev || fallbackName);
  }, [isAuthed, user?.email]);

  const wordCount = useMemo(() => countWords(message), [message]);
  const overLimit = wordCount > WORD_LIMIT;
  const underMin = wordCount > 0 && wordCount < MIN_WORDS;

  const isTest = import.meta.env.MODE === "test";
  const captchaRequired = !(import.meta.env.DEV || isTest);
  const captchaOk = captchaRequired ? (SITE_KEY ? !!token : false) : true;

  const canSubmit = useMemo(() => {
    const messageOk = wordCount >= MIN_WORDS && !overLimit;
    return messageOk && captchaOk && !submitting;
  }, [wordCount, overLimit, captchaOk, submitting]);

  const resetForm = () => {
    setFeedbackType("feature");
    setMessage("");
    setToken(null);
    setStatus("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus("");

    if (honeypot.trim()) {
      setStatus("Sent! Thank you.");
      return;
    }
    if (wordCount < MIN_WORDS) {
      setStatus(`Please enter at least ${MIN_WORDS} words.`);
      return;
    }
    if (overLimit) {
      setStatus(`Please keep your message under ${WORD_LIMIT} words.`);
      return;
    }

    if (captchaRequired && SITE_KEY && !token) {
      setStatus("Please complete the captcha.");
      return;
    }
    if (captchaRequired && !SITE_KEY) {
      setStatus("Captcha is required in production but VITE_TURNSTILE_SITE_KEY is missing.");
      return;
    }

    setSubmitting(true);

    let timeoutId = null;

    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(`${API_BASE}${API_PREFIX}/feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim() || null,
          feedback_type: feedbackType,
          message: message.trim(),
          turnstile_token: captchaRequired && SITE_KEY ? token : "",
          honeypot,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        setStatus(data?.detail || "Failed to send feedback.");
        return;
      }

      setStatus("Sent! Thank you.");
      setMessage("");
      setToken(null);
    } catch (err) {
      if (err?.name === "AbortError") setStatus("Request timed out. Backend didn’t respond.");
      else setStatus(err?.message || "Failed to send feedback.");
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setSubmitting(false);
    }

  };

  return (
    <AppShell>
      <div className="app-page feedback-page">
        <div className="feedback-lane">
          <section className="feedback-auth-card">
            <header className="feedback-auth-header">
              <h1 className="feedback-auth-title">Feedback</h1>
              <p className="feedback-auth-subtitle">
                Share ideas, report issues, or ask questions about how U-Stock works. Messages here will be routed
                straight to my inbox.
              </p>
            </header>

            <form className="feedback-auth-form" onSubmit={onSubmit}>
              {/* Honeypot */}
              <div className="feedback-honeypot" aria-hidden="true">
                <label>
                  Do not fill this out:
                  <input
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    autoComplete="off"
                    tabIndex={-1}
                  />
                </label>
              </div>

              {/* Name */}
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
                  autoComplete="name"
                />
              </div>

              {/* Email */}
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
                  autoComplete="email"
                />
                <p className="feedback-hint">I&apos;ll use this if I need to follow up about your feedback.</p>
              </div>

              {/* Type */}
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

              {/* Message */}
              <div className="feedback-field">
                <div className="feedback-message-row">
                  <label className="feedback-label" htmlFor="message">
                    Message
                  </label>
                  <div className={`feedback-counter ${overLimit ? "is-over" : ""}`}>
                    {wordCount}/{WORD_LIMIT} words
                  </div>
                </div>

                <textarea
                  id="message"
                  className="feedback-textarea"
                  placeholder="Tell me what you’d like to learn, improve, or fix in U-Stock."
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />

                {underMin ? (
                  <p className="feedback-hint feedback-hint--warn">Add a bit more detail (min {MIN_WORDS} words).</p>
                ) : null}
                {overLimit ? (
                  <p className="feedback-hint feedback-hint--warn">
                    Please shorten your message (max {WORD_LIMIT} words).
                  </p>
                ) : null}
              </div>

              <p className="feedback-footer-hint">
                Think of this as your suggestion box. I use these notes to decide what to build next.
              </p>

              {/* Captcha (prod only) */}
              {captchaRequired ? (
                <div className="feedback-captcha">
                  {SITE_KEY ? (
                    <Turnstile
                      sitekey={SITE_KEY}
                      onVerify={(t) => setToken(t)}
                      onExpire={() => setToken(null)}
                      onError={() => setToken(null)}
                    />
                  ) : (
                    <p className="feedback-hint feedback-hint--warn">
                      Captcha is required in production but <code>VITE_TURNSTILE_SITE_KEY</code> is missing.
                    </p>
                  )}
                </div>
              ) : null}

              {status ? (
                <div
                  className={`feedback-status ${
                    status.toLowerCase().includes("sent") ? "feedback-status--ok" : "feedback-status--err"
                  }`}
                >
                  {status}
                </div>
              ) : null}

              <div className="feedback-actions">
                <button type="submit" className="feedback-btn feedback-btn--primary" disabled={!canSubmit}>
                  {submitting ? "Sending..." : "Send feedback"}
                </button>

                <button type="button" className="feedback-btn feedback-btn--ghost" onClick={resetForm} disabled={submitting}>
                  Clear
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
