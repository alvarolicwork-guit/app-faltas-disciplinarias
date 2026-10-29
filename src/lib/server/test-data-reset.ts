import { createHash, randomUUID } from "node:crypto";
import { CollectionReference, Firestore, Timestamp } from "firebase-admin/firestore";
import { touchStats } from "./stats-cache";

export const RESET_COLLECTIONS = ["personal","ci_registry","faltas","solicitudes_eliminacion_falta","imports_personal","imports_sanciones","notificaciones","confirmaciones","reincidencias_bloqueadas","transferencias_solicitudes","transferencias_logs","integraciones_sanciones","stats_cache"] as const;
const preservedRoots=new Set(["users","unidades","access_control","audit_logs"]);
const technicalActions=new Set(["create_user","update_user","delete_user_access","first_password_change","update_user_access","unit_role_handover","create_unidad","update_unidad","delete_unidad","generate_audit_report","production_data_cleanup"]);
const operationalEntity=/^(falta|personal|import|transferencia|reincidencia|integracion)/;
const operationalAction=/^(create_falta|register_falta|request_delete_falta|resolve_delete_falta|expire_delete_falta|annul_falta|delete_falta|lower_reincidencia|import_personal|complete_import_personal|confirm_import|preview_import|revert_import|transfer_|approve_transfer|reject_transfer|expire_transfer|migrate_|rollback_chain|block_reincidencia)/;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Manifest={projectId:string;hash:string;counts:Record<string,number>;paths:string[];preservedDigest:string;unknownCollections:string[];unknownAuditActions:string[]};

async function enumerate(collection:CollectionReference, paths:string[]) {
  // listDocuments also returns missing parents that still have subcollections.
  const refs=await collection.listDocuments();
  for(let i=0;i<refs.length;i+=10)await Promise.all(refs.slice(i,i+10).map(async ref=>{
    for(const nested of await ref.listCollections())await enumerate(nested,paths);
    paths.push(ref.path);
  }));
}
async function preservedDigest(db:Firestore){
  const rows=[];
  for(const name of ["users","unidades"]){
    const snap=await db.collection(name).get();
    for(const doc of snap.docs)rows.push([doc.ref.path,doc.data()]);
  }
  rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  return digest(rows);
}
export async function resetManifest(db:Firestore, projectId:string):Promise<Manifest>{
  if(!["demo-app-faltas","control-disciplinario-comando"].includes(projectId))throw Error("Proyecto no autorizado para este procedimiento");
  const roots=await db.listCollections(), paths:string[]=[], counts:Record<string,number>={};
  for(const name of RESET_COLLECTIONS){
    const start=paths.length;
    await enumerate(db.collection(name),paths);
    counts[name]=paths.length-start;
  }
  const unknownAuditActions=new Set<string>();
  const logs=await db.collection("audit_logs").get();
  let removableAudit=0;
  for(let i=0;i<logs.docs.length;i+=10)await Promise.all(logs.docs.slice(i,i+10).map(async doc=>{
    const row=doc.data(), action=String(row.action??"");
    if(technicalActions.has(action)||["user","unidad","system"].includes(String(row.entity)))return;
    if(operationalEntity.test(String(row.entity??""))||operationalAction.test(action)){
      await enumerateAuditChildren(doc.ref.path);
      paths.push(doc.ref.path);removableAudit++;
    }else unknownAuditActions.add(action||"sin_accion");
  }));
  async function enumerateAuditChildren(path:string){for(const child of await db.doc(path).listCollections())await enumerate(child,paths);}
  counts.audit_logs=removableAudit;
  paths.sort();
  const keep=await preservedDigest(db);
  const unknownCollections=roots.map(r=>r.id).filter(name=>!RESET_COLLECTIONS.includes(name as typeof RESET_COLLECTIONS[number])&&!preservedRoots.has(name)).sort();
  const unknownAudit=[...unknownAuditActions].sort();
  return {projectId,counts,paths,preservedDigest:keep,unknownCollections,unknownAuditActions:unknownAudit,hash:digest({projectId,paths,keep,unknownCollections,unknownAudit})};
}
export function resetSummary(manifest:Manifest){return {projectId:manifest.projectId,hash:manifest.hash,counts:manifest.counts,targetPaths:manifest.paths.length,unknownCollections:manifest.unknownCollections,unknownAuditActions:manifest.unknownAuditActions,preserved:["users","unidades","access_control","technical audit events"],exportsDocuments:false};}
export async function cancelResetPreparation(db:Firestore,projectId:string,operatorUid:string,runId:string){
  if(projectId!=="demo-app-faltas"&&process.env.ALLOW_TEST_DATA_RESET!=="true")throw Error("Se requiere habilitación explícita");
  const ref=db.collection("access_control").doc(runId), fence=db.collection("access_control").doc("maintenance");
  await db.runTransaction(async tx=>{
    const run=await tx.get(ref), state=await tx.get(fence), actor=await tx.get(db.collection("users").doc(operatorUid));
    if(actor.data()?.role!=="super_admin"||(actor.data()?.status??"activo")!=="activo"||actor.data()?.isActive===false)throw Error("Sin permiso de superadministración");
    if(run.data()?.projectId!==projectId||run.data()?.operatorUid!==operatorUid||run.data()?.status!=="preparation_failed"||state.data()?.runId!==runId||Number(run.data()?.completedChunks)!==0)throw Error("Solo puede cancelarse una preparación fallida sin borrados");
    tx.update(ref,{status:"cancelled_before_deletion",cancelledAt:Timestamp.now()});
    tx.set(fence,{active:false},{merge:true});
  });
  const tasks=await ref.collection("targets").get();
  for(const task of tasks.docs)await task.ref.delete();
  return {runId,status:"cancelled_before_deletion",deletedBusinessDocuments:0};
}
type ResetOptions={projectId:string;hash?:string;runId?:string;operatorUid:string;reason:string;stopAfterChunks?:number};

