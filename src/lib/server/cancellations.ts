import { DocumentData, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertDataAvailable } from "./maintenance";
import { ancestorBlock, ancestorEligibility, authorUid, cancellationDeadline, canRequestCancellation, dependentIds, lowerDependentChain, requestDeadline, REQUEST_DAYS, DAY_MS } from "@/lib/domain/sanction-policy";
import { Actor, actorData, assertCurrentActor, audit, notification, OperationError, readConfirmation, payloadHash } from "./operations";
import { skipLocalRecurrenceWait } from "./local-test-policy";

const idSchema = z.string().regex(/^[\w-]{1,200}$/);
const requestSchema = z.object({ faltaId: idSchema, motivo: z.string().trim().min(8).max(4000), tipoSolicitud: z.enum(["representacion", "error_insercion"]).optional(), memorandumRepresentacion: z.string().max(100).nullable().optional(), comentario: z.string().max(4000).nullable().optional() });
const directSchema = z.object({ id: idSchema, motivo: z.string().trim().min(8).max(4000), impactoHash: z.string().regex(/^[a-f0-9]{64}$/).optional() });

export async function expireRequest(id: string): Promise<boolean> {
  const db = getAdminDb();
  return db.runTransaction(async (tx) => {
    await assertDataAvailable(tx, db);
    const ref = db.collection("solicitudes_eliminacion_falta").doc(id);
    const snap = await tx.get(ref);
    const row = snap.data();
    const deadline = row ? requestDeadline(row) : null;
    if (!row || row.estado !== "pendiente" || deadline === null || Date.now() < deadline) return false;
    const personSnap = await tx.get(db.collection("faltas").doc(row.faltaId));
    const resolution = { estado: "rechazada", motivoResolucion: "Plazo de resolución vencido", causaCierre: "vencimiento", resolvedAt: Timestamp.fromMillis(deadline), processedAt: Timestamp.now(), resolvedBy: { uid: "sistema", role: "sistema" } };
    tx.update(ref, resolution);
    const personalId = personSnap.data()?.personalId;
    if (personalId) tx.set(db.collection("personal").doc(personalId), { workflowUpdatedAt: Timestamp.now() }, { merge: true });
    audit(tx, db, null, "expire_delete_falta_request", row.faltaId, { solicitudId: id, unidadId: row.solicitanteUnidadId, before: row, after: { ...row, ...resolution } });
    notification(tx, db, `solicitud-${id}-resuelta`, { unidadId: row.solicitanteUnidadId, destinatarioUid: row.solicitadaPor?.uid ?? null, faltaId: row.faltaId, titulo: "Solicitud rechazada por vencimiento", mensaje: "Transcurrieron cinco días sin resolución.", solicitudId: id });
    return true;
  });
}

export async function expireRequestsForFalta(id: string) {
  const snap = await getAdminDb().collection("solicitudes_eliminacion_falta").where("faltaId", "==", id).get();
  for (const doc of snap.docs) if (doc.data().estado === "pendiente") await expireRequest(doc.id);
}

