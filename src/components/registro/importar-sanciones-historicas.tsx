"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Badge, Card } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useDataCache } from "@/hooks/use-data-cache";
import { useToast } from "@/hooks/use-toast";

type Issue = {
  field: string;
  message: string;
  value?: string;
};

type PreviewRow = {
  rowKey: string;
  sourceRow: number;
  status: "valid" | "warning" | "error" | "duplicate";
  original: Record<string, string>;
  normalized: {
    ci: string;
    nombreCompleto: string;
    fechaSancion: string;
    articulo: string;
    inciso: string;
    memorandum: string;
    unidadSancionId: string;
    unidadSancionNombre: string;
  } | null;
  errors: Issue[];
  warnings: Issue[];
};

type PreviewResult = {
  importId: string;
  fileName: string;
  status: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  canConfirm: boolean;
  rows: PreviewRow[];
};

type ImportSummary = {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  createdRows: number;
  createdAt: string | null;
  confirmedAt: string | null;
  revertedAt: string | null;
  revertReason: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  preview: "Analizada",
  processing: "Procesando",
  confirmed: "Confirmada",
  reverting: "Revirtiendo",
  reverted: "Revertida",
  failed: "Fallida",
};

function rowBadge(status: PreviewRow["status"]) {
  if (status === "valid") return <Badge variant="success">Válida</Badge>;
  if (status === "warning") return <Badge variant="warning">Advertencia</Badge>;
  if (status === "duplicate") return <Badge variant="danger">Duplicada</Badge>;
  return <Badge variant="danger">Error</Badge>;
}

function importBadge(status: string) {
  if (status === "confirmed") return <Badge variant="success">{STATUS_LABELS[status]}</Badge>;
  if (status === "preview") return <Badge variant="info">{STATUS_LABELS[status]}</Badge>;
  if (status === "reverted") return <Badge variant="default">{STATUS_LABELS[status]}</Badge>;
  if (status === "processing" || status === "reverting") {
    return <Badge variant="warning">{STATUS_LABELS[status]}</Badge>;
  }
  return <Badge variant="danger">{STATUS_LABELS[status] ?? status}</Badge>;
}

