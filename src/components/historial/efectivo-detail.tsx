"use client";

import { Icons } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/primitives";
import {
  formatArticleShort,
  formatIncisoShort,
  formatDisciplinaryDate,
  type ReincidenciaOrigenView,
} from "@/lib/domain/reincidencia-format";
import { SancionesRelacionadas } from "./sanciones-relacionadas";

type Falta = {
  conductaOrigen?: {articulo:string;inciso:string};
  cadenaId?:string;
  fechaInicioCadena?:string;
  fechaVencimientoCadena?:string;
  estadoPlazoCadena?:string;
  revisionCadena?:string|null;
  tipificacionOriginal?: { articulo: string; inciso: string };
  documentoRequiereRevision?: boolean;
  id: string;
  nombreCompleto: string;
  ci: string;
  articulo: string;
  inciso: string;
  fechaSancion: string;
  memorandum: string;
  motivo?: string;
  unidadSancionNombre?: string;
  reincidencia?: boolean;
  tipoRegistro?: string;
  reincidenciaOrigen?: ReincidenciaOrigenView;
  registradoPor?: string;
};

type EfectivoDetailProps = {
  falta: Falta | null;
  open: boolean;
  onClose: () => void;
};

function getArticleSeverity(articulo: string): { label: string; variant: "info" | "warning" | "danger" } {
  if (articulo.includes("Art. 11") || articulo.includes("art11")) return { label: "Falta Grave", variant: "danger" };
  if (articulo.includes("Art. 10") || articulo.includes("art10")) return { label: "Falta Media", variant: "warning" };
  return { label: "Falta Leve", variant: "info" };
}

export function EfectivoDetail({ falta, open, onClose }: EfectivoDetailProps) {
  if (!falta) return null;

  const severity = getArticleSeverity(falta.articulo);

  return (
    <Modal open={open} onClose={onClose} title="Detalle de Sanción" size="lg">
      <div className="space-y-5">
        {falta.tipificacionOriginal && <div className="p-3 border rounded-xl"><strong>Tipificación ajustada por cancelación extraordinaria de un antecedente</strong><p>Registro original: {falta.tipificacionOriginal.articulo} / {falta.tipificacionOriginal.inciso}</p><p>El documento original se conserva. Revise su correspondencia con la tipificación actual.</p></div>}
        {/* Header — person info */}
        <div className="flex items-start gap-4 p-4 rounded-2xl bg-gradient-to-r from-[var(--navy-50)] to-[var(--navy-100)]">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--gold-400)] to-[var(--gold-600)] flex items-center justify-center text-[var(--navy-900)] font-bold text-lg flex-shrink-0">
            {falta.nombreCompleto.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-[var(--navy-900)]">{falta.nombreCompleto}</h3>
            <p className="text-sm text-[var(--navy-500)]">CI: {falta.ci}</p>
            {falta.unidadSancionNombre && (
              <p className="text-xs text-[var(--navy-400)] mt-1">{falta.unidadSancionNombre}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge variant={severity.variant}>{severity.label}</Badge>
            {falta.reincidencia && (
              <Badge variant="danger" dot>Reincidencia</Badge>
            )}
          </div>
        </div>

        {falta.conductaOrigen && <div className="p-3 rounded-xl border space-y-1"><p><strong>Falta cometida:</strong> {falta.conductaOrigen.articulo} / {falta.conductaOrigen.inciso}</p><p><strong>Período para considerar la reincidencia:</strong> comienza el {formatDisciplinaryDate(falta.fechaInicioCadena)} y vence el {formatDisciplinaryDate(falta.fechaVencimientoCadena)}.</p><p>{falta.estadoPlazoCadena==="vencida"?"El período para considerar la reincidencia ha finalizado. Las sanciones permanecen en el historial.":"Registrar otra reincidencia no cambia este vencimiento."}</p></div>}
        {falta.revisionCadena && <p role="alert">Los antecedentes de esta falta requieren revisión: {falta.revisionCadena}</p>}
        {/* Detail grid */}
        <div className="grid grid-cols-2 gap-3">
          <DetailField icon={Icons.fileText} label="Artículo" value={falta.articulo} />
          <DetailField icon={Icons.calendar} label="Fecha de Sanción" value={falta.fechaSancion} />
          <DetailField icon={Icons.clipboard} label="Memorándum" value={falta.memorandum} />
          <DetailField icon={Icons.building} label="Unidad" value={falta.unidadSancionNombre ?? "N/A"} />
        </div>

        {falta.tipoRegistro === "reincidencia_escalada" && (
          <div className="p-4 rounded-xl bg-[var(--warning-50)] border border-[var(--warning-100)]">
            <p className="text-xs font-medium text-[var(--warning-600)] mb-1.5 uppercase tracking-wider">
              Sanción anterior relacionada
            </p>
            {falta.reincidenciaOrigen ? (
              <>
                <p className="text-sm font-semibold text-[var(--navy-900)]">
                  {formatArticleShort(falta.reincidenciaOrigen.articuloBase)} {formatIncisoShort(falta.reincidenciaOrigen.incisoBase)}
                </p>
                <p className="mt-1 text-sm text-[var(--navy-800)] leading-relaxed">
                  {falta.reincidenciaOrigen.incisoBase}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <DetailField
                    icon={Icons.calendar}
                    label="Fecha de la sanción anterior"
                    value={formatDisciplinaryDate(falta.reincidenciaOrigen.fechaSancionReferencia)}
                  />
                  <DetailField
                    icon={Icons.clipboard}
                    label="Documento de la sanción anterior"
                    value={falta.reincidenciaOrigen.memorandumReferencia ?? "N/A"}
                  />
                  <DetailField
                    icon={Icons.building}
                    label="Unidad que registró la sanción anterior"
                    value={falta.reincidenciaOrigen.unidadReferenciaNombre ?? "N/A"}
                  />
                </div>
                <div className="mt-3"><SancionesRelacionadas origin={falta.reincidenciaOrigen} /></div>
              </>
            ) : (
              <p className="text-sm text-[var(--warning-600)]">La sanción anterior relacionada no consta en el registro histórico.</p>
            )}
          </div>
        )}

        {/* Inciso full text */}
        <div className="p-4 rounded-xl bg-[var(--navy-50)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--navy-500)] mb-1.5 uppercase tracking-wider">Inciso Aplicado</p>
          <p className="text-sm text-[var(--navy-800)] leading-relaxed">{falta.inciso}</p>
        </div>

        {/* Motivo */}
        {falta.motivo && (
          <div className="p-4 rounded-xl bg-[var(--navy-50)] border border-[var(--border)]">
            <p className="text-xs font-medium text-[var(--navy-500)] mb-1.5 uppercase tracking-wider">Motivo Disciplinario</p>
            <p className="text-sm text-[var(--navy-800)] leading-relaxed">{falta.motivo}</p>
          </div>
        )}

        {/* Audit footer */}
        {falta.registradoPor && (
          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
            {Icons.user({ size: 14, className: "text-[var(--navy-400)]" })}
            <p className="text-xs text-[var(--navy-400)]">
              Registrado por: <span className="font-medium text-[var(--navy-600)]">{falta.registradoPor}</span>
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─── Helper ─── */
function DetailField({
  icon,
  label,
  value,
}: {
  icon: (p?: { size?: number; className?: string }) => React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-[var(--border)]">
      <span className="text-[var(--navy-400)] mt-0.5 flex-shrink-0">{icon({ size: 16 })}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-[var(--navy-400)] uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-[var(--navy-900)] truncate">{value}</p>
      </div>
    </div>
  );
}
