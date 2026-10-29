import { randomUUID } from "node:crypto";
import { DocumentData, DocumentReference, FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { ciKey } from "@/lib/domain/text-normalization";
import { personalIndex } from "@/lib/domain/personal-index";
import { preparePersonalRows } from "@/lib/imports/personal-rows";
import { Actor, assertCurrentActor, audit, OperationError, payloadHash } from "./operations";

type PreparedRows = ReturnType<typeof preparePersonalRows>;
const importStates = new Set(["staging", "ready", "processing", "failed", "confirmed"]);

function assertPreparationHeader(data: DocumentData | undefined, hash: string, total: number): asserts data is DocumentData {
  if (!data) throw new OperationError("Importación no encontrada", 404);
  if (typeof data.hash !== "string" || !importStates.has(data.status) || !Number.isInteger(data.totalRows)) {
    throw new OperationError("La importación requiere revisión de sus datos de preparación");
  }
  if (data.hash !== hash || data.totalRows !== total) {
    throw new OperationError("El archivo no coincide con esta importación. Seleccione el archivo original.");
  }
}

function assertStagingCounters(data: DocumentData, prepared: PreparedRows) {
  const rejected = prepared.filter(row => row.errors.length).length;
  if (data.okRows !== 0 || data.createdRows !== 0 || data.updatedRows !== 0 || data.errorRows !== rejected || data.processedRows !== rejected) {
    throw new OperationError("La preparación tiene resultados incompatibles; requiere revisión");
  }
}

function assertPreparedRow(id: string, data: DocumentData, prepared: PreparedRows) {
  const index = Number(id), expected = prepared[index];
  if (!/^\d{6}$/.test(id) || !expected || id !== String(index).padStart(6, "0") ||
      data.status !== (expected.errors.length ? "rejected" : "pending") || data.appliedAt || data.personalId ||
      payloadHash({rowNumber:data.rowNumber, errors:data.errors, normalized:data.normalized}) !== payloadHash(expected)) {
    throw new OperationError("Las filas preparadas no coinciden con el archivo; requiere revisión");
  }
}

async function completePreparation(actor: Actor, db: Firestore, ref: DocumentReference, hash: string, prepared: PreparedRows, recovery: boolean) {
  // Check every existing row before adding missing rows. Never reset persisted counters.
  const staging = await db.runTransaction(async tx => {
    await assertCurrentActor(tx, db, actor);
    const data = (await tx.get(ref)).data();
    assertPreparationHeader(data, hash, prepared.length);
    if (data.status !== "staging") return false;
    assertStagingCounters(data, prepared);
    const existing = await tx.get(ref.collection("rows").limit(prepared.length + 1));
    existing.docs.forEach(doc => assertPreparedRow(doc.id, doc.data(), prepared));
    return true;
  });
  if (!staging) return;
  for (let i = 0; i < prepared.length; i += 150) {
    const chunk = prepared.slice(i, i + 150);
    await db.runTransaction(async tx => {
      await assertCurrentActor(tx, db, actor);
      const data = (await tx.get(ref)).data();
      assertPreparationHeader(data, hash, prepared.length);
      if (data.status !== "staging") return;
      assertStagingCounters(data, prepared);
      const refs = chunk.map((_, j) => ref.collection("rows").doc(String(i + j).padStart(6, "0")));
      const existing = await tx.getAll(...refs);
      existing.forEach(doc => { if (doc.exists) assertPreparedRow(doc.id, doc.data()!, prepared); });
      chunk.forEach((row, j) => {
        if (!existing[j].exists) tx.create(refs[j], {...row, status:row.errors.length ? "rejected" : "pending"});
      });
    });
  }
  await db.runTransaction(async tx => {
    await assertCurrentActor(tx, db, actor);
    const data = (await tx.get(ref)).data();
    assertPreparationHeader(data, hash, prepared.length);
    if (data.status !== "staging") return;
    assertStagingCounters(data, prepared);
    const rows = await tx.get(ref.collection("rows").limit(prepared.length + 1));
    if (rows.size !== prepared.length) throw new OperationError("La preparación no está completa; vuelva a continuar esta importación");
    rows.docs.forEach(doc => assertPreparedRow(doc.id, doc.data(), prepared));
    const now = Timestamp.now();
    tx.update(ref, {status:"ready", updatedAt:now, ...(recovery ? {recoveredAt:now, recoveredBy:{uid:actor.uid, email:actor.email, role:actor.role}} : {})});
    if (recovery) audit(tx, db, actor, "resume_import_personal", ref.id, {entity:"import_personal", importId:ref.id, totalRows:prepared.length});
  });
}

export async function resumePersonalImportPreparation(actor: Actor, id: string, rows: Record<string, unknown>[]) {
  const db = getAdminDb();
  await completePreparation(actor, db, db.collection("imports_personal").doc(id), payloadHash(rows), preparePersonalRows(rows), true);
  return personalImportResult(id);
}

export async function stagePersonalImport(actor:Actor, rows:Record<string,unknown>[], fileName:string, operationId?:string) {
  const prepared=preparePersonalRows(rows);
  const hash=payloadHash(rows), id="padron_"+payloadHash({uid:actor.uid,key:operationId??hash});
  const db=getAdminDb(), ref=db.collection("imports_personal").doc(id);
  await db.runTransaction(async tx=>{
    await assertCurrentActor(tx,db,actor);
    const current=await tx.get(ref);
    if(current.exists) {assertPreparationHeader(current.data(),hash,rows.length);return;}
    tx.create(ref,{fileName,hash,totalRows:rows.length,status:"staging",createdRows:0,updatedRows:0,okRows:0,errorRows:prepared.filter(r=>r.errors.length).length,processedRows:prepared.filter(r=>r.errors.length).length,createdBy:{uid:actor.uid,email:actor.email,role:actor.role},createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
  });
  await completePreparation(actor,db,ref,hash,prepared,false);
  return id;
}

export async function personalImportResult(id:string) {
  const ref=getAdminDb().collection("imports_personal").doc(id), snap=await ref.get();
  if(!snap.exists)throw new OperationError("Importación no encontrada",404);
  const data=snap.data()!;
  const rejected=await ref.collection("rows").where("status","==","rejected").get();
  return {importId:id,...data,createdAt:data.createdAt?.toDate?.()?.toISOString()??null,updatedAt:data.updatedAt?.toDate?.()?.toISOString()??null,leaseUntil:data.leaseUntil?.toMillis?.()??null,processingActive:data.status==="processing" && (data.leaseUntil?.toMillis?.()??0)>Date.now(),errors:rejected.docs.flatMap(d=>d.data().errors??[])};
}

export async function processPersonalImport(actor:Actor,id:string) {
  const db=getAdminDb(), ref=db.collection("imports_personal").doc(id), owner=randomUUID();
  const claimed=await db.runTransaction(async tx=>{
    await assertCurrentActor(tx,db,actor);
    const current=await tx.get(ref);if(!current.exists)throw new OperationError("Importación no encontrada",404);
    const row=current.data()!;
    if(row.status==="confirmed")return false;
    if(row.status==="staging")throw new OperationError("Preparación incompleta. Vuelva a cargar el mismo archivo");
    if(row.status==="processing" && row.leaseUntil?.toMillis()>Date.now())throw new OperationError("Este lote está siendo procesado; espere unos segundos");
    tx.update(ref,{status:"processing",owner,leaseUntil:Timestamp.fromMillis(Date.now()+60_000),updatedAt:Timestamp.now()});
    return true;
  });
  if(!claimed)return personalImportResult(id);
  try{
    const pending=await ref.collection("rows").where("status","==","pending").limit(100).get();
    const started=Date.now();
    for(const rowDoc of pending.docs){
      if(Date.now()-started>8_000)break;
      const newPerson=db.collection("personal").doc();
      await db.runTransaction(async tx=>{
        await assertCurrentActor(tx,db,actor);
        const batch=await tx.get(ref), ledger=await tx.get(rowDoc.ref);
        if(batch.data()?.owner!==owner || batch.data()?.status!=="processing")throw new OperationError("El procesador del lote cambió");
        if(ledger.data()?.status!=="pending")return;
        const input=ledger.data()!.normalized;
        const registryRef=db.collection("ci_registry").doc(ciKey(input.ci));
        const registry=await tx.get(registryRef);
        const matches=await tx.get(db.collection("personal").where("ci","==",input.ci));
        if(matches.size>1)throw new OperationError("CI duplicado: requiere revisión del padrón");
        const registered=registry.data()?.personalId;
        const target=db.collection("personal").doc(registered||matches.docs[0]?.id||newPerson.id);
        const before=await tx.get(target);
        if(registered && !before.exists && !matches.empty)throw new OperationError("Registro de identidad inconsistente");
        const now=Timestamp.now(), payload={...input,...personalIndex(input),updatedAt:now};
        tx.set(target,{...payload,createdAt:before.data()?.createdAt??now},{merge:true});
        tx.set(registryRef,{ci:input.ci,personalId:target.id,createdAt:registry.data()?.createdAt??now});
        const status=before.exists?"updated":"created";
        tx.update(rowDoc.ref,{status,personalId:target.id,appliedAt:now});
        tx.update(ref,{okRows:FieldValue.increment(1),processedRows:FieldValue.increment(1),[before.exists?"updatedRows":"createdRows"]:FieldValue.increment(1),leaseUntil:Timestamp.fromMillis(Date.now()+60_000),updatedAt:now});
        audit(tx,db,actor,"import_personal",target.id,{entity:"personal",importId:id,before:before.data()??null,after:payload});
      });
    }
    const remaining=await ref.collection("rows").where("status","==","pending").limit(1).get();
    await db.runTransaction(async tx=>{
      await assertCurrentActor(tx,db,actor);
      const current=await tx.get(ref);
      if(current.data()?.owner!==owner)throw new OperationError("El procesador del lote cambió");
      tx.update(ref,{status:remaining.empty?"confirmed":"ready",owner:null,leaseUntil:null,lastError:null,updatedAt:Timestamp.now()});
      if(remaining.empty)audit(tx,db,actor,"complete_import_personal",id,{entity:"import_personal",totalRows:current.data()!.totalRows,okRows:current.data()!.okRows,errorRows:current.data()!.errorRows});
    });
  }catch(error){
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(current.data()?.owner===owner)tx.update(ref,{status:"failed",owner:null,leaseUntil:null,lastError:"No se completó el bloque. Los resultados aplicados se conservaron.",updatedAt:Timestamp.now()});
    });
    throw error;
  }
  return personalImportResult(id);
}
