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

export function formatReincidenciaOrigin(origin: ReincidenciaOrigenView): string {
  if (!origin?.articuloBase || !origin?.incisoBase) {
    return "Origen: no registrado";
  }

  const base = `${formatArticleShort(origin.articuloBase)} ${formatIncisoShort(origin.incisoBase)}`;
  const previous = origin.origenReincidenciaPrevia?.articuloBase && origin.origenReincidenciaPrevia?.incisoBase
    ? ` por ${formatArticleShort(origin.origenReincidenciaPrevia.articuloBase)} ${formatIncisoShort(origin.origenReincidenciaPrevia.incisoBase)}`
    : "";
  const refParts = [
    origin.memorandumReferencia ? `Memo origen ${origin.memorandumReferencia}` : null,
    origin.fechaSancionReferencia ? `Fecha origen ${String(origin.fechaSancionReferencia).slice(0, 10)}` : null,
    origin.unidadReferenciaNombre ? `Unidad origen: ${origin.unidadReferenciaNombre}` : null,
  ].filter(Boolean);

  return refParts.length > 0
    ? `Origen: ${base}${previous} (${refParts.join(" | ")})`
    : `Origen: ${base}${previous}`;
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
