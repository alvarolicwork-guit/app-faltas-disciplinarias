import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { isGlobalRole } from "@/lib/domain/roles";
import { normalizeUnitName } from "@/lib/domain/text-normalization";
import { assertCurrentActor, audit, operationError, OperationError, payloadHash } from "@/lib/server/operations";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const snap = await getAdminDb().collection("unidades").where("estado", "==", "activa").get();
    const data = snap.docs.map(doc => { const row = doc.data(); return { ...row, id: doc.id, createdAt: row.createdAt?.toDate?.()?.toISOString() ?? null, updatedAt: row.updatedAt?.toDate?.()?.toISOString() ?? null }; })
      .sort((a,b) => a.id.localeCompare(b.id, "es", { numeric: true }));
    return NextResponse.json({ data });
  } catch (error) { return operationError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isGlobalRole(actor.role)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    const body = await request.json();
    const nombre = normalizeUnitName(String(body?.nombre ?? ""));
    if (!nombre || nombre.length > 200) throw new OperationError("Nombre de unidad inválido", 400);
    const key = body.operationId;
    if (key !== undefined && (typeof key !== "string" || !/^[\w-]{8,100}$/.test(key))) throw new OperationError("Identificador de operación inválido", 400);
    const db = getAdminDb();
    const sequence = db.collection("access_control").doc("unit_sequence");
    const operation = key ? db.collection("access_control").doc("unit_op_" + actor.uid + "_" + key) : null;
    const data = await db.runTransaction(async tx => {
      await assertCurrentActor(tx, db, actor);
      const previous = operation ? await tx.get(operation) : null;
      if (previous?.exists) {
        if (previous.data()!.hash !== payloadHash({ nombre })) throw new OperationError("La operación ya se usó con otro nombre");
        return previous.data()!.result;
      }
      const counter = await tx.get(sequence);
      let next = Number(counter.data()?.next ?? 0);
      if (!Number.isSafeInteger(next) || next < 1) {
        const all = await tx.get(db.collection("unidades"));
        next = 1 + Math.max(0, ...all.docs.map(d => Number(/^U-(\d+)$/.exec(d.id)?.[1] ?? 0)));
      }
      const id = "U-" + String(next).padStart(3, "0");
      const ref = db.collection("unidades").doc(id);
      if ((await tx.get(ref)).exists) throw new OperationError("Secuencia de unidades inconsistente; requiere revisión");
      const now = Timestamp.now();
      const result = { id, nombre, estado: "activa", createdAt: now, updatedAt: now, createdBy: { uid: actor.uid, email: actor.email, role: actor.role } };
      tx.create(ref, result);
      tx.set(sequence, { next: next + 1, updatedAt: now });
      if (operation) tx.create(operation, { hash: payloadHash({ nombre }), result, createdAt: now });
      audit(tx, db, actor, "create_unidad", id, { entity: "unidad", before: null, after: result });
      return result;
    }, { maxAttempts: 20 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) { return operationError(error); }
}

export async function PATCH(request: NextRequest) { return mutate(request, false); }
export async function DELETE(request: NextRequest) { return mutate(request, true); }
async function mutate(request: NextRequest, deactivate: boolean) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isGlobalRole(actor.role)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    const body = deactivate ? { id: request.nextUrl.searchParams.get("id"), nombre: "" } : await request.json();
    if (typeof body.id !== "string" || !/^[\w-]{1,128}$/.test(body.id)) throw new OperationError("ID de unidad inválido", 400);
    const nombre = normalizeUnitName(String(body.nombre ?? ""));
    if (!deactivate && (!nombre || nombre.length > 200)) throw new OperationError("Nombre de unidad inválido", 400);
    const db = getAdminDb();
    await db.runTransaction(async tx => {
      await assertCurrentActor(tx, db, actor);
      const lock = db.collection("access_control").doc("users");
      await tx.get(lock);
      const ref = db.collection("unidades").doc(body.id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new OperationError("Unidad no encontrada", 404);
      if (deactivate) {
        const sanctions = await tx.get(db.collection("faltas").where("unidadId", "==", body.id).limit(1));
        const users = await tx.get(db.collection("users").where("unidadId", "==", body.id));
        if (!sanctions.empty) throw new OperationError("La unidad tiene sanciones históricas; debe conservarse", 400);
        if (users.docs.some(d => ((d.data().status ?? "activo") === "activo" && d.data().isActive !== false) || d.data().status === "relevo_pendiente")) throw new OperationError("Retire o releve primero los accesos de esta unidad", 400);
      }
      const updates = { ...(deactivate ? { estado: "inactiva" } : { nombre }), updatedAt: Timestamp.now() };
      tx.update(ref, updates);
      tx.set(lock, { updatedAt: Timestamp.now() }, { merge: true });
      audit(tx, db, actor, deactivate ? "delete_unidad" : "update_unidad", body.id, { entity: "unidad", before: snap.data(), after: { ...snap.data(), ...updates } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return operationError(error); }
}
