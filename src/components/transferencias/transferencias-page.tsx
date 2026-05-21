"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useDataCache } from "@/hooks/use-data-cache";

type Transferencia = {
  id: string;
  nombreCompleto?: string;
  ci?: string;
  fromUnidadNombre?: string;
  toUnidadNombre?: string;
  motivoTransferencia?: string;
  createdAt?: string;
  realizadoPor?: { email?: string; role?: string };
};

export function TransferenciasPage() {
  const { get } = useApi();
  const { fetchWithCache } = useDataCache();
  const [rows, setRows] = useState<Transferencia[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    try {
      const payload = await fetchWithCache(
        "transferencias:limit:150",
        () => get<{ data: Transferencia[] }>("/api/transferencias?limit=150"),
        { ttlMs: 5 * 60 * 1000, force: options?.force },
      );
      setRows(payload.data.data);
    } finally {
      setLoading(false);
    }
  }, [fetchWithCache, get]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <h3 className="text-base font-bold text-[var(--navy-900)] mb-2">Auditoría de Traspasos</h3>
        <p className="text-sm text-[var(--navy-500)] mb-4">Registro de transferencias de personal entre unidades.</p>
        <Button variant="outline" size="sm" onClick={() => { void loadData({ force: true }); }} loading={loading} className="mb-4">
          Actualizar
        </Button>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Sin transferencias" description="Aún no existen traspasos registrados." />
        ) : (
          <div className="overflow-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--navy-50)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Funcionario</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Origen</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Destino</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Motivo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Realizado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.createdAt?.slice(0, 19).replace("T", " ") ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-900)] font-medium">{row.nombreCompleto ?? "-"} ({row.ci ?? "-"})</td>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.fromUnidadNombre ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.toUnidadNombre ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.motivoTransferencia ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.realizadoPor?.email ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
