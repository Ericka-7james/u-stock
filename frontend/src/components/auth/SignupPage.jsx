// src/components/auth/SignupPage.jsx
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../layout/AppShell";
import { useAuth } from "../../context/AuthContext";
import "../../css/auth/SignupPage.css";

function getErrorMessage(err) {
  if (!err) return "Something went wrong while creating your account.";
  if (typeof err === "string") return err;
  if (typeof err === "object" && "message" in err && err.message) return String(err.message);
  return "Something went wrong while creating your account.";
}

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(""); // maps to username for backend
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(""); // optional UI only for now
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("📈");

  const [errors, setErrors] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    backend: "",
  });

  const [loading, setLoading] = useState(false);

  const avatars = ["📈", "📊", "🤖", "💡"];
  const emailRegex = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/, []);

  const validate = () => {
    const nextErrors = { name: "", email: "", phone: "", password: "", backend: "" };

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) nextErrors.name = "Please enter your name.";

    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (trimmedPhone) {
      const phoneDigits = trimmedPhone.replace(/\D/g, "");
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        nextErrors.phone = "Please enter a valid phone number (10–15 digits).";
      }
    }

    const emailLocal = trimmedEmail.includes("@") ? trimmedEmail.split("@")[0].toLowerCase() : "";

    if (!password || password.length < 12) {
      nextErrors.password = "Password must be at least 12 characters long.";
    } else if (!/[A-Z]/.test(password)) {
      nextErrors.password = "Password must include at least 1 uppercase letter.";
    } else if (!/[a-z]/.test(password)) {
      nextErrors.password = "Password must include at least 1 lowercase letter.";
    } else if (!/\d/.test(password)) {
      nextErrors.password = "Password must include at least 1 number.";
    } else if (!/[^\w\s]/.test(password)) {
      nextErrors.password = "Password must include at least 1 special character.";
    } else if (emailLocal && password.toLowerCase().includes(emailLocal)) {
      nextErrors.password = "Password must not contain your email.";
    } else if (trimmedName && password.toLowerCase().includes(trimmedName.toLowerCase())) {
      nextErrors.password = "Password must not contain your name/username.";
    }

    setErrors(nextErrors);

    const hasClientError =
      !!nextErrors.name || !!nextErrors.email || !!nextErrors.phone || !!nextErrors.password;

    return !hasClientError;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setErrors((prev) => ({ ...prev, backend: "" }));

    const ok = validate();
    if (!ok) return;

    setLoading(true);
    try {
      await signup({
        username: name.trim(),
        email: email.trim(),
        password,
        avatar,
      });

      navigate("/auth");
    } catch (err) {
      setErrors((prev) => ({ ...prev, backend: getErrorMessage(err) }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="app-page signup-page">
        <div className="signup-auth-card">
          <div className="signup-auth-header">
            <h1 className="signup-auth-title">Create account</h1>
            <p className="signup-auth-subtitle">Sign up to start using U-Stock.</p>
          </div>

          {errors.backend && (
            <div className="signup-banner-error" role="alert" aria-live="polite">
              {errors.backend}
            </div>
          )}

          <form className="signup-auth-form" onSubmit={handleSubmit} noValidate>
            {/* Username */}
            <label className="signup-auth-field" htmlFor="signup-name">
              <span className="signup-auth-icon" aria-hidden="true">👤</span>
              <input
                id="signup-name"
                name="name"
                type="text"
                placeholder="Enter your username"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="username"
                disabled={loading}
              />
            </label>
            {errors.name && <p className="signup-error" role="alert">{errors.name}</p>}

            {/* Email */}
            <label className="signup-auth-field" htmlFor="signup-email">
              <span className="signup-auth-icon" aria-hidden="true">✉️</span>
              <input
                id="signup-email"
                name="email"
                type="email"
                placeholder="Enter your email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
              />
            </label>
            {errors.email && <p className="signup-error" role="alert">{errors.email}</p>}

            {/* Phone (optional) */}
            <label className="signup-auth-field" htmlFor="signup-phone">
              <span className="signup-auth-icon" aria-hidden="true">📞</span>
              <input
                id="signup-phone"
                name="phone"
                type="tel"
                placeholder="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                disabled={loading}
              />
            </label>
            {errors.phone && <p className="signup-error" role="alert">{errors.phone}</p>}

            {/* Password */}
            <label className="signup-auth-field" htmlFor="signup-password">
              <span className="signup-auth-icon" aria-hidden="true">🔒</span>
              <input
                id="signup-password"
                name="password"
                type="password"
                placeholder="Create password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </label>
            {errors.password && <p className="signup-error" role="alert">{errors.password}</p>}

            {/* Avatar row (compact) */}
            <div className="signup-avatar-strip">
              <span className="signup-avatar-strip-label">Avatar</span>
              <div className="signup-avatar-strip-grid" role="group" aria-label="Choose your avatar">
                {avatars.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={
                      "signup-avatar-pill" + (avatar === icon ? " signup-avatar-pill--active" : "")
                    }
                    onClick={() => setAvatar(icon)}
                    aria-pressed={avatar === icon}
                    disabled={loading}
                    title={`Choose ${icon}`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="signup-auth-btn" disabled={loading}>
              {loading ? "Creating…" : "Sign up"}
            </button>

            {/* Divider + social row (visual only) */}
            <div className="signup-divider">
              <span>or sign up with</span>
            </div>

            <div className="signup-social">
              <button type="button" className="signup-social-btn" disabled>
                <span aria-hidden="true">G</span>
                Google
              </button>
              <button type="button" className="signup-social-btn" disabled>
                <span aria-hidden="true">f</span>
                Facebook
              </button>
            </div>

            <div className="signup-footer">
              Already have an account? <Link to="/auth">Sign in</Link>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
