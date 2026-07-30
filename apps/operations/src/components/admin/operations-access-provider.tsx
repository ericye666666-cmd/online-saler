"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { OperationsSession } from "./operations-access";

const API_PROXY_URL = "/api-proxy";
const SESSION_ADMIN_USER_KEY = "operations.access.adminUserId";
const DEFAULT_ADMIN_LOGIN = "superadmin";

type OperationsAccessContextValue = {
  loading: boolean;
  session: OperationsSession | null;
  error: string;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  hasPermission: (permission?: string) => boolean;
};

const OperationsAccessContext = createContext<OperationsAccessContextValue | null>(null);

async function request(path: string, options?: RequestInit): Promise<OperationsSession> {
  const response = await fetch(`${API_PROXY_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) }
  });
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text || `Request failed: ${response.status}` };
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as OperationsSession;
}

export function OperationsAccessProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<OperationsSession | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const adminUserId = localStorage.getItem(SESSION_ADMIN_USER_KEY);
    if (!adminUserId) {
      setSession(null);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const next = await request(`/operations/access/session?adminUserId=${encodeURIComponent(adminUserId)}`);
      if (!next.adminUser) {
        localStorage.removeItem(SESSION_ADMIN_USER_KEY);
        setSession(null);
      } else {
        setSession(next);
      }
    } catch (caught) {
      localStorage.removeItem(SESSION_ADMIN_USER_KEY);
      setSession(null);
      setError(caught instanceof Error ? caught.message : "Could not restore the employee session.");
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (loginAccount: string, password: string) => {
    setLoading(true);
    setError("");
    try {
      const next = await request("/operations/access/login", {
        method: "POST",
        body: JSON.stringify({ login: loginAccount.trim() || DEFAULT_ADMIN_LOGIN, password })
      });
      if (!next.adminUser) throw new Error("Admin account was not returned.");
      localStorage.setItem(SESSION_ADMIN_USER_KEY, next.adminUser.id);
      setSession(next);
    } catch (caught) {
      setSession(null);
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_ADMIN_USER_KEY);
    setSession(null);
    setError("");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<OperationsAccessContextValue>(
    () => ({
      loading,
      session,
      error,
      login,
      logout,
      refresh,
      hasPermission: (permission?: string) => !permission || Boolean(session?.permissions.includes(permission))
    }),
    [error, loading, login, logout, refresh, session]
  );

  return <OperationsAccessContext.Provider value={value}>{children}</OperationsAccessContext.Provider>;
}

export function useOperationsSession(): OperationsAccessContextValue {
  const context = useContext(OperationsAccessContext);
  if (!context) {
    throw new Error("useOperationsSession must be used inside OperationsAccessProvider.");
  }
  return context;
}

export { DEFAULT_ADMIN_LOGIN };
