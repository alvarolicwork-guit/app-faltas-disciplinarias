import assert from "node:assert/strict";
import { before, test } from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "../firebase/admin";
import { POST as register } from "../../app/api/faltas/route";
import { POST as preview } from "../../app/api/faltas/evaluar/route";
import { GET as antecedents } from "../../app/api/antecedentes/route";
import { payloadHash, prepareConfirmation, type Actor } from "./operations";
import { cancelDirectly } from "./cancellations";
import { CHAIN_DAY_MS, canonicalConduct, newChainMetadata, resolveChain } from "../domain/recurrence-chain";
import { DISCIPLINARY_CATALOG } from "../domain/disciplinary-catalog";
import { applyDemoMigration, prepareChainMigration, restoreDemoMigration, rowsHash } from "./chain-migration";

if(process.env.GCLOUD_PROJECT!=="demo-app-faltas"||process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8087"||process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9097")throw new Error("Only local demo-app-faltas emulators");
process.env.FIREBASE_PROJECT_ID="demo-app-faltas";
const db=getAdminDb(),actor={uid:"chains-registrar",email:"chains@example.test",role:"admin_unidad",unidadId:"chains-unit"} as Actor;
let authToken:string;
let adminToken:string;
const article=(n:number)=>DISCIPLINARY_CATALOG.find(a=>a.id===`art${n}`)!;
before(async()=>{
  await getAdminAuth().createUser({uid:actor.uid,email:actor.email,password:"SoloEmulador123!"});
  await db.collection("users").doc(actor.uid).set({role:actor.role,email:actor.email,unidadId:actor.unidadId,status:"activo",isActive:true});
  await db.collection("unidades").doc(actor.unidadId!).set({nombre:"Unidad ficticia de cadenas",estado:"activa"});
  const res=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:actor.email,password:"SoloEmulador123!",returnSecureToken:true})});
  authToken=(await res.json()).idToken;assert.ok(authToken);
});
const request=(url:string,body?:unknown)=>new NextRequest(`http://localhost${url}`,{method:body?"POST":"GET",headers:{authorization:`Bearer ${authToken}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
async function person(id:string){await db.collection("personal").doc(id).set({ci:`FICTICIO-${id}`,nombreCompleto:"Persona ficticia de cadenas",grado:"Cabo"});}
async function seed(personalId:string,id:string,a:number,i:number,date:string,parent?:string,extra:Record<string,unknown>={}){
  await person(personalId);
  const prior=parent?(await db.collection("faltas").doc(parent).get()).data()!:null;
  await db.collection("faltas").doc(id).set({personalId,unidadId:actor.unidadId,unidadNombre:"Unidad ficticia de cadenas",articulo:article(a).label,inciso:article(a).incisos[i-1],fechaSancion:Timestamp.fromDate(new Date(`${date}T00:00:00Z`)),createdAt:Timestamp.fromMillis(Date.now()-30*CHAIN_DAY_MS),estado:"registrada",createdBy:{uid:actor.uid},memorandum:`Documento-${id}`,reincidenciaOrigen:prior?{faltaReferenciaId:parent,articuloBase:prior.articulo,incisoBase:prior.inciso}:null,...extra});
}
async function payload(personalId:string,a:number,i:number,date="2026-10-27",parent?:string){
  const prior=parent?(await db.collection("faltas").doc(parent).get()).data()!:null;
  return {personalId,unidadId:actor.unidadId,articulo:article(a).label,inciso:article(a).incisos[i-1],fechaSancion:date,memorandum:a===9?"Acta-900/2026":"Memorándum-900/2026",motivo:"Prueba aislada de reincidencia",reincidenciaOrigen:prior?{faltaReferenciaId:parent,articuloBase:prior.articulo,incisoBase:prior.inciso}:null};
}
async function send(p:Record<string,unknown>){const confirmationId=await prepareConfirmation(actor,"registrar_sancion",p);return register(request("/api/faltas",{...p,payloadConfirmado:p,confirmationId}));}

test("A04-A09: dos conductas9/X escalan independientemente hasta11/1",async()=>{
  await seed("parallel","pa",9,1,"2026-01-01");await seed("parallel","pb",10,1,"2026-03-01","pa");await seed("parallel","pc",11,1,"2026-05-01","pb");
  await seed("parallel","px",9,2,"2026-02-01");await seed("parallel","py",10,1,"2026-04-01","px");
  const response=await send(await payload("parallel",11,1,"2026-10-27","py"));const saved=await response.json();assert.equal(response.status,201,JSON.stringify(saved));
  const row=(await db.collection("faltas").doc(saved.faltaId).get()).data()!;assert.equal(row.conductaOrigen.incisoNumero,2);assert.equal(row.cadenaId,"px");assert.equal(row.fechaVencimientoCadena,"2027-02-01");
  const a=await send(await payload("parallel",9,1));const result=await a.json();assert.equal(a.status,409);assert.match(result.sancionSugerida.articulo,/12/);assert.equal(result.referencia.faltaId,"pc");
});
test("A16-A17-A46: vence la raíz9/10, permite nueva base y prohíbe continuar cadena antigua",async()=>{
  for(const a of [9,10]){
    const p=`expired-${a}`,inc=a===9?1:5;
    await seed(p,`${p}-root`,a,inc,"2025-10-01");await seed(p,`${p}-child`,a+1,1,"2026-09-01",`${p}-root`);
    const stale=await send(await payload(p,a+1,1,"2026-10-27",`${p}-root`));assert.equal(stale.status,409);
    const result=await send(await payload(p,a,inc));const body=await result.json();assert.equal(result.status,201,JSON.stringify(body));
    const row=(await db.collection("faltas").doc(body.faltaId).get()).data()!;assert.equal(row.cadenaId,body.faltaId);assert.equal(row.fechaInicioCadena,"2026-10-27");assert.equal(row.fechaVencimientoCadena,"2027-10-27");assert.equal(row.reincidenciaOrigen,null);
  }
});
test("A08-A18: no admite salto9→11, fecha futura o origen de otra persona",async()=>{
  await seed("invalid","invalid-root",9,1,"2026-01-01");
  assert.equal((await send(await payload("invalid",11,1,"2026-10-27","invalid-root"))).status,400);
  await person("future");assert.equal((await send(await payload("future",9,1,"2099-01-01"))).status,400);
  await person("foreign");assert.notEqual((await send(await payload("foreign",10,1,"2026-10-27","invalid-root"))).status,201);
});
test("A25: confirmación con decisión desactualizada obliga a reevaluar",async()=>{
  await person("stale");const conduct=article(9);
  const proposed=await preview(request("/api/faltas/evaluar",{personalId:"stale",articulo:conduct.label,inciso:conduct.incisos[0],fechaSancion:"2026-10-27"}));const decision=await proposed.json();assert.equal(proposed.status,200);
  const p={...await payload("stale",9,1),decisionVersion:decision.decisionVersion};
  await seed("stale","stale-new",9,2,"2026-10-01");
  const response=await send(p);assert.equal(response.status,409);assert.match((await response.json()).error,/cambiaron/);
});
test("A21-A22-A51: carreras no duplican base y permiten conductas distintas",async()=>{
  await person("race-same");const same=await payload("race-same",9,1);
  const results=await Promise.all([send(same),send(same)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal((await db.collection("faltas").where("personalId","==","race-same").get()).size,1);
  await person("race-other");const separate=await Promise.all([send(await payload("race-other",9,1)),send(await payload("race-other",9,2))]);assert.deepEqual(separate.map(r=>r.status),[201,201]);
});
test("A11-A12-A13-A49: bloqueo de siete/cinco días; cadena vencida no bloquea nueva base",async()=>{
  await seed("waiting","waiting-root",9,1,"2026-10-01",undefined,{createdAt:Timestamp.fromMillis(Date.now()-6*CHAIN_DAY_MS)});
  let decision=await preview(request("/api/faltas/evaluar",{personalId:"waiting",articulo:article(9).label,inciso:article(9).incisos[0],fechaSancion:"2026-10-27"}));assert.match((await decision.json()).bloqueo,/siete días/);
  await db.collection("faltas").doc("waiting-root").update({createdAt:Timestamp.fromMillis(Date.now()-8*CHAIN_DAY_MS)});
  await db.collection("solicitudes_eliminacion_falta").doc("waiting-request").set({faltaId:"waiting-root",estado:"pendiente",createdAt:Timestamp.fromMillis(Date.now()-2*CHAIN_DAY_MS),expiresAt:Timestamp.fromMillis(Date.now()+3*CHAIN_DAY_MS)});
  decision=await preview(request("/api/faltas/evaluar",{personalId:"waiting",articulo:article(9).label,inciso:article(9).incisos[0],fechaSancion:"2026-10-27"}));assert.match((await decision.json()).bloqueo,/pendiente/);
  await seed("old-request","old-root",9,1,"2025-10-01");await seed("old-request","old-child",10,1,"2026-09-01","old-root");
  await db.collection("solicitudes_eliminacion_falta").doc("old-pending").set({faltaId:"old-child",estado:"pendiente",expiresAt:Timestamp.fromMillis(Date.now()+CHAIN_DAY_MS)});
  assert.equal((await send(await payload("old-request",9,1))).status,201);
});
test("A28-A29: importación revalida nuevas bases y recupera lotes sin resucitar anuladas",async()=>{
  const {POST:confirm}=await import("../../app/api/imports/faltas/[id]/confirm/route");
  const superActor={...actor,uid:"chains-super",role:"super_admin",email:"chains-super@example.test"} as Actor;
  await getAdminAuth().createUser({uid:superActor.uid,email:superActor.email,password:"SoloEmulador123!"});await db.collection("users").doc(superActor.uid).set({role:"super_admin",email:superActor.email,status:"activo",isActive:true});
  const login=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:superActor.email,password:"SoloEmulador123!",returnSecureToken:true})});adminToken=(await login.json()).idToken;
  await seed("import-race","import-new-base",9,1,"2026-01-01");
  const imp=db.collection("imports_sanciones").doc("chains-import");await imp.set({status:"preview"});
  const normalized={rowKey:"row-2",sourceRow:2,ci:"FICTICIO-import-race",personalId:"import-race",nombreCompleto:"Persona ficticia",gradoActual:"Cabo",unidadActualId:"",unidadActualNombre:"",fechaSancion:"2026-02-01",articulo:article(9).label,inciso:article(9).incisos[0],memorandum:"Acta-901/2026",motivo:"Prueba aislada de importación",motivoNoDisponible:false,unidadSancionId:actor.unidadId,unidadSancionNombre:"Unidad ficticia",unidadEfectivoHistoricaId:actor.unidadId,unidadEfectivoHistoricaNombre:"Unidad ficticia",importKey:"chains-import-distinta",isEscalada:false};
  await imp.collection("rows").doc("row-2").set({sourceRow:2,status:"valid",normalized,original:{},errors:[],warnings:[]});
  const sendImport=()=>confirm(new NextRequest("http://localhost/api/imports/faltas/chains-import/confirm",{method:"POST",headers:{authorization:`Bearer ${adminToken}`,"Content-Type":"application/json"},body:JSON.stringify({confirmation:"IMPORTAR SANCIONES"})}),{params:Promise.resolve({id:"chains-import"})});
  assert.equal((await sendImport()).status,409);assert.equal((await imp.get()).data()?.status,"failed");
  // A crashed import with an expired lease can resume; the already annulled row is never rewritten.
  await db.collection("faltas").doc("import_chains-import_row-2").set({...normalized,estado:"anulada"});
  await imp.set({status:"processing",processingOwner:"old-worker",processingLeaseUntil:Timestamp.fromMillis(Date.now()-1)},{merge:true});
  assert.equal((await sendImport()).status,200);assert.equal((await db.collection("faltas").doc("import_chains-import_row-2").get()).data()?.estado,"anulada");
});
test("A36-A43: migración aditiva ensayada, idempotencia y restauración exacta en demo",async()=>{
  await seed("migration","mig-root",10,5,"2026-01-01");await seed("migration","mig-child",11,1,"2026-02-01","mig-root");
  const read=async()=> (await db.collection("faltas").where("personalId","==","migration").get()).docs.map(d=>({...d.data(),id:d.id}));
  const before=await read(),manifest=prepareChainMigration(before);assert.equal(manifest.issues.length,0);assert.equal(manifest.persons[0].changes.length,2);
  await applyDemoMigration(db,manifest);assert.equal(prepareChainMigration(await read()).persons.length,0);
  await restoreDemoMigration(db,manifest);assert.equal(rowsHash(await read()),rowsHash(before));
  await applyDemoMigration(db,manifest);await db.collection("faltas").doc("mig-child").update({motivo:"Operación posterior ficticia"});
  await assert.rejects(restoreDemoMigration(db,manifest),/posteriores/);
});
test("A37: inventario no omite una escalada huérfana sin descendientes",async()=>{
  const malformed={id:"orphan",personalId:"orphan-person",estado:"registrada",articulo:article(10).label,inciso:article(10).incisos[0],fechaSancion:"2026-01-01",reincidenciaOrigen:{faltaReferenciaId:"missing"}};
  assert.equal(prepareChainMigration([malformed]).issues.length,1);
  await seed("orphan-person","orphan-cancel",10,1,"2026-01-01");
  const superActor={uid:"chains-super",role:"super_admin",email:"chains-super@example.test"} as Actor;
  const cancellation={id:"orphan-cancel",motivo:"Registro huérfano ficticio revisado por superadministrador"};
  await cancelDirectly(superActor,cancellation,await prepareConfirmation(superActor,"cancelar_sancion",cancellation));
  assert.equal((await db.collection("faltas").doc("orphan-cancel").get()).data()?.estado,"anulada");
});
test("A08-A10: antecedentes muestran solo último escalón disponible y el plazo completo",async()=>{
  const response=await antecedents(request("/api/antecedentes?personalId=parallel&fechaSancion=2026-10-27"));const body=await response.json();assert.equal(response.status,200);
  assert.equal(body.data.find((r:{id:string})=>r.id==="pa").disponible,false);
  assert.equal(body.data.find((r:{id:string})=>r.id==="pb").fechaVencimientoCadena,"2027-01-01");
});
test("A50: origen histórico conserva el año de su raíz, no el de importación",async()=>{
  const conduct=canonicalConduct(article(9).label,article(9).incisos[0]);const metadata=newChainMetadata("history",conduct,"2024-01-01");assert.equal(metadata.fechaVencimientoCadena,"2024-12-31");
  const rows=[{id:"history",personalId:"history-person",estado:"registrada",articulo:conduct.articulo,inciso:conduct.inciso,fechaSancion:"2024-01-01",...metadata}];assert.equal(resolveChain(rows,"history").metadata.fechaInicioCadena,"2024-01-01");
});

test("A23: cancelación extraordinaria concurrente con reincidencia nunca deja un padre sin efecto",async()=>{
  await seed("cancel-race","cancel-race-root",9,1,"2026-01-01");
  const rows=(await db.collection("faltas").where("personalId","==","cancel-race").get()).docs.map(d=>({...d.data(),id:d.id}));
  const superActor={uid:"chains-super",role:"super_admin",email:"chains-super@example.test"} as Actor;
  const cancellation={id:"cancel-race-root",motivo:"Cancelación ficticia concurrente",impactoHash:payloadHash(rows)};
  const confirmation=await prepareConfirmation(superActor,"cancelar_sancion",cancellation);
  const outcomes=await Promise.allSettled([send(await payload("cancel-race",10,1,"2026-10-27","cancel-race-root")),cancelDirectly(superActor,cancellation,confirmation)]);
  const current=(await db.collection("faltas").where("personalId","==","cancel-race").get()).docs.map(d=>({...d.data(),id:d.id}));
  for(const row of current.filter(r=>(r as Record<string,unknown>).estado==="registrada"))resolveChain(current,row.id);
  assert.ok(outcomes.some(r=>r.status==="fulfilled"));
});
test("A39-A40: el intento bloqueado no es una sanción y la auditoría conserva original/actual",async()=>{
  const {GET:report}=await import("../../app/api/reportes/route");
  const before=await(await report(request("/api/reportes"))).json();
  assert.equal((await send(await payload("parallel",9,1))).status,409);
  const after=await(await report(request("/api/reportes"))).json();assert.equal(after.sancionesPorReincidencia,before.sancionesPorReincidencia);assert.equal(after.reincidenciasBloqueadas,before.reincidenciasBloqueadas+1);
  await seed("audit-change","audit-root",9,1,"2026-01-01");await seed("audit-change","audit-child",10,1,"2026-02-01","audit-root");
  const superActor={uid:"chains-super",role:"super_admin",email:"chains-super@example.test"} as Actor;
  const rows=(await db.collection("faltas").where("personalId","==","audit-change").get()).docs.map(d=>({...d.data(),id:d.id}));
  const cancellation={id:"audit-root",motivo:"Motivo ficticio de ajuste auditable",impactoHash:payloadHash(rows)};
  await cancelDirectly(superActor,cancellation,await prepareConfirmation(superActor,"cancelar_sancion",cancellation));
  const {GET:auditReport}=await import("../../app/api/auditoria/route");
  const auditResponse=await auditReport(new NextRequest("http://localhost/api/auditoria?tipo=sanciones",{headers:{authorization:`Bearer ${adminToken}`}}));assert.equal(auditResponse.status,200);
  const audit=(await auditResponse.json()).data.find((r:{id:string})=>r.id==="audit-child");assert.match(audit.articuloOriginal,/10/);assert.match(audit.articuloActual,/9/);assert.equal(audit.inicioCadena,"2026-02-01");assert.equal(audit.vencimientoCadena,"2027-02-01");
});
test("A50: confirmar una importación histórica evalúa el plazo en la fecha del registro importado",async()=>{
  await seed("historical-import","historical-root",9,2,"2024-01-01");
  const imp=db.collection("imports_sanciones").doc("historical-valid");await imp.set({status:"preview"});
  const normalized={rowKey:"row-2",sourceRow:2,ci:"FICTICIO-historical-import",personalId:"historical-import",nombreCompleto:"Persona ficticia histórica",gradoActual:"Cabo",unidadActualId:"",unidadActualNombre:"",fechaSancion:"2024-04-01",articulo:article(10).label,inciso:article(10).incisos[0],memorandum:"Memorándum-902/2024",motivo:"Prueba ficticia histórica válida",motivoNoDisponible:false,unidadSancionId:actor.unidadId,unidadSancionNombre:"Unidad ficticia",unidadEfectivoHistoricaId:actor.unidadId,unidadEfectivoHistoricaNombre:"Unidad ficticia",importKey:"historical-valid-key",isEscalada:true,originFaltaId:"historical-root"};
  await imp.collection("rows").doc("row-2").set({sourceRow:2,status:"valid",normalized,original:{},errors:[],warnings:[]});
  const {POST:confirm}=await import("../../app/api/imports/faltas/[id]/confirm/route");
  const response=await confirm(new NextRequest("http://localhost/api/imports/faltas/historical-valid/confirm",{method:"POST",headers:{authorization:`Bearer ${adminToken}`,"Content-Type":"application/json"},body:JSON.stringify({confirmation:"IMPORTAR SANCIONES"})}),{params:Promise.resolve({id:"historical-valid"})});assert.equal(response.status,200,JSON.stringify(await response.json()));
  const saved=(await db.collection("faltas").doc("import_historical-valid_row-2").get()).data()!;assert.equal(saved.fechaInicioCadena,"2024-01-01");assert.equal(saved.fechaVencimientoCadena,"2024-12-31");assert.equal(saved.nivelEfectivo,1);
});
