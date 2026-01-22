import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient"; // adjust path to your supabase client

export default function AuthGate({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // Fired for auto sign-outs too (token refresh failure, expiry, etc.)
      if (event === "SIGNED_OUT") {
        // Optional: clear any app-level cached state here
        // e.g., localStorage.removeItem("activeBot");

        // Hard reset to landing (prevents stale dashboard rendering)
        navigate("/", { replace: true });
      }
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, [navigate]);

  return children;
}
