"use client";

import { useCallback, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useUnidades } from "@/hooks/use-unidades";
import { RANGOS_POLICIALES } from "@/lib/domain/rangos-policiales";
import { canBulkImportPersonal } from "@/lib/domain/roles";

type ImportResult = {
  importId?: string;
  totalRows: number;
  okRows: number;
  createdRows?: number;
  updatedRows?: number;
  errorRows: number;
  errors: { row: number; field: string; message: string; value?: string; suggestion?: string }[];
};

type CsvParseResult = {
  delimiter: "," | ";";
  headers: string[];
  rows: Record<string, string>[];
  preview: string[][];
};

const EXPECTED_HEADERS = ["ci", "grado", "nombres", "apellidos", "sexo", "codigo_unidad", "estado"];

function normalizeHeader(raw: string): string {
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (cleaned === "codigo_unidad" || cleaned === "codigo_unidad_" || cleaned === "codigounidad") return "codigo_unidad";
  if (cleaned === "exp." || cleaned === "exp" || cleaned === "sexo") return "sexo";
  if (cleaned === "n°" || cleaned === "no" || cleaned === "n") return "n";
  return cleaned;
}

function splitCsvLine(line: string, delimiter: "," | ";"): string[] {
  return line.split(delimiter).map((cell) => cell.trim());
}

function scoreDelimiter(headerLine: string, delimiter: "," | ";"): number {
  const parts = splitCsvLine(headerLine, delimiter).map(normalizeHeader);
  let score = 0;
  for (const expected of EXPECTED_HEADERS) {
    if (parts.includes(expected)) score += 2;
  }
  score += parts.length;
  return score;
}

function detectDelimiter(lines: string[]): "," | ";" {
  const firstNonEmpty = lines.find((line) => line.trim().length > 0) ?? "";
  const scoreComma = scoreDelimiter(firstNonEmpty, ",");
  const scoreSemicolon = scoreDelimiter(firstNonEmpty, ";");
  return scoreSemicolon > scoreComma ? ";" : ",";
}

function parseCsvAuto(text: string): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { delimiter: ",", headers: [], rows: [], preview: [] };
  }

  const delimiter = detectDelimiter(lines);
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map(normalizeHeader);

  const preview = lines.slice(0, 6).map((line) => splitCsvLine(line, delimiter));

  const rows = lines.slice(1).map((line) => {
    const cols = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });

  return { delimiter, headers, rows, preview };
}

