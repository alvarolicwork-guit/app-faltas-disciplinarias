"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useApi } from "./use-api";
import { useToast } from "./use-toast";
import { useAuth } from "./use-auth";

export type Unidad = {
  id: string;
  nombre: string;
  estado: "activa" | "inactiva";
};

type UnidadesContextType = {
  unidades: Unidad[];
  unitOptions: { value: string; label: string }[];
  loading: boolean;
  refresh: () => Promise<void>;
  getUnitName: (id: string) => string;
};

const UnidadesContext = createContext<UnidadesContextType | null>(null);

export function UnidadesProvider({ children }: { children: ReactNode }) {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [loading, setLoading] = useState(true);
  const { get } = useApi();
  const { firebaseUser } = useAuth();
  const { error: showError } = useToast();

  const fetchUnidades = useCallback(async () => {
    if (!firebaseUser) {
      setUnidades([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await get<{ data: Unidad[] }>("/api/unidades");
      setUnidades(res.data);
    } catch (error) {
      console.error("Error fetching units:", error);
      showError("Error de conexión", "No se pudieron cargar las unidades policiales");
    } finally {
      setLoading(false);
    }
  }, [get, showError, firebaseUser]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUnidades();
  }, [fetchUnidades]);

  const unitOptions = unidades.map(u => ({ value: u.id, label: u.nombre }));

  const getUnitName = useCallback((id: string) => {
    return unidades.find(u => u.id === id)?.nombre ?? id;
  }, [unidades]);

  return (
    <UnidadesContext.Provider value={{ unidades, unitOptions, loading, refresh: fetchUnidades, getUnitName }}>
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
