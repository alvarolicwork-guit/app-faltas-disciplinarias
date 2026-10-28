"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { ContenidoSancion, type SancionView } from "@/components/historial/contenido-sancion";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { canViewGlobalPersonHistory, isUnitScopedRole } from "@/lib/domain/roles";
import { formatArticleShort, formatDisciplinaryDate, formatIncisoShort } from "@/lib/domain/reincidencia-format";

export type Person = { id: string; ci?: string; nombreCompleto?: string; grado?: string; nombres?: string; apellidos?: string };
type Sanction = SancionView;

type Result = { key: string; rows: Sanction[]; error?: string };

export function HistorialPersonal({ person, initialUnitId, unitName, onClose }: { person: Person; initialUnitId: string; unitName: string; onClose: () => void }) {
  const { get } = useApi();
  const { sessionUser } = useAuth();
  const canViewGlobal = canViewGlobalPersonHistory(sessionUser?.role ?? "");
  const unitId = isUnitScopedRole(sessionUser?.role ?? "") ? sessionUser?.unidadId ?? "" : initialUnitId;
  const [showGlobal, setShowGlobal] = useState(!initialUnitId);
  const [filter, setFilter] = useState("todas");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const globalScope = canViewGlobal && showGlobal;
  const queryKey = JSON.stringify([sessionUser?.uid, sessionUser?.role, person.id, globalScope ? "global" : unitId, revision]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ personalId: person.id, scope: globalScope ? "global_person" : "unit" });
    if (!globalScope) params.set("unidadId", unitId);
    void get<{data:Sanction[]}>(`/api/faltas?${params}`).then(payload => {
      if (!cancelled) setResult({key:queryKey, rows:payload.data});
    }).catch(error => {
      if (!cancelled) setResult({key:queryKey, rows:[], error:error instanceof Error ? error.message : "No se pudo consultar el historial"});
    });
    return () => { cancelled = true; };
  }, [get, person.id, globalScope, unitId, queryKey]);

  const loading = result?.key !== queryKey;
  const rows = loading ? [] : result.rows;
  const error = loading ? null : result.error;
  const registered = rows.filter(row => row.estado === "registrada").length;
  const annulled = rows.filter(row => row.estado === "anulada").length;
  const visibleRows = rows.filter(row => filter === "todas" || row.estado === filter).sort((a,b) => String(b.fechaSancion ?? "").localeCompare(String(a.fechaSancion ?? "")) || String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")) || b.id.localeCompare(a.id));

  return <Modal open onClose={onClose} title="Historial del efectivo" size="lg" footer={<Button variant="outline" onClick={onClose}>Cerrar historial</Button>}>
    <div className="space-y-4">
      <div className="rounded-xl bg-[var(--navy-50)] border p-3">
        <h3 className="font-bold text-[var(--navy-900)]">{person.nombreCompleto || [person.grado, person.nombres, person.apellidos].filter(Boolean).join(" ") || "Nombre no registrado"}</h3>
        <p className="text-sm">CI: {person.ci || "No registrada"}</p>
        <p className="mt-1 text-sm font-semibold">{globalScope ? "Historial departamental · Todas las unidades" : `Historial de la unidad · ${unitName || sessionUser?.unidadNombre || unitId}`}</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {canViewGlobal && unitId && <Button variant="outline" size="sm" onClick={() => {setShowGlobal(!globalScope);setFilter("todas");}}>{globalScope ? "Volver al historial de la unidad" : "Ver historial departamental"}</Button>}
        <Button variant="outline" size="sm" onClick={() => setRevision(value => value + 1)} loading={loading}>Actualizar historial</Button>
      </div>
      {loading ? <p role="status">Consultando sanciones del efectivo...</p> : error ? <p role="alert" className="text-red-700">{error}. Pulse Actualizar historial para volver a consultar.</p> : <>
        <p className="text-sm">{registered} registradas · {annulled} sin efecto · {rows.length} registros en este historial</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Estado de las sanciones">
          {[["todas","Todas"],["registrada","Registradas"],["anulada","Sin efecto"]].map(([value,label]) => <Button key={value} size="sm" variant={filter === value ? "secondary" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}
        </div>
        {visibleRows.length === 0 ? <EmptyState title={rows.length ? "Sin registros para este filtro" : globalScope ? "Este efectivo no tiene sanciones registradas" : "Este efectivo no tiene sanciones registradas en esta unidad"} description={rows.length ? "Puede consultar las otras opciones de estado." : undefined} /> : <div className="space-y-3">
          {visibleRows.map(row => <article key={row.id} className="rounded-xl border border-[var(--border)] p-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
              <h4 className="font-bold">{formatArticleShort(row.articulo)}, {formatIncisoShort(row.inciso)}</h4>
              <div className="flex gap-2"><Badge variant={row.estado === "registrada" ? "success" : "default"}>{row.estado === "anulada" ? "Sin efecto" : row.estado === "registrada" ? "Registrada" : "Estado no registrado"}</Badge>{(row.reincidencia || row.tipoRegistro === "reincidencia_escalada") && <Badge variant="warning">Reincidencia</Badge>}</div>
            </div>
            <p className="text-sm"><strong>Documento:</strong> {row.memorandum ?? "No registrado"} · <strong>Fecha:</strong> {formatDisciplinaryDate(row.fechaSancion)}</p>
            <p className="text-sm"><strong>Unidad que registró la sanción:</strong> {row.unidadSancionNombre ?? row.unidadNombre ?? "No registrada"}</p>
            <p className="text-sm"><strong>{row.conductaOrigen ? "Falta cometida" : "Detalle registrado"}:</strong> {row.conductaOrigen ? `${formatArticleShort(row.conductaOrigen.articulo)} / ${row.conductaOrigen.inciso}` : row.inciso}</p>
            {row.estado === "anulada" && <p className="text-sm"><strong>Motivo para dejarla sin efecto:</strong> {row.anulacion?.motivoEliminacion ?? "No consta en este registro"}</p>}
            <details className="text-sm"><summary className="cursor-pointer font-semibold">Ver detalle de la sanción</summary><div className="mt-2"><ContenidoSancion row={row} /></div></details>
          </article>)}
        </div>}
      </>}
    </div>
  </Modal>;
}
