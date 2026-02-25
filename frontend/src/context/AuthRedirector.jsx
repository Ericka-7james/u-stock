// src/context/AuthRedirector.jsx
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./authContextBase.js"; // ✅ FIX

// Public routes that should NEVER be redirected
const PUBLIC_PATHS = new Set(["/", "/about", "/feedback", "/auth", "/auth/signup"]);

export default function AuthRedirector() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    const path = location.pathname;

    if (PUBLIC_PATHS.has(path)) return;
    if (path.startsWith("/auth")) return;

    if (!user) {
      navigate("/", { replace: true });
    }
  }, [user, loading, location.pathname, navigate]);

  return null;
}