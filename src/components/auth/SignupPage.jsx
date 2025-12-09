// src/components/auth/SignupPage.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./AuthPage.css";

const AVATARS = ["📈", "📊", "🤖", "💡"];

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [signName, setSignName] = useState("");
  const [signEmail, setSignEmail] = useState("");
  const [signPhone, setSignPhone] = useState("");
  const [signPassword, setSignPassword] = useState("");
  const [signAvatar, setSignAvatar] = useState(AVATARS[0]);
  const [signError, setSignError] = useState("");
  const [signLoading, setSignLoading] = useState(false);

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

      navigate("/"); // go straight to dashboard/landing
    } catch (err) {
      setSignError(err.message || "Unable to sign up");
    } finally {
      setSignLoading(false);
    }
  };

  return (
    <div
      className="auth-page"
      style={{
        background: "var(--ustock-green-main)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: "32px 16px",
      }}
    >
      <div
        className="auth-right-inner"
        style={{
          background: "rgba(255,255,255,0.1)",
          borderRadius: "20px",
          padding: "40px 28px",
          maxWidth: "420px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h2
          className="auth-right-title"
          style={{ marginBottom: 4, color: "white" }}
        >
          Create your account
        </h2>

        <p className="auth-right-text" style={{ marginBottom: 24 }}>
          Tell us a bit about yourself — pick an icon and get started!
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

          <div className="auth-avatar-section" style={{ marginTop: 6 }}>
            <span className="auth-signup-label" style={{ color: "white" }}>
              Choose your icon
            </span>
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
            style={{
              marginTop: 20,
              background: "white",
              color: "var(--ustock-green-main)",
            }}
          >
            {signLoading ? "Creating account…" : "Sign Up"}
          </button>

          <p style={{ marginTop: 20, fontSize: 14, color: "#e5e7eb" }}>
            Already registered?{" "}
            <Link
              to="/auth"
              style={{
                color: "white",
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              Sign in here →
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
