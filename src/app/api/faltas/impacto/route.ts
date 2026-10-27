import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { lowerDependentChain } from "@/lib/domain/sanction-policy";
import { operationError, OperationError, payloadHash } from "@/lib/server/operations";
import { DocumentData } from "firebase-admin/firestore";
export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (actor.role !== "super_admin") return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    const id = request.nextUrl.searchParams.get("id") ?? "";
    const db = getAdminDb();
    const target = await db.collection("faltas").doc(id).get();
    if (!target.exists) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    const all = await db.collection("faltas").where("personalId", "==", target.data()!.personalId).get();
    const rows: Array<DocumentData & {id:string}> = all.docs.map(d => ({ ...d.data(), id: d.id }));
    let changes;
    try { changes = lowerDependentChain(rows, id); }
    catch(error) { throw new OperationError(error instanceof Error ? error.message : "Cadena inconsistente"); }
    return NextResponse.json({ impactoHash: payloadHash(rows), cambios: changes.map(c => ({id:c.id,articulo:c.articulo,inciso:c.inciso,documento:c.memorandum,unidad:c.unidadNombre,articuloAnterior:rows.find(r=>r.id===c.id)?.articulo,incisoAnterior:rows.find(r=>r.id===c.id)?.inciso,conductaOrigen:c.conductaOrigen,fechaInicioCadena:c.fechaInicioCadena,fechaVencimientoCadena:c.fechaVencimientoCadena,antecedenteId:(c.reincidenciaOrigen as {faltaReferenciaId?:string})?.faltaReferenciaId??null})) });
  } catch(error) { return operationError(error); }
}
