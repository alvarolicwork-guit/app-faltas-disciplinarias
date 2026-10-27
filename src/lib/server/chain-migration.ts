import { FieldValue, Firestore } from "firebase-admin/firestore";
import { inspectChains, type SanctionRow } from "@/lib/domain/recurrence-chain";
import { payloadHash } from "./operations";

const fields = ["conductaOrigen", "cadenaId", "raizHistoricaId", "raizVigenteId", "fechaInicioCadena", "fechaVencimientoCadena", "nivelEfectivo", "versionReglas"] as const;
type Change = { id:string; patch:Record<string,unknown>; before:Record<string,{present:boolean;value:unknown}> };
export type ChainMigration = { version:1; persons:Array<{personalId:string;hashBefore:string;hashAfter?:string;changes:Change[]}>; issues:Array<{id:string;reason:string}>; nodes:number };
export function rowsHash(rows: SanctionRow[]) { return payloadHash([...rows].sort((a,b)=>a.id.localeCompare(b.id))); }

/** Additive deterministic metadata only. Does not retipify, remove or annul records. */
export function prepareChainMigration(rows: SanctionRow[]): ChainMigration {
  const inspected=inspectChains(rows), issues=inspected.filter(r=>r.error).map(r=>({id:r.id,reason:r.error!}));
  const invalidPersons=new Set(issues.map(i=>rows.find(r=>r.id===i.id)?.personalId));
  const groups=new Map<string,SanctionRow[]>();
  for(const row of rows){const person=String(row.personalId);groups.set(person,[...(groups.get(person)??[]),row]);}
  const persons:ChainMigration["persons"]=[];
  for(const [personalId,personRows] of groups){
    if(invalidPersons.has(personalId))continue;
    const changes:Change[]=[];
    for(const row of personRows){
      const meta=inspected.find(i=>i.id===row.id)?.metadata;
      if(!meta)continue;
      const patch:Record<string,unknown>={},before:Change["before"]={};
      for(const key of fields)if(payloadHash(row[key]??null)!==payloadHash(meta[key])){
        patch[key]=meta[key];before[key]={present:row[key]!==undefined,value:row[key]??null};
      }
      if(Object.keys(patch).length)changes.push({id:row.id,patch,before});
    }
    if(changes.length)persons.push({personalId,hashBefore:rowsHash(personRows),changes});
  }
  return {version:1,persons,issues,nodes:rows.length};
}
function assertDemo() {
  if(process.env.FIREBASE_PROJECT_ID!=="demo-app-faltas"||process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8087")throw new Error("Aplicación/restauración habilitadas únicamente en demo-app-faltas local; producción requiere un procedimiento autorizado de migración y respaldo");
}
export async function applyDemoMigration(db:Firestore,manifest:ChainMigration) {
  assertDemo();
  for(const person of manifest.persons){
    person.hashAfter=await db.runTransaction(async tx=>{
      const snap=await tx.get(db.collection("faltas").where("personalId","==",person.personalId));
      const rows=snap.docs.map(d=>({...d.data(),id:d.id}));
      if(rowsHash(rows)!==person.hashBefore)throw new Error("Los datos cambiaron desde el diagnóstico; regenere el manifiesto");
      const after=rows.map(row=>({...row,...person.changes.find(c=>c.id===row.id)?.patch}));
      for(const change of person.changes)tx.update(db.collection("faltas").doc(change.id),change.patch);
      return rowsHash(after);
    });
  }
  return manifest;
}
export async function restoreDemoMigration(db:Firestore,manifest:ChainMigration) {
  assertDemo();
  for(const person of manifest.persons){
    await db.runTransaction(async tx=>{
      const snap=await tx.get(db.collection("faltas").where("personalId","==",person.personalId));
      const rows=snap.docs.map(d=>({...d.data(),id:d.id}));
      if(!person.hashAfter||rowsHash(rows)!==person.hashAfter)throw new Error("Hubo operaciones posteriores; la restauración exige conciliación");
      for(const change of person.changes){
        const patch=Object.fromEntries(Object.entries(change.before).map(([key,old])=>[key,old.present?old.value:FieldValue.delete()]));
        tx.update(db.collection("faltas").doc(change.id),patch);
      }
    });
  }
}
