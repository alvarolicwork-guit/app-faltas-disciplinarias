/* eslint-disable @typescript-eslint/no-require-imports */
/* Audit reproductions: PASS means the stated current behavior was reproduced,
 * including defects. These are NOT safe-behavior acceptance tests.
 * Run only via the isolated runner documented in INFORME.md. */
const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { readdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
if (process.env.GCLOUD_PROJECT !== 'demo-app-faltas' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8188' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9198') throw new Error('Only isolated audit emulators 8188/9198; never production/manual demo');
process.env.FIREBASE_PROJECT_ID = 'demo-app-faltas';
process.env.LOCAL_DEMO_SKIP_RECURRENCE_WAIT = 'false';
const src = path.resolve('src');
const load = p => require(path.join(src, p));
const { NextRequest } = require('next/server');
const { Timestamp } = require('firebase-admin/firestore');
const { getAdminDb, getAdminAuth } = load('lib/firebase/admin.ts');
const { prepareConfirmation } = load('lib/server/operations.ts');
const { DISCIPLINARY_CATALOG } = load('lib/domain/disciplinary-catalog.ts');
const { boliviaToday } = load('lib/domain/recurrence-chain.ts');
const db = getAdminDb(), auth = getAdminAuth(), tokens = new Map(), observations = [];
const actors = Object.fromEntries(['super_admin','admin_dpto','admin_unidad','operador_unidad','visor_dpto'].map(role => [role, {uid:`audit-${role}`, email:`audit-${role}@example.test`, role, ...(['admin_unidad','operador_unidad'].includes(role) ? {unidadId:'U-001'} : {})}]));
const req = (role, url, body, method = body === undefined ? 'GET' : 'POST') => new NextRequest(`http://localhost${url}`, {method, headers:{...(role ? {authorization:`Bearer ${tokens.get(role)}`} : {}),'Content-Type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
const direct = (role, collection, id) => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-app-faltas/databases/(default)/documents/${collection}/${id}`,{headers:{authorization:`Bearer ${tokens.get(role)}`}});
const article = n => DISCIPLINARY_CATALOG.find(a => a.id === `art${n}`);
function record(id, evidence) { observations.push({id,evidence}); writeFileSync(path.join(__dirname,'reproducciones-resultados.json'),JSON.stringify({project:'demo-app-faltas',firestore:'127.0.0.1:8188',auth:'127.0.0.1:9198',observedAt:new Date().toISOString(),observations},null,2)); }
async function person(id) { await db.collection('personal').doc(id).set({ci:`FICTICIO-${id}`,grado:'Cabo',nombres:'Persona',apellidos:`Ficticia ${id}`,nombreCompleto:`Persona ficticia ${id}`,sexo:'Masculino',estado:'activo'}); }
async function sanction(id, unit='U-001', extra={}) {
  await person(id);
  await db.collection('faltas').doc(id).set({personalId:id,ci:`FICTICIO-${id}`,nombreCompleto:`Persona ficticia ${id}`,grado:'Cabo',unidadId:unit,unidadNombre:'Unidad ficticia',unidadSancionNombre:'Unidad ficticia',articulo:article(9).label,inciso:article(9).incisos[0],fechaSancion:Timestamp.fromDate(new Date(`${boliviaToday()}T00:00:00Z`)),createdAt:Timestamp.now(),estado:'registrada',createdBy:actors.admin_unidad,memorandum:'Acta-001/2026',...extra});
}
before(async()=>{
  for (const a of Object.values(actors)) {
    await auth.createUser({uid:a.uid,email:a.email,password:'AuditoriaFicticia2026!'});
    await db.collection('users').doc(a.uid).set({...a,status:'activo',isActive:true,grado:'Cabo',nombres:'Usuario',apellidos:'Ficticio'});
    const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:'AuditoriaFicticia2026!',returnSecureToken:true})});
    const body = await res.json(); assert.ok(body.idToken); tokens.set(a.role,body.idToken);
  }
  for (const id of ['U-001','U-002']) await db.collection('unidades').doc(id).set({id,nombre:`Unidad ficticia ${id}`,estado:'activa'});
});

test('A01: admin_dpto lee auditoría directamente aunque la API la prohíbe',async()=>{
  await db.collection('audit_logs').doc('audit-private').set({action:'annul_falta_extraordinaria',actorUid:actors.super_admin.uid,before:{motivo:'Dato ficticio reservado a auditoría'}});
  const api=await load('app/api/auditoria/route.ts').GET(req('admin_dpto','/api/auditoria'));
  const firestore=await direct('admin_dpto','audit_logs','audit-private');
  assert.equal(api.status,403); assert.equal(firestore.status,200);
  record('A01',{api:api.status,firestore:firestore.status});
});

test('A02: revocar token sin cambiar perfil bloquea API pero conserva lectura directa',async()=>{
  const role='visor_dpto', user=actors[role];
  await sanction('audit-revocation');
  // Ensure tokensValidAfterTime is later than the sign-in second.
  await new Promise(resolve=>setTimeout(resolve,1100));
  await auth.revokeRefreshTokens(user.uid);
  const api=await load('app/api/faltas/route.ts').GET(req(role,'/api/faltas'));
  const firestore=await direct(role,'faltas','audit-revocation');
  assert.equal(api.status,401); assert.equal(firestore.status,200);
  record('A02',{api:api.status,firestore:firestore.status});
});

test('A02b: duplicidad de admin_unidad bloquea API, no Firestore',async()=>{
  await db.collection('users').doc('audit-duplicate').set({role:'admin_unidad',unidadId:'U-001',status:'activo',isActive:true});
  const api=await load('app/api/faltas/route.ts').GET(req('admin_unidad','/api/faltas'));
  const firestore=await direct('admin_unidad','faltas','audit-revocation');
  assert.equal(api.status,401); assert.equal(firestore.status,200);
  await db.collection('users').doc('audit-duplicate').delete();
  record('A02b',{api:api.status,firestore:firestore.status});
});

test('A03: altas simultáneas de unidad pueden sobrescribirse',async()=>{
  const handler=load('app/api/unidades/route.ts').POST;
  const responses=await Promise.all(Array.from({length:12},(_,i)=>handler(req('admin_dpto','/api/unidades',{nombre:`Unidad concurrente ficticia ${i}`}))));
  const bodies=await Promise.all(responses.map(r=>r.json()));
  assert.ok(responses.every(r=>r.status===201));
  const ids=bodies.map(b=>b.data.id), unique=new Set(ids);
  assert.ok(unique.size<ids.length,JSON.stringify(ids));
  record('A03',{requested:12,accepted:responses.length,distinctIds:unique.size,ids});
});

test('A04: fila nula interrumpe importación de padrón después de persistir la anterior',async()=>{
  const before=await db.collection('imports_personal').count().get();
  const response=await load('app/api/imports/personal/route.ts').POST(req('super_admin','/api/imports/personal',{unidadId:'GLOBAL',rows:[{ci:'88000001',grado:'Sgto.',nombres:'Persona',apellidos:'Importada Ficticia',sexo:'Masculino'},null]}));
  assert.equal(response.status,500);
  const persisted=await db.collection('personal').where('ci','==','88000001').get();
  const after=await db.collection('imports_personal').count().get();
  assert.equal(persisted.size,1);assert.equal(after.data().count,before.data().count);
  record('A04',{http:response.status,persistedPeople:persisted.size,importSummaryCreated:false});
});

test('A05: cancelación extraordinaria retira solicitud de los tres filtros disponibles',async()=>{
  await sanction('audit-extraordinary');
  const service=load('lib/server/cancellations.ts');
  const pending=await service.createCancellationRequest(actors.admin_unidad,{faltaId:'audit-extraordinary',motivo:'Solicitud ficticia para comprobar seguimiento'});
  const payload={id:'audit-extraordinary',motivo:'Cancelación extraordinaria ficticia para auditoría'};
  const confirmation=await prepareConfirmation(actors.super_admin,'cancelar_sancion',payload);
  await service.cancelDirectly(actors.super_admin,payload,confirmation);
  const stored=(await db.collection('solicitudes_eliminacion_falta').doc(pending.solicitudId).get()).data();
  assert.equal(stored.estado,'cerrada_extraordinaria');
  for (const state of ['pendiente','aprobada','rechazada']) {
    const response=await load('app/api/faltas/solicitudes/route.ts').GET(req('admin_unidad',`/api/faltas/solicitudes?estado=${state}`));
    assert.equal(response.status,200);assert.ok(!(await response.json()).data.some(r=>r.id===pending.solicitudId));
  }
  record('A05',{persistedStatus:stored.estado,visibleInAvailableFilters:false});
});

test('A06: auditoría conserva estado pendiente vencido sin ejecutar el procesador',async()=>{
  await sanction('audit-expired');
  await db.collection('solicitudes_eliminacion_falta').doc('audit-expired-request').set({faltaId:'audit-expired',estado:'pendiente',solicitanteUnidadId:'U-001',createdAt:Timestamp.fromMillis(Date.now()-6*86400000),expiresAt:Timestamp.fromMillis(Date.now()-86400000),motivo:'Solicitud ficticia vencida'});
  const response=await load('app/api/auditoria/route.ts').GET(req('super_admin','/api/auditoria?tipo=cancelaciones'));
  assert.equal(response.status,200);
  const row=(await response.json()).data.find(r=>r.id==='audit-expired-request');
  assert.equal(row.estado,'pendiente');
  record('A06',{auditState:row.estado,deadlineInPast:true});
});

test('A07: reporte divide una unidad renombrada en dos grupos',async()=>{
  await sanction('audit-name-old','U-002',{unidadSancionNombre:'Nombre anterior ficticio'});
  await sanction('audit-name-new','U-002',{unidadSancionNombre:'Nombre nuevo ficticio'});
  const response=await load('app/api/reportes/route.ts').GET(req('admin_dpto','/api/reportes?unidadId=U-002'));
  assert.equal(response.status,200);const report=await response.json();
  assert.equal(report.porUnidad.length,2);
  record('A07',{actualUnitIds:1,reportUnitGroups:report.porUnidad.length});
});

test('A08: el contador mensual depende de UTC y cambia de mes antes de medianoche en Bolivia',async()=>{
  const OriginalDate=Date;
  const fixed='2026-11-01T02:00:00.000Z'; // 31 October 22:00 in Bolivia.
  const date='2026-10-31';
  await sanction('audit-month','U-002',{fechaSancion:Timestamp.fromDate(new OriginalDate(`${date}T00:00:00Z`))});
  // Control server clock only, keeping the sign-in tokens valid (a fixed past time
  // would invalidate tokens). Instead inspect the exact month algorithm in two TZs.
  const {spawnSync}=require('node:child_process');
  const code=`const now=new Date('${fixed}');const start=new Date(now.getFullYear(),now.getMonth(),1);console.log(new Date('${date}T00:00:00Z')>=start)`;
  const utc=spawnSync(process.execPath,['-e',code],{env:{...process.env,TZ:'UTC'},encoding:'utf8'});
  assert.equal(utc.status,0);assert.equal(utc.stdout.trim(),'false');
  assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',month:'2-digit'}).format(new OriginalDate(fixed)),'10');
  record('A08',{instant:fixed,boliviaDate:'2026-10-31',sanctionDate:date,utcMonthAlgorithmIncludes:false});
});

test('controles: token ausente/inválido denegado en todas las operaciones API ordinarias',async()=>{
  const files=[];function walk(dir){for(const x of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,x.name);if(x.isDirectory())walk(p);else if(x.name==='route.ts')files.push(p);}}walk(path.join(src,'app/api'));
  let checked=0,removed=0;
  for(const file of files){
    const url='/api/'+path.relative(path.join(src,'app/api'),path.dirname(file)).replaceAll('\\','/').replace(/\[[^\]]+\]/g,'audit-missing');
    if(['/api/health','/api/internal/expire-requests','/api/integraciones/sanciones'].includes(url))continue;
    const mod=require(file);
    for(const method of ['GET','POST','PATCH','DELETE'].filter(m=>typeof mod[m]==='function')){
      for(const token of [null,'invalid']){
        const request=new NextRequest(`http://localhost${url}`,{method,headers:{...(token?{authorization:'Bearer invalid'}:{}),'Content-Type':'application/json'},...(['GET','HEAD'].includes(method)?{}:{body:'{}'})});
        const response=await mod[method](request,{params:Promise.resolve({id:'audit-missing'})});
        if(response.status===410){removed++;continue;}
        assert.equal(response.status,401,`${method} ${url}: ${response.status}`);checked++;
      }
    }
  }
  record('AUTH-MATRIX',{denied:checked,retiredOperations:removed});
});

