"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Card, Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { useDataCache } from "@/hooks/use-data-cache";
import { useUnidades } from "@/hooks/use-unidades";
import { useToast } from "@/hooks/use-toast";
import { isUnitScopedRole, canReadCancellationRequests } from "@/lib/domain/roles";
import { pendingRequest } from "@/lib/domain/sanction-policy";
import { formatArticleShort, formatDisciplinaryDate, formatIncisoShort } from "@/lib/domain/reincidencia-format";
import { HistorialPersonal, type Person } from "@/components/personal/historial-personal";
import { EfectivoDetail } from "./efectivo-detail";
import { CancelacionButton } from "./cancelacion-button";
import type { SancionView } from "./contenido-sancion";

type EstadoFilter = "registrada" | "anulada" | "todas";
type Pending = { id: string; faltaId: string; estado: string; createdAt?: string; expiresAt?: string | null };
type Result = {key: string; rows: SancionView[]; requests: Pending[]; nextCursor?:string|null; requestError?: string; error?: string};

export function HistorialPage({ onOpenRequests }: { onOpenRequests: (id?: string) => void }) {
  const { get, post } = useApi();
  const { sessionUser } = useAuth();
  const { fetchWithCache, invalidate } = useDataCache();
  const { unidades, getUnitName } = useUnidades();
  const toast = useToast();
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("registrada");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [selectedFalta, setSelectedFalta] = useState<SancionView | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sentRequest, setSentRequest] = useState<{id:string; faltaId:string} | null>(null);
  const [requestTarget, setRequestTarget] = useState<SancionView | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestType, setRequestType] = useState<"representacion" | "error_insercion">("representacion");
  const [requestMemo, setRequestMemo] = useState("");
  const [requestComment, setRequestComment] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const loadVersion = useRef(0);
  const unitScoped = isUnitScopedRole(sessionUser?.role ?? "");
  const effectiveUnitId = unitScoped ? sessionUser?.unidadId || "" : selectedUnitId;
  const canReadRequests = canReadCancellationRequests(sessionUser?.role ?? "");
  const queryKey = `historial:unit:${sessionUser?.uid}:${sessionUser?.role}:${sessionUser?.unidadId || ""}:${effectiveUnitId}:${estadoFilter}:${appliedSearch}`;
  const currentResult = result?.key === queryKey ? result : null;
  const rows = currentResult?.rows ?? [];
  const requests = currentResult?.requests ?? [];
  const pendingByFalta = new Map(requests.filter(row => pendingRequest(row, now)).map(row => [row.faltaId, row.id]));
  const isLoading = !!effectiveUnitId && (loading || !currentResult);

  const loadData = useCallback(async (force = false, cursor?:string) => {
    if (!effectiveUnitId) return;
    const version = ++loadVersion.current;
    setLoading(true);
    const params = new URLSearchParams({scope:"unit", unidadId:effectiveUnitId,pageSize:"50"});
    if(cursor)params.set("cursor",cursor);
    if (estadoFilter !== "todas") params.set("estado", estadoFilter);
    if (appliedSearch) params.set("q", appliedSearch);
    try {
      const [sanctions, requestResult] = await Promise.all([
        fetchWithCache(queryKey+":"+(cursor??"inicio"), () => get<{data:SancionView[];nextCursor:string|null}>(`/api/faltas?${params}`), {force, ttlMs:60_000}),
        canReadRequests ? get<{data:Pending[]}>("/api/faltas/solicitudes?estado=pendiente").then(data => ({data:data.data, error:undefined as string | undefined})).catch(error => ({data:[] as Pending[], error:error instanceof Error ? error.message : "No se pudieron comprobar las solicitudes pendientes"})) : Promise.resolve({data:[] as Pending[], error:undefined}),
      ]);
      if (version !== loadVersion.current) return;
      setResult(previous=>({key:queryKey, rows:cursor&&previous?.key===queryKey?[...previous.rows,...sanctions.data.data]:sanctions.data.data,nextCursor:sanctions.data.nextCursor, requests:requestResult.data, requestError:requestResult.error}));
      setNow(Date.now());
    } catch (error) {
      if (version === loadVersion.current) setResult({key:queryKey, rows:[], requests:[], error:error instanceof Error ? error.message : "No se pudieron cargar las sanciones"});
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [effectiveUnitId, estadoFilter, appliedSearch, queryKey, canReadRequests, fetchWithCache, get]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(true);
    // Invalidate all in-flight loads on scope changes and unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { loadVersion.current++; };
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()); void loadData(true); }, 60_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  function selectUnit(id: string) {
    setSelectedUnitId(id);
    setAppliedSearch("");
    setSearchText("");
    setSentRequest(null);
  }
  function search(event: FormEvent) {
    event.preventDefault();
    if (appliedSearch === searchText.trim()) void loadData(true);
    else setAppliedSearch(searchText.trim());
  }
  function openPerson(row: SancionView) {
    if (!row.personalId) { toast.warning("Este registro no tiene una referencia de personal verificable. Puede consultar el detalle de la sanción."); return; }
    setSelectedPerson({id:row.personalId, ci:row.ci, nombreCompleto:row.nombreCompleto});
  }
  function openRequestModal(row: SancionView) {
    if (sessionUser?.role !== "admin_unidad" || !row.puedeSolicitarCancelacion || pendingByFalta.has(row.id) || currentResult?.requestError) return;
    setRequestTarget(row); setRequestType("representacion"); setRequestMemo(""); setRequestComment(""); setRequestReason(""); setRequestModalOpen(true);
  }
  function closeRequestModal() { if (!requestSubmitting) setRequestModalOpen(false); }
  const isRepresentacion = requestType === "representacion";
  const requestFormValid = isRepresentacion ? requestMemo.trim().length >= 3 && requestComment.trim().length >= 8 : requestReason.trim().length >= 8;
  async function submitRequestDeletion() {
    if (!requestTarget || sessionUser?.role !== "admin_unidad" || !requestFormValid || requestSubmitting) return;
    setRequestSubmitting(true);
    try {
      const payload = { faltaId:requestTarget.id, tipoSolicitud:requestType, memorandumRepresentacion:isRepresentacion ? requestMemo.trim() : undefined, comentario:isRepresentacion ? requestComment.trim() : undefined, motivo:isRepresentacion ? requestComment.trim() : requestReason.trim() };
      const response = await post<{solicitudId:string}>("/api/faltas/solicitudes", payload);
      for (const prefix of ["historial:", "solicitudes-baja:", "dashboard:"]) invalidate(prefix);
      setSentRequest({id:response.solicitudId, faltaId:requestTarget.id});
      setRequestModalOpen(false);
      toast.success("Solicitud enviada", "Puede consultar su seguimiento en Solicitudes de cancelación.");
      await loadData(true);
    } catch (error) { toast.error("No se pudo enviar la solicitud", error instanceof Error ? error.message : "Intente nuevamente"); }
    finally { setRequestSubmitting(false); }
  }
  const actions = (row: SancionView) => <div className="flex flex-wrap gap-1" onClick={event => event.stopPropagation()}>
    <Button variant="ghost" size="sm" onClick={() => setSelectedFalta(row)}>Ver detalle de la sanción</Button>
    <Button variant="ghost" size="sm" onClick={() => openPerson(row)}>Ver historial del efectivo</Button>
    {pendingByFalta.has(row.id) ? <Button variant="outline" size="sm" onClick={() => onOpenRequests(pendingByFalta.get(row.id) || sentRequest?.id)}>Ver solicitud</Button> : null}
    {row.puedeCancelarDirectamente && <CancelacionButton id={row.id} onComplete={() => { void loadData(true); }} />}
    {sessionUser?.role === "admin_unidad" && row.createdBy?.uid === sessionUser.uid && row.puedeSolicitarCancelacion && !pendingByFalta.has(row.id) && <Button variant="ghost" size="sm" disabled={!!currentResult?.requestError} onClick={() => openRequestModal(row)}>Solicitar dejar sin efecto</Button>}
  </div>;
  const classification = (row:SancionView) => <div className="space-y-1 text-xs">
    <p className="font-semibold">{formatArticleShort(row.articulo)}, {formatIncisoShort(row.inciso)}</p>
    {row.conductaOrigen && <p>Falta cometida: {formatArticleShort(row.conductaOrigen.articulo)}, {formatIncisoShort(row.conductaOrigen.inciso)}</p>}
    {row.fechaVencimientoCadena && <p>Período de reincidencia: {formatDisciplinaryDate(row.fechaInicioCadena)} – {formatDisciplinaryDate(row.fechaVencimientoCadena)}{row.estadoPlazoCadena === "vencida" ? " (finalizado)" : ""}</p>}
    {row.revisionCadena && <p className="text-red-700">Los antecedentes requieren revisión</p>}
  </div>;
  const stateBadge = (row:SancionView) => <Badge variant={row.estado === "registrada" ? "success" : "default"}>{row.estado === "anulada" ? "Sin efecto" : row.estado === "registrada" ? "Registrada" : "Estado no registrado"}</Badge>;

  return <div className="space-y-4 animate-fade-in">
    <Card className="p-5 space-y-3">
      <h3 className="font-bold">Sanciones registradas por unidad</h3>
      <p className="text-sm text-[var(--navy-500)]">Consulte los registros de sanciones y sus documentos. Para buscar a una persona en el padrón, ingrese a Personal.</p>
      {unitScoped ? <p className="font-semibold">{sessionUser?.unidadNombre || "Unidad no disponible"}</p> : <label className="block text-sm">Unidad sancionadora<select aria-label="Unidad sancionadora" className="mt-1 block w-full rounded-xl border p-3" value={selectedUnitId} onChange={event => selectUnit(event.target.value)}><option value="">Seleccionar unidad</option>{unidades.map(unit => <option key={unit.id} value={unit.id}>{unit.nombre}</option>)}</select></label>}
    </Card>
    {sentRequest && <Card className="p-4 flex flex-wrap gap-3 items-center"><p>Solicitud enviada al nivel departamental.</p><Button variant="outline" onClick={() => onOpenRequests(sentRequest.id)}>Ver solicitud enviada</Button></Card>}
    {effectiveUnitId ? <Card className="p-5 space-y-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={search}>
        <Input label="Buscar en las sanciones de la unidad" placeholder="Documento, CI o nombre" value={searchText} onChange={event => setSearchText(event.target.value)} />
        <Button type="submit" variant="secondary">Buscar</Button>
        <Button type="button" variant="outline" onClick={() => void loadData(true)} loading={isLoading}>Actualizar</Button>
      </form>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Estado de las sanciones">
        {([["registrada","Registradas"],["anulada","Sin efecto"],["todas","Todas"]] as const).map(([value,label]) => <Button key={value} size="sm" variant={value === estadoFilter ? "secondary" : "outline"} aria-pressed={value === estadoFilter} onClick={() => setEstadoFilter(value)}>{label}</Button>)}
        <Button size="sm" variant="outline" aria-pressed={viewMode === "table"} onClick={() => setViewMode("table")}>Tabla</Button>
        <Button size="sm" variant="outline" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")}>Tarjetas</Button>
      </div>
      <p className="text-sm">{getUnitName(effectiveUnitId)} · {isLoading ? "Consultando registros…" : `${rows.length} registros`} · {estadoFilter === "registrada" ? "Registradas" : estadoFilter === "anulada" ? "Sin efecto" : "Todos los estados"}{appliedSearch && ` · Búsqueda: ${appliedSearch}`}</p>
      {currentResult?.requestError && <p role="alert" className="text-sm text-red-700">No se pudieron comprobar las solicitudes pendientes. Actualice para habilitar el envío de solicitudes. {currentResult.requestError}</p>}
      {isLoading ? <Skeleton className="h-24 rounded-xl" /> : currentResult?.error ? <div role="alert"><p>{currentResult.error}</p><Button variant="outline" onClick={() => void loadData(true)}>Reintentar</Button></div> : rows.length === 0 ? <EmptyState title="Sin sanciones" description="No existen sanciones con el filtro aplicado." /> : viewMode === "table" ? <div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-sm"><thead><tr>{["Fecha", "Efectivo", "Sanción y falta cometida", "Documento", "Estado", "Acciones"].map(label => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>
        {rows.map(row => <tr key={row.id} className={pendingByFalta.has(row.id) ? "border-t bg-[var(--warning-50)]" : "border-t"}>
          <td className="p-3 whitespace-nowrap">{formatDisciplinaryDate(row.fechaSancion)}</td><td className="p-3"><p className="font-semibold">{row.nombreCompleto || "Nombre no registrado"}</p><p>CI: {row.ci || "No registrada"}</p></td><td className="p-3 min-w-[220px]">{classification(row)}</td><td className="p-3">{row.memorandum || "No registrado"}</td><td className="p-3">{stateBadge(row)}</td><td className="p-3 min-w-[200px]">{actions(row)}</td>
        </tr>)}
      </tbody></table></div> : <div className="grid gap-3 md:grid-cols-2">{rows.map(row => <article key={row.id} className="space-y-3 rounded-xl border p-4"><h4 className="font-bold">{row.nombreCompleto || "Nombre no registrado"}</h4><p className="text-sm">CI: {row.ci || "No registrada"} · {formatDisciplinaryDate(row.fechaSancion)}</p><p className="text-sm">Documento: {row.memorandum || "No registrado"}</p>{classification(row)}{stateBadge(row)}{actions(row)}</article>)}</div>}
    </Card> : <Card className="p-5"><EmptyState title={unitScoped ? "No tiene una unidad asignada" : "Seleccione una unidad"} description={unitScoped ? "Solicite revisar su acceso antes de consultar sanciones." : "Se mostrarán las sanciones registradas para la unidad seleccionada."} /></Card>}
      <Modal
        open={requestModalOpen}
        onClose={closeRequestModal}
        title="Solicitar dejar sin efecto la sanción"
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
              disabled={!requestFormValid || requestSubmitting}
            >
              Enviar solicitud
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--navy-50)] p-3">
            <p className="text-xs text-[var(--navy-500)]">Sancion seleccionada</p>
            <p className="text-sm font-semibold text-[var(--navy-900)]">{requestTarget?.nombreCompleto ?? "-"} ({requestTarget?.ci ?? "-"})</p>
            <p className="text-xs text-[var(--navy-600)] mt-1">Memorandum: {requestTarget?.memorandum ?? "-"} | Fecha: {requestTarget?.fechaSancion ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-[var(--navy-800)] mb-2">Tipo de solicitud</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRequestType("representacion")}
                className={`rounded-xl border p-3 text-left transition-colors ${isRepresentacion ? "border-[var(--gold-500)] bg-[var(--gold-50)]" : "border-[var(--border)] hover:border-[var(--navy-300)]"}`}
              >
                <p className="text-sm font-semibold text-[var(--navy-900)]">Representacion de la sancion</p>
                <p className="text-xs text-[var(--navy-600)] mt-1">Requiere numero de memorandum que da curso a la representacion.</p>
              </button>
              <button
                type="button"
                onClick={() => setRequestType("error_insercion")}
                className={`rounded-xl border p-3 text-left transition-colors ${!isRepresentacion ? "border-[var(--gold-500)] bg-[var(--gold-50)]" : "border-[var(--border)] hover:border-[var(--navy-300)]"}`}
              >
                <p className="text-sm font-semibold text-[var(--navy-900)]">Error de insercion</p>
                <p className="text-xs text-[var(--navy-600)] mt-1">Permite detallar un error en el registro de la sancion.</p>
              </button>
            </div>
          </div>

          {isRepresentacion ? (
            <div className="space-y-3">
              <Input
                label="Nro. de memorandum de representacion"
                placeholder="Ej.: 012/2026"
                value={requestMemo}
                onChange={(e) => setRequestMemo(e.target.value)}
                error={requestMemo.trim().length > 0 && requestMemo.trim().length < 3 ? "Minimo 3 caracteres" : undefined}
              />
              <Textarea
                label="Motivo de la representación (obligatorio)"
                placeholder="Detalle breve del contexto de la representacion..."
                rows={3}
                value={requestComment}
                onChange={(e) => setRequestComment(e.target.value)}
                error={requestComment.trim().length > 0 && requestComment.trim().length < 8 ? "Mínimo ocho caracteres" : undefined}
              />
            </div>
          ) : (
            <Textarea
              label="Motivo de solicitud por error de insercion"
              placeholder="Describa el error de insercion que origino la solicitud..."
              rows={4}
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              error={requestReason.trim().length > 0 && requestReason.trim().length < 8 ? "Minimo 8 caracteres" : undefined}
            />
          )}
        </div>
      </Modal>

      {currentResult?.nextCursor&&<Button variant="outline" loading={loading} onClick={()=>void loadData(true,currentResult.nextCursor!)}>Ver más sanciones</Button>}
      <EfectivoDetail falta={selectedFalta} open={!!selectedFalta} onClose={() => setSelectedFalta(null)} />
      {selectedPerson && <HistorialPersonal key={selectedPerson.id + effectiveUnitId} person={selectedPerson} initialUnitId={effectiveUnitId} unitName={getUnitName(effectiveUnitId)} onClose={() => setSelectedPerson(null)} />}
    </div>;
}
