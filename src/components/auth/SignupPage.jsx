import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./SignupPage.css";

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

      navigate("/");
    } catch (err) {
      setSignError(err.message || "Unable to sign up");
    } finally {
      setSignLoading(false);
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-card">

        <h1 className="signup-title">Create your account</h1>
        <p className="signup-subtitle">
          Tell us a bit about yourself — pick an icon and get started!
        </p>

        <form className="signup-form" onSubmit={handleSignup}>
          <label className="signup-field">
            <span>Name</span>
            <input
              type="text"
              value={signName}
              onChange={(e) => setSignName(e.target.value)}
              required
            />
          </label>

          <label className="signup-field">
            <span>Email</span>
            <input
              type="email"
              value={signEmail}
              onChange={(e) => setSignEmail(e.target.value)}
              required
            />
          </label>

          <label className="signup-field">
            <span>Phone number</span>
            <input
              type="tel"
              value={signPhone}
              onChange={(e) => setSignPhone(e.target.value)}
              placeholder="(555) 555-5555"
            />
          </label>

          <label className="signup-field">
            <span>Password</span>
            <input
              type="password"
              value={signPassword}
              onChange={(e) => setSignPassword(e.target.value)}
              required
            />
          </label>

          <div className="signup-avatar-section">
            <span>Choose your icon</span>
            <div className="signup-avatar-grid">
              {AVATARS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  className={
                    "signup-avatar-chip" +
                    (signAvatar === icon ? " signup-avatar-chip--active" : "")
                  }
                  onClick={() => setSignAvatar(icon)}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {signError && <p className="auth-error">{signError}</p>}

          <button type="submit" className="signup-btn" disabled={signLoading}>
            {signLoading ? "Creating account…" : "Sign Up"}
          </button>

          <div className="signup-alt">
            Already registered?{" "}
            <Link to="/auth">Sign in here →</Link>
          </div>
        </form>

      </div>
    </div>
  );
}
