import { DISCIPLINARY_CATALOG } from "./disciplinary-catalog";
import { articleNumber, incisoNumber, isReincidenciaEscalada, isSameTipificacion, getSancionSugeridaForFaltaBase } from "./disciplinary-recidivism";

export const CHAIN_RULES_VERSION = "conducta-plazo-raiz-v2";
export const CHAIN_DAY_MS = 86_400_000;
export type SanctionRow = Record<string, unknown> & { id: string };
export type Conduct = { articuloNumero: number; incisoNumero: number; articulo: string; inciso: string };
export type ChainMetadata = {
  conductaOrigen: Conduct;
  cadenaId: string;
  raizHistoricaId: string;
  raizVigenteId: string;
  fechaInicioCadena: string;
  fechaVencimientoCadena: string;
  nivelEfectivo: number;
  versionReglas: string;
};
export class ChainError extends Error {
  constructor(message: string, public code = "CADENA_REQUIERE_REVISION") { super(message); }
}

/** Date-only values retain their institutional calendar date, independently of browser timezone. */
export function dateOnly(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    const day = value.slice(0, 10), parsed = new Date(`${day}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
  }
  if (value && typeof value === "object" && "toDate" in value) return dateOnly((value as { toDate(): Date }).toDate().toISOString());
  return null;
}
export function calendarMillis(value: unknown): number {
  const day = dateOnly(value);
  if (!day) throw new ChainError("La fecha de sanción no es verificable", "FECHA_INVALIDA");
  return Date.parse(`${day}T00:00:00Z`);
}
export function boliviaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function validateSanctionDate(value: string, today = boliviaToday()): string {
  const day = dateOnly(value);
  if (!day || day !== value) throw new ChainError("Fecha de sanción inválida", "FECHA_INVALIDA");
  if (day > today) throw new ChainError("La fecha de sanción no puede ser futura", "FECHA_FUTURA");
  return day;
}
export function canonicalConduct(article: string, inciso: string): Conduct {
  const a = articleNumber(article), i = incisoNumber(inciso);
  const catalog = DISCIPLINARY_CATALOG.find(c => articleNumber(c.label) === a);
  const label = catalog?.incisos.find(c => incisoNumber(c) === i);
  if (!catalog || !label || a === null || i === null) throw new ChainError("Artículo/inciso fuera del catálogo", "CATALOGO_INVALIDO");
  return { articuloNumero: a, incisoNumero: i, articulo: catalog.label, inciso: label };
}
export function sameConduct(a: Conduct, b: Conduct): boolean { return a.articuloNumero === b.articuloNumero && a.incisoNumero === b.incisoNumero; }
export function originId(row: SanctionRow): string | null {
  const value = (row.reincidenciaOrigen as { faltaReferenciaId?: unknown } | null)?.faltaReferenciaId;
  return typeof value === "string" && value ? value : null;
}
function rowConduct(row: SanctionRow): Conduct { return canonicalConduct(String(row.articulo), String(row.inciso)); }
function readMetadataConduct(value: unknown): Conduct | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Conduct;
  const result = canonicalConduct(v.articulo, v.inciso);
  if (v.articuloNumero !== result.articuloNumero || v.incisoNumero !== result.incisoNumero) throw new ChainError("Los códigos de la conducta original son inconsistentes");
  return result;
}
export function newChainMetadata(id: string, conduct: Conduct, date: string): ChainMetadata {
  if (isReincidenciaEscalada(conduct.articulo, conduct.inciso) || conduct.articuloNumero === 12) throw new ChainError("Una cadena debe comenzar en una conducta sustantiva");
  return { conductaOrigen: conduct, cadenaId: id, raizHistoricaId: id, raizVigenteId: id, fechaInicioCadena: date,
    fechaVencimientoCadena: new Date(calendarMillis(date) + 365 * CHAIN_DAY_MS).toISOString().slice(0, 10), nivelEfectivo: 0, versionReglas: CHAIN_RULES_VERSION };
}

export type ResolvedChain = { nodes: SanctionRow[]; metadata: ChainMetadata };
/** Resolve every edge from actual rows. Snapshots are evidence, never an alternative source of truth. */
export function resolveChain(rows: SanctionRow[], id: string): ResolvedChain {
  const byId = new Map(rows.map(r => [r.id, r]));
  const seen = new Set<string>(), reverse: SanctionRow[] = [];
  let current = byId.get(id);
  if (!current) throw new ChainError("No se encontró el antecedente");
  const person = current.personalId;
  if(typeof person !== "string" || !person) throw new ChainError("La sanción no conserva la identidad de la persona");
  while (current) {
    if (seen.has(current.id)) throw new ChainError("La cadena contiene un ciclo");
    seen.add(current.id);
    if (current.personalId !== person) throw new ChainError("La cadena referencia a otra persona");
    const classification = rowConduct(current);
    const parentId = originId(current);
    const escalated = isReincidenciaEscalada(classification.articulo, classification.inciso);
    if (escalated !== !!parentId) throw new ChainError("La cadena está incompleta o su registro base conserva un vínculo incompatible");
    calendarMillis(current.fechaSancion);
    reverse.push(current);
    if (!parentId) break;
    const parent = byId.get(parentId);
    if (!parent || parent.estado !== "registrada") throw new ChainError("La cadena tiene un antecedente ausente o sin efecto");
    const parentClass = rowConduct(parent);
    if (classification.articuloNumero !== parentClass.articuloNumero + 1 || classification.incisoNumero !== 1) throw new ChainError("La cadena no conserva un escalón intermedio válido");
    if (calendarMillis(parent.fechaSancion) > calendarMillis(current.fechaSancion)) throw new ChainError("El antecedente tiene fecha posterior a su descendiente");
    const snapshot = current.reincidenciaOrigen as Record<string, unknown>;
    if ((snapshot.articuloBase && articleNumber(String(snapshot.articuloBase)) !== parentClass.articuloNumero) || (snapshot.incisoBase && incisoNumber(String(snapshot.incisoBase)) !== parentClass.incisoNumero)) throw new ChainError("La referencia histórica no coincide con la tipificación del antecedente");
    current = parent;
  }
  const nodes = reverse.reverse(), base = nodes[0], conduct = rowConduct(base);
  if (isReincidenciaEscalada(conduct.articulo, conduct.inciso) || conduct.articuloNumero === 12) throw new ChainError("No se puede demostrar la conducta original");
  const historicalRootId = typeof base.raizHistoricaId === "string" ? base.raizHistoricaId : base.id;
  const historicalRoot = byId.get(historicalRootId);
  if (!historicalRoot || historicalRoot.personalId !== person) throw new ChainError("Falta la raíz histórica necesaria para verificar el plazo");
  if (historicalRootId !== base.id && historicalRoot.estado !== "anulada") throw new ChainError("El cambio de raíz efectiva no tiene una cancelación documentada");
  const originalClass = historicalRoot.tipificacionOriginal as { articulo?: string; inciso?: string } | undefined;
  const historicalConduct = canonicalConduct(originalClass?.articulo ?? String(historicalRoot.articulo), originalClass?.inciso ?? String(historicalRoot.inciso));
  if (!sameConduct(historicalConduct, conduct)) throw new ChainError("La raíz histórica pertenece a otra conducta");
  const effectiveRootId = typeof base.raizVigenteId === "string" ? base.raizVigenteId : historicalRootId;
  if (effectiveRootId !== base.id) throw new ChainError("La raíz vigente no corresponde al primer registro efectivo");
  const anchor = dateOnly(base.fechaSancion)!;
  const metadata = newChainMetadata(historicalRootId, conduct, anchor);
  metadata.raizVigenteId = effectiveRootId;
  metadata.cadenaId = typeof base.cadenaId === "string" ? base.cadenaId : historicalRootId;
  if (metadata.cadenaId !== historicalRootId) throw new ChainError("La identidad de cadena no corresponde a su raíz histórica");
  for (let level = 0; level < nodes.length; level++) {
    const node = nodes[level];
    if (node.estado !== "registrada") throw new ChainError("El antecedente está sin efecto");
    const classification = rowConduct(node);
    if (classification.articuloNumero !== conduct.articuloNumero + level || (level > 0 && classification.incisoNumero !== 1)) throw new ChainError("Nivel incompatible con la conducta original");
    const t = dateOnly(node.fechaSancion)!;
    if (t < anchor || (level > 0 && t >= metadata.fechaVencimientoCadena)) throw new ChainError("La cadena contiene una sanción fuera del plazo de su raíz", "CADENA_FUERA_DE_PLAZO");
    const persistedConduct = readMetadataConduct(node.conductaOrigen);
    if (persistedConduct && !sameConduct(persistedConduct, conduct)) throw new ChainError("La conducta persistida no coincide con la cadena real");
    for (const key of ["cadenaId", "raizHistoricaId", "raizVigenteId", "fechaInicioCadena", "fechaVencimientoCadena"] as const) {
      if (node[key] !== undefined && node[key] !== metadata[key]) throw new ChainError("El plazo o la identidad de la cadena fue alterado");
    }
    if (node.nivelEfectivo !== undefined && node.nivelEfectivo !== level) throw new ChainError("El nivel efectivo no coincide con sus antecedentes");
    const children = rows.filter(r => r.estado === "registrada" && originId(r) === node.id);
    if (children.length > 1) throw new ChainError("La cadena tiene una bifurcación; requiere revisión");
  }
  return { nodes, metadata: { ...metadata, nivelEfectivo: nodes.length - 1 } };
}

export type RecurrenceDecision = {
  periodoAnteriorVencido?: boolean;
  tipo: "base" | "escalada" | "remision";
  conductaOrigen: Conduct;
  sancion: { articulo: string; inciso: string; requiereRemisionDisciplinaria?: boolean; remisionMensaje?: string };
  antecedenteId: string | null;
  metadata: ChainMetadata | null;
  nodes: SanctionRow[];
};

export function evaluateRecurrence(rows: SanctionRow[], person: string, date: string, conduct: Conduct): RecurrenceDecision {
  calendarMillis(date);
  if (isReincidenciaEscalada(conduct.articulo, conduct.inciso) || conduct.articuloNumero === 12) throw new ChainError("Seleccione la conducta original, no el inciso de reincidencia");
  const matching = new Map<string, ResolvedChain>();
  let periodoAnteriorVencido = false;
  for (const row of rows.filter(r => r.personalId === person && r.estado === "registrada")) {
    // Unknown/malformed escalations cannot safely be assigned to an unrelated conduct.
    const resolved = resolveChain(rows, row.id);
    if (!sameConduct(resolved.metadata.conductaOrigen, conduct)) continue;
    if (dateOnly(row.fechaSancion)! > date) throw new ChainError("Hay sanciones posteriores de esta conducta. El registro retroactivo requiere revisión de impacto", "REGISTRO_RETROACTIVO");
    if (date >= resolved.metadata.fechaVencimientoCadena) { periodoAnteriorVencido = true; continue; }
    const previous = matching.get(resolved.metadata.cadenaId);
    if (!previous || resolved.nodes.length > previous.nodes.length) matching.set(resolved.metadata.cadenaId, resolved);
  }
  if (matching.size > 1) throw new ChainError("Existen cadenas superpuestas de la misma conducta; requiere revisión");
  const active = [...matching.values()][0];
  if (!active) return { tipo: "base", periodoAnteriorVencido, conductaOrigen: conduct, sancion: { articulo: conduct.articulo, inciso: conduct.inciso }, antecedenteId: null, metadata: null, nodes: [] };
  const tip = active.nodes.at(-1)!;
  const suggested = getSancionSugeridaForFaltaBase(String(tip.articulo));
  if (!suggested) throw new ChainError("No se puede calcular la siguiente sanción");
  return { tipo: suggested.requiereRemisionDisciplinaria ? "remision" : "escalada", conductaOrigen: conduct, sancion: suggested,
    antecedenteId: tip.id, metadata: { ...active.metadata, nivelEfectivo: active.metadata.nivelEfectivo + 1 }, nodes: active.nodes };
}

export function matchesDecision(article: string, inciso: string, parentId: string | null, decision: RecurrenceDecision): boolean {
  return decision.tipo !== "remision" && isSameTipificacion(article, inciso, decision.sancion.articulo, decision.sancion.inciso) && parentId === decision.antecedenteId;
}

export function snapshotChain(nodes: SanctionRow[]): Record<string, unknown> | null {
  let snapshot: Record<string, unknown> | null = null;
  for (const row of nodes) snapshot = { articuloBase: row.articulo, incisoBase: row.inciso, faltaReferenciaId: row.id,
    fechaSancionReferencia: row.fechaSancion ?? null, memorandumReferencia: row.memorandum ?? null,
    unidadReferenciaNombre: row.unidadSancionNombre ?? row.unidadNombre ?? null, origenReincidenciaPrevia: snapshot };
  return snapshot;
}

/** Read-only per-node inventory; orphan leaves are checked, even without descendants. */
export function inspectChains(rows: SanctionRow[]) {
  const inspected: Array<{id:string;metadata:ChainMetadata|null;error:string|null}> = rows.filter(r => r.estado === "registrada").map(row => {
    try { const resolved = resolveChain(rows, row.id); return { id: row.id, metadata: resolved.metadata, error: null }; }
    catch (e) { return { id: row.id, metadata: null, error: e instanceof Error ? e.message : "Cadena inconsistente" }; }
  });
  for (const item of inspected) if (item.metadata) {
    const metadata = item.metadata;
    const samePerson = rows.find(r => r.id === item.id)?.personalId;
    if (dateOnly(rows.find(r => r.id === item.id)?.fechaSancion)! > boliviaToday()) item.error = "Sanción con fecha futura";
    if (inspected.some(other => other.metadata && rows.find(r => r.id === other.id)?.personalId === samePerson && other.metadata.cadenaId !== metadata.cadenaId && sameConduct(other.metadata.conductaOrigen, metadata.conductaOrigen) && other.metadata.fechaInicioCadena < metadata.fechaVencimientoCadena && metadata.fechaInicioCadena < other.metadata.fechaVencimientoCadena)) item.error = "Cadenas de la misma conducta con plazos superpuestos";
  }
  return inspected;
}
