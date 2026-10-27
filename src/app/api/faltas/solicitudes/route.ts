import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { createCancellationRequest, expireRequest } from "@/lib/server/cancellations";
import { operationError } from "@/lib/server/operations";
import { requestDeadline } from "@/lib/domain/sanction-policy";
export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (actor.role === "visor_dpto") return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    const db = getAdminDb();
    const query = ["admin_dpto", "super_admin"].includes(actor.role) ? db.collection("solicitudes_eliminacion_falta") : db.collection("solicitudes_eliminacion_falta").where("solicitanteUnidadId", "==", actor.unidadId!);
    const snap = await query.get();
    for (const d of snap.docs) if (d.data().estado === "pendiente") await expireRequest(d.id);
    const fresh = await query.get();
    const estado = request.nextUrl.searchParams.get("estado") ?? "pendiente";
    const data = fresh.docs.map((d) => {
      const row = d.data(), deadline = requestDeadline(row);
      return { ...row, id: d.id, createdAt: row.createdAt?.toDate?.().toISOString() ?? null, expiresAt: deadline === null ? null : new Date(deadline).toISOString(), resolvedAt: row.resolvedAt?.toDate?.().toISOString() ?? null };
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
