// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE } from "../config/config"; // 👈 central config
import { useNavigate } from "react-router-dom";

const AuthContext = createContext(null);
const STORAGE_KEY = "ustock_auth";

/**
 * Small helper = "frontend middleware":
 * - prefixes API_BASE
 * - attaches JSON headers
 * - injects Authorization bearer token if present
 * - throws an Error with the response text when !res.ok
 */
async function apiRequest(path, { method = "GET", body, token } = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);   // { id, email, avatar }
  const [token, setToken] = useState(null); // JWT
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  // Restore auth from localStorage on first load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.user && parsed?.token) {
          setUser(parsed.user);
          setToken(parsed.token);
        }
      }
    } catch (e) {
      console.error("Failed to restore auth", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const persist = (nextUser, nextToken) => {
    setUser(nextUser);
    setToken(nextToken);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user: nextUser, token: nextToken })
    );
  };

  const clearAuth = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const login = async (email, password) => {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    // data: { user, token }
    persist(data.user, data.token);
  };

  const signup = async ({ name, email, phone, password, avatar }) => {
    const data = await apiRequest("/auth/signup", {
      method: "POST",
      body: { name, email, phone, password, avatar },
    });
    // auto-login after sign up
    persist(data.user, data.token);
  };

  const logout = () => {
    clearAuth();
    navigate("/", { replace: true });
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, signup, logout }}
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
