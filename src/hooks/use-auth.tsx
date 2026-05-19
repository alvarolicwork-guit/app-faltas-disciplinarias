"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

import { clientAuth } from "@/lib/firebase/client";
import {
  isGlobalRole,
  isSuperAdmin,
  isUnitScopedRole,
} from "@/lib/domain/roles";

/* ─── Types ─── */
export type SessionUser = {
  uid: string;
  email: string;
  role: string;
  unidadId: string | null;
  unidadNombre: string | null;
  grado?: string | null;
  nombres?: string | null;
  apellidos?: string | null;
  nombreCompleto?: string | null;
  mustChangePassword?: boolean;
};

type AuthContextValue = {
  firebaseUser: User | null;
  sessionUser: SessionUser | null;
  idToken: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string>;
  refreshSession: () => Promise<SessionUser | null>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/* ─── Provider ─── */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /* Fetch /api/me to get role + unit info */
  const fetchSession = useCallback(async (token: string): Promise<SessionUser | null> => {
    try {
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as SessionUser;
    } catch {
      return null;
    }
  }, []);

  /* Get fresh token (auto-refresh if expired) */
  const getToken = useCallback(async (): Promise<string> => {
    if (!firebaseUser) throw new Error("No autenticado");
    const token = await firebaseUser.getIdToken(false);
    setIdToken(token);
    return token;
  }, [firebaseUser]);

  const refreshSession = useCallback(async (): Promise<SessionUser | null> => {
    if (!firebaseUser) return null;
    const token = await firebaseUser.getIdToken(true);
    setIdToken(token);
    const session = await fetchSession(token);
    setSessionUser(session);
    return session;
  }, [fetchSession, firebaseUser]);

  /* Auth state observer */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(clientAuth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setIdToken(null);
        setSessionUser(null);
        setLoading(false);
        return;
      }

      setFirebaseUser(user);

      try {
        const token = await user.getIdToken();
        setIdToken(token);

        const session = await fetchSession(token);
        setSessionUser(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de sesión");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchSession]);

  /* Token refresh interval (every 50 min) */
  useEffect(() => {
    if (!firebaseUser) return;

    const interval = setInterval(async () => {
      try {
        const token = await firebaseUser.getIdToken(true);
        setIdToken(token);
      } catch {
        /* silent fail — next call will retry */
      }
    }, 50 * 60 * 1000);

    return () => clearInterval(interval);
  }, [firebaseUser]);

  /* Login */
  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(clientAuth, email.trim(), password);
    } catch {
      setError("Credenciales inválidas. Verifique correo y contraseña.");
      setLoading(false);
      throw new Error("Login failed");
    }
  }, []);

  /* Logout */
  const logout = useCallback(async () => {
    await signOut(clientAuth);
    setSessionUser(null);
    setIdToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      sessionUser,
      idToken,
      loading,
      error,
      login,
      logout,
      getToken,
      refreshSession,
      clearError,
    }),
    [firebaseUser, sessionUser, idToken, loading, error, login, logout, getToken, refreshSession, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ─── Hook ─── */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/* ─── Helpers ─── */
export { isGlobalRole, isSuperAdmin, isUnitScopedRole };
