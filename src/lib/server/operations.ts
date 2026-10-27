import { createHash } from "node:crypto";
import { DocumentData, Firestore, Timestamp, Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getRequestUser } from "@/lib/auth/request-user";
import { NextResponse } from "next/server";
import { ancestorBlock } from "@/lib/domain/sanction-policy";
import { ChainError, resolveChain, snapshotChain } from "@/lib/domain/recurrence-chain";
import { skipLocalRecurrenceWait } from "./local-test-policy";

export type Actor = NonNullable<Awaited<ReturnType<typeof getRequestUser>>>;
export class OperationError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function operationError(error: unknown) {
  if (error instanceof ChainError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code.startsWith("FECHA") || error.code === "CATALOGO_INVALIDO" ? 400 : 409 });
  if (error instanceof OperationError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Operation failed", error instanceof Error ? error.message : "unknown");
  return NextResponse.json({ error: "No se pudo completar la operación" }, { status: 500 });
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
}
export function actorData(actor: Actor) {
  return { uid: actor.uid, email: actor.email, role: actor.role, nombreCompleto: actor.nombreCompleto ?? "", unidadId: actor.unidadId ?? null };
}
export async function assertCurrentActor(tx: Transaction, db: Firestore, actor: Actor) {
  const snap = await tx.get(db.collection("users").doc(actor.uid));
  const user = snap.data();
  if (!user || (user.status ?? "activo") !== "activo" || user.isActive === false || user.mustChangePassword || user.role !== actor.role || (user.unidadId ?? null) !== (actor.unidadId ?? null)) throw new OperationError("La asignación o el acceso cambió. Actualice su sesión", 403);
}
export async function readConfirmation(tx: Transaction, db: Firestore, actor: Actor, id: unknown, action: string, payload: unknown) {
  if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id)) throw new OperationError("Confirme explícitamente la acción antes de continuar", 400);
  const ref = db.collection("confirmaciones").doc(id);
  const snap = await tx.get(ref);
  const data = snap.data();
  if (!data || data.actorUid !== actor.uid || data.actorRole !== actor.role || data.action !== action || data.hash !== payloadHash(payload) || data.unidadId !== (actor.unidadId ?? null)) throw new OperationError("La confirmación no corresponde a esta acción o cambió su asignación", 403);
  if (!data.result && data.expiresAt.toMillis() <= Date.now()) throw new OperationError("La confirmación venció; revise y confirme nuevamente");
  return { ref, data };
}
export function notification(tx: Transaction, db: Firestore, id: string, data: DocumentData) {
  tx.set(db.collection("notificaciones").doc(id), { ...data, createdAt: Timestamp.now() });
}
export function audit(tx: Transaction, db: Firestore, actor: Actor | null, action: string, entityId: string, data: DocumentData) {
  const ref = db.collection("audit_logs").doc();
  tx.set(ref, { actorUid: actor?.uid ?? "sistema", actorRole: actor?.role ?? "sistema", actorEmail: actor?.email ?? null, action, entity: "falta", entityId, createdAt: Timestamp.now(), ...data });
  return ref.id;
}
export async function prepareConfirmation(actor: Actor, action: string, payload: unknown) {
  const db = getAdminDb();
  const ref = db.collection("confirmaciones").doc();
  await ref.set({ action, actorUid: actor.uid, actorRole: actor.role, unidadId: actor.unidadId ?? null, hash: payloadHash(payload), createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 300_000), textoVersion: "intencion-v1" });
  return ref.id;
}

/** Rebuild the evidence from live documents, including every prior ancestor. */
export async function recurrenceSnapshot(tx: Transaction, db: Firestore, personalId: string, firstId: string) {
  const snap = await tx.get(db.collection("faltas").where("personalId", "==", personalId));
  const chain = resolveChain(snap.docs.map(d => ({ ...d.data(), id: d.id })), firstId);
  for (const node of chain.nodes) {
    const requests = await tx.get(db.collection("solicitudes_eliminacion_falta").where("faltaId", "==", node.id));
    const reason = ancestorBlock(node, requests.docs.map(d => d.data()), Date.now(), {skipRegistrationWait:skipLocalRecurrenceWait()});
    if (reason) throw new OperationError(reason);
  }
  return snapshotChain(chain.nodes);
}
