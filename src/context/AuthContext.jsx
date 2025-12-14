// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../config/config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, email?, avatar? }
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  // Always includes cookies. Does NOT force Content-Type for GET.
  const authFetch = useMemo(() => {
    return async (path, options = {}) => {
      const headers = new Headers(options.headers || {});
      const method = (options.method || "GET").toUpperCase();

      // Only set JSON headers when we actually send a JSON body
      const hasBody = options.body !== undefined && options.body !== null;
      if (hasBody && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(`${API_BASE}${path}`, {
        ...options,
        method,
        credentials: "include", // 🔑 cookie auth
        headers,
      });
    };
  }, []);

  const refreshSession = async () => {
    // Checks cookie session and restores user state.
    try {
      const res = await authFetch("/auth/me", { method: "GET" });

      if (!res.ok) {
        setIsAuthed(false);
        setUser(null);
        return false;
      }

      const data = await res.json().catch(() => ({}));

      // We at least store user_id so app survives refresh.
      // (You can add email later by having /auth/me return email too.)
      setUser((prev) => ({
        ...(prev || {}),
        id: data.user_id,
      }));
      setIsAuthed(true);
      return true;
    } catch {
      // Network/server down: do NOT hard log out. Keep last known state.
      // (Prevents "random kicks" during reload when backend restarts.)
      return isAuthed;
    }
  };

  // On boot: check session
  useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshSession();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password) => {
    const res = await authFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || "Login failed");

    // Cookie is set by backend automatically; confirm session
    setUser(data.user || null);
    setIsAuthed(true);

    // Optional: verify cookie actually stuck (helps detect Secure/SameSite issues)
    await refreshSession();
  };

  const signup = async ({ username, email, password, avatar }) => {
    const res = await authFetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, email, password, avatar }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || "Signup failed");

    setUser(data.user || null);

    // If email confirmation is required, cookie may not exist yet.
    await refreshSession();
  };

  const logout = async () => {
    await authFetch("/auth/logout", { method: "POST" });
    setUser(null);
    setIsAuthed(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthed,
        login,
        signup,
        logout,
        authFetch,
        refreshSession, // helpful for pages that want to re-check auth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
