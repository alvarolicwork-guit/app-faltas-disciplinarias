"use client";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/primitives";
import { ContenidoSancion, type SancionView } from "./contenido-sancion";
export function EfectivoDetail({ falta, open, onClose }: { falta: SancionView | null; open: boolean; onClose: () => void }) {
  if (!falta) return null;
  return <Modal open={open} onClose={onClose} title="Detalle de la sanción" size="lg">
    <div className="space-y-4">
      <div className="rounded-xl border bg-[var(--navy-50)] p-3">
        <h3 className="font-bold">{falta.nombreCompleto || "Nombre no registrado"}</h3>
        <p>CI: {falta.ci || "No registrada"}</p>
        <Badge variant={falta.estado === "registrada" ? "success" : "default"}>{falta.estado === "anulada" ? "Sin efecto" : falta.estado === "registrada" ? "Registrada" : "Estado no registrado"}</Badge>
        {(falta.reincidencia || falta.tipoRegistro === "reincidencia_escalada") && <Badge variant="warning">Reincidencia</Badge>}
      </div>
      <ContenidoSancion row={falta} />
    </div>
  </Modal>;
}
