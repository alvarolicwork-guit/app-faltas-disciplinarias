"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Card, Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useAuth, isUnitScopedRole } from "@/hooks/use-auth";
import { useUnidades } from "@/hooks/use-unidades";
import { useToast } from "@/hooks/use-toast";
import { EfectivoDetail } from "./efectivo-detail";

type Falta = {
  id: string;
  nombreCompleto: string;
  ci: string;
  articulo: string;
  inciso: string;
  fechaSancion: string;
  memorandum: string;
  motivo?: string;
  unidadSancionNombre?: string;
  reincidencia?: boolean;
  tipoRegistro?: string;
  reincidenciaOrigen?: {
    articuloBase?: string;
    incisoBase?: string;
    faltaReferenciaId?: string;
    fechaSancionReferencia?: string;
    memorandumReferencia?: string;
    unidadReferenciaNombre?: string;
  } | null;
  registradoPor?: string;
  estado?: "registrada" | "anulada";
};

type SolicitudResumen = {
  id: string;
  faltaId: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  tipoSolicitud?: "representacion" | "error_insercion";
  memorandumRepresentacion?: string | null;
  comentario?: string | null;
  motivo: string;
  createdAt?: string;
  resolvedAt?: string;
  faltaResumen?: {
    nombreCompleto?: string;
    ci?: string;
    memorandum?: string;
  };
};

