import { useEffect, useState } from "react";
import "./SettingsPage.css";

export default function SettingsPage() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("ustock-theme") || "light";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ustock-theme", theme);
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | success | error

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!message.trim()) return;

    setStatus("sending");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setStatus("success");
      setMessage("");
    } catch (err) {
      console.error("Failed to send feedback:", err);
      setStatus("error");
    }
  };

  return (
    <section className="settings-page">
      <header className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">
          Tweak your U-Stock experience or send feedback directly to the
          creator.
        </p>
      </header>

      <section className="settings-section">
        <h2 className="settings-section-title">Appearance</h2>
        <div className="settings-row">
          <div className="settings-row-text">
            <p className="settings-row-label">Dark mode</p>
            <p className="settings-row-help">
              Switch between light and dark themes for the entire app.
            </p>
          </div>

          <label className="toggle-wrapper">
            <span className="toggle-label">
              {theme === "dark" ? "On" : "Off"}
            </span>
            <input
              type="checkbox"
              checked={theme === "dark"}
              onChange={handleThemeToggle}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Suggestion box</h2>
        <p className="settings-section-intro">
          Share ideas, bugs, or feature requests. Messages are forwarded to
          Ericka&apos;s inbox.
        </p>

        <form className="settings-form" onSubmit={handleSubmit}>
          <label className="settings-field">
            <span className="settings-field-label">Your message</span>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell me what would make U-Stock better…"
              required
            />
          </label>

          <button
            type="submit"
            className="settings-submit-btn"
            disabled={status === "sending"}
          >
            {status === "sending" ? "Sending…" : "Send feedback"}
          </button>

          {status === "success" && (
            <p className="settings-status settings-status--success">
              Thanks — feedback sent! 💌
            </p>
          )}
          {status === "error" && (
            <p className="settings-status settings-status--error">
              Something went wrong sending your message. Please try again
              later.
            </p>
          )}
        </form>
      </section>
    </section>
  );
}
