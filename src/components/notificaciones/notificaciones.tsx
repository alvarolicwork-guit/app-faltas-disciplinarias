"use client";
import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/hooks/use-api";
export function Notificaciones() {
  const { get, patch } = useApi();
  const [rows,setRows] = useState<{id:string;titulo:string;mensaje:string;createdAt:string;leida:boolean}[]>([]);
  const [error,setError] = useState("");
  const [unread,setUnread]=useState(0);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const load=useCallback(async(cursor?:string)=>{try{const page=await get<{data:typeof rows;unreadTotal:number;nextCursor:string|null}>("/api/notificaciones"+(cursor?"?cursor="+encodeURIComponent(cursor):""));setRows(current=>cursor?[...current,...page.data]:page.data);setUnread(page.unreadTotal);setNextCursor(page.nextCursor);setError("");}catch{setError("No se pudieron cargar las notificaciones");}},[get]);
  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer=window.setInterval(()=>void load(),60_000);return()=>window.clearInterval(timer);
  },[load]);
  async function mark(id:string) {try {await patch("/api/notificaciones",{id});await load();}catch{setError("No se pudo marcar la notificación");}}
  return <details className="mb-4 p-3 border rounded-xl bg-white"><summary>Notificaciones de la app ({unread} sin leer)</summary>{error&&<p role="alert">{error}</p>}{rows.map(r=><article key={r.id} className="p-2 border-b"><strong>{r.titulo}</strong><p>{r.mensaje}</p><small>{new Date(r.createdAt).toLocaleString("es-BO",{timeZone:"America/La_Paz"})}</small>{!r.leida&&<button className="ml-3 underline" onClick={()=>void mark(r.id)}>Marcar leída</button>}</article>)}{nextCursor&&<button className="mt-3 underline" onClick={()=>void load(nextCursor)}>Ver notificaciones anteriores</button>}</details>;
}
