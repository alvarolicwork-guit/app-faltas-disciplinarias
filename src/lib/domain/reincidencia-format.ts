export type ReincidenciaOrigenView = {
  articuloBase?: string;
  incisoBase?: string;
  faltaReferenciaId?: string;
  fechaSancionReferencia?: string | null;
  memorandumReferencia?: string | null;
  unidadReferenciaNombre?: string | null;
  origenReincidenciaPrevia?: ReincidenciaOrigenView | null;
} | null;

export type ReincidenciaFormatRow = {
  articulo: string;
  inciso: string;
  fechaSancion?: string | null;
  memorandum?: string | null;
  unidadSancionNombre?: string | null;
  unidadNombre?: string | null;
  reincidenciaOrigen?: ReincidenciaOrigenView;
};

export function formatIncisoShort(value?: string | null): string {
  if (!value) return "inc. N/A";
  const match = value.match(/^(\d+)\s*[.)]/);
  return match ? `inc. ${match[1]}` : value;
}

export function formatArticleShort(value?: string | null): string {
  if (!value) return "Art. N/A";
  return value.split(" - ")[0] || value;
}

export function formatDisciplinaryDate(value?: string | null): string {
  if (!value) return "No registrada";
  const day = String(value).slice(0, 10);
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

export function formatReincidenciaOrigin(origin: ReincidenciaOrigenView): string {
  if (!origin?.articuloBase || !origin?.incisoBase) {
    return "Sanción anterior relacionada: no registrada";
  }

  const base = `${formatArticleShort(origin.articuloBase)} ${formatIncisoShort(origin.incisoBase)}`;
  const previous = origin.origenReincidenciaPrevia?.articuloBase && origin.origenReincidenciaPrevia?.incisoBase
    ? ` por ${formatArticleShort(origin.origenReincidenciaPrevia.articuloBase)} ${formatIncisoShort(origin.origenReincidenciaPrevia.incisoBase)}`
    : "";
  const refParts = [
    origin.memorandumReferencia ? `Documento: ${origin.memorandumReferencia}` : null,
    origin.fechaSancionReferencia ? `Fecha: ${formatDisciplinaryDate(origin.fechaSancionReferencia)}` : null,
    origin.unidadReferenciaNombre ? `Unidad que la registró: ${origin.unidadReferenciaNombre}` : null,
  ].filter(Boolean);

  return refParts.length > 0
    ? `Sanción anterior relacionada: ${base}${previous} (${refParts.join(" | ")})`
    : `Sanción anterior relacionada: ${base}${previous}`;
}

export function formatFaltaOrigenOption(row: ReincidenciaFormatRow): string {
  const parts = [
    row.fechaSancion ?? "",
    `${formatArticleShort(row.articulo)} ${formatIncisoShort(row.inciso)}`,
    row.reincidenciaOrigen ? formatReincidenciaOrigin(row.reincidenciaOrigen) : row.inciso,
    `Memo ${row.memorandum ?? "N/A"}`,
    `Unidad: ${row.unidadSancionNombre ?? row.unidadNombre ?? "N/A"}`,
  ];

  return parts.filter(Boolean).join(" | ");
}
