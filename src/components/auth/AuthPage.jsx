// src/components/auth/AuthPage.jsx
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./AuthPage.css";

const AVATARS = ["📈", "📊", "🤖", "💡"];

export default function AuthPage() {
  const { login, signup } = useAuth();
  const [searchParams] = useSearchParams();

  // --- LOGIN STATE ---
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // --- SIGNUP STATE ---
  const initialMode = searchParams.get("mode") === "signup";
  const [showSignupForm, setShowSignupForm] = useState(initialMode);

  const [signName, setSignName] = useState("");
  const [signEmail, setSignEmail] = useState("");
  const [signPhone, setSignPhone] = useState("");
  const [signPassword, setSignPassword] = useState("");
  const [signAvatar, setSignAvatar] = useState(AVATARS[0]);
  const [signError, setSignError] = useState("");
  const [signLoading, setSignLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      await login(loginEmail.trim(), loginPassword);
    } catch (err) {
      setLoginError(err.message || "Unable to sign in");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setSignError("");
    setSignLoading(true);
    try {
      await signup({
        name: signName.trim(),
        email: signEmail.trim(),
        phone: signPhone.trim(),
        password: signPassword,
        avatar: signAvatar,
      });
    } catch (err) {
      setSignError(err.message || "Unable to sign up");
    } finally {
      setSignLoading(false);
    }
  };

  const handleBackFromSignup = () => {
    setShowSignupForm(false);
    setSignError("");
  };

  return (
    <div className="auth-page">
      {/* LEFT: Sign in */}
      <section className="auth-left">
        <div className="auth-left-inner">
          <h1 className="auth-title">
            {showSignupForm ? "Already have an account?" : "Welcome back"}
          </h1>

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

          <div className="auth-social-row">
            <button type="button" className="auth-social-btn" disabled>
              ⧉
            </button>
            <button type="button" className="auth-social-btn" disabled>
              🐦
            </button>
          </div>
        </div>
      </section>

      {/* RIGHT: Sign up */}
      <section className="auth-right">
        <div className="auth-right-inner">
          {!showSignupForm ? (
            <>
              <h2 className="auth-right-title">New here?</h2>
              <p className="auth-right-text">
                Sign up and discover a new way to explore U-Stock insights.
              </p>

              <button
                type="button"
                className="auth-secondary-btn"
                onClick={() => setShowSignupForm(true)}
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              <h2 className="auth-right-title">Create your account</h2>
              <p className="auth-right-text">
                Tell us a bit about you and choose an icon.
              </p>

              <form className="auth-signup-form" onSubmit={handleSignup}>
                <label className="auth-signup-field">
                  <span className="auth-signup-label">Name</span>
                  <input
                    type="text"
                    value={signName}
                    onChange={(e) => setSignName(e.target.value)}
                    required
                  />
                </label>

                <label className="auth-signup-field">
                  <span className="auth-signup-label">Email</span>
                  <input
                    type="email"
                    value={signEmail}
                    onChange={(e) => setSignEmail(e.target.value)}
                    required
                  />
                </label>

                <label className="auth-signup-field">
                  <span className="auth-signup-label">Phone number</span>
                  <input
                    type="tel"
                    value={signPhone}
                    onChange={(e) => setSignPhone(e.target.value)}
                    placeholder="(555) 555-5555"
                  />
                </label>

                <label className="auth-signup-field">
                  <span className="auth-signup-label">Password</span>
                  <input
                    type="password"
                    value={signPassword}
                    onChange={(e) => setSignPassword(e.target.value)}
                    required
                  />
                </label>

                <div className="auth-avatar-section">
                  <span className="auth-signup-label">Choose your icon</span>
                  <div className="auth-avatar-grid">
                    {AVATARS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        className={
                          "auth-avatar-chip" +
                          (icon === signAvatar ? " auth-avatar-chip--active" : "")
                        }
                        onClick={() => setSignAvatar(icon)}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                {signError && (
                  <p className="auth-error auth-error--light">{signError}</p>
                )}

                <button
                  type="submit"
                  className="auth-secondary-btn"
                  disabled={signLoading}
                >
                  {signLoading ? "Creating account…" : "Sign Up"}
                </button>

                <button
                  type="button"
                  className="auth-back-to-login"
                  onClick={handleBackFromSignup}
                >
                  ← Back
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