export async function createCancellationRequest(actor: Actor, input: { faltaId: string; motivo: string; tipoSolicitud?: string; memorandumRepresentacion?: string | null; comentario?: string | null }) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new OperationError("Solicitud inválida: indique sanción y motivo específico (8–4000 caracteres)", 400);
  input = parsed.data;
  await expireRequestsForFalta(input.faltaId);
  const db = getAdminDb();
  const ref = db.collection("solicitudes_eliminacion_falta").doc();
  return db.runTransaction(async (tx) => {
    await assertCurrentActor(tx, db, actor);
    const faltaRef = db.collection("faltas").doc(input.faltaId);
    const falta = (await tx.get(faltaRef)).data();
    if (!falta || !canRequestCancellation(actor, falta, Date.now())) throw new OperationError("Solo el autor activo de la unidad puede solicitarlo dentro de siete días", 403);
    const personRef = db.collection("personal").doc(falta.personalId);
    await tx.get(personRef);
    const existing = await tx.get(db.collection("solicitudes_eliminacion_falta").where("faltaId", "==", input.faltaId));
    if (existing.docs.some((d) => d.data().estado === "pendiente")) throw new OperationError("Ya existe una solicitud pendiente");
    const dependents = await tx.get(db.collection("faltas").where("personalId", "==", falta.personalId));
    if (dependentIds(dependents.docs.map((d) => ({ ...d.data(), id: d.id })), input.faltaId).length) throw new OperationError("El registro tiene reincidencias dependientes; requiere intervención extraordinaria");
    const now = Timestamp.now();
    if (!canRequestCancellation(actor, falta, now.toMillis())) throw new OperationError("El plazo de siete días para solicitarlo ha vencido", 403);
    const payload = { ...input, estado: "pendiente", solicitanteUnidadId: falta.unidadId, solicitanteUnidadNombre: falta.unidadNombre ?? "", solicitadaPor: actorData(actor), createdAt: now, expiresAt: Timestamp.fromMillis(now.toMillis() + REQUEST_DAYS * DAY_MS), faltaResumen: { ci: falta.ci, nombreCompleto: falta.nombreCompleto, memorandum: falta.memorandum, articulo: falta.articulo, inciso: falta.inciso, unidadId: falta.unidadId } };
    tx.set(ref, payload);
    tx.set(personRef, { workflowUpdatedAt: now }, { merge: true });
    audit(tx, db, actor, "request_delete_falta", input.faltaId, { solicitudId: ref.id, unidadId: falta.unidadId, after: payload });
    notification(tx, db, `solicitud-${ref.id}-nueva`, { revisores: true, faltaId: input.faltaId, titulo: "Nueva solicitud para dejar sin efecto", mensaje: input.motivo, solicitudId: ref.id });
    return { ok: true, solicitudId: ref.id };
  });
}

export async function resolveCancellationRequest(actor: Actor, id: string, payload: { decision: string; motivoResolucion: string }, confirmationId: unknown) {
  if (!["admin_dpto", "super_admin"].includes(actor.role)) throw new OperationError("Sin permisos", 403);
  if (!idSchema.safeParse(id).success || !z.object({ decision: z.enum(["aprobada", "rechazada"]), motivoResolucion: z.string().min(6).max(4000).refine(v => v.trim().length >= 6) }).safeParse(payload).success) throw new OperationError("Decisión y motivo de resolución requeridos", 400);
  await expireRequest(id);
  const db = getAdminDb();
  return db.runTransaction(async (tx) => {
    await assertCurrentActor(tx, db, actor);
    const confirmation = await readConfirmation(tx, db, actor, confirmationId, "resolver_solicitud", { id, ...payload });
    if (confirmation.data.result) return confirmation.data.result;
    const ref = db.collection("solicitudes_eliminacion_falta").doc(id);
    const row = (await tx.get(ref)).data();
    if (!row || row.estado !== "pendiente" || requestDeadline(row) === null || Date.now() >= requestDeadline(row)!) throw new OperationError("La solicitud ya fue resuelta o venció");
    const faltaRef = db.collection("faltas").doc(row.faltaId);
    const falta = (await tx.get(faltaRef)).data();
    if (!falta || falta.estado !== "registrada") throw new OperationError("La sanción no está vigente");
    const personRef = db.collection("personal").doc(falta.personalId);
    await tx.get(personRef);
    const all = await tx.get(db.collection("faltas").where("personalId", "==", falta.personalId));
    const requests = await tx.get(db.collection("solicitudes_eliminacion_falta").where("faltaId", "==", row.faltaId));
    if (payload.decision === "aprobada" && dependentIds(all.docs.map((d) => ({ ...d.data(), id: d.id })), row.faltaId).length) throw new OperationError("Existen reincidencias dependientes; use la revisión extraordinaria");
    const now = Timestamp.now();
    if (now.toMillis() >= requestDeadline(row)!) throw new OperationError("La solicitud ya fue resuelta o venció");
    const resolution = { ...payload, estado: payload.decision, resolvedAt: now, resolvedBy: actorData(actor), causaCierre: "decision", confirmacionId: confirmation.ref.id };
    const eligibility = ancestorEligibility({...falta,id:row.faltaId}, requests.docs.map(d => ({...d.data(),...(d.id === id ? resolution : {}),id:d.id})), now.toMillis());
    const dispensaEspera = eligibility.rechazoExpreso?.solicitudId === id && payload.decision === "rechazada";
    tx.update(ref, { ...resolution, dispensaEspera });
    if (payload.decision === "aprobada") tx.update(faltaRef, { estado: "anulada", anulacion: { motivoEliminacion: row.motivo, motivoResolucion: payload.motivoResolucion, solicitudId: id, anuladaPor: actorData(actor), fecha: now, via: "solicitud", confirmacionId: confirmation.ref.id }, updatedAt: now });
    tx.set(personRef, { workflowUpdatedAt: now }, { merge: true });
    audit(tx, db, actor, "resolve_delete_falta_request", row.faltaId, { solicitudId: id, unidadId: falta.unidadId, before: row, after: { ...row, ...resolution, dispensaEspera } });
    notification(tx, db, `solicitud-${id}-resuelta`, { unidadId: falta.unidadId, destinatarioUid: row.solicitadaPor?.uid ?? null, faltaId: row.faltaId, titulo: `Solicitud ${payload.decision}`, mensaje: `${payload.motivoResolucion}${dispensaEspera ? " Se elimina la espera restante de este antecedente para considerar reincidencia; se mantienen las demás verificaciones." : ""}`, solicitudId: id });
    const result = { ok: true };
    tx.update(confirmation.ref, { result, consumedAt: now });
    return result;
  });
}

