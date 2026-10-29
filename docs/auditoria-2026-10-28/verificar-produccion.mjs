// Read-only configuration and anonymous HTTP checks. No business documents,
// credentials, cookies, or tokens are written to output.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const project='control-disciplinario-comando';
if(process.env.FIREBASE_PROJECT_ID!==project || process.env.FIRESTORE_EMULATOR_HOST) throw Error('Expected exact production project and read-only execution');
const {getAdminDb}=require('../../src/lib/firebase/admin.ts');
const {getApps}=require('firebase-admin/app');
getAdminDb();
const token=(await getApps()[0].options.credential.getAccessToken()).access_token;
async function config(url){const r=await fetch(url,{headers:{authorization:`Bearer ${token}`}});const b=await r.json();return {status:r.status,body:b};}
const base='https://app-faltas-disciplinarias.vercel.app';
const results={checkedAt:new Date().toISOString(),readOnly:true,project,http:[],rules:null,indexes:null};
for(const endpoint of ['/','/api/health','/api/personal','/api/faltas','/api/users','/api/auditoria','/api/notificaciones','/api/internal/expire-requests']){
  const r=await fetch(base+endpoint,{redirect:'error'});
  results.http.push({path:endpoint,status:r.status,headers:Object.fromEntries(['content-security-policy','x-frame-options','x-content-type-options','referrer-policy','strict-transport-security','cache-control','server'].map(k=>[k,r.headers.get(k)])),...(endpoint==='/api/health'?{body:await r.json()}:{})});
}
const release=await config(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);
if(release.status===200){
  const rules=await config(`https://firebaserules.googleapis.com/v1/${release.body.rulesetName}`);
  if(rules.status===200){const file=rules.body.source.files.find(f=>f.name.endsWith('.rules'))??rules.body.source.files[0];const content=file.content;const local=readFileSync('firestore.rules','utf8');const normalize=s=>s.replaceAll('\r\n','\n').trim();const hash=s=>createHash('sha256').update(normalize(s)).digest('hex');results.rules={status:200,ruleset:release.body.rulesetName,updated:release.body.updateTime,remoteSha256:hash(content),localSha256:hash(local),matchesLocal:normalize(content)===normalize(local)};}else results.rules={status:rules.status,error:rules.body.error?.message};
}else results.rules={status:release.status,error:release.body.error?.message};
const indexes=await config(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/-/indexes`);
results.indexes=indexes.status===200?{status:200,nextPage:!!indexes.body.nextPageToken,indexes:(indexes.body.indexes??[]).map(i=>({collection:i.name.split('/collectionGroups/')[1].split('/')[0],state:i.state,queryScope:i.queryScope,fields:i.fields}))}:{status:indexes.status,error:indexes.body.error?.message};
writeFileSync('docs/auditoria-2026-10-28/produccion.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({...results,indexes:results.indexes?.indexes?{status:200,count:results.indexes.indexes.length,states:[...new Set(results.indexes.indexes.map(i=>i.state))]}:results.indexes},null,2));
