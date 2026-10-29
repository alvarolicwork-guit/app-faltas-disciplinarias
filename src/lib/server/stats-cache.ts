import { createHash } from "node:crypto";
import { DocumentData, FieldValue, Firestore, Timestamp, Transaction } from "firebase-admin/firestore";

export function touchStats(tx:Transaction,db:Firestore){
  tx.set(db.collection("access_control").doc("stats_revision"),{value:FieldValue.increment(1)},{merge:true});
}
/** Cached views are scoped by role/unit and invalidated in the same transaction
 * as their source mutations. No shared client or unauthenticated cache. */
export async function statsCache(db:Firestore,scope:unknown){
  const id=createHash("sha256").update(JSON.stringify(scope)).digest("hex");
  const revisionRef=db.collection("access_control").doc("stats_revision"), ref=db.collection("stats_cache").doc(id);
  const revision=Number((await revisionRef.get()).data()?.value??0);
  const snapshot=await ref.get(), row=snapshot.data();
  const nextDeadline=row?.data?.proximaSolicitudVenceAt?Date.parse(row.data.proximaSolicitudVenceAt):Infinity;
  const hit=row?.revision===revision&&row.expiresAt?.toMillis()>Date.now()&&nextDeadline>Date.now()?row.data:null;
  return {hit,save:async(data:DocumentData)=>{
    await db.runTransaction(async tx=>{
      const state=await tx.get(db.collection("access_control").doc("maintenance")), current=await tx.get(revisionRef);
      if(state.data()?.active||Number(current.data()?.value??0)!==revision)return;
      tx.set(ref,{revision,data,expiresAt:Timestamp.fromMillis(Date.now()+300_000),createdAt:Timestamp.now()});
    });
  }};
}
