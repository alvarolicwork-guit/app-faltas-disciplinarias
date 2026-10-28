import { annotateSanctions, registrationClassification } from "@/lib/server/chain-views";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { boliviaMonth, csvCell, boliviaDateTime, auditEventLabel, auditStateLabel } from "@/lib/domain/audit-report";
import { operationError } from "@/lib/server/operations";
import { DocumentData, Timestamp } from "firebase-admin/firestore";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (actor.role !== "super_admin") return NextResponse.json({ error: "Solo superadministrador" }, { status: 403 });
    const db = getAdminDb();
    const type = request.nextUrl.searchParams.get("tipo") ?? "sanciones";
    if (!["sanciones", "cancelaciones"].includes(type)) return NextResponse.json({ error: "Informe no válido" }, { status: 400 });
    const month = request.nextUrl.searchParams.get("mes") ?? "";
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
    const unit = request.nextUrl.searchParams.get("unidadId");
    const snap = await db.collection("faltas").get();
    const annotated = await annotateSanctions(db,snap.docs.map(d=>({...d.data(),id:d.id})));
    const rows: Record<string, unknown>[] = [];
    function iso(v: Timestamp | undefined) { return v?.toDate?.().toISOString() ?? ""; }
    function add(id: string, r: DocumentData, kind: string) {
      const date = iso(kind === "registro" ? r.createdAt : r.anulacion?.fecha);
      if ((unit && r.unidadId !== unit) || (month && (!date || boliviaMonth(date) !== month))) return;
      rows.push({ id, ...registrationClassification(r), conductaOriginal: r.conductaOrigen ? `${r.conductaOrigen.articulo} / ${r.conductaOrigen.inciso}` : "origen_no_verificable", cadenaId:r.cadenaId??"", raizHistoricaId:r.raizHistoricaId??"", raizVigenteId:r.raizVigenteId??"", inicioCadena:r.fechaInicioCadena??"", vencimientoCadena:r.fechaVencimientoCadena??"", plazoCadena:r.estadoPlazoCadena??"", revisionCadena:r.revisionCadena??"", evento: kind, mes: date ? boliviaMonth(date) : "sin_fecha_verificable", fecha: date, unidadId: r.unidadId, unidad: r.unidadSancionNombre ?? r.unidadNombre, ci: r.ci, funcionario: r.nombreCompleto, articulo: r.articulo, inciso: r.inciso, documento: r.memorandum, fechaSancion: iso(r.fechaSancion).slice(0, 10), estado: r.estado, actor: kind === "registro" ? r.createdBy?.email : r.anulacion?.anuladaPor?.email, autorUid: kind === "registro" ? r.createdBy?.uid : r.anulacion?.anuladaPor?.uid, motivo: kind === "registro" ? r.motivo : r.anulacion?.motivoEliminacion, via: r.anulacion?.via ?? "", antecedenteId: r.reincidenciaOrigen?.faltaReferenciaId ?? "", confirmacionId: (kind === "registro" ? r.confirmacion?.id : r.anulacion?.confirmacionId) ?? "legado_sin_constancia" });
      const evidence = kind === "registro" ? r.habilitacionAntecedentes?.rechazosExpresos ?? [] : [];
      rows.at(-1)!.habilitacionAnticipada = evidence.map((e: {antecedenteId:string;solicitudId:string;resueltaEl:string;resueltaPor:{uid:string;role:string}}) => `Antecedente ${e.antecedenteId}; solicitud ${e.solicitudId}; rechazo ${e.resueltaEl}; autoridad ${e.resueltaPor.uid} (${e.resueltaPor.role})`).join(' | ');
    }
    for (const r of annotated) if (type === "sanciones") add(r.id,r,"registro"); else if (r.estado === "anulada") add(r.id,r,"sancion_sin_efecto");
    if (type === "cancelaciones") {
      const requests = await db.collection("solicitudes_eliminacion_falta").get();
      for (const d of requests.docs) {
        const r = d.data();
        const date = iso(r.resolvedAt ?? r.createdAt);
        if ((unit && r.solicitanteUnidadId !== unit) || (month && (!date || boliviaMonth(date) !== month))) continue;
        rows.push({ id: d.id, faltaId: r.faltaId, evento: "solicitud", mes: date ? boliviaMonth(date) : "sin_fecha_verificable", fecha: date, unidadId: r.solicitanteUnidadId, unidad: r.solicitanteUnidadNombre, funcionario: r.faltaResumen?.nombreCompleto, estado: r.estado, solicitante: r.solicitadaPor?.email, actor: r.resolvedBy?.email ?? r.resolvedBy?.uid, motivo: r.motivo, motivoResolucion: r.motivoResolucion ?? "", causa: r.causaCierre ?? "", dispensaEspera: r.dispensaEspera === true ? "Se eliminó la espera restante" : "Sin dispensa registrada", solicitada: iso(r.createdAt), vence: iso(r.expiresAt) });
      }
    }
    if (type === "cancelaciones") {
      const adjustments = await db.collection("audit_logs").where("action", "==", "lower_reincidencia_after_annulment").get();
      for (const d of adjustments.docs) {
        const r = d.data(), date = iso(r.createdAt);
        if ((unit && r.unidadId !== unit) || (month && (!date || boliviaMonth(date) !== month))) continue;
        rows.push({ id: d.id, faltaId: r.entityId, evento: "ajuste_reincidencia", mes: date ? boliviaMonth(date) : "sin_fecha_verificable", fecha: date, unidadId: r.unidadId, unidad: r.after?.unidadNombre, funcionario: r.after?.nombreCompleto, estado: r.after?.estado, actor: r.actorEmail, motivo: r.after?.ultimoAjuste?.motivo, antecedenteCancelado: r.causaFaltaId, articuloAnterior: r.before?.articulo, incisoAnterior: r.before?.inciso, articuloActual: r.after?.articulo, incisoActual: r.after?.inciso, inicioAnterior:r.before?.fechaInicioCadena??"", vencimientoAnterior:r.before?.fechaVencimientoCadena??"", inicioActual:r.after?.fechaInicioCadena??"", vencimientoActual:r.after?.fechaVencimientoCadena??"", raizVigenteId:r.after?.raizVigenteId??"" });
      }
    }
    rows.sort((a, b) => `${a.mes}|${a.unidadId}|${a.fecha}`.localeCompare(`${b.mes}|${b.unidadId}|${b.fecha}`));
    for (const row of rows) {
      row.fechaBolivia = boliviaDateTime(row.fecha);
      row.eventoDescripcion = auditEventLabel(row.evento);
      row.estadoDescripcion = auditStateLabel(row.estado);
    }
    const groups = new Map<string, { mes: string; unidad: string; registros: number; sinEfecto: number; solicitudes: number; ajustes: number }>();
    for (const row of rows) {
      const key = `${row.mes}|${row.unidadId}`;
      const group = groups.get(key) ?? { mes: String(row.mes), unidad: String(row.unidad ?? row.unidadId), registros: 0, sinEfecto: 0, solicitudes: 0, ajustes: 0 };
      if (row.evento === "registro") group.registros++;
      if (row.evento === "sancion_sin_efecto" || (row.evento === "registro" && row.estado === "anulada")) group.sinEfecto++;
      if (row.evento === "solicitud") group.solicitudes++;
      if (row.evento === "ajuste_reincidencia") group.ajustes++;
      groups.set(key, group);
    }
    await db.collection("audit_logs").add({ action: "generate_audit_report", actorUid: actor.uid, actorRole: actor.role, tipo: type, mes: month, unidadId: unit ?? null, rows: rows.length, createdAt: Timestamp.now() });
    if (request.nextUrl.searchParams.get("format") === "csv") {
      const columns = [...new Set(rows.flatMap(r => Object.keys(r)))];
      const csv = "\uFEFF" + [columns.map(csvCell).join(","), ...rows.map(r => columns.map(c => csvCell(r[c])).join(","))].join("\r\n");
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv;charset=utf-8", "Content-Disposition": `attachment; filename="auditoria-${type}.csv"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ data: rows, grupos: [...groups.values()], total: rows.length, zonaHoraria: "America/La_Paz", generado: new Date().toISOString() });
  } catch (error) { return operationError(error); }
}
