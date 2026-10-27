import { DocumentData, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { Actor, assertCurrentActor, audit, OperationError } from "./operations";

function active(row: DocumentData) { return (row.status ?? "activo") === "activo" && row.isActive !== false; }
function occupiesUnit(row: DocumentData) { return active(row) || row.status === "relevo_pendiente"; }

// All user mutations share a coordination document: uniqueness and last-admin
// protection hold even when callers target different profile documents.
export async function persistAccess(actor: Actor, uid: string, updates: DocumentData, options: { create?: boolean; outgoingUid?: string | null; reason?: string } = {}) {
  const db = getAdminDb();
  return db.runTransaction(async (tx) => {
    await assertCurrentActor(tx, db, actor);
    const lock = db.collection("access_control").doc("users");
    await tx.get(lock);
    const users = await tx.get(db.collection("users"));
    const target = users.docs.find((d) => d.id === uid);
    const before = target?.data() ?? null;
    if (options.create && before) throw new OperationError("La cuenta ya tiene perfil");
    if (!options.create && !before) throw new OperationError("Usuario no encontrado", 404);
    if (actor.role === "admin_dpto" && (before?.role === "super_admin" || updates.role === "super_admin")) throw new OperationError("No puede gestionar superadministradores", 403);
    if (options.outgoingUid && !["admin_unidad", "operador_unidad"].includes(String(before?.role ?? "admin_unidad"))) throw new OperationError("El entrante debe ser una cuenta de unidad", 403);
    const after = { ...before, ...updates };
    if (["admin_unidad", "operador_unidad"].includes(after.role) && !after.unidadId) throw new OperationError("El rol requiere una unidad", 400);
    if (["admin_unidad", "operador_unidad"].includes(after.role)) {
      const unit = (await tx.get(db.collection("unidades").doc(after.unidadId))).data();
      if (!unit || unit.estado !== "activa") throw new OperationError("La unidad debe existir y estar activa", 400);
      updates = { ...updates, unidadNombre: unit.nombre };
      after.unidadNombre = unit.nombre;
    }
    if (uid === actor.uid && (after.role !== actor.role || !active(after))) throw new OperationError("No puede retirar su propio acceso o rol", 403);
    if (before?.role === "super_admin" && (!active(after) || after.role !== "super_admin") && !users.docs.some((d) => d.id !== uid && d.data().role === "super_admin" && active(d.data()))) throw new OperationError("Debe permanecer un superadministrador activo");
    if (occupiesUnit(after) && ["admin_unidad", "operador_unidad"].includes(after.role)) {
      const duplicate = users.docs.find((d) => d.id !== uid && d.id !== options.outgoingUid && d.data().role === after.role && d.data().unidadId === after.unidadId && occupiesUnit(d.data()));
      if (duplicate) throw new OperationError("Ya existe un responsable activo para ese rol y unidad; realice el relevo");
    }
    const outgoing = options.outgoingUid ? users.docs.find((d) => d.id === options.outgoingUid) : null;
    if (outgoing && (outgoing.data().unidadId !== after.unidadId || outgoing.data().role !== after.role)) throw new OperationError("El responsable saliente cambió; actualice la operación");
    tx.set(db.collection("users").doc(uid), updates, { merge: !options.create });
    if (outgoing) tx.update(outgoing.ref, { status: "bloqueado", isActive: false, blockedAt: Timestamp.now(), blockedReason: options.reason ?? "Relevo", replacedByUid: uid });
    tx.set(lock, { updatedAt: Timestamp.now() });
    const auditId = audit(tx, db, actor, options.outgoingUid ? "unit_role_handover" : "update_user_access", uid, { entity: "user", unidadId: after.unidadId ?? null, before, after, outgoingUid: options.outgoingUid ?? null, reason: options.reason ?? null });
    return { before, after, auditId };
  });
}
