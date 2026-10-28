import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { ancestorBlock } from "@/lib/domain/sanction-policy";
import { expireRequestsForFalta } from "@/lib/server/cancellations";
import { operationError } from "@/lib/server/operations";
import { boliviaToday, dateOnly, evaluateRecurrence, resolveChain, validateSanctionDate } from "@/lib/domain/recurrence-chain";
import { skipLocalRecurrenceWait } from "@/lib/server/local-test-policy";
export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!["admin_unidad", "admin_dpto", "super_admin"].includes(actor.role)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    const id = request.nextUrl.searchParams.get("personalId");
    if (!id) return NextResponse.json({ error: "personalId requerido" }, { status: 400 });
    const db = getAdminDb();
    const snap = await db.collection("faltas").where("personalId", "==", id).get();
    const date = validateSanctionDate(request.nextUrl.searchParams.get("fechaSancion") ?? boliviaToday());
    const rows = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    const requestsById = new Map<string, Record<string, unknown>[]>();
    for (const d of snap.docs) {
      await expireRequestsForFalta(d.id);
      const found = await db.collection("solicitudes_eliminacion_falta").where("faltaId", "==", d.id).get();
      requestsById.set(d.id, found.docs.map(r => ({...r.data(),id:r.id})));
    }
    const data = [];
    for (const d of snap.docs) {
      const r = d.data();
      if (r.estado !== "registrada") continue;
      let bloqueo: string | null = null;
      let metadata = null;
      try {
        const resolved = resolveChain(rows, d.id);
        metadata = resolved.metadata;
        const decision = evaluateRecurrence(rows, id, date, metadata.conductaOrigen);
        if (date >= metadata.fechaVencimientoCadena) bloqueo = "El plazo de esta cadena venció; corresponde evaluar una nueva sanción base";
        else if (decision.antecedenteId !== d.id) bloqueo = "Este registro no es el último escalón utilizable de su cadena";
        else if (decision.tipo === "remision") bloqueo = decision.sancion.remisionMensaje ?? "Corresponde remisión disciplinaria";
        for (const node of resolved.nodes) bloqueo ??= ancestorBlock(node, requestsById.get(node.id) ?? [], Date.now(), {skipRegistrationWait:skipLocalRecurrenceWait()});
      } catch (error) { bloqueo = error instanceof Error ? error.message : "Cadena no verificable"; }
      data.push({ id: d.id, articulo: r.articulo, inciso: r.inciso, memorandum: r.memorandum, fechaSancion: dateOnly(r.fechaSancion), unidadSancionNombre: r.unidadSancionNombre ?? r.unidadNombre, ...metadata, disponible: !bloqueo, bloqueo });
    }
    return NextResponse.json({ data });
  } catch (error) { return operationError(error); }
}
