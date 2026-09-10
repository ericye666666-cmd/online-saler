"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { OperationsSession } from "./operations-access";
import {
  LEGACY_SESSION_ADMIN_USER_KEY,
  OPERATIONS_SESSION_CHANGED_EVENT,
  OPERATIONS_SESSION_EXPIRED_EVENT,
  SESSION_ACCESS_TOKEN_KEY,
  applyToCurrentOperationsSession,
  operationsTokenSubject
} from "@/lib/operations-api";

const API_PROXY_URL = "/api-proxy";
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
    const accessToken = localStorage.getItem(SESSION_ACCESS_TOKEN_KEY);
    if (!accessToken) {
      setSession(null);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const next = await request("/operations/access/session", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      applyToCurrentOperationsSession(accessToken, () => {
        if (!next.adminUser || !next.accessToken) {
          localStorage.removeItem(SESSION_ACCESS_TOKEN_KEY);
          setSession(null);
        } else {
          localStorage.setItem(SESSION_ACCESS_TOKEN_KEY, next.accessToken);
          setSession(next);
        }
      });
    } catch (caught) {
      applyToCurrentOperationsSession(accessToken, () => {
        localStorage.removeItem(SESSION_ACCESS_TOKEN_KEY);
        localStorage.removeItem(LEGACY_SESSION_ADMIN_USER_KEY);
        setSession(null);
        setError(caught instanceof Error ? caught.message : "Could not restore the employee session.");
      });
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
      if (!next.adminUser || !next.accessToken) throw new Error("A protected employee session was not returned.");
      localStorage.setItem(SESSION_ACCESS_TOKEN_KEY, next.accessToken);
      localStorage.removeItem(LEGACY_SESSION_ADMIN_USER_KEY);
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
    localStorage.removeItem(SESSION_ACCESS_TOKEN_KEY);
    localStorage.removeItem(LEGACY_SESSION_ADMIN_USER_KEY);
    setSession(null);
    setError("");
  }, []);

  useEffect(() => {
    const sessionExpired = () => {
      setSession(null);
      setLoading(false);
      setError("Your employee session has expired. Please sign in again.");
    };
    const sessionChanged = () => {
      setSession(null);
      setLoading(false);
      setError("The employee account has changed. Reload the page and sign in before continuing.");
    };
    window.addEventListener(OPERATIONS_SESSION_EXPIRED_EVENT, sessionExpired);
    window.addEventListener(OPERATIONS_SESSION_CHANGED_EVENT, sessionChanged);
    void refresh();
    return () => {
      window.removeEventListener(OPERATIONS_SESSION_EXPIRED_EVENT, sessionExpired);
      window.removeEventListener(OPERATIONS_SESSION_CHANGED_EVENT, sessionChanged);
    };
  }, [refresh]);

  useEffect(() => {
    const adminUserId = session?.adminUser?.id;
    if (!adminUserId) return;
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== SESSION_ACCESS_TOKEN_KEY || operationsTokenSubject(event.newValue) === adminUserId) return;
      window.dispatchEvent(new Event(event.newValue ? OPERATIONS_SESSION_CHANGED_EVENT : OPERATIONS_SESSION_EXPIRED_EVENT));
    };
    window.addEventListener("storage", storageChanged);
    return () => window.removeEventListener("storage", storageChanged);
  }, [session?.adminUser?.id]);

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
