import { articleNumber, isReincidenciaEscalada } from "./disciplinary-recidivism";
import { dateOnly, newChainMetadata, resolveChain, sameConduct, type SanctionRow } from "./recurrence-chain";

export const DAY_MS = 86_400_000;
export const CANCELLATION_DAYS = 7;
export const REQUEST_DAYS = 5;

export function millis(value: unknown): number | null {
  if (value && typeof value === "object" && "toMillis" in value) {
    return (value as { toMillis(): number }).toMillis();
  }
  if (typeof value === "string") {
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function cancellationDeadline(row: Record<string, unknown>): number | null {
  const created = millis(row.createdAt);
  return created === null ? null : created + CANCELLATION_DAYS * DAY_MS;
}

export function requestDeadline(row: Record<string, unknown>): number | null {
  return millis(row.expiresAt) ?? (millis(row.createdAt) === null ? null : millis(row.createdAt)! + REQUEST_DAYS * DAY_MS);
}

export function pendingRequest(row: Record<string, unknown>, now: number): boolean {
  // Legacy requests without a reliable date stay blocked for explicit review.
  return row.estado === "pendiente" && (requestDeadline(row) === null || now < requestDeadline(row)!);
}

export function authorUid(row: Record<string, unknown>): string {
  return String((row.createdBy as { uid?: string } | undefined)?.uid ?? "");
}

export function canRequestCancellation(actor: { uid: string; role: string; unidadId?: string }, row: Record<string, unknown>, now: number): boolean {
  const end = cancellationDeadline(row);
  return actor.role === "admin_unidad" && authorUid(row) === actor.uid && !!actor.unidadId &&
    actor.unidadId === row.unidadId && row.estado === "registrada" && end !== null && now < end;
}

export function ancestorBlock(row: Record<string, unknown>, requests: Record<string, unknown>[], now: number, options: {skipRegistrationWait?:boolean} = {}): string | null {
  if (row.estado !== "registrada") return "El antecedente está sin efecto";
  if (row.revisionReincidencia === "pendiente") return "El antecedente requiere revisión de su fundamento";
  const end = cancellationDeadline(row);
  if (end === null) return "El antecedente no tiene fecha de registro verificable; requiere revisión";
  if (!options.skipRegistrationWait && now < end) return `El antecedente podrá utilizarse desde ${new Date(end).toISOString()} (siete días desde su registro)`;
  if (requests.some((r) => pendingRequest(r, now))) return "El antecedente tiene una solicitud de cancelación pendiente";
  return null;
}

export function dependentIds(rows: Array<{ id: string; reincidenciaOrigen?: unknown; estado?: unknown }>, root: string): string[] {
  const found = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      const origin = row.reincidenciaOrigen as { faltaReferenciaId?: string } | undefined;
      if (row.estado !== "anulada" && origin?.faltaReferenciaId && found.has(origin.faltaReferenciaId) && !found.has(row.id)) {
        found.add(row.id); changed = true;
      }
    }
  }
  return [...found].filter((id) => id !== root);
}

