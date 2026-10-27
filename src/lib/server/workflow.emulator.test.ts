import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { before, test } from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../firebase/admin";
import { prepareConfirmation, type Actor, payloadHash } from "./operations";
import { cancelDirectly, createCancellationRequest, expireRequest, resolveCancellationRequest } from "./cancellations";
import { persistAccess } from "./user-access";
import { DAY_MS } from "../domain/sanction-policy";

if (process.env.GCLOUD_PROJECT !== "demo-app-faltas" || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Only demo-app-faltas emulators may run these tests");
process.env.FIREBASE_PROJECT_ID="demo-app-faltas";
const actor=(uid:string,role:string,unidadId?:string)=>({uid,role,email:`${uid}@example.test`,unidadId,token:{auth_time:Date.now()/1000}} as Actor);
const unit=actor("registrador","admin_unidad","u");
const dept=actor("departamental","admin_dpto");
const superuser=actor("super","super_admin");
const db=getAdminDb();
before(async()=>{
  for(const a of [unit,dept,superuser]) {
    await getAdminAuth().createUser({uid:a.uid,email:a.email,password:"SoloPruebas123"});
    await db.collection("users").doc(a.uid).set({email:a.email,role:a.role,unidadId:a.unidadId??null,status:"activo",isActive:true});
  }
  await db.collection("unidades").doc("u").set({id:"u",nombre:"Unidad ficticia",estado:"activa"});
});

async function token(email:string,password="SoloPruebas123") {
  const res=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,returnSecureToken:true})});
  const body=await res.json(); assert.ok(body.idToken,JSON.stringify(body));return body.idToken as string;
}

test("API: padrón global, unidad automática, confirmación y reintento único",async()=>{
  const {POST,GET}=await import("../../app/api/faltas/route");
  const {NextRequest}=await import("next/server");
  const {DISCIPLINARY_CATALOG}=await import("../domain/disciplinary-catalog");
  const {formatSanctionDocumentNumber}=await import("../domain/sanction-document");
  const authToken=await token(unit.email);
  await db.collection("personal").doc("padron-global").set({ci:"999999",nombreCompleto:"Policía ficticio sin unidad",grado:"Cabo"});
  const article=DISCIPLINARY_CATALOG[0];
  const payload={personalId:"padron-global",unidadId:"u",articulo:article.label,inciso:article.incisos[0],fechaSancion:"2026-10-26",memorandum:formatSanctionDocumentNumber(article.id,"7772026"),motivo:"Registro de prueba aislada",modoRegistro:"actual"};
  const confirmationId=await prepareConfirmation(unit,"registrar_sancion",payload);
  const send=()=>POST(new NextRequest("http://localhost/api/faltas",{method:"POST",headers:{authorization:`Bearer ${authToken}`,"Content-Type":"application/json"},body:JSON.stringify({...payload,payloadConfirmado:payload,confirmationId})}));
  const response=await send();const output=await response.json();assert.equal(response.status,201,JSON.stringify(output));
  const retry=await (await send()).json();assert.equal(retry.faltaId,output.faltaId);
  const row=(await db.collection("faltas").doc(output.faltaId).get()).data()!;assert.equal(row.unidadId,"u");assert.equal(row.createdBy.uid,unit.uid);assert.ok(row.confirmacion.id);
  await db.collection("faltas").doc("foreign").set({...row,unidadId:"foreign"});
  const list=await GET(new NextRequest("http://localhost/api/faltas?personalId=padron-global",{headers:{authorization:`Bearer ${authToken}`}}));
  assert.equal((await list.json()).data.length,1);
  const forged=await POST(new NextRequest("http://localhost/api/faltas",{method:"POST",headers:{authorization:`Bearer ${authToken}`,"Content-Type":"application/json"},body:JSON.stringify({...payload,unidadId:"foreign"})}));
  assert.equal(forged.status,403);
});