test('controles: solo lectura, unidad ajena, cuenta bloqueada y primer cambio',async()=>{
  const foreign=await load('app/api/faltas/route.ts').GET(req('admin_unidad','/api/faltas?unidadId=U-002'));
  assert.equal(foreign.status,200);assert.ok((await foreign.json()).data.every(r=>r.unidadId==='U-001'));
  const global=await load('app/api/faltas/route.ts').GET(req('admin_unidad','/api/faltas?scope=global_person&personalId=audit-name-old'));
  assert.equal(global.status,403);
  const write=await load('app/api/faltas/route.ts').POST(req('operador_unidad','/api/faltas',{}));assert.equal(write.status,403);
  const profile=db.collection('users').doc(actors.admin_unidad.uid);
  for(const update of [{status:'bloqueado',isActive:false},{status:'activo',isActive:true,mustChangePassword:true}]){
    await profile.update(update);const api=await load('app/api/personal/route.ts').GET(req('admin_unidad','/api/personal'));assert.equal(api.status,401);
    assert.equal((await direct('admin_unidad','faltas','audit-revocation')).status,403);
  }
  await profile.update({mustChangePassword:false,status:'activo',isActive:true});
  record('CONTROLS',{foreignUnitFiltered:true,globalHistoryDenied:true,operatorWriteDenied:true,blockedAndFirstChangeDenied:true});
});

