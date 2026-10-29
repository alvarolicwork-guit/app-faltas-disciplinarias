/* eslint-disable @typescript-eslint/no-require-imports */
/* Acceptance of corrected behavior. Isolated demo emulators only. */
const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { readdirSync, writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
if (process.env.GCLOUD_PROJECT !== 'demo-app-faltas' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8188' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9198') throw new Error('Only isolated audit emulators 8188/9198; never production/manual demo');
process.env.FIREBASE_PROJECT_ID = 'demo-app-faltas';
process.env.LOCAL_DEMO_SKIP_RECURRENCE_WAIT = 'false';
const src = path.resolve('src');
const evidenceDirectory=path.resolve('.local-demo/corrections');mkdirSync(evidenceDirectory,{recursive:true});
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
function record(id, evidence) { observations.push({id,evidence}); writeFileSync(path.join(evidenceDirectory,'results.json'),JSON.stringify({project:'demo-app-faltas',observedAt:new Date().toISOString(),observations},null,2)); }
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

test('F01: administrador departamental sin acceso directo a auditoría',async()=>{
  await db.collection('audit_logs').doc('audit-private').set({action:'annul_falta_extraordinaria',actorUid:actors.super_admin.uid,before:{motivo:'Dato ficticio reservado a auditoría'}});
  const api=await load('app/api/auditoria/route.ts').GET(req('admin_dpto','/api/auditoria'));
  const firestore=await direct('admin_dpto','audit_logs','audit-private');
  assert.equal(api.status,403); assert.equal(firestore.status,403);
  record('A01',{api:api.status,firestore:firestore.status});
});

test('F02: token revocado sin acceso por API ni por Firestore',async()=>{
  const role='visor_dpto', user=actors[role];
  await sanction('audit-revocation');
  // Ensure tokensValidAfterTime is later than the sign-in second.
  await new Promise(resolve=>setTimeout(resolve,1100));
  await auth.revokeRefreshTokens(user.uid);
  const api=await load('app/api/faltas/route.ts').GET(req(role,'/api/faltas'));
  const firestore=await direct(role,'faltas','audit-revocation');
  assert.equal(api.status,401); assert.equal(firestore.status,403);
  record('A02',{api:api.status,firestore:firestore.status});
});

test('F02: asignación ambigua sin acceso por ninguno de los canales',async()=>{
  await db.collection('users').doc('audit-duplicate').set({role:'admin_unidad',unidadId:'U-001',status:'activo',isActive:true});
  const api=await load('app/api/faltas/route.ts').GET(req('admin_unidad','/api/faltas'));
  const firestore=await direct('admin_unidad','faltas','audit-revocation');
  assert.equal(api.status,401); assert.equal(firestore.status,403);
  await db.collection('users').doc('audit-duplicate').delete();
  record('A02b',{api:api.status,firestore:firestore.status});
});

test('F03: doce altas simultáneas conservan doce unidades',async()=>{
  const handler=load('app/api/unidades/route.ts').POST;
  const responses=await Promise.all(Array.from({length:12},(_,i)=>handler(req('admin_dpto','/api/unidades',{nombre:`Unidad concurrente ficticia ${i}`}))));
  const bodies=await Promise.all(responses.map(r=>r.json()));
  assert.ok(responses.every(r=>r.status===201));
  const ids=bodies.map(b=>b.data.id), unique=new Set(ids);
  assert.equal(unique.size,ids.length,JSON.stringify(ids));
  record('A03',{requested:12,accepted:responses.length,distinctIds:unique.size,ids});
});

test('F04: fila nula rechaza todo el cuerpo sin escrituras',async()=>{
  const before=await db.collection('imports_personal').count().get();
  const response=await load('app/api/imports/personal/route.ts').POST(req('super_admin','/api/imports/personal',{unidadId:'GLOBAL',rows:[{ci:'88000001',grado:'Sgto.',nombres:'Persona',apellidos:'Importada Ficticia',sexo:'Masculino'},null]}));
  assert.equal(response.status,400);
  const persisted=await db.collection('personal').where('ci','==','88000001').get();
  const after=await db.collection('imports_personal').count().get();
  assert.equal(persisted.size,0);assert.equal(after.data().count,before.data().count);
  record('A04',{http:response.status,persistedPeople:persisted.size,importSummaryCreated:false});
});

test('F08: cancelación extraordinaria localizable en su filtro',async()=>{
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
  const closed=await load('app/api/faltas/solicitudes/route.ts').GET(req('admin_unidad','/api/faltas/solicitudes?estado=cerrada_extraordinaria'));
  assert.ok((await closed.json()).data.some(r=>r.id===pending.solicitudId));
  record('A05',{persistedStatus:stored.estado,visibleInAvailableFilters:true});
});

test('F09: auditoría aplica vencimiento efectivo aun con procesador retrasado',async()=>{
  await sanction('audit-expired');
  await db.collection('solicitudes_eliminacion_falta').doc('audit-expired-request').set({faltaId:'audit-expired',estado:'pendiente',solicitanteUnidadId:'U-001',createdAt:Timestamp.fromMillis(Date.now()-6*86400000),expiresAt:Timestamp.fromMillis(Date.now()-86400000),motivo:'Solicitud ficticia vencida'});
  const response=await load('app/api/auditoria/route.ts').GET(req('super_admin','/api/auditoria?tipo=cancelaciones'));
  assert.equal(response.status,200);
  const row=(await response.json()).data.find(r=>r.id==='audit-expired-request');
  assert.equal(row.estado,'rechazada');assert.equal(row.causa,'vencimiento');
  record('A06',{auditState:row.estado,deadlineInPast:true});
});

test('F10: reporte agrupa una unidad renombrada por su identidad',async()=>{
  await sanction('audit-name-old','U-002',{unidadSancionNombre:'Nombre anterior ficticio'});
  await sanction('audit-name-new','U-002',{unidadSancionNombre:'Nombre nuevo ficticio'});
  const response=await load('app/api/reportes/route.ts').GET(req('admin_dpto','/api/reportes?unidadId=U-002'));
  assert.equal(response.status,200);const report=await response.json();
  assert.equal(report.porUnidad.length,1);
  record('A07',{actualUnitIds:1,reportUnitGroups:report.porUnidad.length});
});

test('F11: mes institucional conserva octubre cuando UTC ya cambió de mes',async()=>{
  const OriginalDate=Date;
  const fixed='2026-11-01T02:00:00.000Z'; // 31 October 22:00 in Bolivia.
  const date='2026-10-31';
  await sanction('audit-month','U-002',{fechaSancion:Timestamp.fromDate(new OriginalDate(`${date}T00:00:00Z`))});
  // Control server clock only, keeping the sign-in tokens valid (a fixed past time
  // would invalidate tokens). Instead inspect the exact month algorithm in two TZs.
  const {spawnSync}=require('node:child_process');
  const code=`const {boliviaDate,civilMonth}=require('./src/lib/domain/institutional-date.ts');console.log(civilMonth(boliviaDate(new Date('${fixed}')))===civilMonth('${date}'))`;
  const utc=spawnSync(process.execPath,['--import','tsx','-e',code],{env:{...process.env,TZ:'UTC'},encoding:'utf8'});
  assert.equal(utc.status,0);assert.equal(utc.stdout.trim(),'true');
  assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',month:'2-digit'}).format(new OriginalDate(fixed)),'10');
  record('A08',{instant:fixed,boliviaDate:'2026-10-31',sanctionDate:date,institutionalMonthIncludes:true});
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

test('F12: reintento histórico conserva el total acumulado',async()=>{
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
  assert.equal(persisted,2);assert.equal(result.createdRows,2);assert.equal(summary.createdRows,2);assert.equal(result.skippedRows,0);
  record('A10',{firstHttp:first.status,retryHttp:retry.status,persistedSanctions:persisted,reportedCreated:result.createdRows,reportedSkipped:result.skippedRows});
});

test('F03: reintento de alta es único y la asignación antigua no determina baja de unidad',async()=>{
  const route=load('app/api/unidades/route.ts');
  const payload={nombre:'Unidad de reintento ficticia',operationId:'operation-repeat-001'};
  const a=await route.POST(req('admin_dpto','/api/unidades',payload)), b=await route.POST(req('admin_dpto','/api/unidades',payload));
  assert.equal(a.status,201);assert.equal(b.status,201);assert.equal((await a.json()).data.id,(await b.json()).data.id);
  await db.collection('unidades').doc('legacy-unit').set({id:'legacy-unit',nombre:'Unidad ficticia antigua',estado:'activa'});
  await db.collection('personal').doc('legacy-person').set({ci:'FICTICIO-OLD',unidadId:'legacy-unit'});
  const removed=await route.DELETE(req('admin_dpto','/api/unidades?id=legacy-unit',undefined,'DELETE'));
  assert.equal(removed.status,200);
  record('units-idempotency',{singleIdentity:true,legacyAssignmentIgnored:true});
});

test('F04: importación de 151 filas se reanuda con totales acumulados',async()=>{
  const route=load('app/api/imports/personal/route.ts');
  const rows=Array.from({length:151},(_,i)=>({ci:String(77000000+i),grado:'Sgto.',nombres:'Persona',apellidos:'Prueba de Lote '+i,sexo:'Masculino'}));
  const body={unidadId:'GLOBAL',rows,fileName:'ficticio.csv'};
  let response=await route.POST(req('super_admin','/api/imports/personal',body));
  assert.equal(response.status,200);let result=await response.json();
  assert.ok(result.okRows>0&&result.okRows<=100);const id=result.importId;
  while(result.status!=='confirmed'){
    response=await route.POST(req('super_admin','/api/imports/personal',{importId:id}));
    assert.equal(response.status,200);result=await response.json();
  }
  assert.equal(result.okRows,151);assert.equal(result.createdRows,151);assert.equal(result.updatedRows,0);
  const retry=await route.POST(req('super_admin','/api/imports/personal',body));
  const repeated=await retry.json();assert.equal(repeated.createdRows,151);assert.equal(repeated.importId,id);
  const ledger=await db.collection('imports_personal').doc(id).collection('rows').where('status','==','created').get();assert.equal(ledger.size,151);
  const opened=await route.GET(req('super_admin','/api/imports/personal?importId='+id));assert.equal((await opened.json()).okRows,151);
  record('personal-import-resume',{applied:151,duplicateRows:0,reopened:true});
});

test('F07/F11: CSV neutraliza fórmulas y conserva fechas civiles',()=>{
  const {csvCell}=load('lib/domain/audit-report.ts');
  for(const value of ['=1+1',' +1','\t@SUM(1)','\u0000-2'])assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('Texto "normal"'),'"Texto ""normal"""');
  const {boliviaDate,previousMonthDate}=load('lib/domain/institutional-date.ts');
  assert.equal(boliviaDate(new Date('2026-11-01T02:00:00Z')),'2026-10-31');
  assert.equal(previousMonthDate('2024-03-31'),'2024-02-29');
});

test('F14: búsqueda indexada y cursores preservan fragmentos y orden indistinto',async()=>{
  const {personalIndex}=load('lib/domain/personal-index.ts');
  const {ciKey}=load('lib/domain/text-normalization.ts');
  for(let start=0;start<1500;start+=100){
    const batch=db.batch();
    for(let i=start;i<Math.min(1500,start+100);i++){
      const row={ci:'IDX'+String(i).padStart(5,'0'),grado:'Sgto.',nombres:i===0?'José':'Nodo'+i,apellidos:i===0?'Pérez Uno':'Apellido'+i,nombreCompleto:i===0?'Sgto. José Pérez Uno':'Sgto. Nodo'+i+' Apellido'+i,sexo:'Masculino',estado:'activo'};
      batch.set(db.collection('personal').doc('indexed-'+i),{...row,...personalIndex(row)});
      if(i===0)batch.set(db.collection('ci_registry').doc(ciKey(row.ci)),{ci:row.ci,personalId:'indexed-0'});
    }
    await batch.commit();
  }
  await db.collection('access_control').doc('search_index').set({version:1});
  const route=load('app/api/personal/route.ts');
  for(const q of ['PEREZ jose','ose','IDX00000']){
    const response=await route.GET(req('admin_dpto','/api/personal?q='+encodeURIComponent(q)));
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.data.length,1,q);assert.equal(result.data[0].id,'indexed-0');
  }
  const first=await (await route.GET(req('admin_dpto','/api/personal?q=nodo&limit=30'))).json();
  assert.equal(first.data.length,30);assert.ok(first.scanned<=100);assert.ok(first.nextCursor);
  const second=await (await route.GET(req('admin_dpto','/api/personal?q=nodo&limit=30&cursor='+first.nextCursor))).json();
  assert.equal(second.data.length,30);assert.equal(new Set([...first.data,...second.data].map(p=>p.id)).size,60);
  const exact=await (await route.GET(req('admin_dpto','/api/personal?exactCI=IDX00000'))).json();assert.equal(exact.data[0].id,'indexed-0');assert.equal(exact.scanned,2);
  record('search-load',{fixturePeople:1500,pageSize:30,candidateReads:first.scanned,cursorDistinct:true,exactCiReads:2});
});

test('F09: procesador automático vence y notifica una sola vez',async()=>{
  const {processExpiredRequests}=load('lib/server/expire-requests.ts');
  const first=await processExpiredRequests();assert.equal(first.expired,1);
  const second=await processExpiredRequests();assert.equal(second.expired,0);
  const row=(await db.collection('solicitudes_eliminacion_falta').doc('audit-expired-request').get()).data();assert.equal(row.causaCierre,'vencimiento');assert.notEqual(row.dispensaEspera,true);
  assert.equal((await db.collection('notificaciones').doc('solicitud-audit-expired-request-resuelta').get()).exists,true);
  record('expiry-job',{firstExpired:first.expired,repeatExpired:second.expired});
});

test('F14: estadísticas reutilizadas se invalidan al editar una unidad',async()=>{
  const {statsCache}=load('lib/server/stats-cache.ts');
  const scope={test:'cache-acceptance',role:'admin_dpto',unit:'U-002'};
  const cold=await statsCache(db,scope);assert.equal(cold.hit,null);await cold.save({total:12});
  assert.equal((await statsCache(db,scope)).hit.total,12);
  const updated=await load('app/api/unidades/route.ts').PATCH(req('admin_dpto','/api/unidades',{id:'U-002',nombre:'Nombre cambiado durante ensayo de caché'},'PATCH'));
  assert.equal(updated.status,200);assert.equal((await statsCache(db,scope)).hit,null);
  record('stats-cache',{cacheHit:true,invalidatedByMutation:true});
});

test('F05/F06: depuración incluye huérfanos, pausa escrituras y reanuda sin tocar accesos',async()=>{
  const {resetManifest,executeTestReset}=load('lib/server/test-data-reset.ts');
  await db.collection('imports_sanciones').doc('orphan-parent').collection('rows').doc('orphan-child').set({ficticio:true});
  const manifest=await resetManifest(db,'demo-app-faltas');
  assert.deepEqual(manifest.unknownCollections,[]);assert.deepEqual(manifest.unknownAuditActions,[]);
  assert.ok(manifest.paths.includes('imports_sanciones/orphan-parent/rows/orphan-child'));
  const usersBefore=(await db.collection('users').count().get()).data().count;
  const unitsBefore=(await db.collection('unidades').count().get()).data().count;
  const options={projectId:'demo-app-faltas',hash:manifest.hash,operatorUid:actors.super_admin.uid,reason:'Retiro autorizado de datos ficticios para ensayo'};
  await assert.rejects(()=>executeTestReset(db,{...options,hash:'incorrect'}),/manifiesto/);
  let runId;
  try{await executeTestReset(db,{...options,stopAfterChunks:1});assert.fail('Debe simular una interrupción');}catch(error){assert.match(error.message,/Interrupción ficticia/);runId=error.runId;}
  assert.ok(runId);assert.equal((await db.collection('access_control').doc('maintenance').get()).data().active,true);
  const attempted=await load('app/api/unidades/route.ts').POST(req('admin_dpto','/api/unidades',{nombre:'No debe crearse durante el mantenimiento'}));assert.equal(attempted.status,503);
  const result=await executeTestReset(db,{...options,runId});assert.equal(result.status,'completed');
  const after=await resetManifest(db,'demo-app-faltas');assert.equal(after.paths.length,0);
  assert.equal((await db.collection('users').count().get()).data().count,usersBefore);assert.equal((await db.collection('unidades').count().get()).data().count,unitsBefore);
  assert.equal((await auth.getUser(actors.super_admin.uid)).disabled,false);
  assert.equal((await db.collection('access_control').doc('maintenance').get()).data().generation,1);
  const {assertCurrentActor}=load('lib/server/operations.ts');
  await assert.rejects(()=>db.runTransaction(tx=>assertCurrentActor(tx,db,actors.super_admin)),/reiniciaron/);
  record('reset-recovery',{runId,deletedTestData:true,orphanRowsRemoved:true,usersPreserved:usersBefore,unitsPreserved:unitsBefore,exportsDocuments:false});
});
