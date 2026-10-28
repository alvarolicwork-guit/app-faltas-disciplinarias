"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { canReadCancellationRequests, canResolveCancellationRequests } from "@/lib/domain/roles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Card, EmptyState, Skeleton, Badge } from "@/components/ui/primitives";
import { ApiError, useApi } from "@/hooks/use-api";
import { useDataCache } from "@/hooks/use-data-cache";
import { useToast } from "@/hooks/use-toast";
import { pendingRequest, requestDeadline } from "@/lib/domain/sanction-policy";
import { boliviaDateTime } from "@/lib/domain/audit-report";

type Solicitud = {
  id: string;
  faltaId: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  motivo: string;
  motivoResolucion?: string;
  solicitanteUnidadNombre?: string;
  faltaResumen?: { nombreCompleto?: string; ci?: string; memorandum?: string };
  solicitadaPor?: { email?: string };
  resolvedBy?: { email?: string; uid?: string };
  causaCierre?: string;
  createdAt?: string;
  expiresAt?: string | null;
  resolvedAt?: string;
  tipoSolicitud?: "representacion" | "error_insercion";
  memorandumRepresentacion?: string | null;
  comentario?: string | null;
};

function remainingTime(row: Solicitud, now: number): string {
  const deadline = requestDeadline(row);
  if (deadline === null) return "Fecha de vencimiento no disponible; requiere revisión";
  const remaining = deadline - now;
  if (remaining <= 0) return "Plazo vencido";
  const minutes = Math.ceil(remaining / 60_000);
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60);
  return days ? `Vence en ${days} d${hours ? ` y ${hours} h` : ""}` : hours ? `Vence en ${hours} h${minutes % 60 ? ` y ${minutes % 60} min` : ""}` : `Vence en ${minutes} min`;
}

