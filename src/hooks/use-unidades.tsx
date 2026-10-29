"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { ApiError, useApi } from "./use-api";
import { useToast } from "./use-toast";
import { useAuth } from "./use-auth";
import { useDataCache } from "./use-data-cache";

export type Unidad = {
  id: string;
  nombre: string;
  estado: "activa" | "inactiva";
};

type UnidadesContextType = {
  unidades: Unidad[];
  unitOptions: { value: string; label: string }[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getUnitName: (id: string) => string;
};

const UnidadesContext = createContext<UnidadesContextType | null>(null);

export function UnidadesProvider({ children }: { children: ReactNode }) {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const { get } = useApi();
  const { fetchWithCache, invalidate } = useDataCache();
  const { sessionUser } = useAuth();
  const sessionKey = sessionUser ? `${sessionUser.uid}:${sessionUser.role}:${sessionUser.unidadId ?? ""}:${sessionUser.dataGeneration ?? 0}` : null;
  const { error: showError } = useToast();

  const fetchUnidades = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!sessionKey) {
      setUnidades([]);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      const res = await fetchWithCache(
        `unidades:${sessionKey}`,
        () => get<{ data: Unidad[] }>("/api/unidades"),
        { ttlMs: 10 * 60 * 1000 },
      );
      if (version !== requestVersion.current) return;
      setUnidades(res.data.data);
      setError(null);
    } catch (error) {
      if (version !== requestVersion.current) return;
      const message = error instanceof ApiError ? error.message : "Compruebe su conexión e intente nuevamente.";
      setError(message);
      console.error("Error fetching units:", error);
      showError("No se pudieron cargar las unidades policiales", message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [fetchWithCache, get, showError, sessionKey]);

  const invalidatePending = useCallback(() => { requestVersion.current++; }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUnidades();
    // Responses from a closed/replaced session or an older refresh must not update this catalog.
    return invalidatePending;
  }, [fetchUnidades, invalidatePending]);

  const unitOptions = unidades.map(u => ({ value: u.id, label: u.nombre }));

  const getUnitName = useCallback((id: string) => {
    return unidades.find(u => u.id === id)?.nombre ?? id;
  }, [unidades]);

  return (
    <UnidadesContext.Provider value={{
      unidades,
      unitOptions,
      loading,
      error,
      refresh: async () => {
        invalidate("unidades:");
        await fetchUnidades();
      },
      getUnitName,
    }}>
      {children}
    </UnidadesContext.Provider>
  );
}

export function useUnidades() {
  const context = useContext(UnidadesContext);
  if (!context) {
    throw new Error("useUnidades must be used within a UnidadesProvider");
  }
  return context;
}
