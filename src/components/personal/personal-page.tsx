"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton, Badge } from "@/components/ui/primitives";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useApi } from "@/hooks/use-api";
import { useAuth, canReadGlobalInfo, isUnitScopedRole } from "@/hooks/use-auth";
import { useDataCache } from "@/hooks/use-data-cache";
import { useToast } from "@/hooks/use-toast";
import { useUnidades } from "@/hooks/use-unidades";
import { getRangoOrder } from "@/lib/domain/rangos-policiales";
import { HistorialPersonal } from "./historial-personal";

type PersonalRow = {
  id: string;
  grado: string;
  apellidos: string;
  nombres: string;
  nombreCompleto?: string;
  ci: string;
  unidadId: string;
  unidadNombre: string;
};

type TransferRequest = {
  id: string;
  personalId: string;
  ci?: string;
  nombreCompleto?: string;
  grado?: string;
  fromUnidadId: string;
  fromUnidadNombre: string;
  toUnidadId: string;
  toUnidadNombre: string;
  estado: "pendiente" | "aceptada" | "rechazada" | "vencida";
  motivoSolicitud?: string;
  observacionRespuesta?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
};

function formatRequestStatus(estado: TransferRequest["estado"]) {
  if (estado === "vencida") return "rechazada automáticamente";
  return estado;
}

function statusVariant(estado: TransferRequest["estado"]): "warning" | "success" | "danger" | "default" {
  if (estado === "pendiente") return "warning";
  if (estado === "aceptada") return "success";
  if (estado === "rechazada") return "danger";
  return "default";
}

