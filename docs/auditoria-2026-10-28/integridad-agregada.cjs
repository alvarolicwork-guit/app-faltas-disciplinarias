/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only. Print counts/categories only; never export records or identifiers.
const {writeFileSync}=require('node:fs');
if(process.env.FIREBASE_PROJECT_ID!=='control-disciplinario-comando'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Exact production project required');
const {getAdminDb}=require('../../src/lib/firebase/admin.ts');
const {inspectChains}=require('../../src/lib/domain/recurrence-chain.ts');
const {ciKey}=require('../../src/lib/domain/text-normalization.ts');
async function main(){
 const db=getAdminDb();
 const [people,registry,sanctions,units,users]=await Promise.all(['personal','ci_registry','faltas','unidades','users'].map(c=>db.collection(c).get()));
 const byId=new Map(people.docs.map(d=>[d.id,d.data()])),byKey=new Map(registry.docs.map(d=>[d.id,d.data()]));
 const knownUnits=new Map(units.docs.map(d=>[d.id,d.data()]));
 const groups=new Map();for(const d of sanctions.docs){const p=d.data().personalId;groups.set(p,[...(groups.get(p)||[]),{...d.data(),id:d.id}]);}
 const reasons={},affected=new Set();
 for(const [id,rows]of groups)for(const issue of inspectChains(rows))if(issue.error){reasons[issue.error]=(reasons[issue.error]??0)+1;affected.add(id);}
 const result={readOnly:true,checkedAt:new Date().toISOString(),counts:{personal:people.size,registry:registry.size,sanctions:sanctions.size,units:units.size},issues:{missingRegistry:people.docs.filter(d=>!byKey.has(ciKey(String(d.data().ci??'')))).length,registryWrongPerson:people.docs.filter(d=>byKey.has(ciKey(String(d.data().ci??'')))&&byKey.get(ciKey(String(d.data().ci??''))).personalId!==d.id).length,orphanRegistry:registry.docs.filter(d=>!byId.has(d.data().personalId)).length,sanctionMissingUnit:sanctions.docs.filter(d=>!knownUnits.has(d.data().unidadId)).length,activeUnitUserWithoutActiveUnit:users.docs.filter(d=>['admin_unidad','operador_unidad'].includes(d.data().role)&&(d.data().status??'activo')==='activo'&&d.data().isActive!==false&&knownUnits.get(d.data().unidadId)?.estado!=='activa').length,affectedPersons:affected.size,chainReasons:reasons}};
 writeFileSync('docs/auditoria-2026-10-28/integridad-agregada.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}main().catch(()=>{console.error('Read-only integrity check failed; no records written.');process.exitCode=1;});
