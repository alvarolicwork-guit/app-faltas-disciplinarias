import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { createCancellationRequest } from "@/lib/server/cancellations";
import { operationError } from "@/lib/server/operations";
import { requestDeadline, effectiveRequest, millis, REQUEST_STATES } from "@/lib/domain/sanction-policy";
import { canReadCancellationRequests } from "@/lib/domain/roles";
export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canReadCancellationRequests(actor.role)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    const db = getAdminDb();
    const query = ["admin_dpto", "super_admin"].includes(actor.role) ? db.collection("solicitudes_eliminacion_falta") : db.collection("solicitudes_eliminacion_falta").where("solicitanteUnidadId", "==", actor.unidadId!);
    const fresh = await query.get();
    const estado = request.nextUrl.searchParams.get("estado") ?? "pendiente";
    if(estado && !(REQUEST_STATES as readonly string[]).includes(estado)) return NextResponse.json({error:"Estado de solicitud inválido"},{status:400});
    const iso=(v:unknown)=>{const n=millis(v);return n===null?null:new Date(n).toISOString();};
    const data = fresh.docs.map((d) => {
      const row = effectiveRequest(d.data()), deadline = requestDeadline(row);
      return { ...row, id: d.id, createdAt: iso(row.createdAt), expiresAt: deadline === null ? null : new Date(deadline).toISOString(), resolvedAt: iso(row.resolvedAt) };
    }).filter((d) => !estado || (d as Record<string, unknown>).estado === estado);
    data.sort((a, b) => estado === "pendiente"
      ? (requestDeadline(a) ?? Infinity) - (requestDeadline(b) ?? Infinity)
      : String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    return NextResponse.json({ data });
  } catch (error) { return operationError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    return NextResponse.json(await createCancellationRequest(actor, await request.json()), { status: 201 });
  } catch (error) { return operationError(error); }
}
