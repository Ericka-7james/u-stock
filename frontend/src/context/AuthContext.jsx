// frontend/src/context/AuthContext.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { API_BASE, API_PREFIX } from "../config/config.js";

import { AuthContext } from "./authContextBase.js";

import {
  SESSION_HINT_KEY,
  safeJson,
  makeHttpError,
  setJustAuthed,
} from "./authUtils.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  const [sessionHint, setSessionHint] = useState(() => {
    try {
      return window.localStorage.getItem(SESSION_HINT_KEY) === "1";
    } catch {
      return false;
    }
  });

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

        if (!ok) {
          await new Promise((r) => setTimeout(r, 250));
          ({ ok, status, data } = await attempt());
        }

        if (!ok) {
          if (status === 401) {
            setIsAuthed(false);
            setUser(null);
            if (sessionHint) clearHint();
            return false;
          }

          setIsAuthed(false);
          setUser(null);
          return false;
        }

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

    setHintOn();
    setJustAuthed("login");

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
    setJustAuthed("signup");

    await refreshSession({ force: true });
  };

  const logout = async () => {
    try {
      await authFetch("auth/logout", { method: "POST" });
    } catch {
      // ignore
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