import { createHash } from "node:crypto";

import { DISCIPLINARY_CATALOG } from "@/lib/domain/disciplinary-catalog";
import {
  articleNumber,
  incisoNumber,
  isDirectReincidenciaControlSubject,
  isRegimenDisciplinarioReferral,
  isReincidenciaEscalada,
  sameArticulo,
} from "@/lib/domain/disciplinary-recidivism";
import { resolveRangoPolicial } from "@/lib/domain/rangos-policiales";
import {
  getSanctionDocumentPrefix,
  isValidSanctionDocumentNumber,
} from "@/lib/domain/sanction-document";
import { normalizeCi, normalizeWhitespace } from "@/lib/domain/text-normalization";

export const HISTORICAL_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const HISTORICAL_IMPORT_MAX_ROWS = 2000;
export const HISTORICAL_MISSING_REASON = "Sin detalle de motivo en la fuente historica.";

export type SpreadsheetCell = string | number | boolean | Date | null | undefined;

export type ImportIssue = {
  field: string;
  message: string;
  value?: string;
};

export type RawHistoricalSanctionRow = {
  sourceRow: number;
  values: Record<string, SpreadsheetCell>;
};

export type HistoricalSanctionNormalized = {
  rowKey: string;
  sourceRow: number;
  ci: string;
  personalId: string;
  nombreCompleto: string;
  gradoActual: string;
  unidadActualId: string;
  unidadActualNombre: string;
  fechaSancion: string;
  articulo: string;
  inciso: string;
  memorandum: string;
  motivo: string;
  motivoNoDisponible: boolean;
  unidadSancionId: string;
  unidadSancionNombre: string;
  unidadEfectivoHistoricaId: string;
  unidadEfectivoHistoricaNombre: string;
  importKey: string;
  isEscalada: boolean;
  originFaltaId?: string;
  originRowKey?: string;
};

export type HistoricalSanctionPreviewRow = {
  rowKey: string;
  sourceRow: number;
  status: "valid" | "warning" | "error" | "duplicate";
  original: Record<string, string>;
  normalized: HistoricalSanctionNormalized | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

export type PersonalImportLookup = {
  id: string;
  ci: string;
  nombreCompleto: string;
  grado: string;
  nombres?: string;
  apellidos?: string;
  unidadId: string;
  unidadNombre: string;
};

export type UnitImportLookup = {
  id: string;
  nombre: string;
  estado?: string;
};

export type ExistingSanctionLookup = {
  id: string;
  personalId: string;
  ci: string;
  articulo: string;
  inciso: string;
  fechaSancion: string;
  memorandum: string;
  unidadSancionId: string;
  estado: string;
  importKey?: string;
  reincidenciaOrigen?: unknown;
};

const HEADER_ALIASES: Record<string, string> = {
  n: "n",
  nro: "n",
  numero: "n",
  ci: "ci",
  cedula_identidad: "ci",
  c_i: "ci",
  grado: "grado",
  nombres: "nombres",
  nombre: "nombres",
  apellidos: "apellidos",
  apellido: "apellidos",
  fecha_sancion: "fecha_sancion",
  fecha: "fecha_sancion",
  articulo: "articulo",
  art: "articulo",
  inciso: "inciso",
  numeral: "inciso",
  num: "inciso",
  documento_sancion: "documento_sancion",
  tipo_documento: "documento_sancion",
  numero_de_documento_de_sancion: "numero_documento_sancion",
  numero_documento_sancion: "numero_documento_sancion",
  nro_documento_sancion: "numero_documento_sancion",
  memorandum_acta: "numero_documento_sancion",
  motivo: "motivo",
  unidad: "unidad",
  codigo: "codigo_unidad",
  codigo_unidad: "codigo_unidad",
};

const REQUIRED_HEADERS = [
  "ci",
  "fecha_sancion",
  "articulo",
  "inciso",
  "documento_sancion",
  "numero_documento_sancion",
  "codigo_unidad",
] as const;

function comparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeHistoricalHeader(value: SpreadsheetCell): string {
  const normalized = comparable(cellToString(value)).replace(/\s+/g, "_");
  return HEADER_ALIASES[normalized] ?? normalized;
}

export function mapSpreadsheetRows(matrix: SpreadsheetCell[][]): {
  headers: string[];
  missingHeaders: string[];
  rows: RawHistoricalSanctionRow[];
} {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => cellToString(cell).length > 0));
  if (headerIndex < 0) {
    return { headers: [], missingHeaders: [...REQUIRED_HEADERS], rows: [] };
  }

  const headers = matrix[headerIndex].map(normalizeHistoricalHeader);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  const rows = matrix
    .slice(headerIndex + 1)
    .map((cells, index) => {
      const values: Record<string, SpreadsheetCell> = {};
      headers.forEach((header, columnIndex) => {
        if (header) values[header] = cells[columnIndex] ?? null;
      });
      return { sourceRow: headerIndex + index + 2, values };
    })
    .filter((row) => Object.values(row.values).some((cell) => cellToString(cell).length > 0));

  return { headers, missingHeaders, rows };
}

