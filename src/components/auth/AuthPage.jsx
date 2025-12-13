// src/components/auth/AuthPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./AuthPage.css";
import AppShell from "../layout/AppShell";

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
    setLoginError("");
    setLoginLoading(true);
    try {
      await login(loginEmail.trim(), loginPassword);
      // if login succeeds, AuthGate / routes will take user to dashboard
    } catch (err) {
      setLoginError(err.message || "Unable to sign in");
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
                    placeholder="Email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </label>

                <label className="auth-field">
                  <span className="auth-input-icon">🔒</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </label>

                {loginError && <p className="auth-error">{loginError}</p>}

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
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--ustock-green-main)",
                    cursor: "pointer",
                    fontWeight: 600,
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
                Log in to see your market dashboard, signals, and sentiment in
                one place.
              </p>

              <button
                type="button"
                className="auth-secondary-btn"
                onClick={goToSignup}
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