export function ImportarSancionesHistoricas() {
  const { get, post, upload } = useApi();
  const { invalidate } = useDataCache();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [revertingId, setRevertingId] = useState("");

  const refreshImports = useCallback(async () => {
    setLoadingList(true);
    try {
      const payload = await get<{ enabled: boolean; data: ImportSummary[] }>("/api/imports/faltas");
      setEnabled(payload.enabled);
      setImports(payload.data);
    } catch (error) {
      toast.error(
        "No se pudo consultar importaciones",
        error instanceof Error ? error.message : "Error desconocido",
      );
    } finally {
      setLoadingList(false);
    }
  }, [get, toast]);

  function handleFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
  }

  function escapeCsv(value: unknown): string {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  function saveRejectedRows(rows: PreviewRow[], fileName: string, importId: string) {
    const rejected = rows.filter((row) => row.status === "error" || row.status === "duplicate");
    if (rejected.length === 0) {
      toast.warning("Esta importación no tiene filas rechazadas.");
      return;
    }

    const headers = [
      "fila_original",
      "estado",
      "ci",
      "grado",
      "nombres",
      "apellidos",
      "fecha_sancion",
      "articulo",
      "inciso",
      "documento_sancion",
      "numero_documento_sancion",
      "unidad",
      "codigo",
      "motivos_rechazo",
    ];
    const lines = rejected.map((row) => {
      const issues = [...row.errors, ...row.warnings]
        .map((issue) => `${issue.field}: ${issue.message}${issue.value ? ` [${issue.value}]` : ""}`)
        .join(" | ");
      return [
        row.sourceRow,
        row.status,
        row.original.ci,
        row.original.grado,
        row.original.nombres,
        row.original.apellidos,
        row.original.fecha_sancion,
        row.original.articulo,
        row.original.inciso,
        row.original.documento_sancion,
        row.original.numero_documento_sancion,
        row.original.unidad,
        row.original.codigo_unidad,
        issues,
      ].map(escapeCsv).join(";");
    });
    const csv = `\uFEFF${headers.map(escapeCsv).join(";")}\r\n${lines.join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_");
    link.href = url;
    link.download = `errores_${baseName}_${importId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadStoredErrorReport(item: ImportSummary) {
    try {
      const result = await get<{
        fileName: string;
        rows: PreviewRow[];
      }>(`/api/imports/faltas/${item.id}/errors`);
      saveRejectedRows(result.rows, result.fileName, item.id);
    } catch (error) {
      toast.error(
        "No se pudo descargar el reporte",
        error instanceof Error ? error.message : "Error desconocido",
      );
    }
  }

  function toggleExpanded() {
    const nextValue = !expanded;
    setExpanded(nextValue);
    if (nextValue) void refreshImports();
  }

  async function analyzeFile() {
    if (!file) {
      toast.warning("Seleccione un archivo .xlsx o .csv");
      return;
    }
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await upload<PreviewResult>("/api/imports/faltas", formData);
      setPreview(result);
      await refreshImports();
      if (result.canConfirm) {
        toast.success("Archivo analizado", "La vista previa está lista para confirmar.");
      } else {
        toast.warning(
          "El archivo requiere correcciones",
          `${result.errorRows} errores y ${result.duplicateRows} duplicados.`,
        );
      }
    } catch (error) {
      toast.error("No se pudo analizar", error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setAnalyzing(false);
    }
  }

  async function confirmImport() {
    if (!preview?.canConfirm) return;
    const confirmation = window.prompt(
      `Se registrarán ${preview.validRows + preview.warningRows} sanciones. Escriba: IMPORTAR SANCIONES`,
    );
    if (confirmation !== "IMPORTAR SANCIONES") {
      toast.warning("Confirmación incorrecta. No se registró ninguna sanción.");
      return;
    }

    setConfirming(true);
    try {
      const result = await post<{ createdRows: number; skippedRows: number }>(
        `/api/imports/faltas/${preview.importId}/confirm`,
        { confirmation },
      );
      toast.success(
        "Importación confirmada",
        `${result.createdRows} sanciones registradas y ${result.skippedRows} filas rechazadas.`,
      );
      setPreview((current) => current ? { ...current, status: "confirmed", canConfirm: false } : null);
      setFile(null);
      invalidate("dashboard:");
      invalidate("historial:");
      invalidate("reportes:");
      await refreshImports();
    } catch (error) {
      toast.error(
        "No se pudo confirmar la importación",
        error instanceof Error ? error.message : "Error desconocido",
      );
    } finally {
      setConfirming(false);
    }
  }

  async function revertImport(item: ImportSummary) {
    const reason = window.prompt("Motivo de la reversión (mínimo 10 caracteres)");
    if (!reason || reason.trim().length < 10) {
      toast.warning("Debe registrar un motivo de al menos 10 caracteres.");
      return;
    }
    const confirmation = window.prompt(
      `Se anularán ${item.createdRows} sanciones de ${item.fileName}. Escriba: REVERTIR IMPORTACION`,
    );
    if (confirmation !== "REVERTIR IMPORTACION") {
      toast.warning("Confirmación incorrecta. La importación no fue revertida.");
      return;
    }

    setRevertingId(item.id);
    try {
      const result = await post<{ revertedRows: number }>(
        `/api/imports/faltas/${item.id}/revert`,
        { confirmation, reason: reason.trim() },
      );
      toast.success("Importación revertida", `${result.revertedRows} sanciones fueron anuladas.`);
      invalidate("dashboard:");
      invalidate("historial:");
      invalidate("reportes:");
      await refreshImports();
    } catch (error) {
      toast.error(
        "No se pudo revertir",
        error instanceof Error ? error.message : "Error desconocido",
      );
    } finally {
      setRevertingId("");
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[var(--navy-900)]">
              Importación histórica en bloque
            </h3>
            <Badge variant="warning">Temporal</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--navy-500)]">
            Analiza Excel o CSV antes de registrar sanciones. No modifica la unidad actual del efectivo.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleExpanded}
          icon={Icons.upload({ size: 15 })}
        >
          {expanded ? "Cerrar importador" : "Abrir importador"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-[var(--info-100)] bg-[var(--info-50)] p-4">
            <p className="text-sm font-semibold text-[var(--info-600)]">Carga controlada</p>
            <p className="mt-1 text-xs text-[var(--info-600)]">
              La primera etapa solo analiza. Firebase se modifica únicamente después de confirmar la vista previa.
              Formatos admitidos: .xlsx y .csv, máximo 5 MB y 2.000 filas.
            </p>
            <p className="mt-2 text-xs font-medium text-[var(--info-600)]">
              Las filas con error o duplicadas se omiten. Las válidas y con advertencia pueden importarse.
            </p>
          </div>

          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] px-4 text-center hover:border-[var(--gold-500)] hover:bg-[var(--gold-50)]">
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.csv"
              disabled={!enabled}
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
            {Icons.fileText({ size: 26, className: "text-[var(--navy-400)]" })}
            <p className="mt-2 text-sm font-medium text-[var(--navy-800)]">
              {file?.name ?? "Seleccione la planilla histórica"}
            </p>
            <p className="mt-1 text-xs text-[var(--navy-400)]">
              {file ? `${(file.size / 1024).toFixed(1)} KB` : "Excel .xlsx o CSV"}
            </p>
          </label>

          <Button
            className="w-full"
            variant="secondary"
            loading={analyzing}
            disabled={!file || !enabled}
            onClick={analyzeFile}
            icon={Icons.search({ size: 16 })}
          >
            Analizar archivo
          </Button>

          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  ["Total", preview.totalRows, "bg-[var(--navy-50)]"],
                  ["Válidas", preview.validRows, "bg-[var(--success-50)]"],
                  ["Advertencias", preview.warningRows, "bg-[var(--warning-50)]"],
                  ["Errores", preview.errorRows, "bg-[var(--danger-50)]"],
                  ["Duplicadas", preview.duplicateRows, "bg-[var(--danger-50)]"],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className={`rounded-xl p-3 text-center ${color}`}>
                    <p className="text-xl font-bold text-[var(--navy-900)]">{value}</p>
                    <p className="text-xs text-[var(--navy-500)]">{label}</p>
                  </div>
                ))}
              </div>

              <div className="max-h-96 overflow-auto rounded-xl border border-[var(--border)]">
                <table className="min-w-[1100px] w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--navy-50)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Fila</th>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-left">CI / efectivo</th>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Tipificación</th>
                      <th className="px-3 py-2 text-left">Documento</th>
                      <th className="px-3 py-2 text-left">Unidad</th>
                      <th className="px-3 py-2 text-left">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {preview.rows.map((row) => {
                      const messages = [...row.errors, ...row.warnings];
                      return (
                        <tr key={row.rowKey} className="align-top">
                          <td className="px-3 py-2 font-medium">{row.sourceRow}</td>
                          <td className="px-3 py-2">{rowBadge(row.status)}</td>
                          <td className="px-3 py-2">
                            <p className="font-semibold">{row.normalized?.ci ?? row.original.ci}</p>
                            <p className="text-[var(--navy-500)]">{row.normalized?.nombreCompleto ?? "Sin coincidencia"}</p>
                          </td>
                          <td className="px-3 py-2">{row.normalized?.fechaSancion ?? row.original.fecha_sancion}</td>
                          <td className="px-3 py-2">
                            <p>{row.normalized?.articulo.split(" - ")[0] ?? row.original.articulo}</p>
                            <p className="text-[var(--navy-500)]">{row.normalized?.inciso ?? row.original.inciso}</p>
                          </td>
                          <td className="px-3 py-2">{row.normalized?.memorandum ?? row.original.numero_documento_sancion}</td>
                          <td className="px-3 py-2">
                            <p>{row.normalized?.unidadSancionId ?? row.original.codigo_unidad}</p>
                            <p className="text-[var(--navy-500)]">{row.normalized?.unidadSancionNombre ?? row.original.unidad}</p>
                          </td>
                          <td className="px-3 py-2">
                            {messages.length === 0 ? (
                              <span className="text-[var(--success-600)]">Sin observaciones</span>
                            ) : (
                              <ul className="space-y-1">
                                {messages.map((issue, index) => (
                                  <li key={`${issue.field}-${index}`}>
                                    <strong>{issue.field}:</strong> {issue.message}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Button
                className="w-full"
                variant="primary"
                loading={confirming}
                disabled={!preview.canConfirm}
                onClick={confirmImport}
                icon={Icons.check({ size: 17 })}
              >
                Confirmar importación de {preview.validRows + preview.warningRows} sanciones
              </Button>
              {preview.errorRows + preview.duplicateRows > 0 && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => saveRejectedRows(preview.rows, preview.fileName, preview.importId)}
                  icon={Icons.fileText({ size: 16 })}
                >
                  Descargar reporte de {preview.errorRows + preview.duplicateRows} filas rechazadas
                </Button>
              )}
              {!preview.canConfirm && preview.status !== "confirmed" && (
                <p className="text-xs text-[var(--danger-600)]">
                  No existen filas válidas para confirmar. Descargue el reporte y corrija la planilla.
                </p>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[var(--navy-900)]">Importaciones recientes</h4>
              <Button variant="ghost" size="sm" loading={loadingList} onClick={refreshImports}>
                Actualizar
              </Button>
            </div>
            <div className="mt-3 overflow-auto rounded-xl border border-[var(--border)]">
              <table className="min-w-[760px] w-full text-xs">
                <thead className="bg-[var(--navy-50)]">
                  <tr>
                    <th className="px-3 py-2 text-left">Archivo</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-left">Filas</th>
                    <th className="px-3 py-2 text-left">Creadas</th>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {imports.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-[var(--navy-400)]">
                        Sin importaciones registradas.
                      </td>
                    </tr>
                  ) : imports.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium">{item.fileName}</td>
                      <td className="px-3 py-2">{importBadge(item.status)}</td>
                      <td className="px-3 py-2">{item.totalRows}</td>
                      <td className="px-3 py-2">{item.createdRows}</td>
                      <td className="px-3 py-2">
                        {item.createdAt ? new Date(item.createdAt).toLocaleString("es-BO") : "N/A"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                        {item.errorRows + item.duplicateRows > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadStoredErrorReport(item)}
                            icon={Icons.fileText({ size: 14 })}
                          >
                            Reporte
                          </Button>
                        )}
                        {item.status === "confirmed" && (
                          <Button
                            variant="danger"
                            size="sm"
                            loading={revertingId === item.id}
                            onClick={() => revertImport(item)}
                            icon={Icons.alertTriangle({ size: 14 })}
                          >
                            Revertir
                          </Button>
                        )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
