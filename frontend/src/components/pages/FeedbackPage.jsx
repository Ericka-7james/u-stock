// src/components/pages/FeedbackPage.jsx
import { useEffect, useMemo, useState } from "react";
import Turnstile from "react-turnstile";
import AppShell from "../layout/AppShell";
import "../../css/pages/FeedbackPage.css";
import { API_BASE, API_PREFIX } from "../../config/config";
import { useAuth } from "../../context/authContextBase.js";
import PageHeaderCard from "../common/PageHeaderCard";

import { FEEDBACK_PAGE_COPY } from "../../content/feedbackpage.content.ts";

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
  const copy = FEEDBACK_PAGE_COPY;

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
      setStatus(copy.status.sent);
      return;
    }
    if (wordCount < MIN_WORDS) {
      setStatus(`${copy.status.minWordsPrefix}${MIN_WORDS}${copy.status.minWordsSuffix}`);
      return;
    }
    if (overLimit) {
      setStatus(`${copy.status.maxWordsPrefix}${WORD_LIMIT}${copy.status.maxWordsSuffix}`);
      return;
    }

    if (captchaRequired && SITE_KEY && !token) {
      setStatus(copy.status.captchaIncomplete);
      return;
    }
    if (captchaRequired && !SITE_KEY) {
      setStatus(copy.status.captchaMissingKey);
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
        setStatus(data?.detail || copy.status.failed);
        return;
      }

      setStatus(copy.status.sent);
      setMessage("");
      setToken(null);
    } catch (err) {
      if (err?.name === "AbortError") setStatus(copy.status.timeout);
      else setStatus(err?.message || copy.status.failed);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="feedback-page">
        <PageHeaderCard title={copy.header.title} subtitle={copy.header.subtitle}>
          <form className="feedback-auth-form" onSubmit={onSubmit}>
            {/* Honeypot */}
            <div className="feedback-honeypot" aria-hidden="true">
              <label>
                {copy.fields.honeypotLabel}
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
                {copy.fields.name.label}
              </label>
              <input
                id="name"
                type="text"
                className="feedback-input"
                placeholder={copy.fields.name.placeholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>

            {/* Email */}
            <div className="feedback-field">
              <label className="feedback-label" htmlFor="email">
                {copy.fields.email.label}
              </label>
              <input
                id="email"
                type="email"
                className="feedback-input"
                placeholder={copy.fields.email.placeholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <p className="feedback-hint">{copy.fields.email.hint}</p>
            </div>

            {/* Type */}
            <div className="feedback-field">
              <label className="feedback-label" htmlFor="feedbackType">
                {copy.fields.type.label}
              </label>
              <select
                id="feedbackType"
                className="feedback-select"
                value={feedbackType}
                onChange={(e) => setFeedbackType(e.target.value)}
              >
                <option value="feature">{copy.fields.type.options.feature}</option>
                <option value="bug">{copy.fields.type.options.bug}</option>
                <option value="question">{copy.fields.type.options.question}</option>
                <option value="other">{copy.fields.type.options.other}</option>
              </select>
            </div>

            {/* Message */}
            <div className="feedback-field">
              <div className="feedback-message-row">
                <label className="feedback-label" htmlFor="message">
                  {copy.fields.message.label}
                </label>
                <div className={`feedback-counter ${overLimit ? "is-over" : ""}`}>
                  {wordCount}/{WORD_LIMIT} words
                </div>
              </div>

              <textarea
                id="message"
                className="feedback-textarea"
                placeholder={copy.fields.message.placeholder}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />

              {underMin ? (
                <p className="feedback-hint feedback-hint--warn">
                  {copy.fields.message.minWarnPrefix}
                  {MIN_WORDS}
                  {copy.fields.message.minWarnSuffix}
                </p>
              ) : null}
              {overLimit ? (
                <p className="feedback-hint feedback-hint--warn">
                  {copy.fields.message.maxWarnPrefix}
                  {WORD_LIMIT}
                  {copy.fields.message.maxWarnSuffix}
                </p>
              ) : null}
            </div>

            <p className="feedback-footer-hint">{copy.fields.message.footerHint}</p>

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
                    {copy.status.captchaMissingKey.replace("VITE_TURNSTILE_SITE_KEY", "")}
                    <code>VITE_TURNSTILE_SITE_KEY</code> is missing.
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
                {submitting ? copy.buttons.submitLoading : copy.buttons.submitIdle}
              </button>

              <button type="button" className="feedback-btn feedback-btn--ghost" onClick={resetForm} disabled={submitting}>
                {copy.buttons.clear}
              </button>
            </div>
          </form>
        </PageHeaderCard>
      </div>
    </AppShell>
  );
}
