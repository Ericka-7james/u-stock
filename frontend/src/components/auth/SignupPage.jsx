// src/components/auth/SignupPage.jsx
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AppShell from "../layout/AppShell";
import ErrorModal from "../common/errorMessages";
import { useAuth } from "../../context/AuthContext";
import { explainAnyError } from "../common/errorMessages";

import "../../css/auth/SignupPage.css";

/** Normalize phone: keep digits only, E.164-ish length guard */
function normalizePhone(input) {
  return String(input || "").replace(/\D/g, "");
}
function isValidPhoneDigits(digits) {
  return digits.length >= 10 && digits.length <= 15;
}
function normalizeEmail(input) {
  return String(input || "").trim().toLowerCase();
}

/** Detect “duplicate email/phone” from a variety of backend styles */
function isDuplicateCredentialError(anyErr) {
  const raw =
    anyErr?.detail?.message ||
    anyErr?.payload?.detail?.message ||
    anyErr?.message ||
    anyErr?.body ||
    anyErr;

  const s = String(raw || "").toLowerCase();

  return (
    s.includes("already registered") ||
    s.includes("already exists") ||
    s.includes("account already exists") ||
    s.includes("duplicate") ||
    s.includes("unique constraint") ||
    s.includes("23505") ||
    s.includes("user already") ||
    s.includes("email already") ||
    s.includes("phone already") ||
    s.includes("already in use")
  );
}

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup, signupWithGoogle, signupWithFacebook } = useAuth();

  const avatars = ["📈", "📊", "🤖", "💡"];
  const emailRegex = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/, []);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("📈");

  const [errors, setErrors] = useState({ name: "", email: "", phone: "", password: "" });

  // ErrorModal state
  const [errModalOpen, setErrModalOpen] = useState(false);
  const [errModal, setErrModal] = useState(null);

  const [loading, setLoading] = useState(false);

  const clearFieldError = useCallback((key) => {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  }, []);

  const closeErrorModal = useCallback(() => {
    setErrModalOpen(false);
    setErrModal(null);
  }, []);

  const openErrorModal = useCallback((anyErr, { feature = "signup" } = {}) => {
    // ✅ always go through mapper (it should split Fix -> subtitle if needed)
    const friendly = explainAnyError(anyErr, { feature });

    // ✅ hard override for duplicate (ensures subtitle is separate no matter what)
    if (isDuplicateCredentialError(anyErr)) {
      setErrModal({
        title: "Account already exists",
        body: "That email or phone number is already in use.",
        subtitle: "Try signing in instead, or use a different email/phone.",
        action: { label: "Sign in", href: "/auth" },
      });
      setErrModalOpen(true);
      return;
    }

    setErrModal({
      title: friendly?.title || "Error",
      body: friendly?.body || "Something went wrong.",
      subtitle: friendly?.subtitle || "",
      action: friendly?.action || null,
    });
    setErrModalOpen(true);
  }, []);

  const validate = useCallback(() => {
    const next = { name: "", email: "", phone: "", password: "" };

    const trimmedName = name.trim();
    const normalizedEmail = normalizeEmail(email);
    const phoneDigits = normalizePhone(phone);

    if (!trimmedName) next.name = "Please enter your username.";

    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      next.email = "Please enter a valid email address.";
    }

    if (phoneDigits && !isValidPhoneDigits(phoneDigits)) {
      next.phone = "Please enter a valid phone number (10–15 digits).";
    }

    const emailLocal = normalizedEmail.includes("@") ? normalizedEmail.split("@")[0] : "";

    if (!password || password.length < 12) {
      next.password = "Password must be at least 12 characters long.";
    } else if (!/[A-Z]/.test(password)) {
      next.password = "Password must include at least 1 uppercase letter.";
    } else if (!/[a-z]/.test(password)) {
      next.password = "Password must include at least 1 lowercase letter.";
    } else if (!/\d/.test(password)) {
      next.password = "Password must include at least 1 number.";
    } else if (!/[^\w\s]/.test(password)) {
      next.password = "Password must include at least 1 special character.";
    } else if (emailLocal && password.toLowerCase().includes(emailLocal)) {
      next.password = "Password must not contain your email.";
    } else if (trimmedName && password.toLowerCase().includes(trimmedName.toLowerCase())) {
      next.password = "Password must not contain your username.";
    }

    setErrors(next);
    return !(next.name || next.email || next.phone || next.password);
  }, [name, email, phone, password, emailRegex]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (loading) return;

      const ok = validate();
      if (!ok) return;

      setLoading(true);
      try {
        await signup({
          username: name.trim(),
          email: normalizeEmail(email),
          phone: normalizePhone(phone) || null,
          password,
          avatar,
        });

        navigate("/auth");
      } catch (err) {
        openErrorModal(err, { feature: "signup" });
      } finally {
        setLoading(false);
      }
    },
    [loading, validate, signup, name, email, phone, password, avatar, navigate, openErrorModal]
  );

  const handleGoogle = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (!signupWithGoogle) {
        openErrorModal("Google signup is not configured yet.", { feature: "signup_google" });
        return;
      }
      await signupWithGoogle();
      navigate("/dashboard");
    } catch (err) {
      openErrorModal(err, { feature: "signup_google" });
    } finally {
      setLoading(false);
    }
  }, [loading, signupWithGoogle, navigate, openErrorModal]);

  const handleFacebook = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (!signupWithFacebook) {
        openErrorModal("Facebook signup is not configured yet.", { feature: "signup_facebook" });
        return;
      }
      await signupWithFacebook();
      navigate("/dashboard");
    } catch (err) {
      openErrorModal(err, { feature: "signup_facebook" });
    } finally {
      setLoading(false);
    }
  }, [loading, signupWithFacebook, navigate, openErrorModal]);

  const handleErrorAction = useCallback(
    (action) => {
      if (!action?.href) return;
      closeErrorModal();
      navigate(action.href);
    },
    [navigate, closeErrorModal]
  );

  return (
    <AppShell>
      <ErrorModal open={errModalOpen} error={errModal} onClose={closeErrorModal} onAction={handleErrorAction} />

      <div className="app-page signup-page">
        <div className="signup-auth-card">
          <div className="signup-auth-header">
            <h1 className="signup-auth-title">Create account</h1>
            <p className="signup-auth-subtitle">Sign up to start using U-Stock.</p>
          </div>

          <form className="signup-auth-form" onSubmit={handleSubmit} noValidate>
            {/* Username */}
            <label className="signup-auth-field" htmlFor="signup-name">
              <span className="signup-auth-icon" aria-hidden="true">
                👤
              </span>
              <input
                id="signup-name"
                name="name"
                type="text"
                placeholder="Enter your username"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearFieldError("name");
                }}
                autoComplete="username"
                disabled={loading}
                aria-invalid={!!errors.name}
              />
            </label>
            {errors.name && (
              <p className="signup-error" role="alert">
                {errors.name}
              </p>
            )}

            {/* Email */}
            <label className="signup-auth-field" htmlFor="signup-email">
              <span className="signup-auth-icon" aria-hidden="true">
                ✉️
              </span>
              <input
                id="signup-email"
                name="email"
                type="email"
                placeholder="Enter your email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFieldError("email");
                }}
                autoComplete="email"
                disabled={loading}
                aria-invalid={!!errors.email}
              />
            </label>
            {errors.email && (
              <p className="signup-error" role="alert">
                {errors.email}
              </p>
            )}

            {/* Phone */}
            <label className="signup-auth-field" htmlFor="signup-phone">
              <span className="signup-auth-icon" aria-hidden="true">
                📞
              </span>
              <input
                id="signup-phone"
                name="phone"
                type="tel"
                placeholder="(555) 555-5555 (optional)"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  clearFieldError("phone");
                }}
                autoComplete="tel"
                disabled={loading}
                aria-invalid={!!errors.phone}
              />
            </label>
            {errors.phone && (
              <p className="signup-error" role="alert">
                {errors.phone}
              </p>
            )}

            {/* Password */}
            <label className="signup-auth-field" htmlFor="signup-password">
              <span className="signup-auth-icon" aria-hidden="true">
                🔒
              </span>
              <input
                id="signup-password"
                name="password"
                type="password"
                placeholder="Create password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearFieldError("password");
                }}
                disabled={loading}
                aria-invalid={!!errors.password}
              />
            </label>
            {errors.password && (
              <p className="signup-error" role="alert">
                {errors.password}
              </p>
            )}

            {/* Avatar */}
            <div className="signup-avatar-strip">
              <span className="signup-avatar-strip-label">Avatar</span>
              <div className="signup-avatar-strip-grid" role="group" aria-label="Choose your avatar">
                {avatars.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={"signup-avatar-pill" + (avatar === icon ? " signup-avatar-pill--active" : "")}
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
              {loading ? "Creating account…" : "Sign up"}
            </button>

            <div className="signup-divider">
              <span>or sign up with</span>
            </div>

            <div className="signup-social">
              <button type="button" className="signup-social-btn" onClick={handleGoogle} disabled={loading}>
                <span aria-hidden="true">G</span>
                Google
              </button>
              <button type="button" className="signup-social-btn" onClick={handleFacebook} disabled={loading}>
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
