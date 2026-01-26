// src/components/auth/AuthPage.jsx
import { useMemo, useState } from "react";
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

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return !!loginEmail.trim() && !!loginPassword && !loginLoading;
  }, [loginEmail, loginPassword, loginLoading]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loginLoading) return;

    setLoginError("");
    setLoginLoading(true);
    try {
      await login(loginEmail.trim(), loginPassword);
      // AuthGate / routes will take user to dashboard
    } catch (err) {
      setLoginError(getErrorMessage(err));
    } finally {
      setLoginLoading(false);
    }
  };

  const goToSignup = () => {
    navigate("/auth/signup");
  };

  const errId = "auth-login-error";

  return (
    <AppShell>
      <div className="auth-page">
        <div className="auth-lane">
          <div className="auth-page-inner">
            {/* LEFT: Sign in */}
            <section className="auth-left">
              <div className="auth-left-inner">
                <h1 className="auth-title">Welcome back</h1>

                <form className="auth-form" onSubmit={handleLogin} noValidate>
                  <label className="auth-field">
                    <span className="auth-input-icon" aria-hidden="true">
                      📧
                    </span>
                    <input
                      type="email"
                      name="email"
                      placeholder="Email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      autoComplete="username"
                      disabled={loginLoading}
                      aria-invalid={!!loginError}
                      aria-describedby={loginError ? errId : undefined}
                    />
                  </label>

                  <label className="auth-field">
                    <span className="auth-input-icon" aria-hidden="true">
                      🔒
                    </span>
                    <input
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      placeholder="Password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      disabled={loginLoading}
                      aria-invalid={!!loginError}
                      aria-describedby={loginError ? errId : undefined}
                    />
                  </label>

                  {loginError && (
                    <p className="auth-error" id={errId} role="alert" aria-live="polite">
                      {loginError}
                    </p>
                  )}

                  <button type="submit" className="auth-primary-btn" disabled={!canSubmit}>
                    {loginLoading ? "Signing in…" : "Sign In →"}
                  </button>
                </form>

                <div className="auth-alt">
                  <span>New here? </span>
                  <button
                    type="button"
                    onClick={goToSignup}
                    disabled={loginLoading}
                    className="auth-link-btn"
                  >
                    Create an account →
                  </button>
                </div>
              </div>
            </section>

            {/* RIGHT: green panel */}
            <section className="auth-right">
              <div className="auth-right-inner">
                <h2 className="auth-right-title">U-Stock Radar Suite</h2>
                <p className="auth-right-text">
                  Log in to see your market dashboard, signals, and sentiment in one place.
                </p>

                <button type="button" className="auth-secondary-btn" onClick={goToSignup} disabled={loginLoading}>
                  Sign Up
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
