"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useApi } from "@/hooks/use-api";
import { useAuth, isUnitScopedRole } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useUnidades } from "@/hooks/use-unidades";
import { getRangoOrder } from "@/lib/domain/rangos-policiales";

type PersonalRow = {
  id: string;
  grado: string;
  apellidos: string;
  nombres: string;
  ci: string;
  unidadId: string;
  unidadNombre: string;
};

export function PersonalPage() {
  const { get } = useApi();
  const { sessionUser } = useAuth();
  const { unitOptions } = useUnidades();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PersonalRow[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [search, setSearch] = useState("");

  const isUnitScoped = sessionUser ? isUnitScopedRole(sessionUser.role) : false;
  const effectiveUnitId = isUnitScoped ? (sessionUser?.unidadId ?? "") : selectedUnitId;

  const fetchPersonal = useCallback(async () => {
    if (!effectiveUnitId) {
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("unidadId", effectiveUnitId);
      params.set("limit", "300");
      const payload = await get<{ data: PersonalRow[] }>(`/api/personal?${params.toString()}`);
      setRows(payload.data);
    } catch (error) {
      setRows([]);
      toast.error("Error al cargar personal", error instanceof Error ? error.message : "No se pudo cargar personal");
    } finally {
      setLoading(false);
    }
  }, [effectiveUnitId, get, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPersonal();
  }, [fetchPersonal]);

  const orderedRows = useMemo(() => {
    const filter = search.trim().toLowerCase();
    const filtered = filter
      ? rows.filter((row) => {
        const fullName = `${row.apellidos} ${row.nombres}`.toLowerCase();
        const ci = String(row.ci ?? "").toLowerCase();
        const grado = String(row.grado ?? "").toLowerCase();
        return fullName.includes(filter) || ci.includes(filter) || grado.includes(filter);
      })
      : rows;

    return [...filtered].sort((a, b) => {
      const rankA = getRangoOrder(a.grado);
      const rankB = getRangoOrder(b.grado);
      if (rankA !== rankB) return rankA - rankB;

      const apellidosCmp = a.apellidos.localeCompare(b.apellidos, "es", { sensitivity: "base" });
      if (apellidosCmp !== 0) return apellidosCmp;

      const nombresCmp = a.nombres.localeCompare(b.nombres, "es", { sensitivity: "base" });
      if (nombresCmp !== 0) return nombresCmp;

      return String(a.ci).localeCompare(String(b.ci), "es", { sensitivity: "base" });
    });
  }, [rows, search]);

  const showUnitSelectorPrompt = !isUnitScoped && !effectiveUnitId;

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--navy-900)]">Personal</h3>
            <p className="text-sm text-[var(--navy-500)]">
              Listado de personal por unidad. Ordenado por jerarquía de grado.
            </p>
          </div>
          {!isUnitScoped && (
            <div className="w-full md:w-[360px]">
              <Select
                label="Unidad"
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                options={unitOptions}
                placeholder="Seleccionar unidad"
              />
            </div>
          )}
        </div>

        <div className="mt-4">
          <Input
            placeholder="Buscar por CI, apellidos, nombres o grado"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mt-4">
          {showUnitSelectorPrompt ? (
            <EmptyState
              title="Seleccione una unidad"
              description="Para mayor control, primero seleccione una unidad específica para ver su personal."
            />
          ) : loading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)}</div>
          ) : orderedRows.length === 0 ? (
            <EmptyState title="Sin resultados" description="No hay personal cargado para esta unidad o no coincide la búsqueda." />
          ) : (
            <div className="overflow-auto rounded-xl border border-[var(--border)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--navy-50)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">N°</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Grado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Apellidos</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Nombres</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">CI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {orderedRows.map((row, index) => (
                    <tr key={row.id} className="hover:bg-[var(--navy-50)] transition-colors">
                      <td className="px-4 py-3 text-[var(--navy-700)]">{index + 1}</td>
                      <td className="px-4 py-3 text-[var(--navy-900)] font-medium">{row.grado}</td>
                      <td className="px-4 py-3 text-[var(--navy-700)]">{row.apellidos}</td>
                      <td className="px-4 py-3 text-[var(--navy-700)]">{row.nombres}</td>
                      <td className="px-4 py-3 text-[var(--navy-900)] font-semibold">{row.ci}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