test("reglas Firestore: propio permitido, ajeno y cuenta bloqueada denegados",async()=>{
  const authToken=await token(unit.email);
  const row={unidadId:"u",estado:"registrada"};
  await db.collection("faltas").doc("rules-own").set(row);
  await db.collection("faltas").doc("rules-other").set({...row,unidadId:"v"});
  const read=(id:string)=>fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-app-faltas/databases/(default)/documents/faltas/${id}`,{headers:{authorization:`Bearer ${authToken}`}});
  assert.equal((await read("rules-own")).status,200);
  assert.equal((await read("rules-other")).status,403);
  await db.collection("users").doc(unit.uid).update({status:"bloqueado",isActive:false});
  assert.equal((await read("rules-own")).status,403);
  await db.collection("users").doc(unit.uid).update({status:"activo",isActive:true});
});

test("API: reincidencia espera siete días y solicitudes; no permite duplicar base",async()=>{
  const {POST}=await import("../../app/api/faltas/route");
  const {NextRequest}=await import("next/server");
  const {DISCIPLINARY_CATALOG}=await import("../domain/disciplinary-catalog");
  const authToken=await token(unit.email);
  const base=DISCIPLINARY_CATALOG[0],upper=DISCIPLINARY_CATALOG[1];
  await sanction("api-base",1,{grado:"Cabo",articulo:base.label,inciso:base.incisos[0],fechaSancion:Timestamp.fromDate(new Date("2026-10-01T00:00:00Z"))});
  const payload={personalId:"api-base",unidadId:"u",articulo:upper.label,inciso:upper.incisos[0],fechaSancion:"2026-10-26",memorandum:"Memorándum-888/2026",motivo:"Prueba de reincidencia",reincidenciaOrigen:{articuloBase:base.label,incisoBase:base.incisos[0],faltaReferenciaId:"api-base"}};
  async function send(p:typeof payload|Record<string,unknown>) {
    const confirmationId=await prepareConfirmation(unit,"registrar_sancion",p);
    return POST(new NextRequest("http://localhost/api/faltas",{method:"POST",headers:{authorization:`Bearer ${authToken}`,"Content-Type":"application/json"},body:JSON.stringify({...p,payloadConfirmado:p,confirmationId})}));
  }
  const early=await send(payload);assert.equal(early.status,409);assert.match((await early.json()).error,/siete días/);
  const repeatedBase=await send({...payload,articulo:base.label,inciso:base.incisos[0],memorandum:"Acta-888/2026",reincidenciaOrigen:null});assert.equal(repeatedBase.status,409);
  await db.collection("faltas").doc("api-base").update({createdAt:Timestamp.fromMillis(Date.now()-9*DAY_MS)});
  await db.collection("solicitudes_eliminacion_falta").doc("api-pending").set({faltaId:"api-base",estado:"pendiente",createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+DAY_MS)});
  const pending=await send(payload);assert.equal(pending.status,409);assert.match((await pending.json()).error,/pendiente/);
  await db.collection("solicitudes_eliminacion_falta").doc("api-pending").update({estado:"rechazada"});
  const success=await send(payload);assert.equal(success.status,201,JSON.stringify(await success.json()));
});

test("confirmación alterada y cancelación extraordinaria con impacto obsoleto se rechazan",async()=>{
  await sanction("modified",20);
  const payload={id:"modified",motivo:"Motivo original confirmado"};
  const confirmation=await prepareConfirmation(superuser,"cancelar_sancion",payload);
  await assert.rejects(cancelDirectly(superuser,{...payload,motivo:"Otro motivo distinto"},confirmation));
  assert.equal((await db.collection("faltas").doc("modified").get()).data()?.estado,"registrada");
});
async function sanction(id:string,age=1,extra:Record<string,unknown>={}) {
  await db.collection("personal").doc(id).set({ci:`CI-${id}`,nombreCompleto:"Persona ficticia",grado:"Cabo"});
  await db.collection("faltas").doc(id).set({personalId:id,unidadId:"u",unidadNombre:"Unidad ficticia",ci:`CI-${id}`,nombreCompleto:"Persona ficticia",memorandum:"MEMO",fechaSancion:Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),articulo:"Art. 9",inciso:"3. Base",estado:"registrada",createdAt:Timestamp.fromMillis(Date.now()-age*DAY_MS),createdBy:{uid:unit.uid},...extra});
}
test("solo autor solicita; aprobación conserva registro y notifica una vez",async()=>{
  await sanction("solicitud");
  await assert.rejects(createCancellationRequest({...unit,uid:"otro"},{faltaId:"solicitud",motivo:"Error de registro"}));
  const {solicitudId}=await createCancellationRequest(unit,{faltaId:"solicitud",motivo:"Error de registro"});
  const payload={id:solicitudId,decision:"aprobada",motivoResolucion:"Error comprobado"};
  const confirmation=await prepareConfirmation(dept,"resolver_solicitud",payload);
  await resolveCancellationRequest(dept,solicitudId,payload,confirmation);
  await resolveCancellationRequest(dept,solicitudId,payload,confirmation);
  assert.equal((await db.collection("faltas").doc("solicitud").get()).data()?.estado,"anulada");
  assert.equal((await db.collection("notificaciones").where("solicitudId","==",solicitudId).get()).size,2);
});
test("vencimiento se persiste y no permite aprobación tardía",async()=>{
  await sanction("vence");
  const {solicitudId}=await createCancellationRequest(unit,{faltaId:"vence",motivo:"Error documentado"});
  await db.collection("solicitudes_eliminacion_falta").doc(solicitudId).update({expiresAt:Timestamp.fromMillis(Date.now()-1)});
  const result=await Promise.all([expireRequest(solicitudId),expireRequest(solicitudId)]);
  assert.equal(result.filter(Boolean).length,1);
  const payload={id:solicitudId,decision:"aprobada",motivoResolucion:"Intento después de vencer"};
  await assert.rejects(resolveCancellationRequest(dept,solicitudId,payload,await prepareConfirmation(dept,"resolver_solicitud",payload)));
  assert.equal((await db.collection("faltas").doc("vence").get()).data()?.estado,"registrada");
});
test("administrador departamental no cancela ajenas ni propias fuera de plazo",async()=>{
  await sanction("ajena");await sanction("antigua",8,{createdBy:{uid:dept.uid}});
  for(const id of ["ajena","antigua"]) {
    const payload={id,motivo:"Error comprobado"};
    await assert.rejects(cancelDirectly(dept,payload,await prepareConfirmation(dept,"cancelar_sancion",payload)));
  }
});
test("extraordinaria cancela una y rebaja dependientes atómicamente",async()=>{
  await sanction("base",30);
  await db.collection("faltas").doc("nivel10").set({personalId:"base",unidadId:"u",estado:"registrada",createdBy:{uid:unit.uid},createdAt:Timestamp.fromMillis(Date.now()-20*DAY_MS),articulo:"Art. 10",inciso:"1. Reincidencia",memorandum:"ESCRITO",fechaSancion:Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),reincidenciaOrigen:{faltaReferenciaId:"base"}});
  await db.collection("faltas").doc("nivel11").set({personalId:"base",unidadId:"u",estado:"registrada",createdBy:{uid:unit.uid},createdAt:Timestamp.fromMillis(Date.now()-10*DAY_MS),articulo:"Art. 11",inciso:"1. Reincidencia",memorandum:"ARRESTO",fechaSancion:Timestamp.fromDate(new Date("2026-03-01T00:00:00Z")),reincidenciaOrigen:{faltaReferenciaId:"nivel10"}});
  const rows=(await db.collection("faltas").where("personalId","==","base").get()).docs.map(d=>({...d.data(),id:d.id}));
  const payload={id:"base",motivo:"Cancelación extraordinaria documentada",impactoHash:payloadHash(rows)};
  await cancelDirectly(superuser,payload,await prepareConfirmation(superuser,"cancelar_sancion",payload));
  assert.equal((await db.collection("faltas").doc("base").get()).data()?.estado,"anulada");
  const level10=(await db.collection("faltas").doc("nivel10").get()).data()!;
  const level11=(await db.collection("faltas").doc("nivel11").get()).data()!;
  assert.equal(level10.articulo,"Art. 9");assert.equal(level10.inciso,"3. Base");assert.equal(level10.reincidenciaOrigen,null);
  assert.equal(level11.articulo,"Art. 10");assert.equal(level11.reincidenciaOrigen.faltaReferenciaId,"nivel10");
  assert.equal(level10.fechaInicioCadena,"2026-02-01");assert.equal(level10.fechaVencimientoCadena,"2027-02-01");assert.equal(level11.fechaVencimientoCadena,"2027-02-01");
  assert.equal(level10.memorandum,"ESCRITO");assert.equal(level10.tipificacionOriginal.articulo,"Art. 10");
});
test("concurrencia de administradores no duplica rol activo por unidad",async()=>{
  await db.collection("unidades").doc("otra").set({id:"otra",nombre:"Otra ficticia",estado:"activa"});
  const payload={role:"admin_unidad",unidadId:"otra",status:"activo",isActive:true};
  const result=await Promise.allSettled([persistAccess(superuser,"nuevo1",payload,{create:true}),persistAccess(superuser,"nuevo2",payload,{create:true})]);
  assert.equal(result.filter(r=>r.status==="fulfilled").length,1);
});
test("unidad ausente, cuenta bloqueada y primer cambio bloquean API",async()=>{
  const {getRequestUser}=await import("../auth/request-user");
  const {NextRequest}=await import("next/server");
  const auth=getAdminAuth();
  const user=await auth.createUser({email:"prueba@example.test",password:"ClaveFicticia123"});
  const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:user.email,password:"ClaveFicticia123",returnSecureToken:true})});
  const {idToken}=await response.json();
  const request=new NextRequest("http://localhost/api/faltas",{headers:{authorization:`Bearer ${idToken}`}});
  await db.collection("users").doc(user.uid).set({role:"admin_unidad",status:"activo"});
  assert.equal(await getRequestUser(request),null);
  await db.collection("users").doc(user.uid).update({role:"admin_dpto",mustChangePassword:true});
  assert.equal(await getRequestUser(request),null);
  await db.collection("users").doc(user.uid).update({mustChangePassword:false,status:"bloqueado"});
  assert.equal(await getRequestUser(request),null);
});

test("operador y visor no registran; solo superadministrador genera auditoría", async () => {
  const {NextRequest}=await import("next/server");
  const sanctions=await import("../../app/api/faltas/route");
  const reports=await import("../../app/api/auditoria/route");
  for (const [uid, role] of [["op", "operador_unidad"], ["visor", "visor_dpto"]]) {
    await getAdminAuth().createUser({uid,email:`${uid}@example.test`,password:"SoloPruebas123"});
    await db.collection("users").doc(uid).set({role,unidadId:role==="operador_unidad"?"u":null,status:"activo",isActive:true});
    const authToken=await token(`${uid}@example.test`);
    const result=await sanctions.POST(new NextRequest("http://localhost/api/faltas",{method:"POST",headers:{authorization:`Bearer ${authToken}`,"Content-Type":"application/json"},body:"{}"}));
    assert.equal(result.status,403);
    assert.equal((await reports.GET(new NextRequest("http://localhost/api/auditoria",{headers:{authorization:`Bearer ${authToken}`}}))).status,403);
  }
  const authToken=await token(superuser.email);
  const result=await reports.GET(new NextRequest("http://localhost/api/auditoria?tipo=cancelaciones",{headers:{authorization:`Bearer ${authToken}`}}));
  const body=await result.json();assert.equal(result.status,200);
  assert.ok(body.data.some((r:{evento:string})=>r.evento==="sancion_sin_efecto"));
  assert.ok(body.data.some((r:{evento:string})=>r.evento==="ajuste_reincidencia"));
  assert.ok(body.grupos.length>0);
});

test("notificaciones de otra unidad no se listan ni se pueden marcar", async () => {
  const {NextRequest}=await import("next/server");
  const routes=await import("../../app/api/notificaciones/route");
  await db.collection("notificaciones").doc("foreign-notification").set({unidadId:"foreign",titulo:"Ajena",createdAt:Timestamp.now()});
  const authToken=await token(unit.email);
  const headers={authorization:`Bearer ${authToken}`,"Content-Type":"application/json"};
  const result=await routes.GET(new NextRequest("http://localhost/api/notificaciones",{headers}));
  const body=await result.json();assert.ok(!body.data.some((r:{id:string})=>r.id==="foreign-notification"));
  const mark=await routes.PATCH(new NextRequest("http://localhost/api/notificaciones",{method:"PATCH",headers,body:JSON.stringify({id:"foreign-notification"})}));assert.equal(mark.status,403);
});

test("cancelación departamental propia dentro de plazo conserva autor y motivo", async () => {
  await sanction("propia-dept",1,{createdBy:{uid:dept.uid}});
  const payload={id:"propia-dept",motivo:"Error propio comprobado"};
  await cancelDirectly(dept,payload,await prepareConfirmation(dept,"cancelar_sancion",payload));
  const row=(await db.collection("faltas").doc(payload.id).get()).data()!;
  assert.equal(row.estado,"anulada");assert.equal(row.createdBy.uid,dept.uid);assert.equal(row.anulacion.motivoEliminacion,payload.motivo);
});

test("relevo pendiente reserva unidad, bloquea saliente y permite recuperación", async () => {
  await db.collection("unidades").doc("relevo").set({nombre:"Unidad ficticia de relevo",estado:"activa"});
  const out={role:"admin_unidad",unidadId:"relevo",status:"activo",isActive:true};
  await db.collection("users").doc("saliente").set(out);
  await persistAccess(superuser,"entrante",{...out,status:"relevo_pendiente",isActive:false,handoverPending:true},{create:true,outgoingUid:"saliente",reason:"Relevo ficticio"});
  assert.equal((await db.collection("users").doc("saliente").get()).data()?.isActive,false);
  await assert.rejects(persistAccess(superuser,"segundo",out,{create:true}));
  await persistAccess(superuser,"entrante",{status:"activo",isActive:true,handoverPending:false});
  assert.equal((await db.collection("users").doc("entrante").get()).data()?.isActive,true);
  await assert.rejects(persistAccess(dept,superuser.uid,{role:"admin_unidad",unidadId:"u"}));
  await assert.rejects(persistAccess(superuser,superuser.uid,{status:"bloqueado",isActive:false}));
});

test("toda la cadena debe estar vigente y sin solicitudes pendientes", async () => {
  const {recurrenceSnapshot}=await import("./operations");
  await sanction("chain-live",20);
  await db.collection("faltas").doc("chain-child").set({personalId:"chain-live",estado:"registrada",createdAt:Timestamp.fromMillis(Date.now()-10*DAY_MS),articulo:"Art. 10",inciso:"1. Reincidencia",fechaSancion:Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),reincidenciaOrigen:{faltaReferenciaId:"chain-live"}});
  const read=()=>db.runTransaction(tx=>recurrenceSnapshot(tx,db,"chain-live","chain-child"));
  await db.collection("faltas").doc("chain-live").update({estado:"anulada"});
  await assert.rejects(read(),/sin efecto/);
  await db.collection("faltas").doc("chain-live").update({estado:"registrada"});
  await db.collection("solicitudes_eliminacion_falta").doc("chain-request").set({faltaId:"chain-live",estado:"pendiente",createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+DAY_MS)});
  await assert.rejects(read(),/pendiente/);
  await db.collection("solicitudes_eliminacion_falta").doc("chain-request").update({estado:"rechazada"});
  const result=await read();
  assert.equal((result?.origenReincidenciaPrevia as {faltaReferenciaId:string}).faltaReferenciaId,"chain-live");
});

test("integración no omite sesión ni confirmación y rechaza contrato antiguo", async () => {
  const {POST}=await import("../../app/api/integraciones/sanciones/route");
  const {NextRequest}=await import("next/server");
  const {DISCIPLINARY_CATALOG}=await import("../domain/disciplinary-catalog");
  const oldEnabled=process.env.BSFP_INTEGRATION_ENABLED,oldSecret=process.env.BSFP_INTEGRATION_SECRET;
  process.env.BSFP_INTEGRATION_ENABLED="true";process.env.BSFP_INTEGRATION_SECRET="secreto-ficticio-solo-emulador";
  try {
    const send=(body:unknown,authToken?:string)=>{
      const raw=JSON.stringify(body),timestamp=new Date().toISOString();
      const signature=createHmac("sha256",process.env.BSFP_INTEGRATION_SECRET!).update(`${timestamp}.${raw}`).digest("hex");
      return POST(new NextRequest("http://localhost/api/integraciones/sanciones",{method:"POST",headers:{"Content-Type":"application/json","x-integration-source":"BSFP","x-integration-timestamp":timestamp,"x-integration-signature":signature,...(authToken?{authorization:`Bearer ${authToken}`}:{})},body:raw}));
    };
    assert.equal((await send({sourceApp:"BSFP",ci:"999999",externalId:"legacy"})).status,426);
    await db.collection("personal").doc("transport").set({ci:"12349999",nombreCompleto:"Persona transporte ficticia",grado:"Cabo"});
    const article=DISCIPLINARY_CATALOG[0];
    const payload={personalId:"transport",unidadId:"u",articulo:article.label,inciso:article.incisos[0],fechaSancion:"2026-10-27",memorandum:"Acta-999/2026",motivo:"Transporte ficticio confirmado"};
    const confirmationId=await prepareConfirmation(unit,"registrar_sancion",payload);
    const envelope={sancion:{...payload,payloadConfirmado:payload,confirmationId}};
    assert.equal((await send(envelope)).status,401);
    const authToken=await token(unit.email);
    const result=await send(envelope,authToken);assert.equal(result.status,201,JSON.stringify(await result.json()));
    assert.equal((await send(envelope,authToken)).status,201);
    assert.equal((await db.collection("faltas").where("personalId","==","transport").get()).size,1);
  } finally {
    if(oldEnabled===undefined)delete process.env.BSFP_INTEGRATION_ENABLED;else process.env.BSFP_INTEGRATION_ENABLED=oldEnabled;
    if(oldSecret===undefined)delete process.env.BSFP_INTEGRATION_SECRET;else process.env.BSFP_INTEGRATION_SECRET=oldSecret;
  }
});
