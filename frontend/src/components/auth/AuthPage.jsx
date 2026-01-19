// src/components/auth/AuthPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../css/auth/AuthPage.css";
import AppShell from "../layout/AppShell";

function getErrorMessage(err) {
  if (!err) return "Unable to sign in";
  if (typeof err === "string") return err;
  if (typeof err === "object" && "message" in err && err.message) return String(err.message);
  return "Unable to sign in";
}

export default function AuthPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  // --- LOGIN STATE ---
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loginLoading) return;

    setLoginError("");
    setLoginLoading(true);
    try {
      await login(loginEmail.trim(), loginPassword);
      // If login succeeds, AuthGate / routes will take user to dashboard
    } catch (err) {
      setLoginError(getErrorMessage(err));
    } finally {
      setLoginLoading(false);
    }
  };

  const goToSignup = () => {
    navigate("/auth/signup");
  };

  return (
    <AppShell>
      <div className="auth-page">
        <div className="auth-page-inner">
          {/* LEFT: Sign in */}
          <section className="auth-left">
            <div className="auth-left-inner">
              <h1 className="auth-title">Welcome back</h1>

              <form className="auth-form" onSubmit={handleLogin}>
                <label className="auth-field">
                  <span className="auth-input-icon">📧</span>
                  <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    autoComplete="username"
                    disabled={loginLoading}
                  />
                </label>

                <label className="auth-field">
                  <span className="auth-input-icon">🔒</span>
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="Password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    disabled={loginLoading}
                  />
                </label>

                {loginError && (
                  <p className="auth-error" role="alert" aria-live="polite">
                    {loginError}
                  </p>
                )}

                <button
                  type="submit"
                  className="auth-primary-btn"
                  disabled={loginLoading}
                >
                  {loginLoading ? "Signing in…" : "Sign In →"}
                </button>
              </form>

              <div
                style={{
                  marginTop: 16,
                  textAlign: "center",
                  fontSize: 13,
                }}
              >
                <span>New here? </span>
                <button
                  type="button"
                  onClick={goToSignup}
                  disabled={loginLoading}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--ustock-green-main)",
                    cursor: loginLoading ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    opacity: loginLoading ? 0.7 : 1,
                  }}
                >
                  Create an account →
                </button>
              </div>
            </div>
          </section>

          {/* RIGHT: keep your green panel as a static welcome blurb */}
          <section className="auth-right">
            <div className="auth-right-inner">
              <h2 className="auth-right-title">U-Stock Radar Suite</h2>
              <p className="auth-right-text">
                Log in to see your market dashboard, signals, and sentiment in one place.
              </p>

              <button
                type="button"
                className="auth-secondary-btn"
                onClick={goToSignup}
                disabled={loginLoading}
              >
                Sign Up
              </button>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
