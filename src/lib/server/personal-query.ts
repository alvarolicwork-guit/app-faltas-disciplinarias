import { DocumentData, Firestore, Query } from "firebase-admin/firestore";
import { matchesPersonalSearch, normalizePersonalSearch } from "@/lib/domain/personal-search";
import { OperationError, payloadHash } from "./operations";

export async function indexedPersonal(db:Firestore, input:{q:string;limit:number;cursor:string|null;scope:string;exactCI?:string|null}) {
  const {q,limit,cursor,scope}=input;
  if(input.exactCI){
    const {ciKey}=await import("@/lib/domain/text-normalization");
    const registry=await db.collection("ci_registry").doc(ciKey(input.exactCI)).get();
    const person=registry.exists?await db.collection("personal").doc(registry.data()!.personalId).get():null;
    const data:Array<DocumentData&{id:string}>=person?.exists?[{...person.data(),id:person.id}]:[];
    return {data,total:data.length,nextOffset:null,nextCursor:null,scanned:person?2:1};
  }
  const fingerprint=payloadHash({q:normalizePersonalSearch(q),scope});
  let lastId:string|null=null;
  if(cursor){
    try{const parsed=JSON.parse(Buffer.from(cursor,"base64url").toString());if(parsed.fingerprint!==fingerprint||typeof parsed.id!=="string"||!/^[\w-]{1,128}$/.test(parsed.id))throw Error();lastId=parsed.id;}
    catch{throw new OperationError("Cursor inválido para esta búsqueda",400);}
  }
  let query:Query<DocumentData>=db.collection("personal").orderBy("searchName").orderBy("__name__");
  const term=normalizePersonalSearch(q).split(" ").sort((a,b)=>b.length-a.length)[0];
  if(term)query=query.where("searchGrams","array-contains",term.slice(0,3));
  if(lastId){const last=await db.collection("personal").doc(lastId).get();if(!last.exists)throw new OperationError("El padrón cambió; reinicie la búsqueda",409);query=query.startAfter(last);}
  const data:Array<DocumentData&{id:string}>=[];
  let scanned=0, end=false, nextId=lastId;
  while(scanned<500 && data.length<limit){
    const count=Math.min(100,500-scanned), snap=await query.limit(count).get();
    if(snap.empty){end=true;break;}
    let consumed=0;
    for(const doc of snap.docs){
      consumed++;scanned++;nextId=doc.id;
      if(matchesPersonalSearch(doc.data(),q))data.push({...doc.data(),id:doc.id});
      if(data.length===limit)break;
    }
    if(consumed===snap.size && snap.size<count){end=true;break;}
    if(data.length===limit)break;
    query=query.startAfter(snap.docs.at(-1)!);
  }
  return {data,total:!cursor&&end?data.length:null,nextOffset:null,nextCursor:end||!nextId?null:Buffer.from(JSON.stringify({fingerprint,id:nextId})).toString("base64url"),scanned};
}