export function HistorialPage() {
  const { get, post } = useApi();
  const { sessionUser } = useAuth();
  const { unidades, getUnitName } = useUnidades();
  const toast = useToast();

  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [faltasRows, setFaltasRows] = useState<Falta[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [selectedFalta, setSelectedFalta] = useState<Falta | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<"registrada" | "anulada" | "todas">("registrada");
  const [pendingRequestIds, setPendingRequestIds] = useState<Set<string>>(new Set());
  const [solicitudesRows, setSolicitudesRows] = useState<SolicitudResumen[]>([]);
  const [solicitudesFilter, setSolicitudesFilter] = useState<"pendiente" | "aprobada">("pendiente");
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestTarget, setRequestTarget] = useState<Falta | null>(null);
  const [requestType, setRequestType] = useState<"representacion" | "error_insercion">("representacion");
  const [requestMemo, setRequestMemo] = useState("");
  const [requestComment, setRequestComment] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const canSelectUnit = sessionUser ? !isUnitScopedRole(sessionUser.role) : false;
  const canRequestDeletion = sessionUser ? isUnitScopedRole(sessionUser.role) : false;

  const effectiveUnitId = canSelectUnit ? selectedUnitId : (sessionUser?.unidadId ?? "");

  const refreshFaltas = useCallback(async (unidadId: string, q = "", estado = estadoFilter) => {
    if (!unidadId) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("unidadId", unidadId);
    if (estado !== "todas") {
      params.set("estado", estado);
    }
    if (q.trim()) params.set("q", q.trim());
    try {
      const payload = await get<{ data: Falta[] }>(`/api/faltas?${params}`);
      setFaltasRows(payload.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [get, estadoFilter]);

  const refreshSolicitudes = useCallback(async (estado: "pendiente" | "aprobada") => {
    try {
      const payload = await get<{ data: SolicitudResumen[] }>(`/api/faltas/solicitudes?estado=${estado}`);
      setSolicitudesRows(payload.data);
      if (estado === "pendiente") {
        setPendingRequestIds(new Set(payload.data.map((row) => row.faltaId)));
      }
    } catch {
      if (estado === "pendiente") {
        setPendingRequestIds(new Set());
      }
      setSolicitudesRows([]);
    }
  }, [get]);

  useEffect(() => {
    if (!effectiveUnitId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshFaltas(effectiveUnitId, "", estadoFilter);
  }, [effectiveUnitId, refreshFaltas, estadoFilter]);

  useEffect(() => {
    if (!sessionUser) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSolicitudes("pendiente");
  }, [sessionUser, refreshSolicitudes]);

  useEffect(() => {
    if (!sessionUser) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSolicitudes(solicitudesFilter);
  }, [sessionUser, solicitudesFilter, refreshSolicitudes]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (effectiveUnitId) void refreshFaltas(effectiveUnitId, searchText, estadoFilter);
  }

  function handleSelectUnit(unitId: string) {
    setSelectedUnitId(unitId);
    setSearchText("");
    setFaltasRows([]);
  }

  function getArticleBadge(articulo: string) {
    if (articulo.includes("Art. 11") || articulo.includes("art11")) return <Badge variant="danger">Art. 11</Badge>;
    if (articulo.includes("Art. 10") || articulo.includes("art10")) return <Badge variant="warning">Art. 10</Badge>;
    return <Badge variant="info">Art. 9</Badge>;
  }

  function openRequestModal(row: Falta) {
    setRequestTarget(row);
    setRequestType("representacion");
    setRequestMemo("");
    setRequestComment("");
    setRequestReason("");
    setRequestModalOpen(true);
  }

  function closeRequestModal() {
    setRequestModalOpen(false);
    setRequestSubmitting(false);
  }

  async function submitRequestDeletion() {
    if (!requestTarget) return;

    const isRepresentacion = requestType === "representacion";

    if (isRepresentacion && requestMemo.trim().length < 3) {
      toast.warning("Debe indicar el memorándum de representación");
      return;
    }

    if (!isRepresentacion && requestReason.trim().length < 8) {
      toast.warning("Debe indicar un motivo válido (mínimo 8 caracteres)");
      return;
    }

    setRequestSubmitting(true);
    try {
      const payload = {
        faltaId: requestTarget.id,
        tipoSolicitud: requestType,
        memorandumRepresentacion: isRepresentacion ? requestMemo.trim() : undefined,
        comentario: isRepresentacion ? (requestComment.trim() || undefined) : undefined,
        motivo: !isRepresentacion ? requestReason.trim() : undefined,
      };

      await post("/api/faltas/solicitudes", payload);
      setPendingRequestIds((prev) => new Set(prev).add(requestTarget.id));
      await refreshSolicitudes(solicitudesFilter);
      closeRequestModal();
      toast.success("Solicitud enviada", "La solicitud fue remitida al nivel departamental.");
    } catch (error) {
      toast.error("Error", error instanceof Error ? error.message : "No se pudo enviar la solicitud");
    } finally {
      setRequestSubmitting(false);
    }
  }

  const isRepresentacion = requestType === "representacion";
  const requestFormValid = isRepresentacion
    ? requestMemo.trim().length >= 3 && (requestComment.trim().length === 0 || requestComment.trim().length >= 4)
    : requestReason.trim().length >= 8;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Unit selector */}
      {canSelectUnit && (
        <Card className="p-5">
          <h3 className="text-base font-bold text-[var(--navy-900)] mb-3">Seleccionar Unidad Policial</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {unidades.map((unit) => (
              <button
                key={unit.id}
                type="button"
                onClick={() => handleSelectUnit(unit.id)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${selectedUnitId === unit.id ? "border-[var(--gold-500)] bg-[var(--gold-50)] shadow-sm" : "border-[var(--border)] hover:border-[var(--navy-300)] hover:bg-[var(--navy-50)]"}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedUnitId === unit.id ? "bg-[var(--gold-500)] text-[var(--navy-900)]" : "bg-[var(--navy-100)] text-[var(--navy-500)]"}`}>
                  {Icons.building({ size: 14 })}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--navy-400)]">{unit.id}</p>
                  <p className="text-xs font-medium text-[var(--navy-800)] truncate">{unit.nombre}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {!canSelectUnit && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            {Icons.building({ size: 18, className: "text-[var(--navy-400)]" })}
            <div>
              <p className="text-xs text-[var(--navy-400)]">Unidad asignada</p>
              <p className="text-sm font-semibold text-[var(--navy-800)]">{sessionUser?.unidadNombre ?? "Sin unidad"}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Search & filters */}
      {effectiveUnitId && (
        <Card className="p-5">
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <form className="flex gap-2 flex-1" onSubmit={handleSearch}>
              <Input placeholder="Buscar por CI, nombre o memorándum" value={searchText} onChange={(e) => setSearchText(e.target.value)} icon={Icons.search({ size: 16 })} className="flex-1" />
              <Button type="submit" variant="secondary" icon={Icons.search({ size: 16 })}>Buscar</Button>
            </form>
            <div className="flex gap-1 bg-[var(--navy-100)] p-1 rounded-xl self-start">
              {(["registrada", "anulada", "todas"] as const).map((estado) => (
                <button
                  key={estado}
                  type="button"
                  onClick={() => setEstadoFilter(estado)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${estadoFilter === estado ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}
                >
                  {estado}
                </button>
              ))}
              <button type="button" onClick={() => setViewMode("table")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${viewMode === "table" ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}>Tabla</button>
              <button type="button" onClick={() => setViewMode("cards")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${viewMode === "cards" ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}>Cards</button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 text-sm text-[var(--navy-500)]">
               Mostrando <strong className="text-[var(--navy-800)]">{faltasRows.length}</strong> registros de <strong className="text-[var(--navy-800)]">{getUnitName(effectiveUnitId)}</strong>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : faltasRows.length === 0 ? (
            <EmptyState icon={Icons.historial({ size: 40 })} title="Sin sanciones" description="No existen sanciones con el filtro aplicado." />
          ) : viewMode === "table" ? (
            /* TABLE VIEW */
            <div className="overflow-auto rounded-xl border border-[var(--border)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--navy-50)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Efectivo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">CI</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Artículo</th>
                     <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Memorándum</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Estado</th>
                     <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Acciones</th>
                   </tr>
                 </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {faltasRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`transition-colors cursor-pointer ${pendingRequestIds.has(row.id) ? "bg-[var(--warning-50)] hover:bg-[var(--warning-100)]" : "hover:bg-[var(--navy-50)]"}`}
                      onClick={() => setSelectedFalta(row)}
                    >
                      <td className="px-4 py-3 text-[var(--navy-700)] whitespace-nowrap">{row.fechaSancion}</td>
                      <td className="px-4 py-3 font-medium text-[var(--navy-900)]">{row.nombreCompleto}</td>
                      <td className="px-4 py-3 text-[var(--navy-600)]">{row.ci}</td>
                      <td className="px-4 py-3">{getArticleBadge(row.articulo)}</td>
                      <td className="px-4 py-3 text-[var(--navy-600)]">{row.memorandum}</td>
                      <td className="px-4 py-3">
                        <Badge variant={row.estado === "anulada" ? "default" : "success"}>{row.estado ?? "registrada"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" icon={Icons.eye({ size: 14 })} onClick={(e) => { e.stopPropagation(); setSelectedFalta(row); }}>
                          Ver
                        </Button>
                        {canRequestDeletion && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Icons.alertTriangle({ size: 14 })}
                            disabled={pendingRequestIds.has(row.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              openRequestModal(row);
                            }}
                          >
                            {pendingRequestIds.has(row.id) ? "Solicitud enviada" : "Solicitar Baja"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* CARD VIEW (mobile-friendly) */
            <div className="grid gap-3 md:grid-cols-2">
              {faltasRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedFalta(row)}
                  className={`p-4 rounded-xl border transition-all text-left w-full ${pendingRequestIds.has(row.id) ? "border-[var(--warning-300)] bg-[var(--warning-50)] hover:border-[var(--warning-400)]" : "border-[var(--border)] hover:shadow-md hover:border-[var(--gold-500)]"}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-[var(--navy-900)]">{row.nombreCompleto}</p>
                      <p className="text-xs text-[var(--navy-400)]">CI: {row.ci}</p>
                    </div>
                    {getArticleBadge(row.articulo)}
                  </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div><p className="text-[10px] text-[var(--navy-400)]">Fecha</p><p className="text-xs font-medium text-[var(--navy-700)]">{row.fechaSancion}</p></div>
                      <div><p className="text-[10px] text-[var(--navy-400)]">Memorándum</p><p className="text-xs font-medium text-[var(--navy-700)]">{row.memorandum}</p></div>
                      <div><p className="text-[10px] text-[var(--navy-400)]">Estado</p><p className="text-xs font-medium text-[var(--navy-700)]">{row.estado ?? "registrada"}</p></div>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-[var(--navy-900)]">Solicitudes de Baja/Eliminación</h3>
            <p className="text-sm text-[var(--navy-500)]">Seguimiento de solicitudes pendientes y aceptadas.</p>
          </div>
          <div className="flex gap-1 bg-[var(--navy-100)] p-1 rounded-xl">
            {(["pendiente", "aprobada"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setSolicitudesFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${solicitudesFilter === status ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {solicitudesRows.length === 0 ? (
          <EmptyState title="Sin solicitudes" description="No existen solicitudes para este estado." />
        ) : (
          <div className="overflow-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--navy-50)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Efectivo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Memo representación</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Detalle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {solicitudesRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.createdAt?.slice(0, 10) ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-900)] font-medium">
                      {row.faltaResumen?.nombreCompleto ?? "-"} ({row.faltaResumen?.ci ?? "-"})
                    </td>
                    <td className="px-4 py-3 text-[var(--navy-700)]">
                      {row.tipoSolicitud === "representacion" ? "Representación de la sanción" : "Error de inserción"}
                    </td>
                    <td className="px-4 py-3 text-[var(--navy-700)]">{row.memorandumRepresentacion ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--navy-700)] max-w-[350px]">{row.tipoSolicitud === "representacion" ? row.comentario ?? "Sin comentario" : row.motivo}</td>
                    <td className="px-4 py-3">
                      <Badge variant={row.estado === "pendiente" ? "warning" : "success"}>{row.estado}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={requestModalOpen}
        onClose={closeRequestModal}
        title="Solicitar baja o eliminación de sanción"
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={closeRequestModal} disabled={requestSubmitting}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => { void submitRequestDeletion(); }}
              loading={requestSubmitting}
              disabled={!requestFormValid}
            >
              Enviar solicitud
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--navy-50)] p-3">
            <p className="text-xs text-[var(--navy-500)]">Sanción seleccionada</p>
            <p className="text-sm font-semibold text-[var(--navy-900)]">{requestTarget?.nombreCompleto ?? "-"} ({requestTarget?.ci ?? "-"})</p>
            <p className="text-xs text-[var(--navy-600)] mt-1">Memorándum: {requestTarget?.memorandum ?? "-"} | Fecha: {requestTarget?.fechaSancion ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-[var(--navy-800)] mb-2">Tipo de solicitud</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRequestType("representacion")}
                className={`rounded-xl border p-3 text-left transition-colors ${isRepresentacion ? "border-[var(--gold-500)] bg-[var(--gold-50)]" : "border-[var(--border)] hover:border-[var(--navy-300)]"}`}
              >
                <p className="text-sm font-semibold text-[var(--navy-900)]">Representación de la sanción</p>
                <p className="text-xs text-[var(--navy-600)] mt-1">Requiere número de memorándum que da curso a la representación.</p>
              </button>
              <button
                type="button"
                onClick={() => setRequestType("error_insercion")}
                className={`rounded-xl border p-3 text-left transition-colors ${!isRepresentacion ? "border-[var(--gold-500)] bg-[var(--gold-50)]" : "border-[var(--border)] hover:border-[var(--navy-300)]"}`}
              >
                <p className="text-sm font-semibold text-[var(--navy-900)]">Error de inserción</p>
                <p className="text-xs text-[var(--navy-600)] mt-1">Permite detallar un error en el registro de la sanción.</p>
              </button>
            </div>
          </div>

          {isRepresentacion ? (
            <div className="space-y-3">
              <Input
                label="Nro. de memorándum de representación"
                placeholder="Ej.: 012/2026"
                value={requestMemo}
                onChange={(e) => setRequestMemo(e.target.value)}
                error={requestMemo.trim().length > 0 && requestMemo.trim().length < 3 ? "Mínimo 3 caracteres" : undefined}
              />
              <Textarea
                label="Comentario corto (opcional)"
                placeholder="Detalle breve del contexto de la representación..."
                rows={3}
                value={requestComment}
                onChange={(e) => setRequestComment(e.target.value)}
                error={requestComment.trim().length > 0 && requestComment.trim().length < 4 ? "Si ingresa comentario, use al menos 4 caracteres" : undefined}
              />
            </div>
          ) : (
            <Textarea
              label="Motivo de solicitud por error de inserción"
              placeholder="Describa el error de inserción que originó la solicitud..."
              rows={4}
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              error={requestReason.trim().length > 0 && requestReason.trim().length < 8 ? "Mínimo 8 caracteres" : undefined}
            />
          )}
        </div>
      </Modal>

      {/* Detail modal */}
      <EfectivoDetail falta={selectedFalta} open={!!selectedFalta} onClose={() => setSelectedFalta(null)} />
    </div>
  );
}
