"use client";

import { useEffect, useState } from "react";

import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";

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
  const [rows, setRows] = useState<Transferencia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const payload = await get<{ data: Transferencia[] }>("/api/transferencias?limit=150");
        setRows(payload.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [get]);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <h3 className="text-base font-bold text-[var(--navy-900)] mb-2">Auditoría de Traspasos</h3>
        <p className="text-sm text-[var(--navy-500)] mb-4">Registro de transferencias de personal entre unidades.</p>

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
