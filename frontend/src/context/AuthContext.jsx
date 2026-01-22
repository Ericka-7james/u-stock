// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { API_BASE, API_PREFIX } from "../config/config";

const AuthContext = createContext(null);

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  const authFetch = useMemo(() => {
    return async (path, options = {}) => {
      const method = (options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});

      const hasBody = options.body !== undefined && options.body !== null;
      if (hasBody && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const p = path.startsWith("/") ? path : `/${path}`;

      // ✅ With Vite proxy, API_BASE should be "" in dev
      // so this becomes "/api/auth/me"
      const url = `${API_BASE}${API_PREFIX}${p}`;

      return fetch(url, {
        ...options,
        method,
        credentials: "include",
        headers,
      });
    };
  }, []);

  const refreshSession = useCallback(async () => {
    const attempt = async () => {
      const res = await authFetch("auth/me", { method: "GET" });
      const data = await safeJson(res);
      return { ok: res.ok, data };
    };

    try {
      let { ok, data } = await attempt();

      // Safari-ish fallback: retry once quickly
      if (!ok) {
        await new Promise((r) => setTimeout(r, 250));
        ({ ok, data } = await attempt());
      }

      if (!ok) {
        setIsAuthed(false);
        setUser(null);
        return false;
      }

      if (data?.user?.id) {
        setUser(data.user);
        setIsAuthed(true);
        return true;
      }

      if (data?.user_id) {
        setUser((prev) => ({
          ...(prev || {}),
          id: data.user_id,
          email: data.email || prev?.email || "",
        }));
        setIsAuthed(true);
        return true;
      }

      setIsAuthed(false);
      setUser(null);
      return false;
    } catch { 
      setIsAuthed(false);
      setUser(null);
      return false;
    }
}, [authFetch]);


  useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshSession();
      setLoading(false);
    })();
  }, [refreshSession]);

  useEffect(() => {
    const t = window.setInterval(() => {
      refreshSession();
    }, 60_000);

    return () => window.clearInterval(t);
  }, [refreshSession]);


  const login = async (email, password) => {
    const res = await authFetch("auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.detail || "Login failed");

    setUser(data.user || null);
    setIsAuthed(true);

    // confirm cookie works
    await refreshSession();
  };

  const signup = async ({ username, email, password, avatar }) => {
    const res = await authFetch("auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, email, password, avatar }),
    });

    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.detail || "Signup failed");

    setUser(data.user || null);
    await refreshSession();
  };

  const logout = async () => {
    await authFetch("auth/logout", { method: "POST" });
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
        refreshSession,
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