/** Trusted administrative runner only; never exported through a web API. */
export async function executeTestReset(db:Firestore, options:ResetOptions){
  const {projectId,operatorUid,reason}=options;
  if(!["demo-app-faltas","control-disciplinario-comando"].includes(projectId))throw Error("Proyecto no autorizado");
  if(projectId!=="demo-app-faltas"&&process.env.ALLOW_TEST_DATA_RESET!=="true")throw Error("La ejecución real requiere habilitación explícita del procedimiento");
  if(reason.trim().length<15||reason.length>500)throw Error("Motivo requerido de 15 a 500 caracteres");
  if(options.stopAfterChunks && projectId!=="demo-app-faltas")throw Error("La interrupción simulada solo se permite en demo");
  const profile=(await db.collection("users").doc(operatorUid).get()).data();
  if(profile?.role!=="super_admin"||(profile.status??"activo")!=="activo"||profile.isActive===false)throw Error("Se requiere un superadministrador activo para operar");
  const fence=db.collection("access_control").doc("maintenance");
  const runId=options.runId??"reset_"+randomUUID(), run=db.collection("access_control").doc(runId), owner=randomUUID();
  if(!options.runId){
    const manifest=await resetManifest(db,projectId);
    if(!options.hash||manifest.hash!==options.hash)throw Error("El manifiesto cambió. Actualice la evaluación antes de ejecutar");
    if(manifest.unknownCollections.length||manifest.unknownAuditActions.length)throw Error("Existen recursos sin clasificar. Resuelva el alcance antes de ejecutar");
    await db.runTransaction(async tx=>{
      const state=await tx.get(fence);
      if(state.data()?.active)throw Error("Ya existe un procedimiento en curso");
      if(["ready_for_real_data","real"].includes(state.data()?.datasetPhase))throw Error("El reinicio de pruebas ya está cerrado para esta instalación");
      tx.set(fence,{active:true,runId,generation:Number(state.data()?.generation??0),datasetPhase:"test",startedAt:Timestamp.now()},{merge:true});
      tx.create(run,{status:"preparing",operatorUid,reason,projectId,manifestHash:manifest.hash,preservedDigest:manifest.preservedDigest,counts:manifest.counts,owner,leaseUntil:Timestamp.fromMillis(Date.now()+120_000),startedAt:Timestamp.now(),completedChunks:0});
    });
    try{
      const frozen=await resetManifest(db,projectId);
      if(frozen.hash!==manifest.hash)throw Error("Cambió el alcance al detener las escrituras; no se borró información");
      for(let i=0;i<manifest.paths.length;i+=100){
        await run.collection("targets").doc(String(i/100).padStart(6,"0")).set({paths:manifest.paths.slice(i,i+100),done:false});
      }
      await run.update({status:"running",targetPaths:manifest.paths.length});
    }catch(error){await run.update({status:"preparation_failed",lastError:"La preparación no se completó; no se inició el borrado",owner:null,leaseUntil:Timestamp.now()});throw error;}
  }else{
    await db.runTransaction(async tx=>{
      const state=await tx.get(fence), current=await tx.get(run);
      if(!current.exists||state.data()?.runId!==runId||!state.data()?.active)throw Error("No existe un reinicio activo con ese identificador");
      if(current.data()!.projectId!==projectId||current.data()!.operatorUid!==operatorUid)throw Error("Operador/proyecto no corresponde al procedimiento");
      if(!["running","interrupted"].includes(current.data()!.status))throw Error("La preparación no está lista para reanudar borrados");
      if(current.data()!.owner&&current.data()!.leaseUntil?.toMillis()>Date.now())throw Error("El procesador sigue activo; espere su finalización o vencimiento");
      tx.update(run,{owner,leaseUntil:Timestamp.fromMillis(Date.now()+120_000),status:"running"});
    });
  }
  try{
    const targets=await run.collection("targets").where("done","==",false).get();
    let completed=0;
    for(const task of targets.docs){
      await db.runTransaction(async tx=>{
        const state=await tx.get(fence), current=await tx.get(run), ledger=await tx.get(task.ref);
        if(!state.data()?.active||state.data()?.runId!==runId||current.data()?.owner!==owner)throw Error("El ejecutor o mantenimiento cambió");
        if(ledger.data()?.done)return;
        const paths=ledger.data()!.paths as string[];
        for(const path of paths){
          const root=path.split("/")[0];
          if(!RESET_COLLECTIONS.includes(root as typeof RESET_COLLECTIONS[number])&&root!=="audit_logs")throw Error("Ruta fuera de alcance");
          tx.delete(db.doc(path));
        }
        tx.update(task.ref,{done:true,paths:[],completedAt:Timestamp.now()});
        tx.update(run,{completedChunks:Number(current.data()!.completedChunks??0)+1,leaseUntil:Timestamp.fromMillis(Date.now()+120_000)});
      });
      completed++;
      if(options.stopAfterChunks && completed>=options.stopAfterChunks)throw Error("Interrupción ficticia de prueba");
    }
    const remaining=await resetManifest(db,projectId), current=(await run.get()).data()!;
    if(remaining.paths.length||remaining.unknownAuditActions.length||remaining.preservedDigest!==current.preservedDigest)throw Error("La verificación final detectó residuos o cambios en los recursos conservados");
    await db.runTransaction(async tx=>{
      const state=await tx.get(fence), current=await tx.get(run);
      if(state.data()?.runId!==runId||current.data()?.owner!==owner)throw Error("El procedimiento cambió");
      tx.set(db.collection("audit_logs").doc(runId),{action:"production_data_cleanup",entity:"system",entityId:projectId,via:"trusted_administrative_script",operatorProfileUid:operatorUid,reason,manifestHash:current.data()!.manifestHash,counts:current.data()!.counts,exportsDocuments:false,createdAt:Timestamp.now()});
      tx.update(run,{status:"completed",completedAt:Timestamp.now(),owner:null,leaseUntil:null});
      touchStats(tx,db);
      tx.set(db.collection("access_control").doc("search_index"),{version:1,updatedAt:Timestamp.now()});
      tx.set(fence,{active:false,generation:Number(state.data()?.generation??0)+1,datasetPhase:"ready_for_real_data",completedAt:Timestamp.now()},{merge:true});
    });
    return {runId,status:"completed",counts:current.counts,exportsDocuments:false,preservedUsersAndUnits:true};
  }catch(error){
    await db.runTransaction(async tx=>{const current=await tx.get(run);if(current.data()?.owner===owner)tx.update(run,{status:"interrupted",owner:null,leaseUntil:Timestamp.now(),lastError:"Ejecución interrumpida; mantenimiento conservado para reanudar"});});
    throw Object.assign(error instanceof Error?error:Error("No se completó el procedimiento"),{runId});
  }
}
