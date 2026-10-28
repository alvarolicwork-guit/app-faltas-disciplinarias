"use client";

import { formatDisciplinaryDate, type ReincidenciaOrigenView } from "@/lib/domain/reincidencia-format";
import { SancionesRelacionadas } from "./sanciones-relacionadas";
import { boliviaDateTime } from "@/lib/domain/audit-report";

export type SancionView = {
  id: string;
  personalId?: string;
  nombreCompleto?: string;
  ci?: string;
  articulo: string;
  inciso: string;
  fechaSancion: string | null;
  createdAt?: string;
  estado?: string;
  memorandum?: string;
  motivo?: string;
  unidadId?: string;
  unidadSancionNombre?: string;
  unidadNombre?: string;
  conductaOrigen?: { articulo: string; inciso: string };
  reincidencia?: boolean;
  tipoRegistro?: string;
  reincidenciaOrigen?: ReincidenciaOrigenView;
  fechaInicioCadena?: string;
  fechaVencimientoCadena?: string;
  estadoPlazoCadena?: string;
  revisionCadena?: string | null;
  tipificacionOriginal?: { articulo: string; inciso: string };
  documentoRequiereRevision?: boolean;
  createdBy?: { uid?: string; email?: string; nombreCompleto?: string };
  registradoPor?: string;
  anulacion?: { motivoEliminacion?: string; motivoResolucion?: string };
  puedeSolicitarCancelacion?: boolean;
  puedeCancelarDirectamente?: boolean;
  habilitacionAntecedentes?: {rechazosExpresos?: {antecedenteId:string;solicitudId:string;resueltaEl:string}[]};
};

export function ContenidoSancion({ row }: { row: SancionView }) {
  return <div className="space-y-2 text-sm break-words">
    <p><strong>Sanción registrada:</strong> {row.articulo} / {row.inciso}</p>
    <p><strong>{row.conductaOrigen ? "Falta cometida" : "Detalle registrado"}:</strong> {row.conductaOrigen ? `${row.conductaOrigen.articulo} / ${row.conductaOrigen.inciso}` : row.inciso}</p>
    <p><strong>Documento:</strong> {row.memorandum || "No registrado"}</p>
    <p><strong>Fecha de sanción:</strong> {formatDisciplinaryDate(row.fechaSancion)}</p>
    <p><strong>Unidad que registró la sanción:</strong> {row.unidadSancionNombre || row.unidadNombre || "No registrada"}</p>
    <p><strong>Motivo disciplinario:</strong> {row.motivo || "No registrado"}</p>
    <p><strong>Registrada por:</strong> {row.createdBy?.nombreCompleto || row.createdBy?.email || row.registradoPor || row.createdBy?.uid || "No registrado"}</p>
    {row.fechaVencimientoCadena && <p><strong>Período para considerar la reincidencia:</strong> comienza el {formatDisciplinaryDate(row.fechaInicioCadena)} y vence el {formatDisciplinaryDate(row.fechaVencimientoCadena)}.{row.estadoPlazoCadena === "vencida" && " Período finalizado."}</p>}
    {row.tipificacionOriginal && <div className="rounded-xl border p-3"><strong>Sanción antes del ajuste por cancelación de un antecedente:</strong><p>{row.tipificacionOriginal.articulo} / {row.tipificacionOriginal.inciso}</p><p>El documento original se conserva. Revise su correspondencia con la sanción actual.</p></div>}
    {row.documentoRequiereRevision && <p role="alert">El documento requiere revisión por el ajuste de la sanción.</p>}
    {row.revisionCadena && <p role="alert">Los antecedentes requieren revisión: {row.revisionCadena}</p>}
    {row.estado === "anulada" && <p><strong>Motivo para dejarla sin efecto:</strong> {row.anulacion?.motivoEliminacion || "No consta en este registro"}</p>}
    {row.anulacion?.motivoResolucion && <p><strong>Motivo de la resolución:</strong> {row.anulacion.motivoResolucion}</p>}
    {row.habilitacionAntecedentes?.rechazosExpresos?.map(e => <p key={e.antecedenteId}><strong>Habilitación al registrar:</strong> el rechazo de la solicitud del antecedente el {boliviaDateTime(e.resueltaEl)} permitió registrar esta sanción antes de completar los siete días de espera.</p>)}
    {row.reincidenciaOrigen ? <SancionesRelacionadas origin={row.reincidenciaOrigen} /> : row.tipoRegistro === "reincidencia_escalada" ? <p>La sanción anterior relacionada no consta en el registro histórico.</p> : null}
  </div>;
}
