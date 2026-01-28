// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { API_BASE, API_PREFIX } from "../config/config";

const AuthContext = createContext(null);

// localStorage “hint” so we don’t ping /auth/me for brand new visitors
const SESSION_HINT_KEY = "ustock_session_hint_v1";

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

  // derived from localStorage; used to decide whether we should even try /auth/me
  const [sessionHint, setSessionHint] = useState(() => {
    try {
      return window.localStorage.getItem(SESSION_HINT_KEY) === "1";
    } catch {
      return false;
    }
  });

  // prevent double mount calls in React 18 StrictMode dev
  const didInitRef = useRef(false);

  const authFetch = useMemo(() => {
    return async (path, options = {}) => {
      const method = (options.method || "GET").toUpperCase();
      const headers = new Headers(options.headers || {});

      const hasBody = options.body !== undefined && options.body !== null;
      if (hasBody && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const p = path.startsWith("/") ? path : `/${path}`;
      const url = `${API_BASE}${API_PREFIX}${p}`;

      return fetch(url, {
        ...options,
        method,
        credentials: "include",
        headers,
      });
    };
  }, []);

  const setHintOn = useCallback(() => {
    try {
      window.localStorage.setItem(SESSION_HINT_KEY, "1");
    } catch {
      // ignore
    }
    setSessionHint(true);
  }, []);

  const clearHint = useCallback(() => {
    try {
      window.localStorage.removeItem(SESSION_HINT_KEY);
    } catch {
      // ignore
    }
    setSessionHint(false);
  }, []);

  const refreshSession = useCallback(
    async (opts = {}) => {
      const { force = false } = opts;

      // ✅ Key behavior: don’t call /auth/me for brand-new visitors
      // unless forced (login flow) or we already have a session hint.
      if (!force && !sessionHint && !isAuthed) {
        setIsAuthed(false);
        setUser(null);
        return false;
      }

      const attempt = async () => {
        const res = await authFetch("auth/me", { method: "GET" });
        const data = await safeJson(res);
        return { ok: res.ok, status: res.status, data };
      };

      try {
        let { ok, status, data } = await attempt();

        // Safari-ish fallback: retry once quickly
        if (!ok) {
          await new Promise((r) => setTimeout(r, 250));
          ({ ok, status, data } = await attempt());
        }

        // 401 is “normal” when no cookie exists — treat as unauth silently
        if (!ok) {
          if (status === 401) {
            setIsAuthed(false);
            setUser(null);

            // if we thought we had a session but server says no, clear hint
            if (sessionHint) clearHint();

            return false;
          }

          // other errors: still treat as unauth
          setIsAuthed(false);
          setUser(null);
          return false;
        }

        // success -> keep hint so future reloads can restore session quietly
        setHintOn();

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
    },
    [authFetch, clearHint, isAuthed, sessionHint, setHintOn]
  );

  // Initial boot: only refresh if we have a hint (or later if forced)
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    (async () => {
      // if no hint, don’t spam /me — just mark loading done
      if (!sessionHint) {
        setLoading(false);
        return;
      }

      setLoading(true);
      await refreshSession({ force: true }); // we have a hint, so it’s safe to check
      setLoading(false);
    })();
  }, [refreshSession, sessionHint]);

  // Keep-alive polling ONLY when authed (or when we have a hint)
  useEffect(() => {
    if (!isAuthed && !sessionHint) return;

    const t = window.setInterval(() => {
      refreshSession();
    }, 60_000);

    return () => window.clearInterval(t);
  }, [refreshSession, isAuthed, sessionHint]);

  const login = async (email, password) => {
    const res = await authFetch("auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.detail || "Login failed");

    setUser(data.user || null);
    setIsAuthed(true);

    // ✅ set hint so future reloads can restore session w/out spamming for new visitors
    setHintOn();

    // confirm cookie works (force refresh even if hint missing)
    await refreshSession({ force: true });
  };

  const signup = async ({ username, email, password, avatar }) => {
    const res = await authFetch("auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, email, password, avatar }),
    });

    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.detail || "Signup failed");

    setUser(data.user || null);

    // signup implies we likely have a session/cookie right after
    setHintOn();
    await refreshSession({ force: true });
  };

  const logout = async () => {
    try {
      await authFetch("auth/logout", { method: "POST" });
    } catch {
      // ignore network/logout errors; still clear local state
    } finally {
      setUser(null);
      setIsAuthed(false);
      clearHint();
    }
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
