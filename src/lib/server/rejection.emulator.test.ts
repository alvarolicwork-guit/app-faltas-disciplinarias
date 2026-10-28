import assert from "node:assert/strict";
import { before, test } from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "../firebase/admin";
import { DAY_MS } from "../domain/sanction-policy";
import { boliviaToday } from "../domain/recurrence-chain";
import { DISCIPLINARY_CATALOG } from "../domain/disciplinary-catalog";
import { POST as preview } from "../../app/api/faltas/evaluar/route";
import { POST as register, GET as sanctions } from "../../app/api/faltas/route";
import { GET as antecedents } from "../../app/api/antecedentes/route";
import { POST as requestCancellation } from "../../app/api/faltas/solicitudes/route";
import { PATCH as resolveRequest } from "../../app/api/faltas/solicitudes/[id]/resolver/route";
import { GET as auditReport } from "../../app/api/auditoria/route";
import { createCancellationRequest, expireRequest, resolveCancellationRequest, cancelDirectly } from "./cancellations";
import { prepareConfirmation, recurrenceSnapshot, payloadHash, type Actor } from "./operations";

if (process.env.GCLOUD_PROJECT !== "demo-app-faltas" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8188" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9198") throw new Error("Requires separate rejection-test emulators; never run against the manual demo");
process.env.FIREBASE_PROJECT_ID = "demo-app-faltas";
process.env.LOCAL_DEMO_SKIP_RECURRENCE_WAIT = "false";
const db = getAdminDb();
const actor = (uid:string, role:string, unidadId?:string) => ({uid:`reject-${uid}`,email:`reject-${uid}@example.test`,role,unidadId,token:{auth_time:Date.now()/1000}} as Actor);
const unit=actor("unit","admin_unidad","reject-u"), other=actor("other","admin_unidad","reject-v"), dept=actor("dept","admin_dpto"), superuser=actor("super","super_admin"), operator=actor("operator","operador_unidad","reject-u"), visor=actor("visor","visor_dpto");
const tokens = new Map<string,string>();
const article=(n:number)=>DISCIPLINARY_CATALOG.find(a=>a.id===`art${n}`)!;
const today=boliviaToday();
const dateAgo=(days:number)=>new Date(Date.parse(`${today}T00:00:00Z`)-days*DAY_MS).toISOString().slice(0,10);
before(async()=>{
  for(const a of [unit,other,dept,superuser,operator,visor]) {
    await getAdminAuth().createUser({uid:a.uid,email:a.email,password:"SoloPruebas123!"});
    await db.collection("users").doc(a.uid).set({email:a.email,role:a.role,unidadId:a.unidadId??null,status:"activo",isActive:true});
    const login=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:a.email,password:"SoloPruebas123!",returnSecureToken:true})});
    const body=await login.json();assert.ok(body.idToken);tokens.set(a.uid,body.idToken);
  }
  for(const id of ["reject-u","reject-v"]) await db.collection("unidades").doc(id).set({nombre:`Unidad ficticia ${id}`,estado:"activa"});
});
const req=(a:Actor|null,url:string,body?:unknown,method=body?"POST":"GET")=>new NextRequest(`http://localhost${url}`,{method,headers:{...(a?{authorization:`Bearer ${tokens.get(a.uid)}`} : {}),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
async function seed(id:string,days=2,a=9,i=1) {
  const personalId=`reject-p-${id}`,faltaId=`reject-f-${id}`;
  await db.collection("personal").doc(personalId).set({ci:`FICTICIO-${id}`,nombreCompleto:`Persona ficticia ${id}`,grado:"Cabo"});
  await db.collection("faltas").doc(faltaId).set({personalId,ci:`FICTICIO-${id}`,nombreCompleto:`Persona ficticia ${id}`,grado:"Cabo",unidadId:unit.unidadId,unidadNombre:"Unidad ficticia de rechazos",articulo:article(a).label,inciso:article(a).incisos[i-1],fechaSancion:Timestamp.fromDate(new Date(`${dateAgo(Math.ceil(days))}T00:00:00Z`)),createdAt:Timestamp.fromMillis(Date.now()-days*DAY_MS),estado:"registrada",createdBy:{uid:unit.uid},memorandum:`Documento-${id}`});
  return {personalId,faltaId,a,i};
}
type Fixture=Awaited<ReturnType<typeof seed>>;
async function evaluate(f:Fixture,as=unit) {
  const response=await preview(req(as,"/api/faltas/evaluar",{personalId:f.personalId,articulo:article(f.a).label,inciso:article(f.a).incisos[f.i-1],fechaSancion:today}));
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
}
async function request(f:Fixture) {
  const response=await requestCancellation(req(unit,"/api/faltas/solicitudes",{faltaId:f.faltaId,motivo:"Se solicita revisar este registro ficticio"}));
  const body=await response.json();assert.equal(response.status,201,JSON.stringify(body));return body.solicitudId as string;
}
async function reject(id:string,as=dept) {
  const payload={decision:"rechazada",motivoResolucion:"La documentación confirma el registro ficticio"};
  const confirmationId=await prepareConfirmation(as,"resolver_solicitud",{id,...payload});
  const send=()=>resolveRequest(req(as,`/api/faltas/solicitudes/${id}/resolver`,{...payload,confirmationId},"PATCH"),{params:Promise.resolve({id})});
  const response=await send();assert.equal(response.status,200,JSON.stringify(await response.json()));
  assert.equal((await send()).status,200);return id;
}
function registrationPayload(f:Fixture,e:Awaited<ReturnType<typeof evaluate>>,as=unit) {
  return {personalId:f.personalId,unidadId:as.unidadId,articulo:e.sancion.articulo,inciso:e.sancion.inciso,fechaSancion:today,memorandum:"Memorándum-990/2026",motivo:"Reincidencia ficticia tras revisión expresa",decisionVersion:e.decisionVersion,reincidenciaOrigen:{faltaReferenciaId:e.antecedenteId,articuloBase:e.reincidenciaOrigen.articuloBase,incisoBase:e.reincidenciaOrigen.incisoBase}};
}
async function save(f:Fixture,e:Awaited<ReturnType<typeof evaluate>>,as=unit) {
  const payload=registrationPayload(f,e,as),confirmationId=await prepareConfirmation(as,"registrar_sancion",payload);
  return register(req(as,"/api/faltas",{...payload,payloadConfirmado:payload,confirmationId}));
}

test("rechazo real habilita antes de siete días, guarda evidencia y cada nuevo escalón vuelve a esperar",async()=>{
  const f=await seed("early");assert.match((await evaluate(f)).bloqueo,/siete días/);
  const id=await request(f);assert.match((await evaluate(f)).bloqueo,/pendiente/);
  await reject(id);const e=await evaluate(f);assert.equal(e.disponible,true);assert.equal(e.pruebaLocalSinEspera,false);assert.equal(e.antecedentesConfirmados.length,1);assert.equal(e.antecedentesConfirmados[0].solicitudId,undefined);
  const ancestry=await antecedents(req(unit,`/api/antecedentes?personalId=${f.personalId}&fechaSancion=${today}`));assert.equal((await ancestry.json()).data.find((r:{id:string})=>r.id===f.faltaId).disponible,true);
  await db.runTransaction(tx=>recurrenceSnapshot(tx,db,f.personalId,f.faltaId));
  const response=await save(f,e),body=await response.json();assert.equal(response.status,201,JSON.stringify(body));
  const stored=(await db.collection("faltas").doc(body.faltaId).get()).data()!;
  assert.equal(stored.habilitacionAntecedentes.rechazosExpresos[0].solicitudId,id);assert.equal(stored.habilitacionAntecedentes.rechazosExpresos[0].resueltaPor.uid,dept.uid);
  assert.equal(stored.fechaInicioCadena,dateAgo(2));assert.match((await evaluate(f)).bloqueo,/siete días/);
  const listed=await sanctions(req(unit,`/api/faltas?personalId=${f.personalId}`));const record=(await listed.json()).data.find((r:{id:string})=>r.id===body.faltaId);assert.equal(record.habilitacionAntecedentes.rechazosExpresos[0].resueltaPor,undefined);
  const notices=await db.collection("notificaciones").where("solicitudId","==",id).get();const notice=notices.docs.find(d=>d.id.endsWith("resuelta"))!.data();assert.equal(notice.unidadId,unit.unidadId);assert.equal(notice.destinatarioUid,unit.uid);assert.match(notice.mensaje,/espera restante/);
  const report=await auditReport(req(superuser,`/api/auditoria?tipo=sanciones&unidadId=${unit.unidadId}`));assert.match((await report.json()).data.find((r:{id:string})=>r.id===body.faltaId).habilitacionAnticipada,new RegExp(id));
  const cancellations=await auditReport(req(superuser,`/api/auditoria?tipo=cancelaciones&unidadId=${unit.unidadId}`));assert.match((await cancellations.json()).data.find((r:{id:string})=>r.id===id).dispensaEspera,/eliminó/);
});

test("cierre automático no dispensa siete días y el vencimiento efectivo no depende del cron",async()=>{
  const f=await seed("expiry",6),id="reject-expiry-request";
  await db.collection("solicitudes_eliminacion_falta").doc(id).set({faltaId:f.faltaId,estado:"pendiente",createdAt:Timestamp.fromMillis(Date.now()-5*DAY_MS-1000),expiresAt:Timestamp.fromMillis(Date.now()-1000),solicitanteUnidadId:unit.unidadId,solicitadaPor:{uid:unit.uid}});
  assert.match((await evaluate(f)).bloqueo,/vencimiento/);assert.equal(await expireRequest(id),true);assert.match((await evaluate(f)).bloqueo,/siete días/);
  await db.collection("faltas").doc(f.faltaId).update({createdAt:Timestamp.fromMillis(Date.now()-8*DAY_MS)});assert.equal((await evaluate(f)).disponible,true);
  const pending=await seed("late-pending",8);await db.collection("solicitudes_eliminacion_falta").doc("reject-late-pending").set({faltaId:pending.faltaId,estado:"pendiente",createdAt:Timestamp.fromMillis(Date.now()-2*DAY_MS),expiresAt:Timestamp.fromMillis(Date.now()+3*DAY_MS)});assert.match((await evaluate(pending)).bloqueo,/pendiente/);
});

test("nueva solicitud invalida vista previa; rechazos de otra conducta no habilitan",async()=>{
  const f=await seed("stale");await reject(await request(f));const stale=await evaluate(f);
  const newer=await request(f);assert.match((await evaluate(f)).bloqueo,/pendiente/);assert.equal((await save(f,stale)).status,409);
  await reject(newer,superuser);assert.equal((await evaluate(f)).disponible,true);
  await db.collection("faltas").doc("reject-other-conduct").set({...(await db.collection("faltas").doc(f.faltaId).get()).data(),inciso:article(9).incisos[1]});assert.match((await evaluate({...f,i:2})).bloqueo,/siete días/);
});

test("roles sin resolución y clientes sin token no conceden excepciones",async()=>{
  const f=await seed("permissions"),id=await request(f),payload={decision:"rechazada",motivoResolucion:"Intento ficticio de resolución no autorizada",confirmationId:"invalida"};
  for(const a of [unit,operator,visor,null]) {
    const response=await resolveRequest(req(a,`/api/faltas/solicitudes/${id}/resolver`,payload,"PATCH"),{params:Promise.resolve({id})});assert.equal(response.status,a?403:401);
  }
  assert.equal((await preview(req(null,"/api/faltas/evaluar",{personalId:f.personalId,articulo:article(9).label,inciso:article(9).incisos[0],fechaSancion:today}))).status,401);
  const forged=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-app-faltas/databases/(default)/documents/solicitudes_eliminacion_falta/${id}?updateMask.fieldPaths=estado`,{method:"PATCH",headers:{authorization:`Bearer ${tokens.get(unit.uid)}`,"Content-Type":"application/json"},body:JSON.stringify({fields:{estado:{stringValue:"rechazada"}}})});assert.equal(forged.status,403);
  assert.match((await evaluate(f)).bloqueo,/pendiente/);
});

test("aprobación y cancelación extraordinaria prevalecen sobre el rechazo",async()=>{
  const f=await seed("approved"),id=await request(f);const payload={decision:"aprobada",motivoResolucion:"Se comprueba un error en el registro ficticio"};const confirmation=await prepareConfirmation(dept,"resolver_solicitud",{id,...payload});await resolveCancellationRequest(dept,id,payload,confirmation);assert.equal((await evaluate(f)).tipo,"base");
  const chain=await seed("extraordinary");await reject(await request(chain));const saved=await save(chain,await evaluate(chain));const body=await saved.json();assert.equal(saved.status,201);
  const rows=(await db.collection("faltas").where("personalId","==",chain.personalId).get()).docs.map(d=>({...d.data(),id:d.id}));const cancellation={id:chain.faltaId,motivo:"Cancelación extraordinaria ficticia con ajuste",impactoHash:payloadHash(rows)};const cancelConfirmation=await prepareConfirmation(superuser,"cancelar_sancion",cancellation);await cancelDirectly(superuser,cancellation,cancelConfirmation);
  const lowered=(await db.collection("faltas").doc(body.faltaId).get()).data()!;assert.equal(lowered.articulo,article(9).label);assert.equal(lowered.fechaInicioCadena,today);assert.ok(lowered.habilitacionAntecedentes.rechazosExpresos.length);
});

test("reincidencia y nueva solicitud concurrentes nunca dejan un antecedente pendiente utilizado",async()=>{
  const f=await seed("race");await reject(await request(f));const e=await evaluate(f);
  await Promise.allSettled([save(f,e),createCancellationRequest(unit,{faltaId:f.faltaId,motivo:"Nueva revisión ficticia concurrente"})]);
  const rows=await db.collection("faltas").where("personalId","==",f.personalId).get();const pending=await db.collection("solicitudes_eliminacion_falta").where("faltaId","==",f.faltaId).get();
  const hasPending=pending.docs.some(d=>d.data().estado==="pendiente");
  assert.equal(rows.size>1 && hasPending,false);assert.ok(rows.size>1 || hasPending,"Una de las operaciones debe completar su efecto");
});

test("conducta nacida en artículo diez puede escalar en otra unidad mediante rechazo",async()=>{
  const f=await seed("ten",2,10,5);await reject(await request(f),superuser);const e=await evaluate(f,other);assert.equal(e.disponible,true);assert.equal(e.sancion.articulo,article(11).label);
  const response=await save(f,e,other),body=await response.json();assert.equal(response.status,201,JSON.stringify(body));const stored=(await db.collection("faltas").doc(body.faltaId).get()).data()!;assert.equal(stored.unidadId,other.unidadId);assert.equal(stored.conductaOrigen.incisoNumero,5);
});

test("importación confirmada utiliza la misma excepción y conserva su evidencia",async()=>{
  const {POST:confirm}=await import("../../app/api/imports/faltas/[id]/confirm/route");
  const f=await seed("import");const requestId=await reject(await request(f));
  const importId="reject-import",imp=db.collection("imports_sanciones").doc(importId);
  await imp.set({status:"preview"});
  const normalized={rowKey:"row-2",sourceRow:2,ci:"FICTICIO-import",personalId:f.personalId,nombreCompleto:"Persona ficticia import",gradoActual:"Cabo",unidadActualId:"",unidadActualNombre:"",fechaSancion:today,articulo:article(10).label,inciso:article(10).incisos[0],memorandum:"Memorándum-991/2026",motivo:"Prueba de importación tras rechazo expreso",motivoNoDisponible:false,unidadSancionId:unit.unidadId,unidadSancionNombre:"Unidad ficticia",unidadEfectivoHistoricaId:unit.unidadId,unidadEfectivoHistoricaNombre:"Unidad ficticia",importKey:"reject-import-distinta",isEscalada:true,originFaltaId:f.faltaId};
  await imp.collection("rows").doc("row-2").set({sourceRow:2,status:"valid",normalized,original:{},errors:[],warnings:[]});
  const response=await confirm(req(superuser,`/api/imports/faltas/${importId}/confirm`,{confirmation:"IMPORTAR SANCIONES"}),{params:Promise.resolve({id:importId})});assert.equal(response.status,200,JSON.stringify(await response.json()));
  const stored=(await db.collection("faltas").doc(`import_${importId}_row-2`).get()).data()!;assert.equal(stored.habilitacionAntecedentes.rechazosExpresos[0].solicitudId,requestId);
});
