import { Firestore, Query, DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { OperationError, payloadHash } from "./operations";

export async function queryPage(db:Firestore, query:Query<DocumentData>, options:{collection:string;size:number;cursor:string|null;scope:unknown;matches:(row:DocumentData)=>boolean}) {
  const hash=payloadHash(options.scope);
  if(options.cursor){
    try{
      const value=JSON.parse(Buffer.from(options.cursor,"base64url").toString());
      if(value.hash!==hash||typeof value.id!=="string"||!/^[\w-]{1,200}$/.test(value.id))throw Error();
      const last=await db.collection(options.collection).doc(value.id).get();
      if(!last.exists)throw Error();
      query=query.startAfter(last);
    }catch{throw new OperationError("La consulta cambió; vuelva a buscar desde el inicio",400);}
  }
  const docs:QueryDocumentSnapshot[]=[];
  let scanned=0,end=false,lastId:string|null=null;
  while(scanned<500&&docs.length<options.size){
    const take=Math.min(100,500-scanned), snap=await query.limit(take).get();
    if(snap.empty){end=true;break;}
    let consumed=0;
    for(const doc of snap.docs){consumed++;scanned++;lastId=doc.id;if(options.matches(doc.data()))docs.push(doc);if(docs.length===options.size)break;}
    if(consumed===snap.size&&snap.size<take){end=true;break;}
    if(docs.length===options.size)break;
    query=query.startAfter(snap.docs.at(-1)!);
  }
  return {docs,nextCursor:end||!lastId?null:Buffer.from(JSON.stringify({hash,id:lastId})).toString("base64url"),scanned};
}