export function ImportPage() {
  const { post, apiFetch } = useApi();
  const { sessionUser } = useAuth();
  const toast = useToast();
  const { getUnitName, unitOptions } = useUnidades();
  const [file, setFile] = useState<File | null>(null);
  const [unidadId] = useState("GLOBAL");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [detectedDelimiter, setDetectedDelimiter] = useState<"," | ";" | null>(null);
  const isGlobalImport = true;
  const canUseBulkImport = sessionUser ? canBulkImportPersonal(sessionUser.role) : false;
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPersonal, setNewPersonal] = useState({
    ci: "",
    grado: "",
    nombres: "",
    apellidos: "",
    sexo: "Masculino",
    unidadId: "",
    estado: "activo",
  });

  const handleFile = useCallback((f: File | null) => {
    setFile(f);
    setResult(null);
    setPreview([]);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsvAuto(text);
      setDetectedDelimiter(parsed.delimiter);
      setPreview(parsed.preview);
    };
    reader.readAsText(f);
  }, []);

  async function handleImport() {
    if (!file || !unidadId) {
      toast.warning("Seleccione archivo y unidad");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCsvAuto(text);
      setDetectedDelimiter(parsed.delimiter);

      const requiredHeaders = ["ci", "grado", "nombres", "apellidos", "sexo", "codigo_unidad"];
      const missingHeaders = requiredHeaders.filter((header) => !parsed.headers.includes(header));
      if (missingHeaders.length > 0) {
        toast.error(
          "Columnas faltantes",
          `Faltan columnas requeridas: ${missingHeaders.join(", ")}. Revise el encabezado del CSV.`,
        );
        return;
      }

      const rows = parsed.rows;

      const unidadNombre = isGlobalImport ? "GLOBAL" : getUnitName(unidadId);
      const payload = { unidadId, unidadNombre, rows };
      const res = await post<ImportResult>("/api/imports/personal", payload);
      setResult(res);
      toast.success("Importación completada", `${res.okRows} registros exitosos, ${res.errorRows} errores`);
    } catch (err) {
      toast.error("Error", err instanceof Error ? err.message : "No se pudo importar");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePersonal() {
    if (!newPersonal.unidadId) {
      toast.warning("Seleccione la unidad destino");
      return;
    }
    setCreating(true);
    try {
      await post("/api/personal", {
        ...newPersonal,
        unidadNombre: getUnitName(newPersonal.unidadId),
      });
      toast.success("Efectivo creado", "El nuevo efectivo fue registrado correctamente.");
      setNewPersonal({
        ci: "",
        grado: "",
        nombres: "",
        apellidos: "",
        sexo: "Masculino",
        unidadId: "",
        estado: "activo",
      });
    } catch (err) {
      toast.error("Error", err instanceof Error ? err.message : "No se pudo crear el efectivo");
    } finally {
      setCreating(false);
    }
  }

  function handlePrintErrorsReport() {
    if (!result || result.errorRows === 0) return;
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) {
      toast.warning("No se pudo abrir la ventana de impresión");
      return;
    }

    const now = new Date();
    const rows = result.errors
      .map(
        (err) => `
          <tr>
            <td>${err.row}</td>
            <td>${err.field}</td>
            <td>${err.value ?? ""}</td>
            <td>${err.message}</td>
          </tr>
        `,
      )
      .join("");

    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Informe de Errores de Importación</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
            h1 { margin: 0; font-size: 20px; }
            h2 { margin: 6px 0 18px; font-size: 14px; color: #4b5563; font-weight: 500; }
            .meta { margin: 12px 0 18px; font-size: 13px; }
            .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
            .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
            .label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
            .value { font-size: 16px; font-weight: 700; margin-top: 3px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; font-weight: 700; }
            .footer { margin-top: 16px; color: #6b7280; font-size: 11px; }
          </style>
        </head>
        <body>
          <h1>Informe de Errores de Importación de Personal</h1>
          <h2>Control Disciplinario - Comando Departamental de Policía Chuquisaca</h2>
          <div class="meta">Fecha: ${now.toLocaleString("es-BO")}</div>
          <div class="grid">
            <div class="card"><div class="label">Total Filas</div><div class="value">${result.totalRows}</div></div>
            <div class="card"><div class="label">Creados</div><div class="value">${result.createdRows ?? 0}</div></div>
            <div class="card"><div class="label">Actualizados</div><div class="value">${result.updatedRows ?? 0}</div></div>
            <div class="card"><div class="label">Errores</div><div class="value">${result.errorRows}</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Fila</th>
                <th>Campo</th>
                <th>Valor recibido</th>
                <th>Descripción de error</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="footer">Import ID: ${result.importId ?? "N/A"}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  async function handleResetImportData() {
    const reason = window.prompt("Motivo de la eliminación masiva (mínimo 10 caracteres)");
    if (!reason || reason.trim().length < 10) {
      toast.warning("Debe ingresar un motivo válido de al menos 10 caracteres.");
      return;
    }

    const confirmation = window.prompt(
      "Esta acción eliminará TODO el personal cargado, CI registry y logs de importación. Escriba: ELIMINAR TODO",
    );
    if (confirmation !== "ELIMINAR TODO") {
      toast.warning("Confirmación no válida. Operación cancelada.");
      return;
    }

    setResetting(true);
    try {
      const res = await apiFetch<{ deletedPersonal: number; deletedRegistry: number; deletedImports: number }>(
        "/api/imports/personal",
        {
          method: "DELETE",
          body: JSON.stringify({
            confirmation,
            reason: reason.trim(),
            scope: "personal_import_reset",
          }),
        },
      );

      setResult(null);
      setPreview([]);
      setFile(null);
      toast.success(
        "Base reiniciada",
        `Personal: ${res.deletedPersonal}, CI Registry: ${res.deletedRegistry}, Importaciones: ${res.deletedImports}`,
      );
    } catch (err) {
      toast.error("Error", err instanceof Error ? err.message : "No se pudo reiniciar la base");
    } finally {
      setResetting(false);
    }
  }

  const rangoOptions = RANGOS_POLICIALES.map((rango) => ({ value: rango, label: rango }));

  return (
    <div className="space-y-4 animate-fade-in">
      {canUseBulkImport && (
        <Card className="p-5">
        <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Importar Personal desde CSV/Excel</h3>

        <div className="p-3 rounded-xl bg-[var(--info-50)] border border-[var(--info-100)]">
          <p className="text-sm font-medium text-[var(--navy-800)]">Modo de importación: Global departamental</p>
          <p className="text-xs text-[var(--info-600)] mt-1">
            Cada fila debe contener exactamente estas columnas: <strong>ci</strong>, <strong>grado</strong>, <strong>nombres</strong>, <strong>apellidos</strong>, <strong>sexo</strong>, <strong>codigo_unidad</strong> y opcionalmente <strong>estado</strong>.
          </p>
          <p className="text-xs text-[var(--info-600)] mt-1">
            Formato por fila: <strong>CI único</strong> (sin repetir), <strong>grado oficial del catálogo</strong>, nombres y apellidos, sexo (Masculino/Femenino), y código de unidad válido (ej: U-001).
          </p>
          <p className="text-xs text-[var(--info-700)] mt-2 font-medium">
            Ejemplo de fila CSV: <span className="font-mono">1234567,Sgto. 1ro.,Juan,Campos,Masculino,U-001,activo</span>
          </p>
          {detectedDelimiter && (
            <p className="text-xs text-[var(--info-700)] mt-1">
              Delimitador detectado automáticamente: <strong>{detectedDelimiter}</strong>
            </p>
          )}
        </div>

        {/* Dropzone */}
        <div className="mt-4">
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-[var(--border)] rounded-2xl cursor-pointer hover:border-[var(--gold-500)] hover:bg-[var(--gold-50)] transition-all">
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            {file ? (
              <div className="text-center">
                {Icons.fileText({ size: 28, className: "text-[var(--gold-500)] mx-auto mb-2" })}
                <p className="text-sm font-medium text-[var(--navy-800)]">{file.name}</p>
                <p className="text-xs text-[var(--navy-400)]">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="text-center">
                {Icons.upload({ size: 28, className: "text-[var(--navy-300)] mx-auto mb-2" })}
                <p className="text-sm text-[var(--navy-500)]">Arrastre un archivo o haga clic para seleccionar</p>
                <p className="text-xs text-[var(--navy-400)] mt-1">CSV o Excel (.xlsx, .xls)</p>
              </div>
            )}
          </label>
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="mt-4 overflow-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--navy-50)]">
                <tr>{preview[0]?.map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold text-[var(--navy-500)]">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {preview.slice(1).map((row, ri) => (
                  <tr key={ri}>{row.map((c, ci) => <td key={ci} className="px-3 py-2 text-[var(--navy-700)]">{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button className="w-full mt-4" variant="primary" size="lg" loading={busy} disabled={!file || !unidadId} onClick={handleImport} icon={Icons.upload({ size: 18 })}>
          Importar Personal
        </Button>
        <Button
          className="w-full mt-3"
          variant="outline"
          size="md"
          loading={resetting}
          onClick={handleResetImportData}
          icon={Icons.trash({ size: 16 })}
        >
          Eliminar Todo el Personal Cargado
        </Button>
        <p className="text-xs text-[var(--danger-600)] mt-2">
          Acción restringida a super admin. Requiere confirmación explícita y motivo de auditoría.
        </p>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="text-base font-bold text-[var(--navy-900)] mb-2">Nuevo Efectivo (Ingreso Individual)</h3>
        <p className="text-sm text-[var(--navy-500)] mb-4">Alta manual para personal incorporado al departamento.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="CI" value={newPersonal.ci} onChange={(e) => setNewPersonal((p) => ({ ...p, ci: e.target.value }))} required />
          <Select
            label="Grado"
            value={newPersonal.grado}
            onChange={(e) => setNewPersonal((p) => ({ ...p, grado: e.target.value }))}
            options={rangoOptions}
            placeholder="Seleccionar grado"
            required
          />
          <Input label="Nombres" value={newPersonal.nombres} onChange={(e) => setNewPersonal((p) => ({ ...p, nombres: e.target.value }))} required />
          <Input label="Apellidos" value={newPersonal.apellidos} onChange={(e) => setNewPersonal((p) => ({ ...p, apellidos: e.target.value }))} required />
          <Select label="Sexo" value={newPersonal.sexo} onChange={(e) => setNewPersonal((p) => ({ ...p, sexo: e.target.value }))} options={[{ value: "Masculino", label: "Masculino" }, { value: "Femenino", label: "Femenino" }]} />
          <Select label="Unidad destino" value={newPersonal.unidadId} onChange={(e) => setNewPersonal((p) => ({ ...p, unidadId: e.target.value }))} options={unitOptions} placeholder="Seleccionar unidad" required />
        </div>
        <Button className="w-full mt-4" variant="primary" loading={creating} onClick={handleCreatePersonal} icon={Icons.plus({ size: 18 })}>Registrar Efectivo</Button>
      </Card>

      {/* Results */}
      {result && (
        <Card className="p-5 animate-fade-in-up">
          <h3 className="text-base font-bold text-[var(--navy-900)] mb-3">Resultado de Importación</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-[var(--navy-50)] text-center">
              <p className="text-2xl font-bold text-[var(--navy-900)]">{result.totalRows}</p>
              <p className="text-xs text-[var(--navy-400)]">Total filas</p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--success-50)] text-center">
              <p className="text-2xl font-bold text-[var(--success-600)]">{result.okRows}</p>
              <p className="text-xs text-[var(--success-600)]">Exitosos</p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--danger-50)] text-center">
              <p className="text-2xl font-bold text-[var(--danger-600)]">{result.errorRows}</p>
              <p className="text-xs text-[var(--danger-600)]">Errores</p>
            </div>
          </div>
          {(result.createdRows !== undefined || result.updatedRows !== undefined) && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-xl bg-[var(--info-50)] text-center">
                <p className="text-xl font-bold text-[var(--info-600)]">{result.createdRows ?? 0}</p>
                <p className="text-xs text-[var(--info-600)]">Creados</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--warning-50)] text-center">
                <p className="text-xl font-bold text-[var(--warning-600)]">{result.updatedRows ?? 0}</p>
                <p className="text-xs text-[var(--warning-600)]">Actualizados</p>
              </div>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="overflow-auto rounded-xl border border-[var(--danger-100)]">
              <div className="p-3 border-b border-[var(--danger-100)] bg-[var(--danger-50)] flex justify-end">
                <Button variant="outline" size="sm" onClick={handlePrintErrorsReport} icon={Icons.fileText({ size: 14 })}>
                  Imprimir Informe de Errores
                </Button>
              </div>
              <table className="min-w-full text-xs">
                <thead className="bg-[var(--danger-50)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--danger-600)]">Fila</th>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--danger-600)]">Campo</th>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--danger-600)]">Valor</th>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--danger-600)]">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--danger-100)]">
                  {result.errors.map((err, i) => (
                    <tr key={i}><td className="px-3 py-2">{err.row}</td><td className="px-3 py-2">{err.field}</td><td className="px-3 py-2">{err.value ?? ""}</td><td className="px-3 py-2">{err.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
