// src/components/auth/AuthPage.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../css/auth/AuthPage.css";
import AppShell from "../layout/AppShell";

import { AUTH_PAGE_COPY } from "../../content/authpage.content";

function getErrorMessage(err) {
  if (!err) return AUTH_PAGE_COPY.errors.fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object" && "message" in err && err.message) return String(err.message);
  return AUTH_PAGE_COPY.errors.fallback;
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
                <h1 className="auth-title">{AUTH_PAGE_COPY.left.title}</h1>

                <form className="auth-form" onSubmit={handleLogin} noValidate>
                  <label className="auth-field">
                    <span className="auth-input-icon" aria-hidden="true">
                      📧
                    </span>
                    <input
                      type="email"
                      name="email"
                      placeholder={AUTH_PAGE_COPY.left.fields.emailPlaceholder}
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
                      placeholder={AUTH_PAGE_COPY.left.fields.passwordPlaceholder}
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
                    {loginLoading ? AUTH_PAGE_COPY.left.submit.loading : AUTH_PAGE_COPY.left.submit.idle}
                  </button>
                </form>

                <div className="auth-alt">
                  <span>{AUTH_PAGE_COPY.left.alt.prefix}</span>
                  <button
                    type="button"
                    onClick={goToSignup}
                    disabled={loginLoading}
                    className="auth-link-btn"
                  >
                    {AUTH_PAGE_COPY.left.alt.cta}
                  </button>
                </div>
              </div>
            </section>

            {/* RIGHT: green panel */}
            <section className="auth-right">
              <div className="auth-right-inner">
                <h2 className="auth-right-title">{AUTH_PAGE_COPY.right.title}</h2>
                <p className="auth-right-text">{AUTH_PAGE_COPY.right.description}</p>

                <button
                  type="button"
                  className="auth-secondary-btn"
                  onClick={goToSignup}
                  disabled={loginLoading}
                >
                  {AUTH_PAGE_COPY.right.cta}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
