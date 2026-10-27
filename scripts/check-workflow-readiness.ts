import { inspectChains } from "../src/lib/domain/recurrence-chain";
/** Read-only inventory. Never creates, updates, deletes or exports personnel. */
import { createHash } from "node:crypto";
import { getAdminDb } from "../src/lib/firebase/admin";
import { cancellationDeadline, requestDeadline } from "../src/lib/domain/sanction-policy";

async function main() {
  const requestedProject = process.argv.find(a => a.startsWith("--project="))?.slice(10);
  if (!process.argv.includes("--read-only") || !requestedProject || requestedProject !== process.env.FIREBASE_PROJECT_ID) throw new Error("Use --read-only --project=<FIREBASE_PROJECT_ID exacto>; solo se permiten lecturas");
  const db = getAdminDb();
  const [people, sanctions, users, requests] = await Promise.all(["personal", "faltas", "users", "solicitudes_eliminacion_falta"].map(c => db.collection(c).get()));
  const personIds = new Set(people.docs.map(d => d.id));
  const groups = new Map<string, string[]>();
  const ci = new Set<string>();
  let duplicateCi = 0;
  for (const d of people.docs) { const value = String(d.data().ci ?? "").trim(); if (value && ci.has(value)) duplicateCi++; ci.add(value); }
  let unitProfilesMissingUnit = 0;
  for (const d of users.docs) {
    const row = d.data();
    if (["admin_unidad", "operador_unidad"].includes(row.role) && !row.unidadId) unitProfilesMissingUnit++;
    if (row.role === "admin_unidad" && (row.status ?? "activo") === "activo" && row.isActive !== false) {
      const key = String(row.unidadId ?? ""); groups.set(key, [...(groups.get(key) ?? []), d.id]);
    }
  }
  let orphanPersonalReferences = 0, missingAuthor = 0, missingRegistrationDate = 0, invalidChains = 0;
  const byPerson = new Map<string, Array<Record<string, unknown> & {id:string}>>();
  for (const d of sanctions.docs) { const row = d.data(); const id = String(row.personalId ?? ""); byPerson.set(id, [...(byPerson.get(id) ?? []), { ...row, id:d.id }]); }
  for (const d of sanctions.docs) {
    const row = d.data();
    if (!personIds.has(row.personalId)) orphanPersonalReferences++;
    if (!row.createdBy?.uid) missingAuthor++;
    if (cancellationDeadline(row) === null) missingRegistrationDate++;

  }
  invalidChains=[...byPerson.values()].reduce((n,rows)=>n+inspectChains(rows).filter(r=>r.error).length,0);
  const digest = (items: unknown[]) => createHash("sha256").update(JSON.stringify(items)).digest("hex");
  console.log(JSON.stringify({projectId:requestedProject,readOnly:true,checkedAt:new Date().toISOString(),counts:{personal:people.size,faltas:sanctions.size,users:users.size,solicitudes:requests.size},issues:{duplicateCi,unitProfilesMissingUnit,unitsWithMultipleActiveRegistrars:[...groups.values()].filter(g=>g.length>1).length,orphanPersonalReferences,missingAuthor,missingRegistrationDate,invalidChains,legacyPendingRequests:requests.docs.filter(d=>d.data().estado==="pendiente").length,pendingRequestsWithoutReliableDeadline:requests.docs.filter(d=>d.data().estado==="pendiente"&&requestDeadline(d.data())===null).length},identityDigest:digest(people.docs.map(d=>[d.id,d.data().ci]).sort()),historyDigest:digest(sanctions.docs.map(d=>[d.id,d.data().personalId,d.data().unidadId,d.data().estado,d.data().reincidenciaOrigen?.faltaReferenciaId??null]).sort())},null,2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Inventory failed"); process.exitCode=1; });
