import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { expireRequest } from "./cancellations";
import { assertDataAvailable } from "./maintenance";

export async function processExpiredRequests() {
  const db=getAdminDb(), started=Date.now();
  let scanned=0,expired=0,hasMore=false;
  const query=db.collection("solicitudes_eliminacion_falta").where("estado","==","pendiente").where("expiresAt","<=",Timestamp.fromMillis(started)).orderBy("expiresAt").limit(100);
  for(let page=0;page<10;page++){
    await db.runTransaction(tx=>assertDataAvailable(tx,db));
    const snap=await query.get();
    if(snap.empty){hasMore=false;break;}
    hasMore=true;
    for(const doc of snap.docs){
      scanned++;
      if(await expireRequest(doc.id))expired++;
      if(Date.now()-started>8_000)break;
    }
    if(Date.now()-started>8_000)break;
  }
  await db.runTransaction(async tx=>{
    await assertDataAvailable(tx,db);
    tx.set(db.collection("access_control").doc("expiry_job"),{lastSuccessAt:Timestamp.now(),scanned,expired,hasMore,durationMs:Date.now()-started,lastError:null},{merge:true});
  });
  return {scanned,expired,hasMore};
}
