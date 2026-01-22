// src/context/AuthRedirector.jsx
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function AuthRedirector() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;

    const path = location.pathname || "/";
    const isPublic = path === "/" || path.startsWith("/auth");

    if (!user && !isPublic) {
      navigate("/", { replace: true });
    }
  }, [user, loading, location.pathname, navigate]);

  return null;
}