export async function cancelDirectly(actor: Actor, payload: { id: string; motivo: string; impactoHash?: string }, confirmationId: unknown) {
  if (!["admin_dpto", "super_admin"].includes(actor.role)) throw new OperationError("Sin permisos", 403);
  const parsed = directSchema.safeParse(payload);
  if (!parsed.success) throw new OperationError("Debe indicar sanción y motivo específico (8–4000 caracteres)", 400);
  payload = parsed.data;
  const db = getAdminDb();
  return db.runTransaction(async (tx) => {
    await assertCurrentActor(tx, db, actor);
    const confirmation = await readConfirmation(tx, db, actor, confirmationId, "cancelar_sancion", payload);
    if (confirmation.data.result) return confirmation.data.result;
    const ref = db.collection("faltas").doc(payload.id);
    const falta = (await tx.get(ref)).data();
    if (!falta || falta.estado !== "registrada") throw new OperationError("La sanción no está vigente");
    if (actor.role !== "super_admin" && (authorUid(falta) !== actor.uid || cancellationDeadline(falta) === null || Date.now() >= cancellationDeadline(falta)!)) throw new OperationError("Solo puede cancelar sus propios registros dentro de siete días", 403);
    const personRef = db.collection("personal").doc(falta.personalId);
    await tx.get(personRef);
    const all = await tx.get(db.collection("faltas").where("personalId", "==", falta.personalId));
    const dependents = dependentIds(all.docs.map((d) => ({ ...d.data(), id: d.id })), payload.id);
    const chainRows = all.docs.map((d) => ({ ...d.data(), id: d.id }));
    let changes;
    try { changes = lowerDependentChain(chainRows, payload.id); }
    catch(error) { throw new OperationError(error instanceof Error ? error.message : "Cadena inconsistente"); }
    if (dependents.length && actor.role !== "super_admin") throw new OperationError("Las dependencias requieren cancelación extraordinaria", 403);
    if (dependents.length && payload.impactoHash !== payloadHash(chainRows)) throw new OperationError("Revise y confirme el impacto actualizado de la cadena");
    // Keep the entire amendment atomic. Oversized legacy chains need an explicit
    // recovery workflow rather than applying a partial correction.
    if (changes.length > 80) throw new OperationError("Cadena extraordinariamente extensa: requiere una operación de mantenimiento supervisada");
    const requests = await tx.get(db.collection("solicitudes_eliminacion_falta").where("faltaId", "==", payload.id));
    const dependentRequests = [];
    for (const change of changes) dependentRequests.push(await tx.get(db.collection("solicitudes_eliminacion_falta").where("faltaId", "==", change.id)));
    const now = Timestamp.now();
    const via = actor.role === "super_admin" ? "extraordinaria" : "directa";
    const anulacion = { motivoEliminacion: payload.motivo, anuladaPor: actorData(actor), fecha: now, via, confirmacionId: confirmation.ref.id };
    tx.update(ref, { estado: "anulada", anulacion, updatedAt: now });
    for (const change of changes) {
      const original = all.docs.find(d => d.id === change.id)!.data();
      const chain = { conductaOrigen: change.conductaOrigen, cadenaId: change.cadenaId, raizHistoricaId: change.raizHistoricaId, raizVigenteId: change.raizVigenteId, fechaInicioCadena: change.fechaInicioCadena, fechaVencimientoCadena: change.fechaVencimientoCadena, nivelEfectivo: change.nivelEfectivo, versionReglas: change.versionReglas };
      const adjustment = { ...chain, articulo: change.articulo, inciso: change.inciso, reincidencia: change.reincidencia, tipoRegistro: change.tipoRegistro, reincidenciaOrigen: change.reincidenciaOrigen, reincidenciaReferencia: change.reincidenciaReferencia, fundamentoOriginal: original.fundamentoOriginal ?? { articulo: original.articulo, inciso: original.inciso, reincidenciaOrigen: original.reincidenciaOrigen ?? null }, tipificacionOriginal: original.tipificacionOriginal ?? { articulo: original.articulo, inciso: original.inciso, reincidenciaOrigen: original.reincidenciaOrigen ?? null }, ultimoAjuste: { causaFaltaId: payload.id, motivo: payload.motivo, actor: actorData(actor), fecha: now }, documentoRequiereRevision: true, updatedAt: now };
      tx.update(db.collection("faltas").doc(change.id), adjustment);
      for (const pending of dependentRequests.flatMap(s => s.docs).filter(d => d.data().faltaId === change.id && d.data().estado === "pendiente")) {
        const old = pending.data();
        tx.update(pending.ref, { faltaResumenOriginal: old.faltaResumenOriginal ?? old.faltaResumen, faltaResumen: { ...old.faltaResumen, articulo: change.articulo, inciso: change.inciso }, ajusteReferenciado: payload.id, updatedAt: now });
      }
      audit(tx, db, actor, "lower_reincidencia_after_annulment", change.id, { unidadId: original.unidadId, causaFaltaId: payload.id, before: original, after: { ...original, ...adjustment } });
      notification(tx, db, `ajuste-${payload.id}-${change.id}`, { unidadId: original.unidadId, destinatarioUid: authorUid(original), faltaId: change.id, titulo: "Reincidencia ajustada un nivel", mensaje: payload.motivo });
    }
    tx.set(personRef, { workflowUpdatedAt: now }, { merge: true });
    for (const r of requests.docs) if (r.data().estado === "pendiente") tx.update(r.ref, { estado: "cerrada_extraordinaria", motivoResolucion: payload.motivo, resolvedAt: now, resolvedBy: actorData(actor) });
    audit(tx, db, actor, via === "extraordinaria" ? "annul_falta_extraordinaria" : "annul_falta", payload.id, { unidadId: falta.unidadId, before: falta, after: { ...falta, estado: "anulada", anulacion } });
    notification(tx, db, `cancelacion-${payload.id}`, { unidadId: falta.unidadId, destinatarioUid: authorUid(falta), faltaId: payload.id, titulo: `Sanción sin efecto (${via})`, mensaje: payload.motivo });
    const result = { ok: true, afectadas: [payload.id], ajustadas: changes.map(c => c.id) };
    tx.update(confirmation.ref, { result, consumedAt: now });
    return result;
  });
}

export async function assertAncestorAvailable(id: string, row: DocumentData) {
  await expireRequestsForFalta(id);
  const requests = await getAdminDb().collection("solicitudes_eliminacion_falta").where("faltaId", "==", id).get();
  const reason = ancestorBlock({...row,id}, requests.docs.map((d) => ({...d.data(),id:d.id})), Date.now(), {skipRegistrationWait:skipLocalRecurrenceWait()});
  if (reason) throw new OperationError(reason);
}