test('A09: renovar sesión tras cambiar contraseña vía Admin SDK',async()=>{
  const {initializeApp,deleteApp}=require('firebase/app');
  const {getAuth,connectAuthEmulator,signInWithEmailAndPassword}=require('firebase/auth');
  const app=initializeApp({apiKey:'fake',projectId:'demo-app-faltas'},'audit-password-client');
  try {
    const user=await auth.createUser({uid:'audit-password',email:'audit-password@example.test',password:'TemporalFicticia2026!'});
    await db.collection('users').doc(user.uid).set({role:'admin_dpto',status:'activo',mustChangePassword:true});
    const client=getAuth(app);connectAuthEmulator(client,`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,{disableWarnings:true});
    const login=await signInWithEmailAndPassword(client,user.email,'TemporalFicticia2026!');
    const token=await login.user.getIdToken();
    await new Promise(resolve=>setTimeout(resolve,1100));
    const response=await load('app/api/users/password-change/route.ts').POST(new NextRequest('http://localhost/api/users/password-change',{method:'POST',headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({newPassword:'NuevaFicticia2026!'})}));
    assert.equal(response.status,200);
    let refreshError=null;
    try {await login.user.getIdToken(true);} catch(error){refreshError=error.code;}
    assert.equal(refreshError,null);
    const profile=(await db.collection('users').doc(user.uid).get()).data();assert.equal(profile.mustChangePassword,false);
    record('A09',{passwordChangeHttp:response.status,mustChangePassword:profile.mustChangePassword,refreshError});
  } finally {await deleteApp(app);}
});

test('A10: reintento de importación histórica no conserva el total acumulado',async()=>{
  const importId='audit-partial-history';
  const imp=db.collection('imports_sanciones').doc(importId);
  await imp.set({status:'preview'});
  const rows=[];
  for (const i of [1,2]) {
    const id=`audit-import-person-${i}`;await person(id);
    const normalized={rowKey:`row-${i}`,sourceRow:i,ci:`FICTICIO-${id}`,personalId:id,nombreCompleto:'Persona ficticia',gradoActual:'Cabo',unidadActualId:'',unidadActualNombre:'',fechaSancion:'2025-01-01',articulo:article(9).label,inciso:article(9).incisos[0],memorandum:i===1?'Acta-001/2025':'',motivo:'Motivo ficticio de auditoría de importación',motivoNoDisponible:false,unidadSancionId:'U-001',unidadSancionNombre:'Unidad ficticia',unidadEfectivoHistoricaId:'U-001',unidadEfectivoHistoricaNombre:'Unidad ficticia',importKey:`audit-history-key-${i}`,isEscalada:false};
    rows.push(normalized);
    await imp.collection('rows').doc(normalized.rowKey).set({sourceRow:i,status:'valid',normalized,original:{},errors:[],warnings:[]});
  }
  const send=()=>load('app/api/imports/faltas/[id]/confirm/route.ts').POST(req('super_admin',`/api/imports/faltas/${importId}/confirm`,{confirmation:'IMPORTAR SANCIONES'}),{params:Promise.resolve({id:importId})});
  const first=await send();assert.equal(first.status,500);
  assert.equal((await db.collection('faltas').where('importId','==',importId).get()).size,1);
  // Simulate a repaired staging row after a partial failure, entirely in the emulator.
  await imp.collection('rows').doc('row-2').update({'normalized.memorandum':'Acta-002/2025'});
  const retry=await send();assert.equal(retry.status,200);
  const result=await retry.json();
  const persisted=(await db.collection('faltas').where('importId','==',importId).get()).size;
  const summary=(await imp.get()).data();
  assert.equal(persisted,2);assert.equal(result.createdRows,1);assert.equal(summary.createdRows,1);assert.equal(result.skippedRows,1);
  record('A10',{firstHttp:first.status,retryHttp:retry.status,persistedSanctions:persisted,reportedCreated:result.createdRows,reportedSkipped:result.skippedRows});
});
