import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHistoricalConsistencyChecks,
  mapSpreadsheetRows,
  normalizeHistoricalDate,
  normalizeHistoricalDocument,
  normalizeHistoricalRow,
  normalizeUnitCode,
  parseCsvMatrix,
  type PersonalImportLookup,
  type UnitImportLookup,
} from "@/lib/imports/historical-sanctions";

test("detecta encabezados institucionales y CSV con punto y coma", () => {
  const matrix = parseCsvMatrix(
    "N°;ci;fecha_sancion;articulo;inciso;documento_sancion;número de documento de sanción;codigo\n" +
      "1;3539879;12/3/2026;ART. 10;NUM. 10;MEMORANDUM;7/2026;U-44\n",
  );
  const mapped = mapSpreadsheetRows(matrix);
  assert.deepEqual(mapped.missingHeaders, []);
  assert.equal(mapped.rows.length, 1);
  assert.equal(mapped.rows[0].values.numero_documento_sancion, "7/2026");
});

test("normaliza fechas institucionales y rechaza fechas inexistentes", () => {
  assert.equal(normalizeHistoricalDate("12/3/2026"), "2026-03-12");
  assert.equal(normalizeHistoricalDate("09-04-2026"), "2026-04-09");
  assert.equal(normalizeHistoricalDate("31/2/2026"), null);
});

test("normaliza codigo de unidad y documento", () => {
  assert.equal(normalizeUnitCode("u-44"), "U-044");
  assert.equal(
    normalizeHistoricalDocument("art10", "MEMORANDUM", "7/2026").value,
    "Memorándum-007/2026",
  );
  assert.equal(
    normalizeHistoricalDocument("art9", "ACTA", "06/2026").value,
    "Acta-006/2026",
  );
});

test("crea vista previa valida sin modificar datos actuales del personal", () => {
  const personal: PersonalImportLookup = {
    id: "personal-1",
    ci: "3539879",
    nombreCompleto: "Cap. Marcelo Edwin Jimenez Machaca",
    grado: "Cap.",
    nombres: "Marcelo Edwin",
    apellidos: "Jimenez Machaca",
    unidadId: "U-001",
    unidadNombre: "COMANDO DEPARTAMENTAL",
  };
  const unit: UnitImportLookup = {
    id: "U-044",
    nombre: "BATALLON DE SEGURIDAD FISICA ESTATAL",
    estado: "activa",
  };
  const mapped = mapSpreadsheetRows([
    ["ci", "grado", "nombres", "apellidos", "fecha_sancion", "articulo", "inciso", "documento_sancion", "número de documento de sanción", "motivo", "UNIDAD", "codigo"],
    ["3539879", "CAP.", "MARCELO EDWIN", "JIMENEZ MACHACA", "12/3/2026", "ART. 10", "NUM. 10", "MEMORANDUM", "7/2026", "", "BAT. SEG. FIS. ESTATAL", "U-44"],
  ]);
  const row = normalizeHistoricalRow({
    row: mapped.rows[0],
    personalByCi: new Map([[personal.ci, personal]]),
    unitsById: new Map([[unit.id, unit]]),
  });

  assert.equal(row.errors.length, 0);
  assert.equal(row.status, "warning");
  assert.equal(row.normalized?.memorandum, "Memorándum-007/2026");
  assert.equal(row.normalized?.unidadActualId, "U-001");
  assert.equal(row.normalized?.unidadSancionId, "U-044");
  assert.equal(row.normalized?.motivoNoDisponible, true);
});

test("marca duplicados dentro del mismo archivo", () => {
  const base = {
    rowKey: "row-2",
    sourceRow: 2,
    status: "valid" as const,
    original: {},
    errors: [],
    warnings: [],
    normalized: {
      rowKey: "row-2",
      sourceRow: 2,
      ci: "3539879",
      personalId: "personal-1",
      nombreCompleto: "Cap. Persona",
      gradoActual: "Cap.",
      unidadActualId: "U-001",
      unidadActualNombre: "COMANDO DEPARTAMENTAL",
      fechaSancion: "2026-03-12",
      articulo: "Art. 10 - Llamada de atencion escrita y arresto de 1 a 3 dias",
      inciso: "10. No presentarse.",
      memorandum: "Memorándum-007/2026",
      motivo: "Sin detalle de motivo en la fuente historica.",
      motivoNoDisponible: true,
      unidadSancionId: "U-044",
      unidadSancionNombre: "BATALLON DE SEGURIDAD FISICA ESTATAL",
      unidadEfectivoHistoricaId: "U-044",
      unidadEfectivoHistoricaNombre: "BATALLON DE SEGURIDAD FISICA ESTATAL",
      importKey: "same-key",
      isEscalada: false,
    },
  };
  const second = structuredClone(base);
  second.rowKey = "row-3";
  second.sourceRow = 3;
  second.normalized!.rowKey = "row-3";
  second.normalized!.sourceRow = 3;
  const rows = [base, second];

  applyHistoricalConsistencyChecks(rows, []);
  assert.equal(rows[0].status, "valid");
  assert.equal(rows[1].status, "duplicate");
});
