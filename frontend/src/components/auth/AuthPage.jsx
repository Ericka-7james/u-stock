// src/components/auth/AuthPage.jsx
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../layout/AppShell";
import ErrorModal from "../common/ErrorModal";

import { useAuth } from "../../context/authContextBase.js";
import { explainAnyError } from "../../lib/errorMessages";

import { AUTH_PAGE_COPY } from "../../content/landing/authpage.content.ts";
import { ERROR_KEYS, ERROR_PRESETS } from "../../content/error/errorCatalog";

import "../../css/auth/AuthPage.css";

function normalizeEmail(input) {
  return String(input || "").trim().toLowerCase();
}

function msg(key, fallback) {
  return ERROR_PRESETS?.[key]?.body || fallback || "Something went wrong.";
}

export default function AuthPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const COPY = AUTH_PAGE_COPY;

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Centralized modal error (same as signup)
  const [errModalOpen, setErrModalOpen] = useState(false);
  const [errModal, setErrModal] = useState(null);

  const closeErrorModal = useCallback(() => {
    setErrModalOpen(false);
    setErrModal(null);
  }, []);

  const openErrorModal = useCallback((anyErr, { feature = "login" } = {}) => {
    const friendly = explainAnyError(anyErr, { feature });

    setErrModal({
      title: friendly?.title || ERROR_PRESETS?.[ERROR_KEYS.LOGIN_FALLBACK]?.title || "Error",
      body:
        friendly?.body ||
        msg(ERROR_KEYS.LOGIN_FALLBACK, COPY?.errors?.fallback),
      subtitle: friendly?.subtitle || "",
      image: friendly?.image || null,
      action: friendly?.action || null,
    });

    setErrModalOpen(true);
  }, [COPY?.errors?.fallback]);

  const handleErrorAction = useCallback(
    (action) => {
      if (!action?.href) return;
      closeErrorModal();
      navigate(action.href);
    },
    [navigate, closeErrorModal]
  );

  const canSubmit = useMemo(() => {
    return !!loginEmail.trim() && !!loginPassword && !loginLoading;
  }, [loginEmail, loginPassword, loginLoading]);

  const handleLogin = useCallback(
    async (e) => {
      e.preventDefault();
      if (loginLoading) return;

      const email = normalizeEmail(loginEmail);
      const password = loginPassword;

      if (!email || !password) return;

      setLoginLoading(true);
      try {
        await login(email, password);
        // AuthGate / routes will take user to dashboard
      } catch (err) {
        openErrorModal(err, { feature: "login" });
      } finally {
        setLoginLoading(false);
      }
    },
    [loginLoading, loginEmail, loginPassword, login, openErrorModal]
  );

  const goToSignup = useCallback(() => {
    navigate("/auth/signup");
  }, [navigate]);

  return (
    <AppShell>
      <ErrorModal
        open={errModalOpen}
        error={errModal}
        onClose={closeErrorModal}
        onAction={handleErrorAction}
      />

      <div className="auth-page">
        <div className="auth-lane">
          <div className="auth-page-inner">
            {/* LEFT: Sign in */}
            <section className="auth-left">
              <div className="auth-left-inner">
                <h1 className="auth-title">{COPY.left.title}</h1>

                <form className="auth-form" onSubmit={handleLogin} noValidate>
                  <label className="auth-field">
                    <span className="auth-input-icon" aria-hidden="true">
                      📧
                    </span>
                    <input
                      type="email"
                      name="email"
                      placeholder={COPY.left.fields.emailPlaceholder}
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      autoComplete="username"
                      disabled={loginLoading}
                      aria-invalid={false}
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
                      placeholder={COPY.left.fields.passwordPlaceholder}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      disabled={loginLoading}
                      aria-invalid={false}
                    />
                  </label>

                  <button type="submit" className="auth-primary-btn" disabled={!canSubmit}>
                    {loginLoading ? COPY.left.submit.loading : COPY.left.submit.idle}
                  </button>
                </form>

                <div className="auth-alt">
                  <span>{COPY.left.alt.prefix}</span>
                  <button
                    type="button"
                    onClick={goToSignup}
                    disabled={loginLoading}
                    className="auth-link-btn"
                  >
                    {COPY.left.alt.cta}
                  </button>
                </div>
              </div>
            </section>

            {/* RIGHT: green panel */}
            <section className="auth-right">
              <div className="auth-right-inner">
                <h2 className="auth-right-title">{COPY.right.title}</h2>
                <p className="auth-right-text">{COPY.right.description}</p>

                <button
                  type="button"
                  className="auth-secondary-btn"
                  onClick={goToSignup}
                  disabled={loginLoading}
                >
                  {COPY.right.cta}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}