export function SolicitudesPage({ selectedRequestId, onFindSanction }: { selectedRequestId?: string; onFindSanction: () => void }) {
  const { sessionUser } = useAuth();
  const canRead = canReadCancellationRequests(sessionUser?.role ?? "");
  const canResolve = canResolveCancellationRequests(sessionUser?.role ?? "");
  const { get, post, patch } = useApi();
  const { fetchWithCache, invalidate } = useDataCache();
  const toast = useToast();
  const [result, setResult] = useState<{key:string; rows:Solicitud[]; error?:string} | null>(null);
  const loadVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pendiente" | "aprobada" | "rechazada">("pendiente");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Solicitud | null>(null);
  const [resolveDecision, setResolveDecision] = useState<"aprobada" | "rechazada">("aprobada");
  const [resolveReason, setResolveReason] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const queryKey = `solicitudes-baja:${sessionUser?.uid}:${sessionUser?.role}:${sessionUser?.unidadId ?? ""}:${filter}`;
  const loadData = useCallback(async (options?: { force?: boolean; silent?: boolean }) => {
    if (!canRead) return;
    const version = ++loadVersion.current;
    if (!options?.silent) setLoading(true);
    try {
      const payload = await fetchWithCache(queryKey,
        () => get<{ data: Solicitud[] }>(`/api/faltas/solicitudes?estado=${filter}`),
        { ttlMs: filter === "pendiente" ? 60_000 : 300_000, force: options?.force });
      if (version !== loadVersion.current) return;
      setResult({key:queryKey, rows:payload.data.data});
      setNow(Date.now());
    } catch (error) {
      if (version === loadVersion.current) setResult({key:queryKey, rows:[], error:error instanceof Error ? error.message : "No se pudieron consultar las solicitudes"});
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [canRead, queryKey, fetchWithCache, get, filter]);
  const rows = result?.key === queryKey ? result.rows : [];
  const loadError = result?.key === queryKey ? result.error : null;
  const isLoading = loading || result?.key !== queryKey;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData({ force: true });
    // Invalidate all in-flight loads on scope changes and unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { loadVersion.current++; };
  }, [loadData]);

  useEffect(() => {
    if (filter !== "pendiente") return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void loadData({ force: true, silent: true });
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [filter, loadData]);

  const visibleRows = rows.filter(row => filter !== "pendiente" || pendingRequest(row, now)).sort((a, b) => filter === "pendiente" ? (requestDeadline(a) ?? Infinity) - (requestDeadline(b) ?? Infinity) : 0);
  const nextDeadline = filter === "pendiente" ? Math.min(...visibleRows.map(requestDeadline).filter((value): value is number => value !== null)) : Infinity;
  useEffect(() => {
    if (!Number.isFinite(nextDeadline)) return;
    const timer = window.setTimeout(() => {
      setNow(Date.now());
      void loadData({ force: true, silent: true });
    }, Math.min(Math.max(nextDeadline - Date.now() + 50, 0), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [nextDeadline, loadData]);

  function openResolveModal(row: Solicitud, decision: "aprobada" | "rechazada") {
    if (!canResolve || !pendingRequest(row, now)) return;
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
    if (!canResolve || !resolveTarget || !pendingRequest(resolveTarget, Date.now())) {
      toast.warning("La solicitud ya no está disponible para resolver");
      setResolveModalOpen(false);
      void loadData({force:true});
      return;
    }

    const motivoResolucion = resolveReason.trim();
    if (motivoResolucion.length < 6) {
      toast.warning("Debe indicar motivo de resolución (mínimo 6 caracteres)");
      return;
    }

    setBusyId(resolveTarget.id);
    try {
      const payload = { id: resolveTarget.id, decision: resolveDecision, motivoResolucion };
      const { confirmationId } = await post<{confirmationId:string}>("/api/confirmaciones", { action:"resolver_solicitud", payload, acepta:true });
      await patch(`/api/faltas/solicitudes/${resolveTarget.id}/resolver`, {
        confirmationId,
        decision: resolveDecision,
        motivoResolucion,
      });
      invalidate("solicitudes-baja:");
      invalidate("historial:");
      invalidate("dashboard:");
      invalidate("reportes:");
      invalidate("personal:");
      toast.success(
        resolveDecision === "aprobada" ? "Solicitud aprobada" : "Solicitud rechazada",
      );
      setResolveModalOpen(false);
      setResolveTarget(null);
      setResolveReason("");
      await loadData({ force: true });
    } catch (error) {
      toast.error("Error", getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  if (!canRead) return <p role="alert">No tiene permisos para consultar solicitudes.</p>;

  return (
    <div className="space-y-4 animate-fade-in">
      {sessionUser?.role === "super_admin" && <Card className="p-5"><p className="mb-3 text-sm">Para dejar sin efecto una sanción sin solicitud, seleccione su registro y confirme el motivo y el impacto.</p><Button variant="outline" onClick={onFindSanction}>Buscar sanción para dejar sin efecto</Button></Card>}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-[var(--navy-900)]">Solicitudes de cancelación</h3>
            <p className="text-sm text-[var(--navy-500)]">{filter === "pendiente" ? "Se muestran primero las solicitudes próximas a vencer." : "Consulta de solicitudes resueltas."}</p>
            {!canResolve && <p className="text-sm text-[var(--navy-500)]">Seguimiento de solicitudes de {sessionUser?.unidadNombre || "su unidad"}.</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => { void loadData({ force: true }); }} loading={isLoading}>
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
                {{pendiente:"Pendientes",aprobada:"Aprobadas",rechazada:"Rechazadas"}[status]}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : loadError ? (<div role="alert"><p>No se pudieron cargar las solicitudes: {loadError}</p><Button variant="outline" onClick={() => void loadData({force:true})}>Reintentar</Button></div>) : visibleRows.length === 0 ? (
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">{filter === "pendiente" ? "Tiempo para resolver" : "Resolución"}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {visibleRows.map((row) => (
                  <tr key={row.id} className={row.id === selectedRequestId ? "bg-[var(--gold-50)]" : ""}>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.createdAt ? boliviaDateTime(row.createdAt) : "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-900)] font-medium">{row.faltaResumen?.nombreCompleto ?? "-"} ({row.faltaResumen?.ci ?? "-"})<p className="text-xs font-normal">Documento: {row.faltaResumen?.memorandum || "No registrado"}</p>{row.id === selectedRequestId && <p className="text-xs font-semibold">Solicitud seleccionada</p>}</td>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.solicitanteUnidadNombre ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-700)] max-w-[350px]"><p>{row.motivo}</p><p className="mt-1 text-xs">Solicitante: {row.solicitadaPor?.email || "No registrado"}</p><details className="mt-2"><summary>Ver información de la solicitud</summary><p>Tipo: {row.tipoSolicitud === "representacion" ? "Representación de la sanción" : row.tipoSolicitud === "error_insercion" ? "Error de inserción" : "No registrado"}</p>{row.memorandumRepresentacion && <p>Documento de representación: {row.memorandumRepresentacion}</p>}{row.comentario && row.comentario !== row.motivo && <p>Comentario: {row.comentario}</p>}{row.motivoResolucion && <p>Motivo de resolución: {row.motivoResolucion}</p>}{row.resolvedBy && <p>Resuelta por: {row.resolvedBy.email || (row.resolvedBy.uid === "sistema" ? "Sistema — vencimiento del plazo" : row.resolvedBy.uid)}</p>}</details></td>
                    <td className="px-4 py-3">
                      <Badge variant={row.estado === "pendiente" ? "warning" : row.estado === "aprobada" ? "success" : "default"}>{row.estado === "rechazada" ? row.causaCierre === "vencimiento" ? "Rechazada por vencimiento" : row.causaCierre === "decision" ? "Rechazada por el administrador" : "Rechazada" : row.estado}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {row.estado === "pendiente" ? <>
                        <p className={requestDeadline(row) !== null && requestDeadline(row)! - now <= 86_400_000 ? "font-semibold text-red-700" : "font-medium text-[var(--navy-800)]"}>{remainingTime(row, now)}</p>
                        {row.expiresAt && <p className="text-xs text-[var(--navy-500)]">Vence el {boliviaDateTime(row.expiresAt)}</p>}
                      </> : <span className="text-xs">{row.resolvedAt ? boliviaDateTime(row.resolvedAt) : "-"}</span>}
                    </td>
                    <td className="px-4 py-3">
                        {canResolve && pendingRequest(row, now) ? (
                          <div className="flex gap-2">
                            <Button size="sm" variant="primary" loading={busyId === row.id} onClick={() => openResolveModal(row, "aprobada")}>Aprobar</Button>
                            <Button size="sm" variant="outline" loading={busyId === row.id} onClick={() => openResolveModal(row, "rechazada")}>Rechazar</Button>
                          </div>
                        ) : (
                        <span className="text-xs text-[var(--navy-500)]">{row.estado === "pendiente" ? "En revisión departamental" : row.motivoResolucion || "Resuelta"}</span>
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
        open={canResolve && resolveModalOpen}
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
              disabled={!canResolve || !resolveTarget || !pendingRequest(resolveTarget, now) || resolveReason.trim().length < 6}
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