export type ChainRow = Record<string, unknown> & { id: string };
// Rebase exactly the descendants of the cancelled node by one level. Preserve
// independent chains, dates and document numbers; amendments are audited apart.
export function lowerDependentChain(rows: ChainRow[], targetId: string): ChainRow[] {
  const byId = new Map(rows.map(r => [r.id, r]));
  const target = byId.get(targetId);
  if (!target) throw new Error("Sanción no encontrada");
  const descendants = dependentIds(rows, targetId);
  // An isolated invalid historical row can still be cancelled without changing
  // any other record. Full diagnosis is performed separately by inspectChains.
  if(!descendants.length)return [];
  // A reclassification needs a complete, unambiguous chain.
  const originalResolution = resolveChain(rows as SanctionRow[], targetId);
  for (const id of descendants) resolveChain(rows as SanctionRow[], id);
  const adjusted = new Map<string, ChainRow>();
  const remaining = new Set(descendants);
  while (remaining.size) {
    let progress = false;
    for (const id of remaining) {
      const row = byId.get(id)!;
      const oldOrigin = row.reincidenciaOrigen as Record<string, unknown>;
      const parentId = String(oldOrigin.faltaReferenciaId);
      if (parentId !== targetId && !adjusted.has(parentId)) continue;
      const originalParent = byId.get(parentId)!;
      if (row.personalId !== target.personalId || !originalParent.articulo || !originalParent.inciso) throw new Error("Cadena inconsistente: revise identidad y tipificación");
      const newParent = parentId === targetId ? null : adjusted.get(parentId)!;
      const replacementOrigin = newParent ? {
        articuloBase: newParent.articulo, incisoBase: newParent.inciso,
        faltaReferenciaId: newParent.id, fechaSancionReferencia: newParent.fechaSancion ?? null,
        memorandumReferencia: newParent.memorandum ?? null,
        unidadReferenciaNombre: newParent.unidadSancionNombre ?? newParent.unidadNombre ?? null,
        origenReincidenciaPrevia: newParent.reincidenciaOrigen ?? null,
      } : (target.reincidenciaOrigen ?? null);
      const escalated = isReincidenciaEscalada(String(originalParent.articulo), String(originalParent.inciso));
      adjusted.set(id, { ...row, articulo: originalParent.articulo, inciso: originalParent.inciso,
        reincidencia: escalated, tipoRegistro: escalated ? "reincidencia_escalada" : "falta_directa",
        reincidenciaOrigen: escalated ? replacementOrigin : null,
        reincidenciaReferencia: escalated ? replacementOrigin : null,
      });
      remaining.delete(id); progress = true;
    }
    if (!progress) throw new Error("Cadena cíclica o incompleta");
  }
  const output = [...adjusted.values()];
  const cancelled = { ...target, estado: "anulada" };
  const effectiveRows = rows.map(r => r.id === targetId ? cancelled : adjusted.get(r.id) ?? r);
  // The effective base can change on cancellation of the original: the user
  // explicitly requires a new year from the sanction promoted to base.
  for (const change of output) {
    let base = change;
    const seen = new Set<string>();
    while (base.reincidenciaOrigen) {
      if (seen.has(base.id)) throw new Error("Cadena cíclica");
      seen.add(base.id);
      const parent = (base.reincidenciaOrigen as {faltaReferenciaId:string}).faltaReferenciaId;
      const next = effectiveRows.find(r => r.id === parent);
      if (!next) throw new Error("Cadena incompleta");
      base = next;
    }
    const metadata = newChainMetadata(originalResolution.metadata.cadenaId, originalResolution.metadata.conductaOrigen, dateOnly(base.fechaSancion)!);
    Object.assign(change, metadata, { raizHistoricaId: originalResolution.metadata.raizHistoricaId, raizVigenteId: base.id,
      nivelEfectivo: articleNumber(String(change.articulo))! - originalResolution.metadata.conductaOrigen.articuloNumero });
  }
  // Re-resolve the result to verify metadata, levels and reference snapshots.
  for (const change of output) resolveChain(effectiveRows as SanctionRow[], change.id);
  if (output.length && originalResolution.metadata.raizVigenteId === targetId) {
    const promoted = output.find(r => !r.reincidenciaOrigen)!;
    const metadata = resolveChain(effectiveRows as SanctionRow[], promoted.id).metadata;
    for (const other of effectiveRows.filter(r => r.estado === "registrada" && !output.some(c => c.id === r.id))) {
      const separate = resolveChain(effectiveRows as SanctionRow[], other.id).metadata;
      if (separate.cadenaId !== metadata.cadenaId && sameConduct(separate.conductaOrigen, metadata.conductaOrigen) && separate.fechaInicioCadena < metadata.fechaVencimientoCadena && metadata.fechaInicioCadena < separate.fechaVencimientoCadena) throw new Error("El nuevo año de la base promovida se superpone con otra cadena de esta conducta; requiere revisión de impacto");
    }
  }
  return output;
}

