import { SancionesRelacionadas } from "@/components/historial/sanciones-relacionadas";
import { CHAIN_DAY_MS, type ChainMetadata, type Conduct } from "@/lib/domain/recurrence-chain";
import { formatArticleShort, formatDisciplinaryDate, formatIncisoShort, type ReincidenciaOrigenView } from "@/lib/domain/reincidencia-format";
import { boliviaDateTime } from "@/lib/domain/audit-report";

type Evaluation = {
  tipo: "base" | "escalada" | "remision";
  periodoAnteriorVencido?: boolean;
  conductaOrigen: Conduct;
  sancion: { articulo: string; inciso: string };
  metadata: ChainMetadata | null;
  reincidenciaOrigen: ReincidenciaOrigenView;
  bloqueo: string | null;
  pruebaLocalSinEspera?: boolean;
  antecedentesConfirmados?: {antecedenteId:string;resueltaEl:string;documento:string|null}[];
};

export function ResumenSancion({ evaluation, fechaSancion }: { evaluation: Evaluation; fechaSancion: string }) {
  const { tipo, metadata, conductaOrigen, sancion, reincidenciaOrigen: previous } = evaluation;
  const level = metadata?.nivelEfectivo ?? 0;
  const recurrence = level === 1 ? "Primera reincidencia" : "Segunda reincidencia";
  const title = tipo === "base" ? (evaluation.periodoAnteriorVencido ? "Nuevo registro tras finalizar el período anterior" : "Primer registro vigente por esta falta") : tipo === "remision" ? "Corresponde remitir a Régimen Disciplinario" : `${recurrence} por la misma falta`;
  const article = `${formatArticleShort(sancion.articulo)}, ${formatIncisoShort(sancion.inciso)}`;
  const start = metadata?.fechaInicioCadena ?? fechaSancion;
  const end = metadata?.fechaVencimientoCadena ?? new Date(Date.parse(`${fechaSancion}T00:00:00Z`) + 365 * CHAIN_DAY_MS).toISOString().slice(0, 10);
  return (
    <section aria-label="Resultado de la revisión de antecedentes" className="rounded-xl border p-4 space-y-3 bg-[var(--navy-50)]">
      <h4 className="font-bold text-[var(--navy-900)]">{title}</h4>
      {tipo === "base" ? <p>{evaluation.periodoAnteriorVencido ? "El período anterior para considerar la reincidencia ha finalizado. Las sanciones anteriores permanecen en el historial." : "No se encontraron sanciones anteriores vigentes para considerar reincidencia por esta misma falta."} Corresponde registrar {article}.</p> : tipo === "escalada" ? <p>{level === 1 ? "El funcionario ya tiene una sanción vigente por esta misma falta." : "El funcionario ya tiene una primera reincidencia por esta misma falta."} Corresponde registrar la {recurrence.toLowerCase()}: {article}.</p> : <p>Los antecedentes por esta misma falta requieren remisión a Régimen Disciplinario.</p>}
      <p><strong>Falta cometida:</strong> {conductaOrigen.articulo} / {conductaOrigen.inciso}</p>
      {tipo !== "base" && <p><strong>{tipo === "remision" ? "Artículo de remisión" : "Sanción que corresponde registrar"}:</strong> {sancion.articulo} / {sancion.inciso}</p>}
      {previous && <p><strong>Sanción anterior relacionada:</strong> {previous.memorandumReferencia ?? "Documento no registrado"} · {formatDisciplinaryDate(previous.fechaSancionReferencia)} · {previous.unidadReferenciaNombre ?? "Unidad no registrada"}.</p>}
      <div className="text-sm">
        <p><strong>Período para considerar la reincidencia:</strong> comienza el {formatDisciplinaryDate(start)} y vence el {formatDisciplinaryDate(end)}.</p>
      </div>
      {previous && <SancionesRelacionadas origin={previous} />}
      {tipo === "escalada" && !evaluation.bloqueo && evaluation.antecedentesConfirmados?.map(row => <p key={row.antecedenteId} role="status" className="text-sm"><strong>Antecedente habilitado{row.documento ? ` (${row.documento})` : ""}:</strong> la solicitud para dejar sin efecto fue rechazada el {boliviaDateTime(row.resueltaEl)}.</p>)}
      {evaluation.bloqueo && <p role="alert" className="text-red-700"><strong>No se puede registrar todavía:</strong> {evaluation.bloqueo}</p>}
      {evaluation.pruebaLocalSinEspera && <p role="status" className="text-sm text-amber-800">Prueba local: puede registrar reincidencias sin esperar siete días. Se conservan el vencimiento anual y el bloqueo por solicitudes pendientes.</p>}
    </section>
  );
}
