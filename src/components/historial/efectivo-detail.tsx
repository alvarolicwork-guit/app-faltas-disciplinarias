"use client";

import { Icons } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/primitives";

type Falta = {
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
  reincidenciaOrigen?: {
    articuloBase?: string;
    incisoBase?: string;
    faltaReferenciaId?: string;
    fechaSancionReferencia?: string;
    memorandumReferencia?: string;
    unidadReferenciaNombre?: string;
  } | null;
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
              <Badge variant="danger" dot>Reincidencia Escalada</Badge>
            )}
          </div>
        </div>

        {/* Detail grid */}
        <div className="grid grid-cols-2 gap-3">
          <DetailField icon={Icons.fileText} label="Artículo" value={falta.articulo} />
          <DetailField icon={Icons.calendar} label="Fecha de Sanción" value={falta.fechaSancion} />
          <DetailField icon={Icons.clipboard} label="Memorándum" value={falta.memorandum} />
          <DetailField icon={Icons.building} label="Unidad" value={falta.unidadSancionNombre ?? "N/A"} />
        </div>

        {falta.tipoRegistro === "reincidencia_escalada" && falta.reincidenciaOrigen && (
          <div className="p-4 rounded-xl bg-[var(--warning-50)] border border-[var(--warning-100)]">
            <p className="text-xs font-medium text-[var(--warning-600)] mb-1.5 uppercase tracking-wider">
              Origen de Reincidencia
            </p>
            <p className="text-sm font-semibold text-[var(--navy-900)]">
              {falta.reincidenciaOrigen.articuloBase}
            </p>
            <p className="mt-1 text-sm text-[var(--navy-800)] leading-relaxed">
              {falta.reincidenciaOrigen.incisoBase}
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <DetailField
                icon={Icons.calendar}
                label="Fecha previa"
                value={String(falta.reincidenciaOrigen.fechaSancionReferencia ?? "N/A").slice(0, 10)}
              />
              <DetailField
                icon={Icons.clipboard}
                label="Memo previo"
                value={falta.reincidenciaOrigen.memorandumReferencia ?? "N/A"}
              />
              <DetailField
                icon={Icons.building}
                label="Unidad previa"
                value={falta.reincidenciaOrigen.unidadReferenciaNombre ?? "N/A"}
              />
            </div>
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
