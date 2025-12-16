// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
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

      return fetch(`${API_BASE}${API_PREFIX}${p}`, {
        ...options,
        method,
        credentials: "include",
        headers,
      });
    };
  }, []);

  const refreshSession = async () => {
    const attempt = async () => {
      const res = await authFetch("auth/me", { method: "GET" });
      if (!res.ok) return null;
      return await safeJson(res);
    };

    try {
      let data = await attempt();

      // Safari fallback: short retry once before giving up
      if (!data) {
        await new Promise((r) => setTimeout(r, 300));
        data = await attempt();
      }

      if (!data) {
        setIsAuthed(false);
        setUser(null);
        return false;
      }

      setUser((prev) => ({ ...(prev || {}), id: data.user_id }));
      setIsAuthed(true);
      return true;
    } catch {
      setIsAuthed(false);
      setUser(null);
      return false;
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshSession();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password) => {
    const res = await authFetch("auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.detail || "Login failed");

    setUser(data.user || null);
    setIsAuthed(true);

    // confirm cookie is actually valid
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