export function cellToString(value: SpreadsheetCell): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return normalizeWhitespace(String(value));
}

export function parseCsvMatrix(text: string): SpreadsheetCell[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function normalizeHistoricalDate(value: SpreadsheetCell): string | null {
  let date: Date | null = null;

  if (value instanceof Date) {
    date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  } else if (typeof value === "number" && Number.isFinite(value)) {
    date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
  } else {
    const raw = cellToString(value);
    const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    const localMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (isoMatch) {
      date = createUtcDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    } else if (localMatch) {
      date = createUtcDate(Number(localMatch[3]), Number(localMatch[2]), Number(localMatch[1]));
    }
  }

  if (!date || Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString().slice(0, 10);
  if (iso > new Date().toISOString().slice(0, 10)) return null;
  return iso;
}

function createUtcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function normalizeUnitCode(value: SpreadsheetCell): string {
  const raw = cellToString(value).toUpperCase().replace(/\s+/g, "");
  const match = raw.match(/^U-?(\d{1,3})$/);
  return match ? `U-${match[1].padStart(3, "0")}` : raw;
}

export function resolveHistoricalArticle(value: SpreadsheetCell) {
  const raw = comparable(cellToString(value));
  const match = raw.match(/(?:art(?:iculo)?\s*)?(\d{1,2})/);
  const number = match ? Number(match[1]) : null;
  return DISCIPLINARY_CATALOG.find((article) => article.id === `art${number}`) ?? null;
}

export function resolveHistoricalInciso(articleId: string, value: SpreadsheetCell): string | null {
  const match = cellToString(value).match(/(\d{1,2})/);
  if (!match) return null;
  const number = Number(match[1]);
  const article = DISCIPLINARY_CATALOG.find((item) => item.id === articleId);
  return article?.incisos.find((inciso) => incisoNumber(inciso) === number) ?? null;
}

export function normalizeHistoricalDocument(
  articleId: string,
  documentType: SpreadsheetCell,
  documentNumber: SpreadsheetCell,
): { value: string | null; typeMismatch: boolean } {
  const expectedType = articleId === "art9" ? "acta" : "memorandum";
  const receivedType = comparable(cellToString(documentType));
  const typeMismatch = receivedType.length > 0 && !receivedType.includes(expectedType);
  const raw = cellToString(documentNumber);
  const match = raw.match(/(\d{1,3})\s*[/\\-]\s*(\d{4})/);
  if (!match) return { value: null, typeMismatch };
  const value = `${getSanctionDocumentPrefix(articleId)}${match[1].padStart(3, "0")}/${match[2]}`;
  return { value: isValidSanctionDocumentNumber(articleId, value) ? value : null, typeMismatch };
}

export function buildHistoricalImportKey(input: {
  ci: string;
  fechaSancion: string;
  articulo: string;
  inciso: string;
  memorandum: string;
  unidadSancionId: string;
}): string {
  const source = [
    normalizeCi(input.ci),
    input.fechaSancion,
    articleNumber(input.articulo) ?? "",
    incisoNumber(input.inciso) ?? "",
    comparable(input.memorandum),
    input.unidadSancionId,
  ].join("|");
  return createHash("sha256").update(source).digest("hex");
}

export function normalizeHistoricalRow(params: {
  row: RawHistoricalSanctionRow;
  personalByCi: Map<string, PersonalImportLookup>;
  unitsById: Map<string, UnitImportLookup>;
}): HistoricalSanctionPreviewRow {
  const { row, personalByCi, unitsById } = params;
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const original = Object.fromEntries(
    Object.entries(row.values).map(([key, value]) => [key, cellToString(value)]),
  );
  const ci = normalizeCi(cellToString(row.values.ci));
  const personal = personalByCi.get(ci);
  const article = resolveHistoricalArticle(row.values.articulo);
  const inciso = article ? resolveHistoricalInciso(article.id, row.values.inciso) : null;
  const fechaSancion = normalizeHistoricalDate(row.values.fecha_sancion);
  const unitId = normalizeUnitCode(row.values.codigo_unidad);
  const unit = unitsById.get(unitId);

  if (!ci) errors.push({ field: "ci", message: "CI requerido", value: original.ci });
  if (!personal) errors.push({ field: "ci", message: "El CI no existe en personal", value: ci });
  if (!article) errors.push({ field: "articulo", message: "Articulo no reconocido", value: original.articulo });
  if (!inciso) errors.push({ field: "inciso", message: "Inciso inexistente para el articulo", value: original.inciso });
  if (!fechaSancion) errors.push({ field: "fecha_sancion", message: "Fecha invalida o futura", value: original.fecha_sancion });
  if (!unit) errors.push({ field: "codigo", message: "Codigo de unidad inexistente o inactivo", value: unitId });

  if (article && inciso && isRegimenDisciplinarioReferral(article.label, inciso)) {
    errors.push({
      field: "articulo",
      message: "Art. 12 inc. 1 corresponde a Regimen Disciplinario y no se importa como falta",
      value: original.articulo,
    });
  }

  const document = article
    ? normalizeHistoricalDocument(article.id, row.values.documento_sancion, row.values.numero_documento_sancion)
    : { value: null, typeMismatch: false };
  if (!document.value) {
    errors.push({
      field: "numero_documento_sancion",
      message: "Numero invalido; use numero/año, por ejemplo 007/2026",
      value: original.numero_documento_sancion,
    });
  }
  if (document.typeMismatch) {
    errors.push({
      field: "documento_sancion",
      message: article?.id === "art9" ? "Art. 9 requiere ACTA" : "Art. 10 y 11 requieren MEMORANDUM",
      value: original.documento_sancion,
    });
  }

  if (personal) {
    const gradoRaw = cellToString(row.values.grado);
    if (gradoRaw) {
      const grado = resolveRangoPolicial(gradoRaw);
      if (!grado.ok) {
        warnings.push({ field: "grado", message: "Grado historico no reconocido; no se modificara personal", value: gradoRaw });
      } else if (grado.gradoFinal !== personal.grado) {
        warnings.push({ field: "grado", message: `Grado actual: ${personal.grado}`, value: gradoRaw });
      }
    }

    const sourceName = comparable(`${cellToString(row.values.nombres)} ${cellToString(row.values.apellidos)}`);
    const currentName = comparable(personal.nombreCompleto.replace(personal.grado, ""));
    if (sourceName && currentName && sourceName !== currentName) {
      warnings.push({
        field: "nombres/apellidos",
        message: `Nombre actual: ${personal.nombreCompleto}`,
        value: `${original.nombres ?? ""} ${original.apellidos ?? ""}`.trim(),
      });
    }
  }

  if (unit && original.unidad && comparable(original.unidad) !== comparable(unit.nombre)) {
    warnings.push({
      field: "unidad",
      message: `Se utilizara el nombre oficial: ${unit.nombre}`,
      value: original.unidad,
    });
  }

  const rawReason = cellToString(row.values.motivo);
  const motivoNoDisponible = rawReason.length === 0;
  if (motivoNoDisponible) {
    warnings.push({
      field: "motivo",
      message: "Se registrara que el motivo no estaba disponible en la fuente historica",
    });
  }

  const rowKey = `row-${row.sourceRow}`;
  if (
    errors.length > 0 ||
    !personal ||
    !article ||
    !inciso ||
    !fechaSancion ||
    !unit ||
    !document.value
  ) {
    return { rowKey, sourceRow: row.sourceRow, status: "error", original, normalized: null, errors, warnings };
  }

  const normalized: HistoricalSanctionNormalized = {
    rowKey,
    sourceRow: row.sourceRow,
    ci,
    personalId: personal.id,
    nombreCompleto: personal.nombreCompleto,
    gradoActual: personal.grado,
    unidadActualId: personal.unidadId,
    unidadActualNombre: personal.unidadNombre,
    fechaSancion,
    articulo: article.label,
    inciso,
    memorandum: document.value,
    motivo: motivoNoDisponible ? HISTORICAL_MISSING_REASON : normalizeWhitespace(rawReason),
    motivoNoDisponible,
    unidadSancionId: unit.id,
    unidadSancionNombre: unit.nombre,
    unidadEfectivoHistoricaId: unit.id,
    unidadEfectivoHistoricaNombre: unit.nombre,
    importKey: buildHistoricalImportKey({
      ci,
      fechaSancion,
      articulo: article.label,
      inciso,
      memorandum: document.value,
      unidadSancionId: unit.id,
    }),
    isEscalada: isReincidenciaEscalada(article.label, inciso),
  };

  return {
    rowKey,
    sourceRow: row.sourceRow,
    status: warnings.length > 0 ? "warning" : "valid",
    original,
    normalized,
    errors,
    warnings,
  };
}

function dateMillis(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

function isWithinPreviousYear(previous: string, current: string): boolean {
  const diff = dateMillis(current) - dateMillis(previous);
  return diff >= 0 && diff <= 365 * 86_400_000;
}

export function applyHistoricalConsistencyChecks(
  rows: HistoricalSanctionPreviewRow[],
  existing: ExistingSanctionLookup[],
): void {
  const seenKeys = new Set(existing.map((item) => item.importKey).filter(Boolean) as string[]);
  const existingByPerson = new Map<string, ExistingSanctionLookup[]>();
  for (const item of existing.filter((entry) => entry.estado === "registrada")) {
    const list = existingByPerson.get(item.personalId) ?? [];
    list.push(item);
    existingByPerson.set(item.personalId, list);
  }

  const ordered = rows
    .filter((row) => row.normalized)
    .sort((a, b) => {
      const dateCompare = a.normalized!.fechaSancion.localeCompare(b.normalized!.fechaSancion);
      return dateCompare || a.sourceRow - b.sourceRow;
    });
  const acceptedByPerson = new Map<string, HistoricalSanctionPreviewRow[]>();

  for (const row of ordered) {
    const item = row.normalized!;
    if (seenKeys.has(item.importKey)) {
      row.status = "duplicate";
      row.errors.push({ field: "fila", message: "La sancion ya existe en Firebase o esta repetida en el archivo" });
      continue;
    }
    seenKeys.add(item.importKey);

    const importedPrevious = (acceptedByPerson.get(item.personalId) ?? []).filter(
      (candidate) =>
        candidate.normalized &&
        isWithinPreviousYear(candidate.normalized.fechaSancion, item.fechaSancion),
    );
    const existingPrevious = (existingByPerson.get(item.personalId) ?? []).filter(
      (candidate) => isWithinPreviousYear(candidate.fechaSancion, item.fechaSancion),
    );

    if (item.isEscalada) {
      const targetArticle = articleNumber(item.articulo);
      const allowedArticles = targetArticle === 10 ? [9] : targetArticle === 11 ? [9, 10] : [];
      const importedCandidates = importedPrevious.filter((candidate) =>
        allowedArticles.includes(articleNumber(candidate.normalized!.articulo) ?? 0),
      );
      const existingCandidates = existingPrevious.filter((candidate) =>
        allowedArticles.includes(articleNumber(candidate.articulo) ?? 0),
      );
      const candidateCount = importedCandidates.length + existingCandidates.length;

      if (candidateCount !== 1) {
        row.status = "error";
        row.errors.push({
          field: "inciso",
          message: candidateCount === 0
            ? "No se encontro una falta previa valida para esta reincidencia"
            : "Hay varios posibles origenes; registre esta reincidencia manualmente",
        });
        continue;
      }

      if (importedCandidates.length === 1) {
        item.originRowKey = importedCandidates[0].rowKey;
      } else {
        item.originFaltaId = existingCandidates[0].id;
      }
    } else if (isDirectReincidenciaControlSubject(item.articulo, item.inciso)) {
      const directImported = importedPrevious.find((candidate) =>
        candidate.normalized &&
        sameArticulo(candidate.normalized.articulo, item.articulo) &&
        incisoNumber(candidate.normalized.inciso) === incisoNumber(item.inciso),
      );
      const directExisting = existingPrevious.find(
        (candidate) =>
          sameArticulo(candidate.articulo, item.articulo) &&
          incisoNumber(candidate.inciso) === incisoNumber(item.inciso),
      );
      if (directImported || directExisting) {
        row.status = "error";
        row.errors.push({
          field: "inciso",
          message: "Existe la misma falta dentro de 365 dias; requiere revision por reincidencia",
        });
        continue;
      }
    }

    const accepted = acceptedByPerson.get(item.personalId) ?? [];
    accepted.push(row);
    acceptedByPerson.set(item.personalId, accepted);
  }
}

export function fileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function historicalImportEnabled(): boolean {
  return process.env.HISTORICAL_SANCTIONS_IMPORT_ENABLED !== "false";
}
