"use client";
import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { useUnidades } from "@/hooks/use-unidades";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { csvCell, auditEventLabel, auditStateLabel, boliviaDateTime } from "@/lib/domain/audit-report";

export function AuditoriaPage() {
  const { get, del, post } = useApi();
  const { sessionUser } = useAuth();
  const { unitOptions } = useUnidades();
  const toast = useToast();
  const [tipo, setTipo] = useState("sanciones");
  const [mes, setMes] = useState("");
  const [unidad, setUnidad] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [groups, setGroups] = useState<{mes:string;unidad:string;registros:number;sinEfecto:number;solicitudes:number;ajustes:number}[]>([]);
  if (sessionUser?.role !== "super_admin") return <p>Acceso exclusivo al superadministrador.</p>;
  async function load() {
    setBusy(true);
    try { const res = await get<{data:Record<string,unknown>[];grupos:typeof groups}>(`/api/auditoria?${new URLSearchParams({tipo,mes,unidadId:unidad})}`); setRows(res.data); setGroups(res.grupos); setLoaded(true); }
    catch(e) { toast.error("Auditoría", e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }
  function exportCsv() {
    const cols = [...new Set(rows.flatMap(r=>Object.keys(r)))];
    const blob = new Blob(["\uFEFF", [cols.map(csvCell).join(","), ...rows.map(r=>cols.map(c=>csvCell(r[c])).join(","))].join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=`auditoria-${tipo}-${mes||"todos"}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  async function cancel(id: string) {
    const motivo = window.prompt("Motivo de la cancelación extraordinaria (mínimo ocho caracteres)");
    if (!motivo || motivo.trim().length < 8) return;

    setBusy(true);
    try {
      const impact = await get<{impactoHash:string;cambios:{id:string;articulo:string;inciso:string;documento:string}[]}>(`/api/faltas/impacto?id=${encodeURIComponent(id)}`);
      const summary = impact.cambios.map(c=>`${c.documento}: ${c.articulo} / ${c.inciso}`).join("\n");
      if (!window.confirm(`Se dejará sin efecto solo la sanción elegida. ${impact.cambios.length} sanciones posteriores bajarán un nivel:\n${summary}\n¿Confirma esta acción y su motivo?`)) return;
      const payload = { id, motivo: motivo.trim(), impactoHash: impact.impactoHash };
      const { confirmationId } = await post<{confirmationId:string}>("/api/confirmaciones",{action:"cancelar_sancion",payload,acepta:true});
      await del("/api/faltas",{payload,confirmationId});
      toast.success("Sanción sin efecto"); await load();
    } catch(e) { toast.error("Cancelación",e instanceof Error?e.message:"Error"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4 p-4 bg-white rounded-xl"><h2 className="text-xl font-bold">Informes de auditoría</h2>
    <div className="flex flex-wrap gap-3"><label>Informe<select aria-label="Informe" value={tipo} onChange={e=>{setTipo(e.target.value);setLoaded(false);setRows([]);}}><option value="sanciones">Registro de sanciones</option><option value="cancelaciones">Cancelaciones y sanciones sin efecto</option></select></label>
    <label>Mes<input type="month" value={mes} onChange={e=>{setMes(e.target.value);setLoaded(false);}} /></label><label>Unidad<select value={unidad} onChange={e=>{setUnidad(e.target.value);setLoaded(false);}}><option value="">Todas</option>{unitOptions.map(u=><option key={u.value} value={u.value}>{u.label}</option>)}</select></label>
    <Button onClick={load} loading={busy}>Generar informe</Button><Button disabled={!loaded||busy} onClick={exportCsv}>Exportar CSV</Button><Button disabled={!loaded||busy} onClick={()=>window.print()}>Imprimir</Button></div>
    <p>Fechas de registro/resolución en America/La_Paz. {loaded?`${rows.length} filas. Los rechazos no son sanciones sin efecto.`:"Seleccione filtros y genere el informe."}</p>
    {loaded && <div className="overflow-auto"><table className="text-sm w-full"><thead><tr><th>Mes</th><th>Unidad</th><th>Registros</th><th>Sin efecto</th><th>Solicitudes</th><th>Ajustes</th></tr></thead><tbody>{groups.map(g=><tr key={`${g.mes}-${g.unidad}`}><td>{g.mes}</td><td>{g.unidad}</td><td>{g.registros}</td><td>{g.sinEfecto}</td><td>{g.solicitudes}</td><td>{g.ajustes}</td></tr>)}</tbody></table></div>}
    {loaded && <div className="overflow-auto"><table className="text-sm w-full"><thead><tr>{["Mes / unidad","Funcionario / documento","Evento / estado","Autor / motivo","Acción"].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.evento}-${r.id}-${i}`} className="border-b"><td>{String(r.mes)}<br/>{String(r.unidad??r.unidadId??"")}</td><td>{String(r.funcionario??"")}<br/>{String(r.documento??"")}<br/>Actual: {String(r.articuloActual??r.articulo??"")} {String(r.incisoActual??r.inciso??"")}<br/>Original: {String(r.articuloOriginal??r.articuloAnterior??"")} {String(r.incisoOriginal??r.incisoAnterior??"")}<br/>Falta cometida: {String(r.conductaOriginal??"")}<br/>Período para considerar la reincidencia: {String(r.inicioCadena??r.inicioActual??"")} – {String(r.vencimientoCadena??r.vencimientoActual??"")}{r.revisionCadena?<p className="text-red-700">Requiere revisión: {String(r.revisionCadena)}</p>:null}</td><td>{auditEventLabel(r.evento)} / {auditStateLabel(r.estado)}<br/>{boliviaDateTime(r.fecha)}{r.habilitacionAnticipada ? <p>Habilitación al registrar: {String(r.habilitacionAnticipada)}</p> : null}{r.evento === "solicitud" && <p>{r.causa === "decision" ? "Resolución del administrador" : r.causa === "vencimiento" ? "Cierre por vencimiento" : ""}<br/>{String(r.dispensaEspera ?? "")}</p>}</td><td>{String(r.actor??"")}<br/>{String(r.motivo??"")}<br/>{String(r.motivoResolucion??"")}</td><td>{r.evento==="registro"&&r.estado==="registrada"&&<Button disabled={busy} onClick={()=>cancel(String(r.id))}>Cancelación extraordinaria</Button>}</td></tr>)}</tbody></table></div>}
  </div>;
}
