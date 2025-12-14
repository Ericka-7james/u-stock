// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE } from "../config/config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, email, avatar } optional
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  // ✅ This replaces apiRequest. Always includes cookies.
  const authFetch = async (path, options = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include", // 🔑 cookie auth
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    return res;
  };

  // On boot: check session
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/auth/me", { method: "GET" });
        if (res.ok) {
          setIsAuthed(true);
        } else {
          setIsAuthed(false);
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
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

    // Cookie is set by backend automatically
    setUser(data.user || null);
    setIsAuthed(true);
  };

  const signup = async ({ username, email, password, avatar }) => {
    const res = await authFetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, email, password, avatar }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || "Signup failed");

    // If Supabase requires email confirmation, you may NOT be authed yet.
    // If cookie was set, /auth/me will succeed.
    const meRes = await authFetch("/auth/me");
    setIsAuthed(meRes.ok);

    setUser(data.user || null);
  };

  const logout = async () => {
    await authFetch("/auth/logout", { method: "POST" });
    setUser(null);
    setIsAuthed(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthed, login, signup, logout, authFetch }}
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
