import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { ciKey } from "@/lib/domain/text-normalization";
import { personalIndex } from "@/lib/domain/personal-index";
import { preparePersonalRows } from "@/lib/imports/personal-rows";
import { Actor, assertCurrentActor, audit, OperationError, payloadHash } from "./operations";

export async function stagePersonalImport(actor:Actor, rows:Record<string,unknown>[], fileName:string, operationId?:string) {
  const prepared=preparePersonalRows(rows);
  const hash=payloadHash(rows), id="padron_"+payloadHash({uid:actor.uid,key:operationId??hash});
  const db=getAdminDb(), ref=db.collection("imports_personal").doc(id);
  const ready=await db.runTransaction(async tx=>{
    await assertCurrentActor(tx,db,actor);
    const current=await tx.get(ref);
    if(current.exists && current.data()!.hash!==hash)throw new OperationError("Esta operación corresponde a otro archivo");
    if(current.exists && current.data()!.status!=="staging") return true;
    tx.set(ref,{fileName,hash,totalRows:rows.length,status:"staging",createdRows:0,updatedRows:0,okRows:0,errorRows:prepared.filter(r=>r.errors.length).length,processedRows:prepared.filter(r=>r.errors.length).length,createdBy:{uid:actor.uid,email:actor.email,role:actor.role},createdAt:current.data()?.createdAt??Timestamp.now(),updatedAt:Timestamp.now()},{merge:true});
    return false;
  });
  if(!ready){
    for(let i=0;i<prepared.length;i+=150){
      const chunk=prepared.slice(i,i+150);
      await db.runTransaction(async tx=>{
        await assertCurrentActor(tx,db,actor);
        const current=await tx.get(ref);if(current.data()?.status!=="staging")return;
        const refs=chunk.map((_,j)=>ref.collection("rows").doc(String(i+j).padStart(6,"0")));
        const existing=await tx.getAll(...refs);
        chunk.forEach((row,j)=>{if(!existing[j].exists)tx.create(refs[j],{...row,status:row.errors.length?"rejected":"pending"});});
      });
    }
    await db.runTransaction(async tx=>{
      await assertCurrentActor(tx,db,actor);
      const current=await tx.get(ref);
      if(current.data()?.status==="staging")tx.update(ref,{status:"ready",updatedAt:Timestamp.now()});
    });
  }
  return id;
}

export async function personalImportResult(id:string) {
  const ref=getAdminDb().collection("imports_personal").doc(id), snap=await ref.get();
  if(!snap.exists)throw new OperationError("Importación no encontrada",404);
  const data=snap.data()!;
  const rejected=await ref.collection("rows").where("status","==","rejected").get();
  return {importId:id,...data,createdAt:data.createdAt?.toDate?.()?.toISOString()??null,updatedAt:data.updatedAt?.toDate?.()?.toISOString()??null,leaseUntil:data.leaseUntil?.toMillis?.()??null,errors:rejected.docs.flatMap(d=>d.data().errors??[])};
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
