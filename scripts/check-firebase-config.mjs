// Read-only verification. Deployment uses the authorized Firebase CLI session.
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {getAdminAuth} from "../src/lib/firebase/admin.ts";
import {getApp} from "firebase-admin/app";
import {getSecurityRules} from "firebase-admin/security-rules";
const project="control-disciplinario-comando";
if(process.env.FIREBASE_PROJECT_ID!==project||process.env.FIRESTORE_EMULATOR_HOST)throw Error("Exact production target required");
getAdminAuth();
const token=(await getApp().options.credential.getAccessToken()).access_token;
const hash=s=>createHash("sha256").update(s.replaceAll("\r\n","\n").trim()).digest("hex");
const base="https://firestore.googleapis.com/v1/projects/"+project+"/databases/(default)/collectionGroups/-/indexes";
const remote=[];let next;
do{
  const response=await fetch(base+(next?"?pageToken="+encodeURIComponent(next):""),{headers:{authorization:"Bearer "+token},signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw Error("Index verification HTTP "+response.status);
  remote.push(...(result.indexes??[]));next=result.nextPageToken;
}while(next);
const key=(collection,scope,fields)=>JSON.stringify({collection,scope,fields:fields.filter(f=>f.fieldPath!=="__name__").map(f=>({fieldPath:f.fieldPath,...(f.arrayConfig?{arrayConfig:f.arrayConfig}:{order:f.order})}))});
const local=JSON.parse(readFileSync("firestore.indexes.json","utf8").replace(/^\uFEFF/,"")).indexes;
const rules=await getSecurityRules().getFirestoreRuleset(), source=readFileSync("firestore.rules","utf8");
const matched=local.map(item=>{const found=remote.find(i=>key(i.name.split("/collectionGroups/")[1].split("/")[0],i.queryScope,i.fields)===key(item.collectionGroup,item.queryScope,item.fields));return {collection:item.collectionGroup,state:found?.state??"MISSING"};});
const result={checkedAt:new Date().toISOString(),project,readOnly:true,rules:{name:rules.name,matchesLocal:hash(rules.source[0].content)===hash(source),sha256:hash(rules.source[0].content)},declaredIndexes:local.length,matchedIndexes:matched,allReady:matched.every(i=>i.state==="READY")};
writeFileSync(".local-firebase-config.json",JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,matchedIndexes:undefined,states:[...new Set(matched.map(i=>i.state))]},null,2));
