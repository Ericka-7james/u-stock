// src/context/AuthRedirector.jsx
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Public routes that should NEVER be redirected
const PUBLIC_PATHS = new Set([
  "/",
  "/about",
  "/auth",
  "/auth/signup",
]);

export default function AuthRedirector() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    const path = location.pathname;

    // Allow public pages always
    if (PUBLIC_PATHS.has(path)) return;

    // Allow anything under /auth to be safe
    if (path.startsWith("/auth")) return;

    // If not logged in and trying to access protected pages → kick to home
    if (!user) {
      navigate("/", { replace: true });
    }
  }, [user, loading, location.pathname, navigate]);

  return null;
}
