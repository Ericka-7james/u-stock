// src/components/auth/SignupPage.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../layout/AppShell";
import { useAuth } from "../../context/AuthContext";
import "./SignupPage.css";

export default function SignupPage() {
  const { signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

    // --- Name: required ---
    const trimmedName = name.trim();
    if (!trimmedName) {
      nextErrors.name = "Please enter your name.";
    }

    // --- Email: required + basic pattern ---
    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    // --- Phone: required, 10–15 digits (ignore formatting chars) ---
    const trimmedPhone = phone.trim();
    const phoneDigits = trimmedPhone.replace(/\D/g, "");
    if (!trimmedPhone || phoneDigits.length < 10 || phoneDigits.length > 15) {
      nextErrors.phone =
        "Please enter a valid phone number (10–15 digits).";
    }

    // --- Password: required, min length, at least one special char ---
    if (!password || password.length < 8) {
      nextErrors.password =
        "Password must be at least 8 characters long.";
    } else {
      const specialCharRegex = /[^A-Za-z0-9]/;
      if (!specialCharRegex.test(password)) {
        nextErrors.password =
          "Password must include at least one special character.";
      }
    }

    setErrors(nextErrors);

    const hasClientError =
      !!nextErrors.name ||
      !!nextErrors.email ||
      !!nextErrors.phone ||
      !!nextErrors.password;

    return !hasClientError;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Clear any previous backend error
    setErrors((prev) => ({ ...prev, backend: "" }));

    const ok = validate();
    if (!ok) return;

    setLoading(true);
    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        avatar,
      });
      // Optional: redirect or show success here
    } catch (err) {
      const message =
        err?.message ||
        "Something went wrong while creating your account.";
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

          {errors.backend && (
            <p className="signup-error signup-error--backend">
              {errors.backend}
            </p>
          )}

          <form
            className="signup-form"
            onSubmit={handleSubmit}
            // Disable browser native validation so we always show our own messages
            noValidate
          >
            {/* Name */}
            <label className="signup-field">
              <span>Name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name && (
                <p className="signup-error">{errors.name}</p>
              )}
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
              {errors.email && (
                <p className="signup-error">{errors.email}</p>
              )}
            </label>

            {/* Phone */}
            <label className="signup-field">
              <span>Phone number</span>
              <input
                type="tel"
                required
                placeholder="(555) 555-5555"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {errors.phone && (
                <p className="signup-error">{errors.phone}</p>
              )}
            </label>

            {/* Password */}
            <label className="signup-field">
              <span>Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {errors.password && (
                <p className="signup-error">{errors.password}</p>
              )}
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
                      (avatar === icon
                        ? " signup-avatar-chip--active"
                        : "")
                    }
                    onClick={() => setAvatar(icon)}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="signup-btn"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Sign Up"}
            </button>

            <div className="signup-alt">
              Already registered?{" "}
              <Link to="/auth">Sign in here →</Link>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
