"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Card, Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useAuth, canViewGlobalPersonHistory, isGlobalRole, isUnitScopedRole } from "@/hooks/use-auth";
import { useDataCache } from "@/hooks/use-data-cache";
import { useUnidades } from "@/hooks/use-unidades";
import { useToast } from "@/hooks/use-toast";
import type { ReincidenciaOrigenView } from "@/lib/domain/reincidencia-format";
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
  unidadNombre?: string;
  reincidencia?: boolean;
  tipoRegistro?: string;
  reincidenciaOrigen?: ReincidenciaOrigenView;
  registradoPor?: string;
  estado?: "registrada" | "anulada";
};

type PersonalResumen = {
  id: string;
  ci: string;
  grado?: string;
  nombreCompleto: string;
  unidadId?: string;
  unidadNombre?: string;
  estado?: string;
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

type HistoryScope = "unit" | "person";
type EstadoFilter = "registrada" | "anulada" | "todas";

export function HistorialPage() {
  const { get, post } = useApi();
  const { sessionUser } = useAuth();
  const { fetchWithCache, invalidate } = useDataCache();
  const { unidades, getUnitName } = useUnidades();
  const toast = useToast();

  const [historyScope, setHistoryScope] = useState<HistoryScope>("unit");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedPersonal, setSelectedPersonal] = useState<PersonalResumen | null>(null);
  const [personalSearchText, setPersonalSearchText] = useState("");
  const [personalResults, setPersonalResults] = useState<PersonalResumen[]>([]);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);

  const [faltasRows, setFaltasRows] = useState<Falta[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastLoadedKey, setLastLoadedKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [selectedFalta, setSelectedFalta] = useState<Falta | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("registrada");
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
  const canUseGlobalPersonHistory = sessionUser ? canViewGlobalPersonHistory(sessionUser.role) : false;
  const activeHistoryScope: HistoryScope = canUseGlobalPersonHistory ? historyScope : "unit";
  const canRequestDeletion = sessionUser ? isUnitScopedRole(sessionUser.role) && activeHistoryScope === "unit" : false;
  const canViewDeletionRequests = sessionUser ? isUnitScopedRole(sessionUser.role) || isGlobalRole(sessionUser.role) : false;
  const isPersonScope = canUseGlobalPersonHistory && activeHistoryScope === "person";
  const effectiveUnitId = canSelectUnit ? selectedUnitId : (sessionUser?.unidadId ?? "");

  const buildUnitCacheKey = useCallback((unidadId: string, q = "", estado: EstadoFilter = estadoFilter) => {
    return `historial:unit:${unidadId}:${estado}:${q.trim().toLowerCase()}`;
  }, [estadoFilter]);

  const buildPersonCacheKey = useCallback((personalId: string, q = "", estado: EstadoFilter = estadoFilter) => {
    return `historial:person:${personalId}:${estado}:${q.trim().toLowerCase()}`;
  }, [estadoFilter]);

  const refreshFaltasByUnit = useCallback(async (
    unidadId: string,
    q = "",
    estado: EstadoFilter = estadoFilter,
    options?: { force?: boolean },
  ) => {
    if (!unidadId) return;
    const cacheKey = buildUnitCacheKey(unidadId, q, estado);
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    params.set("unidadId", unidadId);
    params.set("scope", "unit");
    if (estado !== "todas") params.set("estado", estado);
    if (q.trim()) params.set("q", q.trim());

    try {
      const payload = await fetchWithCache(
        cacheKey,
        () => get<{ data: Falta[] }>(`/api/faltas?${params}`),
        { ttlMs: 5 * 60 * 1000, force: options?.force },
      );
      setFaltasRows(payload.data.data);
      setLastLoadedKey(cacheKey);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  }, [buildUnitCacheKey, fetchWithCache, get, estadoFilter]);

  const refreshFaltasByPersonal = useCallback(async (
    personalId: string,
    q = "",
    estado: EstadoFilter = estadoFilter,
    options?: { force?: boolean },
  ) => {
    if (!personalId) return;
    const cacheKey = buildPersonCacheKey(personalId, q, estado);
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    params.set("scope", "global_person");
    params.set("personalId", personalId);
    if (estado !== "todas") params.set("estado", estado);
    if (q.trim()) params.set("q", q.trim());

    try {
      const payload = await fetchWithCache(
        cacheKey,
        () => get<{ data: Falta[] }>(`/api/faltas?${params}`),
        { ttlMs: 5 * 60 * 1000, force: options?.force },
      );
      setFaltasRows(payload.data.data);
      setLastLoadedKey(cacheKey);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudo cargar el historial global");
    } finally {
      setLoading(false);
    }
  }, [buildPersonCacheKey, fetchWithCache, get, estadoFilter]);

  const refreshSolicitudes = useCallback(async (estado: "pendiente" | "aprobada") => {
    try {
      const payload = await fetchWithCache(
        `solicitudes-baja:${estado}`,
        () => get<{ data: SolicitudResumen[] }>(`/api/faltas/solicitudes?estado=${estado}`),
        { ttlMs: estado === "pendiente" ? 60 * 1000 : 5 * 60 * 1000 },
      );
      setSolicitudesRows(payload.data.data);
      if (estado === "pendiente") {
        setPendingRequestIds(new Set(payload.data.data.map((row) => row.faltaId)));
      }
    } catch {
      if (estado === "pendiente") {
        setPendingRequestIds(new Set());
      }
      setSolicitudesRows([]);
    }
  }, [fetchWithCache, get]);

  useEffect(() => {
    if (activeHistoryScope !== "unit" || !effectiveUnitId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshFaltasByUnit(effectiveUnitId, "", estadoFilter);
  }, [effectiveUnitId, refreshFaltasByUnit, estadoFilter, activeHistoryScope]);

  useEffect(() => {
    if (!isPersonScope || !selectedPersonal) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshFaltasByPersonal(selectedPersonal.id, "", estadoFilter);
  }, [isPersonScope, selectedPersonal, refreshFaltasByPersonal, estadoFilter]);

  useEffect(() => {
    if (!sessionUser || !canViewDeletionRequests) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSolicitudes("pendiente");
  }, [sessionUser, canViewDeletionRequests, refreshSolicitudes]);

  useEffect(() => {
    if (!sessionUser || !canViewDeletionRequests) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSolicitudes(solicitudesFilter);
  }, [sessionUser, canViewDeletionRequests, solicitudesFilter, refreshSolicitudes]);

  function resetHistoryRows() {
    setFaltasRows([]);
    setLoadError(null);
    setLastLoadedKey(null);
  }

  function handleScopeChange(scope: HistoryScope) {
    setHistoryScope(scope);
    setSearchText("");
    resetHistoryRows();
  }

  async function handlePersonalSearch(e: FormEvent) {
    e.preventDefault();
    const q = personalSearchText.trim();

    if (q.length < 2) {
      toast.warning("Ingrese al menos 2 caracteres para buscar");
      return;
    }

    setPersonalLoading(true);
    setPersonalError(null);
    try {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("limit", "12");
      const payload = await get<{ data: PersonalResumen[] }>(`/api/personal?${params}`);
      setPersonalResults(payload.data);
      if (payload.data.length === 0) {
        setSelectedPersonal(null);
        resetHistoryRows();
      }
    } catch (error) {
      setPersonalError(error instanceof Error ? error.message : "No se pudo buscar el efectivo");
    } finally {
      setPersonalLoading(false);
    }
  }

  function handleSelectPersonal(personal: PersonalResumen) {
    setSelectedPersonal(personal);
    setSearchText("");
    resetHistoryRows();
  }

  function handleHistorySearch(e: FormEvent) {
    e.preventDefault();
    if (isPersonScope && selectedPersonal) {
      void refreshFaltasByPersonal(selectedPersonal.id, searchText, estadoFilter);
      return;
    }

    if (effectiveUnitId) {
      void refreshFaltasByUnit(effectiveUnitId, searchText, estadoFilter);
    }
  }

  function handleForceRefresh() {
    if (isPersonScope && selectedPersonal) {
      void refreshFaltasByPersonal(selectedPersonal.id, searchText, estadoFilter, { force: true });
      return;
    }

    if (effectiveUnitId) {
      void refreshFaltasByUnit(effectiveUnitId, searchText, estadoFilter, { force: true });
    }
  }

  function handleSelectUnit(unitId: string) {
    setSelectedUnitId(unitId);
    setSearchText("");
    resetHistoryRows();
  }

  function getArticleBadge(articulo: string) {
    if (articulo.includes("Art. 11") || articulo.includes("art11")) return <Badge variant="danger">Art. 11</Badge>;
    if (articulo.includes("Art. 10") || articulo.includes("art10")) return <Badge variant="warning">Art. 10</Badge>;
    return <Badge variant="info">Art. 9</Badge>;
  }

  function getEstadoLabel(estado?: "registrada" | "anulada") {
    return estado === "anulada" ? "sin efecto" : "registrada";
  }

  function resolveReincidenciaChain(
    origin: ReincidenciaOrigenView,
    rowsById: Map<string, Falta>,
    seenIds = new Set<string>(),
  ): ReincidenciaOrigenView {
    if (!origin?.faltaReferenciaId || origin.origenReincidenciaPrevia || seenIds.has(origin.faltaReferenciaId)) {
      return origin;
    }

    const referenced = rowsById.get(origin.faltaReferenciaId);
    if (!referenced?.reincidenciaOrigen) {
      return origin;
    }

    seenIds.add(origin.faltaReferenciaId);
    return {
      ...origin,
      origenReincidenciaPrevia: resolveReincidenciaChain(referenced.reincidenciaOrigen, rowsById, seenIds),
    };
  }

  function enrichFaltaForDetail(row: Falta | null): Falta | null {
    if (!row?.reincidenciaOrigen) return row;

    const rowsById = new Map(faltasRows.map((item) => [item.id, item]));
    return {
      ...row,
      reincidenciaOrigen: resolveReincidenciaChain(row.reincidenciaOrigen, rowsById),
    };
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
      toast.warning("Debe indicar el memorandum de representacion");
      return;
    }

    if (!isRepresentacion && requestReason.trim().length < 8) {
      toast.warning("Debe indicar un motivo valido (minimo 8 caracteres)");
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
      if (lastLoadedKey) {
        invalidate(lastLoadedKey);
      }
      invalidate("solicitudes-baja:");
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
  const canShowHistoryPanel = isPersonScope ? !!selectedPersonal : !!effectiveUnitId;
  const showUnitColumn = isPersonScope;
  const selectedContextLabel = isPersonScope
    ? selectedPersonal?.nombreCompleto ?? "Efectivo no seleccionado"
    : getUnitName(effectiveUnitId);

  return (
    <div className="space-y-4 animate-fade-in">
      {canUseGlobalPersonHistory && (
        <Card className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-bold text-[var(--navy-900)]">Alcance del historial</h3>
              <p className="text-sm text-[var(--navy-500)]">
                Consulte por unidad o revise el historial completo de un efectivo en todas las unidades.
              </p>
            </div>
            <div className="flex gap-1 bg-[var(--navy-100)] p-1 rounded-xl self-start">
              {([
                ["unit", "Por unidad"],
                ["person", "Por efectivo"],
              ] as const).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => handleScopeChange(scope)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeHistoryScope === scope ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {canSelectUnit && activeHistoryScope === "unit" && (
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

      {isPersonScope && (
        <Card className="p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <form className="flex flex-1 gap-2" onSubmit={handlePersonalSearch}>
              <Input
                label="Buscar efectivo"
                placeholder="CI, nombre o apellidos"
                value={personalSearchText}
                onChange={(e) => setPersonalSearchText(e.target.value)}
                icon={Icons.search({ size: 16 })}
                className="flex-1"
              />
              <Button type="submit" variant="secondary" icon={Icons.search({ size: 16 })} loading={personalLoading}>
                Buscar
              </Button>
            </form>
          </div>

          {personalError && (
            <div className="mt-3 rounded-xl border border-[var(--danger-100)] bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-600)]">
              {personalError}
            </div>
          )}

          {personalResults.length > 0 && (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {personalResults.map((personal) => (
                <button
                  key={personal.id}
                  type="button"
                  onClick={() => handleSelectPersonal(personal)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${selectedPersonal?.id === personal.id ? "border-[var(--gold-500)] bg-[var(--gold-50)]" : "border-[var(--border)] hover:border-[var(--navy-300)] hover:bg-[var(--navy-50)]"}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--navy-100)] text-[var(--navy-500)]">
                    {Icons.user({ size: 17 })}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--navy-900)]">{personal.nombreCompleto}</p>
                    <p className="text-xs text-[var(--navy-500)]">CI {personal.ci}</p>
                    <p className="truncate text-xs text-[var(--navy-400)]">{personal.unidadNombre ?? "Sin unidad"}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {personalSearchText.trim().length >= 2 && !personalLoading && personalResults.length === 0 && !personalError && (
            <div className="mt-4">
              <EmptyState icon={Icons.user({ size: 40 })} title="Sin resultados" description="No se encontraron efectivos con ese criterio." />
            </div>
          )}
        </Card>
      )}

      {canShowHistoryPanel && (
        <Card className="p-5">
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <form className="flex gap-2 flex-1" onSubmit={handleHistorySearch}>
              <Input
                placeholder={isPersonScope ? "Filtrar por memorandum dentro del historial" : "Buscar por CI, nombre o memorandum"}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                icon={Icons.search({ size: 16 })}
                className="flex-1"
              />
              <Button type="submit" variant="secondary" icon={Icons.search({ size: 16 })}>Buscar</Button>
              <Button type="button" variant="outline" onClick={handleForceRefresh} disabled={loading}>
                Actualizar
              </Button>
            </form>
            <div className="flex gap-1 bg-[var(--navy-100)] p-1 rounded-xl self-start">
              {(["registrada", "anulada", "todas"] as const).map((estado) => (
                <button
                  key={estado}
                  type="button"
                  onClick={() => setEstadoFilter(estado)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${estadoFilter === estado ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}
                >
                  {estado === "anulada" ? "sin efecto" : estado}
                </button>
              ))}
              <button type="button" onClick={() => setViewMode("table")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${viewMode === "table" ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}>Tabla</button>
              <button type="button" onClick={() => setViewMode("cards")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${viewMode === "cards" ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}>Cards</button>
            </div>
          </div>

          <div className="mb-3 text-sm text-[var(--navy-500)]">
            {isPersonScope ? (
              <>
                Historial completo de <strong className="text-[var(--navy-800)]">{selectedContextLabel}</strong>.
                Mostrando <strong className="text-[var(--navy-800)]">{faltasRows.length}</strong> registros en todas las unidades.
              </>
            ) : (
              <>
                Mostrando <strong className="text-[var(--navy-800)]">{faltasRows.length}</strong> registros de <strong className="text-[var(--navy-800)]">{selectedContextLabel}</strong>
              </>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : loadError ? (
            <div className="rounded-xl border border-[var(--danger-100)] bg-[var(--danger-50)] p-4">
              <p className="text-sm font-semibold text-[var(--danger-600)]">No se pudo cargar el historial.</p>
              <p className="mt-1 text-xs text-[var(--danger-600)]">{loadError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={handleForceRefresh}>
                Reintentar
              </Button>
            </div>
          ) : faltasRows.length === 0 ? (
            <EmptyState icon={Icons.historial({ size: 40 })} title="Sin sanciones" description="No existen sanciones con el filtro aplicado." />
          ) : viewMode === "table" ? (
            <div className="overflow-auto rounded-xl border border-[var(--border)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--navy-50)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Efectivo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">CI</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Articulo</th>
                    {showUnitColumn && <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Unidad sancionadora</th>}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">Memorandum</th>
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
                      {showUnitColumn && <td className="px-4 py-3 text-[var(--navy-600)]">{row.unidadSancionNombre ?? row.unidadNombre ?? "-"}</td>}
                      <td className="px-4 py-3 text-[var(--navy-600)]">{row.memorandum}</td>
                      <td className="px-4 py-3">
                        <Badge variant={row.estado === "anulada" ? "default" : "success"}>{getEstadoLabel(row.estado)}</Badge>
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
                            {pendingRequestIds.has(row.id) ? "Solicitud enviada" : "Dejar sin efecto"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
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
                    <div><p className="text-[10px] text-[var(--navy-400)]">Memorandum</p><p className="text-xs font-medium text-[var(--navy-700)]">{row.memorandum}</p></div>
                    <div><p className="text-[10px] text-[var(--navy-400)]">Estado</p><p className="text-xs font-medium text-[var(--navy-700)]">{getEstadoLabel(row.estado)}</p></div>
                    {showUnitColumn && <div><p className="text-[10px] text-[var(--navy-400)]">Unidad</p><p className="text-xs font-medium text-[var(--navy-700)]">{row.unidadSancionNombre ?? row.unidadNombre ?? "-"}</p></div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {canViewDeletionRequests && (
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-[var(--navy-900)]">Solicitudes para Dejar sin Efecto</h3>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Memo representacion</th>
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
                      {row.tipoSolicitud === "representacion" ? "Representacion de la sancion" : "Error de insercion"}
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
      )}

      <Modal
        open={requestModalOpen}
        onClose={closeRequestModal}
        title="Solicitar dejar sin efecto la sancion"
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
                label="Comentario corto (opcional)"
                placeholder="Detalle breve del contexto de la representacion..."
                rows={3}
                value={requestComment}
                onChange={(e) => setRequestComment(e.target.value)}
                error={requestComment.trim().length > 0 && requestComment.trim().length < 4 ? "Si ingresa comentario, use al menos 4 caracteres" : undefined}
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

      <EfectivoDetail falta={enrichFaltaForDetail(selectedFalta)} open={!!selectedFalta} onClose={() => setSelectedFalta(null)} />
    </div>
  );
}
