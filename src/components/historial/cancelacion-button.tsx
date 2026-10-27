"use client";
import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useDataCache } from "@/hooks/use-data-cache";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";

export function CancelacionButton({id,onComplete}:{id:string;onComplete:()=>void}) {
  const {get,post,del}=useApi(); const {sessionUser}=useAuth(); const toast=useToast(); const {invalidate}=useDataCache();
  const [open,setOpen]=useState(false); const [reason,setReason]=useState(""); const [busy,setBusy]=useState(false); const [accepted,setAccepted]=useState(false);
  const [impact,setImpact]=useState<{impactoHash:string;cambios:{id:string;articulo:string;inciso:string;documento:string;articuloAnterior:string;incisoAnterior:string;fechaInicioCadena:string;fechaVencimientoCadena:string}[]}|null>(null);
  async function start() { setBusy(true);setReason("");setAccepted(false);try {setImpact(sessionUser?.role==="super_admin"?await get(`/api/faltas/impacto?id=${encodeURIComponent(id)}`):null);setOpen(true);}catch(e){toast.error("Cancelación",e instanceof Error?e.message:"Error");}finally{setBusy(false);} }
  async function submit() {
    setBusy(true);try {
      const payload={id,motivo:reason.trim(),...(impact?{impactoHash:impact.impactoHash}:{})};
      const {confirmationId}=await post<{confirmationId:string}>("/api/confirmaciones",{action:"cancelar_sancion",payload,acepta:accepted});
      await del("/api/faltas",{payload,confirmationId});
      for(const scope of ["historial:","dashboard:","reportes:","personal:","solicitudes-baja:"])invalidate(scope);
      setOpen(false);toast.success("Sanción sin efecto");onComplete();
    }catch(e){toast.error("Cancelación",e instanceof Error?e.message:"Error");}finally{setBusy(false);}
  }
  return <span onClick={e=>e.stopPropagation()}><Button size="sm" variant="ghost" loading={busy} onClick={start}>Dejar sin efecto</Button><Modal open={open} onClose={()=>{if(!busy)setOpen(false);}} title={sessionUser?.role==="super_admin"?"Cancelación extraordinaria":"Cancelación de registro propio"} footer={<Button loading={busy} disabled={!accepted||reason.trim().length<8} onClick={submit}>Confirmar cancelación</Button>}><p>La sanción original se conserva. Esta acción y su motivo quedarán en auditoría.</p>{impact&&<div><p>{impact.cambios.length} registros posteriores bajarán un nivel:</p>{impact.cambios.map(c=><p key={c.id}>{c.documento}: {c.articuloAnterior} / {c.incisoAnterior} → {c.articulo} / {c.inciso}. Plazo: {c.fechaInicioCadena} hasta {c.fechaVencimientoCadena}</p>)}</div>}<Textarea label="Motivo obligatorio" value={reason} onChange={e=>setReason(e.target.value)}/><label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> Confirmo mi intención y el impacto descrito.</label></Modal></span>;
}
