// src/components/auth/SignupPage.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../layout/AppShell";
import { useAuth } from "../../context/AuthContext";
import "./SignupPage.css";

export default function SignupPage() {
  const { signup } = useAuth();

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

  const validate = () => {
    const nextErrors = {
      name: "",
      email: "",
      phone: "",
      password: "",
      backend: "",
    };

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    // --- Name (username): required ---
    if (!trimmedName) {
      nextErrors.name = "Please enter your name.";
    }

    // --- Email: required + basic pattern ---
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    // --- Phone: OPTIONAL (if provided, validate digits length) ---
    if (trimmedPhone) {
      const phoneDigits = trimmedPhone.replace(/\D/g, "");
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        nextErrors.phone = "Please enter a valid phone number (10–15 digits).";
      }
    }

    // --- Password: must match backend rules ---
    const emailLocal = trimmedEmail.includes("@")
      ? trimmedEmail.split("@")[0].toLowerCase()
      : "";

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

    setErrors((prev) => ({ ...prev, backend: "" }));

    const ok = validate();
    if (!ok) return;

    setLoading(true);
    try {
      // IMPORTANT: backend expects `username`, not `name`
      await signup({
        username: name.trim(),
        email: email.trim(),
        password,
        avatar,
      });

      // Optional: redirect or show success here
      // e.g. navigate("/dashboard")
    } catch (err) {
      const message =
        err?.message || "Something went wrong while creating your account.";
      setErrors((prev) => ({ ...prev, backend: message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="app-page signup-page">
        <div className="signup-card">
          <h1 className="signup-title">Create your account</h1>
          <p className="signup-subtitle">
            Tell us a bit about yourself — pick an icon and get started!
          </p>

          {/* backend errors */}
          {errors.backend && <p className="form-error">{errors.backend}</p>}

          <form className="signup-form" onSubmit={handleSubmit} noValidate>
            {/* Name */}
            <label className="signup-field">
              <span>Name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name && <p className="signup-error">{errors.name}</p>}
            </label>

            {/* Email */}
            <label className="signup-field">
              <span>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors.email && <p className="signup-error">{errors.email}</p>}
            </label>

            {/* Phone (optional) */}
            <label className="signup-field">
              <span>Phone number (optional)</span>
              <input
                type="tel"
                placeholder="(555) 555-5555"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {errors.phone && <p className="signup-error">{errors.phone}</p>}
            </label>

            {/* Password */}
            <label className="signup-field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {errors.password && <p className="signup-error">{errors.password}</p>}
            </label>

            {/* Avatar selection */}
            <div className="signup-avatar-section">
              <span>Choose your icon</span>
              <div className="signup-avatar-grid">
                {avatars.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={
                      "signup-avatar-chip" +
                      (avatar === icon ? " signup-avatar-chip--active" : "")
                    }
                    onClick={() => setAvatar(icon)}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button type="submit" className="signup-btn" disabled={loading}>
              {loading ? "Creating account…" : "Sign Up"}
            </button>

            <div className="signup-alt">
              Already registered? <Link to="/auth">Sign in here →</Link>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