export function PersonalPage() {
  const { get, post, patch } = useApi();
  const { sessionUser } = useAuth();
  const { fetchWithCache, invalidate } = useDataCache();
  const { unitOptions } = useUnidades();
  const toast = useToast();
  const { error: toastError, success: toastSuccess, warning: toastWarning } = toast;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PersonalRow[]>([]);
  const [personalTotal, setPersonalTotal] = useState(0);
  const [personalOffset, setPersonalOffset] = useState(0);
  const [personalNextOffset, setPersonalNextOffset] = useState<number | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const personalFetchVersion = useRef(0);
  const [selectedPersonal, setSelectedPersonal] = useState<PersonalRow | null>(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [targetUnitId, setTargetUnitId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [sending, setSending] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestScope, setRequestScope] = useState<"entrantes" | "salientes">("entrantes");
  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [personalUpdatedAt, setPersonalUpdatedAt] = useState<number | null>(null);
  const [requestsUpdatedAt, setRequestsUpdatedAt] = useState<number | null>(null);

  const isUnitScoped = sessionUser ? isUnitScopedRole(sessionUser.role) : false;
  const canReadGlobal = sessionUser ? canReadGlobalInfo(sessionUser.role) : false;
  const canTransfer = false;
  const sessionUnitId = sessionUser?.unidadId ?? "";
  const effectiveUnitId = isUnitScoped ? (sessionUser?.unidadId ?? "") : selectedUnitId;

  const fetchPersonal = useCallback(async (options?: { force?: boolean; query?: string; offset?: number }) => {
    const version = ++personalFetchVersion.current;
    const queryText = options?.query?.trim() ?? "";
    const canSearchGlobally = canReadGlobal && !effectiveUnitId;

    if (!effectiveUnitId && (!canSearchGlobally || queryText.length < 2)) {
      setRows([]);
      setPersonalUpdatedAt(null);
      setPersonalTotal(0);
      setPersonalOffset(0);
      setPersonalNextOffset(null);
      setAppliedSearch("");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (effectiveUnitId) params.set("unidadId", effectiveUnitId);
      if (queryText) params.set("q", queryText);
      params.set("offset", String(options?.offset ?? 0));
      params.set("limit", "50");

      const cacheScope = effectiveUnitId ? `unidad:${effectiveUnitId}` : "global";
      const cacheQuery = queryText ? queryText.toLowerCase() : "all";
      const payload = await fetchWithCache(
        `personal:${cacheScope}:${cacheQuery}:${options?.offset ?? 0}`,
        () => get<{ data: PersonalRow[]; total: number; nextOffset: number | null }>(`/api/personal?${params.toString()}`),
        { ttlMs: queryText ? 2 * 60 * 1000 : 5 * 60 * 1000, force: options?.force },
      );
      if (version !== personalFetchVersion.current) return;
      setRows(payload.data.data);
      setAppliedSearch(queryText);
      setPersonalTotal(payload.data.total);
      setPersonalOffset(options?.offset ?? 0);
      setPersonalNextOffset(payload.data.nextOffset);
      setPersonalUpdatedAt(payload.storedAt);
    } catch (error) {
      if (version !== personalFetchVersion.current) return;
      setRows([]);
      toastError("Error al cargar personal", error instanceof Error ? error.message : "No se pudo cargar personal");
    } finally {
      if (version === personalFetchVersion.current) setLoading(false);
    }
  }, [canReadGlobal, effectiveUnitId, fetchWithCache, get, toastError]);

  const fetchRequests = useCallback(async (options?: { force?: boolean }) => {
    if (!canTransfer) {
      setRequests([]);
      return;
    }

    setRequestsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("scope", requestScope);
      params.set("estado", "todas");
      params.set("limit", "80");
      if (!isUnitScoped && effectiveUnitId) {
        if (requestScope === "entrantes") params.set("toUnidadId", effectiveUnitId);
        if (requestScope === "salientes") params.set("fromUnidadId", effectiveUnitId);
      }
      const unitPart = isUnitScoped ? sessionUnitId || "sin-unidad" : effectiveUnitId || "global";
      const payload = await fetchWithCache(
        `transfer-requests:${requestScope}:${unitPart}`,
        () => get<{ data: TransferRequest[] }>(`/api/transferencias/solicitudes?${params}`),
        { ttlMs: requestScope === "entrantes" ? 60 * 1000 : 2 * 60 * 1000, force: options?.force },
      );
      setRequests(payload.data.data);
      setRequestsUpdatedAt(payload.storedAt);
    } catch (error) {
      setRequests([]);
      toastError("Error al cargar solicitudes", error instanceof Error ? error.message : "No se pudieron cargar solicitudes");
    } finally {
      setRequestsLoading(false);
    }
  }, [canTransfer, effectiveUnitId, fetchWithCache, get, isUnitScoped, requestScope, sessionUnitId, toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPersonal();
  }, [fetchPersonal]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRequests();
  }, [fetchRequests]);
  function handlePersonalSearch(event: FormEvent) {
    event.preventDefault();
    const queryText = search.trim();

    if (!effectiveUnitId && canReadGlobal && queryText.length < 2) {
      toastWarning("Ingrese al menos 2 caracteres para buscar en todo el personal");
      return;
    }

    void fetchPersonal({ force: true, query: queryText });
  }

  const orderedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const rankA = getRangoOrder(a.grado);
      const rankB = getRangoOrder(b.grado);
      if (rankA !== rankB) return rankA - rankB;

      const apellidosCmp = String(a.apellidos ?? "").localeCompare(String(b.apellidos ?? ""), "es", { sensitivity: "base" });
      if (apellidosCmp !== 0) return apellidosCmp;

      const nombresCmp = String(a.nombres ?? "").localeCompare(String(b.nombres ?? ""), "es", { sensitivity: "base" });
      if (nombresCmp !== 0) return nombresCmp;

      return String(a.ci).localeCompare(String(b.ci), "es", { sensitivity: "base" });
    });
  }, [rows]);

  const targetUnitOptions = useMemo(() => {
    const currentUnit = selectedPersonal?.unidadId ?? effectiveUnitId;
    return unitOptions.filter((unit) => unit.value !== currentUnit);
  }, [effectiveUnitId, selectedPersonal, unitOptions]);

  const pendingIncomingCount = requests.filter((row) => row.estado === "pendiente" && row.toUnidadId === sessionUser?.unidadId).length;
  const canUseGlobalPersonalSearch = !isUnitScoped && canReadGlobal;
  const showUnitSelectorPrompt = canUseGlobalPersonalSearch && !effectiveUnitId && !appliedSearch && !loading;
  const showUnidadActualColumn = false;
  async function submitTransferRequest() {
    if (!selectedPersonal) return;
    if (!targetUnitId) {
      toastWarning("Seleccione la unidad destino");
      return;
    }
    if (transferReason.trim().length < 6) {
      toastWarning("Ingrese un motivo de al menos 6 caracteres");
      return;
    }

    setSending(true);
    try {
      await post("/api/transferencias/solicitudes", {
        personalId: selectedPersonal.id,
        toUnidadId: targetUnitId,
        motivoSolicitud: transferReason.trim(),
      });
      invalidate("transfer-requests:");
      toastSuccess("Solicitud enviada", "La unidad destino tiene 24 horas para aceptar o rechazar.");
      setSendModalOpen(false);
      setSelectedPersonal(null);
      setRequestScope("salientes");
      await fetchRequests({ force: true });
    } catch (error) {
      toastError("Error", error instanceof Error ? error.message : "No se pudo enviar la solicitud");
    } finally {
      setSending(false);
    }
  }

  async function resolveRequest(row: TransferRequest, decision: "aceptada" | "rechazada") {
    const observacionRespuesta = decision === "rechazada"
      ? window.prompt("Motivo del rechazo (opcional)") ?? ""
      : "";

    setBusyRequestId(row.id);
    try {
      await patch(`/api/transferencias/solicitudes/${row.id}/resolver`, {
        decision,
        observacionRespuesta,
      });
      invalidate("transfer-requests:");
      invalidate("transferencias:");
      if (decision === "aceptada") {
        invalidate(`personal:unidad:${row.fromUnidadId}`);
        invalidate(`personal:unidad:${row.toUnidadId}`);
        invalidate("dashboard:");
      }
      toastSuccess(decision === "aceptada" ? "Traspaso aceptado" : "Traspaso rechazado");
      await fetchRequests({ force: true });
      await fetchPersonal({ force: true });
    } catch (error) {
      toastError("Error", error instanceof Error ? error.message : "No se pudo resolver la solicitud");
    } finally {
      setBusyRequestId(null);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {pendingIncomingCount > 0 && requestScope !== "entrantes" && (
        <Card className="p-4 border-[var(--warning-100)] bg-[var(--warning-50)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--warning-600)]">Solicitudes de recepción pendientes</p>
              <p className="text-xs text-[var(--warning-600)]">{pendingIncomingCount} solicitud(es) requieren aceptación o rechazo.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setRequestScope("entrantes")}>
              Revisar
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--navy-900)]">{isUnitScoped || effectiveUnitId ? "Personal con registros de sanciones" : "Personal del comando departamental"}</h3>
            {personalUpdatedAt && (
              <p className="text-xs text-[var(--navy-400)]">
                Datos conservados en esta sesion.
              </p>
            )}
            <p className="text-sm text-[var(--navy-500)]">
              Seleccione un efectivo para consultar su historial de sanciones.
            </p>
          </div>
          {(effectiveUnitId || (canUseGlobalPersonalSearch && appliedSearch.length >= 2)) && (
            <Button variant="outline" size="sm" onClick={() => { void fetchPersonal({ force: true, query: appliedSearch }); }} loading={loading}>
              Actualizar
            </Button>
          )}
          {!isUnitScoped && canReadGlobal && (
            <div className="w-full md:w-[360px]">
              <Select
                label="Unidad sancionadora"
                value={selectedUnitId}
                onChange={(e) => {setSelectedUnitId(e.target.value);setSearch("");setAppliedSearch("");setSelectedPersonal(null);}}
                options={[{value:"",label:"Todo el padrón departamental"},...unitOptions]}
              />
            </div>
          )}
        </div>

        <form className="mt-4 flex flex-col gap-2 md:flex-row" onSubmit={handlePersonalSearch}>
          <Input
            placeholder={canUseGlobalPersonalSearch && !effectiveUnitId ? "Buscar efectivo por CI, nombres o apellidos en todo el comando" : "Buscar por CI, apellidos, nombres o grado"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="secondary" loading={loading}>
            Buscar
          </Button>
        </form>

        <div className="mt-4">
          {showUnitSelectorPrompt ? (
            <EmptyState
              title="Seleccione una unidad o busque un efectivo"
              description="Busque por CI, nombres o apellidos en todo el comando. También puede seleccionar una unidad para ver las personas que tienen sanciones registradas allí."
            />
          ) : loading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)}</div>
          ) : orderedRows.length === 0 ? (
            <EmptyState title="Sin resultados" description={effectiveUnitId ? "No hay personal sancionado en esta unidad o no coincide la búsqueda." : "No se encontró personal con ese criterio en el comando."} />
          ) : (
            <div className="overflow-auto rounded-xl border border-[var(--border)]">
              <div className="flex flex-wrap gap-3 items-center p-3"><span>{personalTotal} personas; mostrando desde {personalOffset + 1}{appliedSearch ? ` · Búsqueda: ${appliedSearch}` : ""}</span><Button disabled={loading || personalOffset === 0} onClick={() => { void fetchPersonal({ force: true, query: appliedSearch, offset: Math.max(0, personalOffset - 50) }); }}>Anterior</Button><Button disabled={loading || personalNextOffset === null} onClick={() => { void fetchPersonal({ force: true, query: appliedSearch, offset: personalNextOffset! }); }}>Siguiente</Button></div>
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--navy-50)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">N°</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Grado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Apellidos</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Nombres</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">CI</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Historial</th>
                                      {showUnidadActualColumn && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Unidad actual</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {orderedRows.map((row, index) => (
                    <tr
                      key={row.id}
                      className="hover:bg-[var(--navy-50)] transition-colors cursor-pointer"
                      onClick={() => setSelectedPersonal(row)}
                    >
                      <td className="px-4 py-3 text-[var(--navy-700)]">{personalOffset + index + 1}</td>
                      <td className="px-4 py-3 text-[var(--navy-900)] font-medium">{row.grado}</td>
                      <td className="px-4 py-3 text-[var(--navy-700)]">{row.apellidos}</td>
                      <td className="px-4 py-3 text-[var(--navy-700)]">{row.nombres}</td>
                      <td className="px-4 py-3 text-[var(--navy-900)] font-semibold">{row.ci}</td>
                      <td className="px-4 py-3"><Button size="sm" variant="outline" aria-label={`Ver historial de ${row.nombreCompleto ?? `${row.nombres} ${row.apellidos}`}`} onClick={() => setSelectedPersonal(row)}>Ver historial</Button></td>
                                          {showUnidadActualColumn && (
                        <td className="px-4 py-3 text-[var(--navy-700)] min-w-[220px]">{row.unidadNombre}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {canTransfer && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-[var(--navy-900)]">Solicitudes de envío</h3>
              <p className="text-sm text-[var(--navy-500)]">Control de traspasos pendientes, aceptados y rechazados.</p>
            </div>
            {requestsUpdatedAt && (
              <p className="text-xs text-[var(--navy-400)]">
                Datos conservados en esta sesion.
              </p>
            )}
            <Button variant="outline" size="sm" onClick={() => { void fetchRequests({ force: true }); }} loading={requestsLoading}>
              Actualizar
            </Button>
            <div className="flex gap-1 bg-[var(--navy-100)] p-1 rounded-xl">
              {(["entrantes", "salientes"] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setRequestScope(scope)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${requestScope === scope ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>

          {requestsLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : requests.length === 0 ? (
            <EmptyState title="Sin solicitudes" description="No existen solicitudes de envío para esta vista." />
          ) : (
            <div className="overflow-auto rounded-xl border border-[var(--border)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--navy-50)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Efectivo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Origen</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Destino</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {requests.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 text-[var(--navy-700)]">{row.createdAt?.slice(0, 10) ?? "-"}</td>
                      <td className="px-4 py-3 text-[var(--navy-900)] font-medium">{row.nombreCompleto ?? "-"} ({row.ci ?? "-"})</td>
                      <td className="px-4 py-3 text-[var(--navy-700)]">{row.fromUnidadNombre}</td>
                      <td className="px-4 py-3 text-[var(--navy-700)]">{row.toUnidadNombre}</td>
                      <td className="px-4 py-3"><Badge variant={statusVariant(row.estado)}>{formatRequestStatus(row.estado)}</Badge></td>
                      <td className="px-4 py-3">
                        {requestScope === "entrantes" && row.estado === "pendiente" ? (
                          <div className="flex gap-2">
                            <Button size="sm" variant="primary" loading={busyRequestId === row.id} onClick={() => { void resolveRequest(row, "aceptada"); }}>Aceptar</Button>
                            <Button size="sm" variant="outline" loading={busyRequestId === row.id} onClick={() => { void resolveRequest(row, "rechazada"); }}>Rechazar</Button>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--navy-500)]">{row.expiresAt ? `Vence: ${row.expiresAt.slice(0, 16).replace("T", " ")}` : "-"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {selectedPersonal && <HistorialPersonal key={`${sessionUser?.uid}:${sessionUser?.role}:${selectedPersonal.id}:${effectiveUnitId}`} person={selectedPersonal} initialUnitId={effectiveUnitId} unitName={unitOptions.find(unit => unit.value === effectiveUnitId)?.label ?? sessionUser?.unidadNombre ?? ""} onClose={() => setSelectedPersonal(null)} />}

      <Modal
        open={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        title="Enviar efectivo a otra unidad"
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={() => setSendModalOpen(false)} disabled={sending}>Cancelar</Button>
            <Button variant="primary" onClick={() => { void submitTransferRequest(); }} loading={sending} disabled={!targetUnitId || transferReason.trim().length < 6}>
              Enviar solicitud
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-100)] bg-[var(--warning-50)] p-3">
            <p className="text-sm text-[var(--warning-600)]">
              La unidad destino tendrá 24 horas para aceptar o rechazar. Si no responde, la solicitud será rechazada automáticamente.
            </p>
          </div>
          <Select
            label="Unidad destino"
            value={targetUnitId}
            onChange={(e) => setTargetUnitId(e.target.value)}
            options={targetUnitOptions}
            placeholder="Seleccionar unidad destino"
          />
          <Textarea
            label="Motivo del envío"
            value={transferReason}
            onChange={(e) => setTransferReason(e.target.value)}
            rows={4}
            placeholder="Detalle el motivo del envío del efectivo..."
            error={transferReason.trim().length > 0 && transferReason.trim().length < 6 ? "Mínimo 6 caracteres" : undefined}
          />
        </div>
      </Modal>
    </div>
  );
}
