// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { API_BASE, API_PREFIX } from "../config/config";

const AuthContext = createContext(null);

// localStorage “hint” so we don’t ping /auth/me for brand new visitors
const SESSION_HINT_KEY = "ustock_session_hint_v1";

// one-time “show dashboard onboarding after auth”
const JUST_AUTHED_KEY = "ustock:just_authed_v1";
const JUST_AUTHED_KIND_KEY = "ustock:just_authed_kind_v1"; // "signup" | "login"

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function extractDetailMessage(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;

  if (typeof detail === "object") {
    // your backend sends: { code, message }
    return String(detail.message || detail.detail || detail.error || "");
  }

  return String(detail);
}

function makeHttpError(res, data) {
  const detail = data?.detail ?? null;

  const code =
    typeof detail === "object" && detail?.code
      ? detail.code
      : typeof data === "object" && data?.code
      ? data.code
      : null;

  const msg = extractDetailMessage(detail) || String(data?.message || data?.error || "") || `Request failed (${res.status})`;

  const err = new Error(msg);

  // attach metadata so explainAnyError() can use it
  err.status = res.status;
  err.code = code;
  err.detail = detail;
  err.payload = data;

  return err;
}

function setJustAuthed(kind = "login") {
  try {
    window.localStorage.setItem(JUST_AUTHED_KEY, "1");
    window.localStorage.setItem(JUST_AUTHED_KIND_KEY, kind);
  } catch {
    // ignore
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

      // ✅ don’t call /auth/me for brand-new visitors unless forced or we have a hint
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

        // 401 is normal when no cookie exists — treat as unauth silently
        if (!ok) {
          if (status === 401) {
            setIsAuthed(false);
            setUser(null);

            // if we thought we had a session but server says no, clear hint
            if (sessionHint) clearHint();

            return false;
          }

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

  // Initial boot: only refresh if we have a hint
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    (async () => {
      if (!sessionHint) {
        setLoading(false);
        return;
      }

      setLoading(true);
      await refreshSession({ force: true });
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
    if (!res.ok) throw makeHttpError(res, data);

    setUser(data.user || null);
    setIsAuthed(true);

    // ✅ set hint so future reloads can restore session
    setHintOn();

    // ✅ NEW: mark dashboard onboarding to show once
    setJustAuthed("login");

    // confirm cookie works
    await refreshSession({ force: true });
  };

  const signup = async ({ username, email, phone, password, avatar }) => {
    const res = await authFetch("auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, email, phone, password, avatar }),
    });

    const data = await safeJson(res);
    if (!res.ok) throw makeHttpError(res, data);

    setUser(data.user || null);
    setIsAuthed(true);

    setHintOn();

    // ✅ NEW: mark dashboard onboarding to show once
    setJustAuthed("signup");

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
