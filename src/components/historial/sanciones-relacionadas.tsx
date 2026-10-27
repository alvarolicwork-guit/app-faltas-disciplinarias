import { formatArticleShort, formatDisciplinaryDate, formatIncisoShort, type ReincidenciaOrigenView } from "@/lib/domain/reincidencia-format";

export function SancionesRelacionadas({ origin }: { origin: ReincidenciaOrigenView }) {
  if (!origin) return null;
  const sanctions: NonNullable<ReincidenciaOrigenView>[] = [];
  for (let current: ReincidenciaOrigenView = origin; current; current = current.origenReincidenciaPrevia ?? null) sanctions.unshift(current);
  return (
    <details className="rounded-lg border border-[var(--border)] p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-[var(--navy-800)]">Ver sanciones relacionadas ({sanctions.length})</summary>
      <ol className="mt-3 space-y-3 list-decimal pl-5">
        {sanctions.map((sanction, index) => <li key={sanction.faltaReferenciaId ?? index}>
          <p className="font-semibold">{formatArticleShort(sanction.articuloBase)}, {formatIncisoShort(sanction.incisoBase)}</p>
          <p>{sanction.incisoBase ?? "Descripción no registrada"}</p>
          <p><strong>Documento:</strong> {sanction.memorandumReferencia ?? "No registrado"}</p>
          <p><strong>Fecha de la sanción:</strong> {formatDisciplinaryDate(sanction.fechaSancionReferencia)}</p>
          <p><strong>Unidad que la registró:</strong> {sanction.unidadReferenciaNombre ?? "No registrada"}</p>
        </li>)}
      </ol>
    </details>
  );
}
