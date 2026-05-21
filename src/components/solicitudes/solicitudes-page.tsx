"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Card, EmptyState, Skeleton, Badge } from "@/components/ui/primitives";
import { ApiError, useApi } from "@/hooks/use-api";
import { useDataCache } from "@/hooks/use-data-cache";
import { useToast } from "@/hooks/use-toast";

type Solicitud = {
  id: string;
  faltaId: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  motivo: string;
  motivoResolucion?: string;
  solicitanteUnidadNombre?: string;
  faltaResumen?: { nombreCompleto?: string; ci?: string; memorandum?: string };
  solicitadaPor?: { email?: string };
  createdAt?: string;
  resolvedAt?: string;
  tipoSolicitud?: "representacion" | "error_insercion";
  memorandumRepresentacion?: string | null;
  comentario?: string | null;
};

export function SolicitudesPage() {
  const { get, patch } = useApi();
  const { fetchWithCache, invalidate } = useDataCache();
  const toast = useToast();
  const [rows, setRows] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pendiente" | "aprobada" | "rechazada">("pendiente");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Solicitud | null>(null);
  const [resolveDecision, setResolveDecision] = useState<"aprobada" | "rechazada">("aprobada");
  const [resolveReason, setResolveReason] = useState("");

  const loadData = useCallback(async (options?: { force?: boolean; silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const payload = await fetchWithCache(
        `solicitudes-baja:${filter}`,
        () => get<{ data: Solicitud[] }>(`/api/faltas/solicitudes?estado=${filter}`),
        { ttlMs: filter === "pendiente" ? 60 * 1000 : 5 * 60 * 1000, force: options?.force },
      );
      setRows(payload.data.data);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [fetchWithCache, get, filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (filter !== "pendiente") return;
    const timer = window.setInterval(() => {
      void loadData({ force: true, silent: true });
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [filter, loadData]);

  function openResolveModal(row: Solicitud, decision: "aprobada" | "rechazada") {
    setResolveTarget(row);
    setResolveDecision(decision);
    setResolveReason("");
    setResolveModalOpen(true);
  }

  function closeResolveModal() {
    if (busyId) return;
    setResolveModalOpen(false);
    setResolveTarget(null);
    setResolveReason("");
  }

  function getApiErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
      const payload = error.payload as {
        error?: string;
        message?: string;
      } | Array<{ message?: string }>;

      if (Array.isArray(payload) && payload.length > 0 && payload[0]?.message) {
        return payload[0].message;
      }

      if (payload && !Array.isArray(payload)) {
        if (payload.error) return payload.error;
        if (payload.message) return payload.message;
      }
    }

    return error instanceof Error ? error.message : "No se pudo resolver";
  }

  async function submitResolve() {
    if (!resolveTarget) return;

    const motivoResolucion = resolveReason.trim();
    if (motivoResolucion.length < 6) {
      toast.warning("Debe indicar motivo de resolución (mínimo 6 caracteres)");
      return;
    }

    setBusyId(resolveTarget.id);
    try {
      await patch(`/api/faltas/solicitudes/${resolveTarget.id}/resolver`, {
        decision: resolveDecision,
        motivoResolucion,
      });
      invalidate("solicitudes-baja:");
      invalidate("historial:");
      invalidate("dashboard:");
      invalidate("reportes:");
      toast.success(
        resolveDecision === "aprobada" ? "Solicitud aprobada" : "Solicitud rechazada",
      );
      closeResolveModal();
      await loadData({ force: true });
    } catch (error) {
      toast.error("Error", getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-[var(--navy-900)]">Solicitudes para Dejar sin Efecto</h3>
            <p className="text-sm text-[var(--navy-500)]">Bandeja departamental para resolver solicitudes sobre sanciones disciplinarias.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { void loadData({ force: true }); }} loading={loading}>
            Actualizar
          </Button>
          <div className="flex gap-1 bg-[var(--navy-100)] p-1 rounded-xl">
            {(["pendiente", "aprobada", "rechazada"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === status ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Sin solicitudes" description="No existen solicitudes para este estado." />
        ) : (
          <div className="overflow-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--navy-50)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Efectivo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Unidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Motivo Solicitud</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.createdAt?.slice(0, 10) ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-900)] font-medium">{row.faltaResumen?.nombreCompleto ?? "-"} ({row.faltaResumen?.ci ?? "-"})</td>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.solicitanteUnidadNombre ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-700)] max-w-[350px]">{row.motivo}</td>
                    <td className="px-4 py-3">
                      <Badge variant={row.estado === "pendiente" ? "warning" : row.estado === "aprobada" ? "success" : "default"}>{row.estado}</Badge>
                    </td>
                    <td className="px-4 py-3">
                        {row.estado === "pendiente" ? (
                          <div className="flex gap-2">
                            <Button size="sm" variant="primary" loading={busyId === row.id} onClick={() => openResolveModal(row, "aprobada")}>Aprobar</Button>
                            <Button size="sm" variant="outline" loading={busyId === row.id} onClick={() => openResolveModal(row, "rechazada")}>Rechazar</Button>
                          </div>
                        ) : (
                        <span className="text-xs text-[var(--navy-500)]">{row.motivoResolucion ?? "Resuelta"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={resolveModalOpen}
        onClose={closeResolveModal}
        title={resolveDecision === "aprobada" ? "Aprobar solicitud" : "Rechazar solicitud"}
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={closeResolveModal} disabled={!!busyId}>
              Cancelar
            </Button>
            <Button
              variant={resolveDecision === "aprobada" ? "primary" : "outline"}
              onClick={() => { void submitResolve(); }}
              loading={!!busyId}
              disabled={resolveReason.trim().length < 6}
            >
              {resolveDecision === "aprobada" ? "Aprobar y dejar sin efecto" : "Confirmar rechazo"}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--navy-50)] p-3">
            <p className="text-xs text-[var(--navy-500)]">Solicitud seleccionada</p>
            <p className="text-sm font-semibold text-[var(--navy-900)]">
              {resolveTarget?.faltaResumen?.nombreCompleto ?? "-"} ({resolveTarget?.faltaResumen?.ci ?? "-"})
            </p>
            <p className="mt-1 text-xs text-[var(--navy-600)]">
              Tipo: {resolveTarget?.tipoSolicitud === "representacion" ? "Representación de la sanción" : "Error de inserción"}
            </p>
            {resolveTarget?.tipoSolicitud === "representacion" && (
              <p className="mt-1 text-xs text-[var(--navy-600)]">
                Memo de representación: {resolveTarget?.memorandumRepresentacion ?? "-"}
              </p>
            )}
          </div>

          <Textarea
            label={resolveDecision === "aprobada" ? "Motivo de aprobación para dejar sin efecto" : "Motivo de rechazo"}
            placeholder={resolveDecision === "aprobada" ? "Describa el fundamento de la aprobación..." : "Describa el fundamento del rechazo..."}
            rows={4}
            value={resolveReason}
            onChange={(e) => setResolveReason(e.target.value)}
            error={resolveReason.trim().length > 0 && resolveReason.trim().length < 6 ? "Mínimo 6 caracteres" : undefined}
          />
        </div>
      </Modal>
    </div>
  );
}
