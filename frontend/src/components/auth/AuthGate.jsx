// src/components/auth/AuthGate.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient"; // adjust path if needed

export default function AuthGate({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    // If supabase isn't configured for some reason, just render children.
    if (!supabase?.auth?.onAuthStateChange) return;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Covers auto sign-outs: refresh failure / expiry / manual signout
      if (event === "SIGNED_OUT" || event === "TOKEN_REFRESH_FAILED") {
        navigate("/", { replace: true });
      }
    });

    return () => {
      data?.subscription?.unsubscribe?.();
    };
  }, [navigate]);

  return children;
}
