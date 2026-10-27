import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { operationError } from "@/lib/server/operations";
import { FieldPath, Timestamp } from "firebase-admin/firestore";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const db = getAdminDb();
    // Separate queries avoid exposing other units and allow legacy actor delivery.
    const snapshots = await Promise.all([
      db.collection("notificaciones").where("destinatarioUid", "==", actor.uid).get(),
      ...(actor.unidadId && ["admin_unidad", "operador_unidad"].includes(actor.role) ? [db.collection("notificaciones").where("unidadId", "==", actor.unidadId).get()] : []),
      ...(["admin_dpto", "super_admin"].includes(actor.role) ? [db.collection("notificaciones").where("revisores", "==", true).get()] : []),
    ]);
    const rows = new Map(snapshots.flatMap((s) => s.docs.map((d) => [d.id, { ...d.data(), id: d.id, leida: !!d.data().leidaPor?.[actor.uid], createdAt: d.data().createdAt.toDate().toISOString() }] as const)));
    return NextResponse.json({ data: [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  } catch (error) { return operationError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await request.json();
    if (typeof id !== "string" || !/^[\w-]{1,200}$/.test(id)) return NextResponse.json({ error: "Identificador inválido" }, { status: 400 });
    const ref = getAdminDb().collection("notificaciones").doc(id);
    const data = (await ref.get()).data();
    if (!data || !(data.destinatarioUid === actor.uid || (actor.unidadId && ["admin_unidad", "operador_unidad"].includes(actor.role) && data.unidadId === actor.unidadId) || (data.revisores && ["admin_dpto", "super_admin"].includes(actor.role)))) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    await ref.update(new FieldPath("leidaPor", actor.uid), Timestamp.now());
    return NextResponse.json({ ok: true });
  } catch(error) { return operationError(error); }
}
