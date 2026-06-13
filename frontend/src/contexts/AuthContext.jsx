import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = unknown, false = no user, object = user
  const [loading, setLoading] = useState(true);
  const [devMode, setDevMode] = useState(() => localStorage.getItem("gv_dev_mode") === "1");

  const refresh = useCallback(async () => {
    if (devMode) {
      const dev = { user_id: "dev_user", email: "dev@local", name: "Dev User", role: "user", picture: "" };
      setUser(dev);
      setLoading(false);
      return dev;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(false);
      return null;
    } finally {
      setLoading(false);
    }
  }, [devMode]);

  useEffect(() => {
    // If returning from OAuth callback, AuthCallback handles it
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data);
    return data;
  };

  const register = async (email, password, name) => {
    const { data } = await api.post("/auth/register", { email, password, name });
    setUser(data);
    return data;
  };

  const logout = async () => {
    if (!devMode) {
      try { await api.post("/auth/logout"); } catch {}
    }
    setUser(false);
  };

  const toggleDevMode = (v) => {
    const next = typeof v === "boolean" ? v : !devMode;
    localStorage.setItem("gv_dev_mode", next ? "1" : "0");
    setDevMode(next);
    if (next) {
      setUser({ user_id: "dev_user", email: "dev@local", name: "Dev User", role: "user", picture: "" });
    } else {
      setUser(null);
      setLoading(true);
      // refresh via effect after rerender
      setTimeout(() => refresh(), 0);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, devMode, login, register, logout, refresh, toggleDevMode, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
