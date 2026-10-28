// Integration/browser regression for the manual demo only. Every write belongs
// to a unique fixture namespace; existing demo records are preserved.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

if (process.env.FIREBASE_PROJECT_ID !== 'demo-app-faltas' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8087' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9097') throw Error('Only the local demo emulators are permitted');
const {getAdminDb,getAdminAuth} = await import('../src/lib/firebase/admin.ts');
const {Timestamp} = await import('firebase-admin/firestore');
const {DISCIPLINARY_CATALOG:catalog} = await import('../src/lib/domain/disciplinary-catalog.ts');
const db=getAdminDb(), auth=getAdminAuth(), origin='http://127.0.0.1:3000';
const prefix=`NAVTEST-${Date.now()}-`, unit=prefix+'U1', otherUnit=prefix+'U2', person=prefix+'P1', emptyPerson=prefix+'P2';
const password='SoloPruebasLocal2026!', day=86400000, now=Date.now();
const results=[], errors=[], users=[], contexts=[];
const record=text=>{results.push(text);console.log(text);};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function records(collection) {return (await db.collection(collection).get()).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id));}
const before=hash([await records('personal'),await records('faltas')]);
const roleNames={admin_unidad:'unidad',operador_unidad:'operador',admin_dpto:'dpto',super_admin:'super',visor_dpto:'visor'};
const accounts={};
let browser;
function own(row) {return row.id?.startsWith(prefix) || ['personalId','faltaId','entityId','actorUid','unidadId','destinatarioUid','solicitudId'].some(k=>String(row[k]??'').startsWith(prefix));}
try {
  const health=await fetch(origin+'/api/health'); assert.equal(health.status,200);
  const sign=await fetch('http://127.0.0.1:9097/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'super@demo.local',password:'PruebaLocal2026!',returnSecureToken:true})}).then(r=>r.json());
  const me=await fetch(origin+'/api/me',{headers:{Authorization:`Bearer ${sign.idToken}`}}).then(r=>r.json());
  assert.ok(JSON.stringify(me).includes('LOCAL-SUPER'),'The application must be the known manual demo');
  for(const id of [unit,otherUnit]) await db.collection('unidades').doc(id).set({id,nombre:id===unit?'Unidad de verificación':'Otra unidad de verificación',estado:'activa'});
  for(const [role,name] of Object.entries(roleNames)) {
    const uid=prefix+name, email=uid.toLowerCase()+'@example.test';
    await auth.createUser({uid,email,password});users.push(uid);
    await db.collection('users').doc(uid).set({email,role,status:'activo',isActive:true,...(role.endsWith('_unidad')?{unidadId:unit,unidadNombre:'Unidad de verificación'}:{})});
    const login=await fetch('http://127.0.0.1:9097/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})}).then(r=>r.json());
    assert.ok(login.idToken);accounts[role]={uid,email,token:login.idToken};
  }
  const ci=String(now).slice(-8);
  await db.collection('personal').doc(person).set({ci,grado:'Cabo',nombres:'Verificación',apellidos:prefix,nombreCompleto:'Cabo Verificación '+prefix,sexo:'Masculino',estado:'activo'});
  await db.collection('personal').doc(emptyPerson).set({ci:ci+'9',grado:'Cabo',nombres:'Sin sanciones',apellidos:prefix,nombreCompleto:'Cabo Sin sanciones '+prefix,estado:'activo'});
  const base=prefix+'BASE', child=prefix+'REINCIDENCIA', recent=prefix+'RECIENTE', annulled=prefix+'SIN-EFECTO', expired=prefix+'VENCIDA';
  const row=(id,article,inciso,unitId,date,created,parent)=>({personalId:person,nombreCompleto:'Cabo Verificación '+prefix,ci,unidadId:unitId,unidadNombre:unitId===unit?'Unidad de verificación':'Otra unidad de verificación',articulo:catalog[article].label,inciso:catalog[article].incisos[inciso-1],fechaSancion:Timestamp.fromDate(new Date(date)),createdAt:Timestamp.fromMillis(created),createdBy:{uid:accounts.admin_unidad.uid,email:accounts.admin_unidad.email},estado:'registrada',memorandum:id,motivo:'Comprobación ficticia del recorrido de navegación',...(parent?{reincidencia:true,tipoRegistro:'reincidencia_escalada',reincidenciaOrigen:{faltaReferenciaId:parent,articuloBase:catalog[0].label,incisoBase:catalog[0].incisos[0]}}:{})});
  await db.collection('faltas').doc(base).set(row(base,0,1,unit,'2026-09-01',now-30*day));
  await db.collection('faltas').doc(child).set(row(child,1,1,otherUnit,'2026-09-10',now-20*day,base));
  await db.collection('faltas').doc(recent).set(row(recent,0,2,unit,'2026-10-27',now-3600000));
  await db.collection('faltas').doc(annulled).set({...row(annulled,0,3,unit,'2026-09-15',now-10*day),estado:'anulada',anulacion:{motivoEliminacion:'Motivo ficticio conservado'}});
  await db.collection('faltas').doc(expired).set(row(expired,0,4,unit,'2026-10-21',now-6*day));
  await db.collection('solicitudes_eliminacion_falta').doc(prefix+'EXPIRED').set({faltaId:expired,estado:'pendiente',solicitanteUnidadId:unit,solicitanteUnidadNombre:'Unidad de verificación',createdAt:Timestamp.fromMillis(now-6*day),expiresAt:Timestamp.fromMillis(now-day),solicitadaPor:{uid:accounts.admin_unidad.uid,email:accounts.admin_unidad.email},motivo:'Solicitud ficticia para comprobar el vencimiento',faltaResumen:{nombreCompleto:'Cabo Verificación '+prefix,ci,memorandum:expired}});
  await db.collection('solicitudes_eliminacion_falta').doc(prefix+'OTHER').set({faltaId:child,estado:'pendiente',solicitanteUnidadId:otherUnit,createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(now+day),motivo:'Solicitud de otra unidad'});
  async function api(role,url,method='GET',body) {
    const response=await fetch(origin+url,{method,headers:{Authorization:`Bearer ${accounts[role].token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  }
  for(const role of Object.keys(accounts)) {
    const request=await api(role,'/api/faltas/solicitudes?estado=pendiente&unidadId='+otherUnit);
    if(role==='visor_dpto') assert.equal(request.status,403);
    else {assert.equal(request.status,200);if(role.endsWith('_unidad'))assert.ok(request.body.data.every(r=>r.solicitanteUnidadId===unit));}
    if(role.endsWith('_unidad')||role==='visor_dpto')assert.equal((await api(role,'/api/faltas/solicitudes/'+prefix+'OTHER/resolver','PATCH',{decision:'aprobada',motivoResolucion:'Intento prohibido'})).status,403);
    if(role.endsWith('_unidad')) assert.equal((await api(role,'/api/faltas?scope=global_person&personalId='+person)).status,403);
  }
  assert.equal((await fetch(origin+'/api/faltas/solicitudes')).status,401);
  assert.equal((await db.collection('solicitudes_eliminacion_falta').doc(prefix+'EXPIRED').get()).data().estado,'rechazada');
  record('API: cinco roles, unidad manipulada, resolución prohibida, historial global denegado, token ausente y vencimiento');

  const runtime=process.env.PLAYWRIGHT_MODULES??'C:/Users/Alvaro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
  const require=createRequire(path.resolve(runtime,'package.json'));const {chromium}=require('playwright');
  browser=await chromium.launch({channel:'chrome',headless:true});
  async function login(role,viewport={width:1440,height:1000}) {
    const context=await browser.newContext({viewport});contexts.push(context);const page=await context.newPage();
    page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.getByLabel('Correo electrónico').fill(accounts[role].email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
    await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();return page;
  }
  const department=await login('admin_dpto');
  await department.getByRole('button',{name:'Personal',exact:true}).first().click();
  await department.getByPlaceholder(/Buscar efectivo por CI/).fill(ci);
  await department.getByRole('button',{name:'Buscar',exact:true}).click();
  await department.getByRole('row').filter({hasText:ci}).filter({hasNotText:ci+'9'}).getByRole('button',{name:/^Ver historial de /}).click();
  const ficha=department.getByRole('dialog',{name:'Historial del efectivo'});
  await ficha.getByText('4 registradas · 1 sin efecto · 5 registros en este historial',{exact:true}).waitFor();
  await department.keyboard.press('Escape');
  await department.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Ver historial de '));
  await department.getByRole('row').filter({hasText:ci+'9'}).getByRole('button',{name:/^Ver historial de /}).click();
  await ficha.getByText('Este efectivo no tiene sanciones registradas',{exact:true}).waitFor();
  await ficha.getByRole('button',{name:'Cerrar historial',exact:true}).focus();await department.keyboard.press('Tab');
  assert.equal(await department.locator(':focus').getAttribute('aria-label'),'Cerrar');await department.keyboard.press('Escape');
  await department.getByRole('button',{name:'Sanciones registradas',exact:true}).first().click();
  await department.getByLabel('Unidad sancionadora',{exact:true}).selectOption(unit);
  await department.getByRole('button',{name:'Todas',exact:true}).click();
  await department.getByRole('row').filter({hasText:base}).getByRole('button',{name:'Ver historial del efectivo',exact:true}).click();
  await ficha.getByText('3 registradas · 1 sin efecto · 4 registros en este historial',{exact:true}).waitFor();
  await ficha.getByRole('button',{name:'Ver historial departamental',exact:true}).click();
  await ficha.getByText('4 registradas · 1 sin efecto · 5 registros en este historial',{exact:true}).waitFor();
  await ficha.getByRole('button',{name:'Sin efecto',exact:true}).click();await ficha.getByText('Motivo ficticio conservado',{exact:false}).first().waitFor();
  await department.keyboard.press('Escape');assert.equal(await department.getByRole('button',{name:'Por efectivo',exact:true}).count(),0);
  await department.getByRole('row').filter({hasText:base}).getByRole('button',{name:'Ver detalle de la sanción',exact:true}).click();
  await department.getByRole('dialog',{name:'Detalle de la sanción'}).getByText('Comprobación ficticia del recorrido de navegación',{exact:false}).waitFor();await department.keyboard.press('Escape');
  record('Ficha única: Personal y Sanciones, ámbito unidad/departamento, sin efecto, detalle separado y foco al cerrar');
  const unitPage=await login('admin_unidad');
  await unitPage.getByRole('button',{name:'Sanciones registradas',exact:true}).first().click();
  const recentRow=unitPage.getByRole('row').filter({hasText:recent});
  await unitPage.route('**/api/faltas/solicitudes?*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Fallo de comprobación ficticio'})}));
  await unitPage.getByRole('button',{name:'Actualizar',exact:true}).click();await unitPage.getByRole('alert').filter({hasText:'No se pudieron comprobar'}).waitFor();
  assert.ok(await recentRow.getByRole('button',{name:'Solicitar dejar sin efecto',exact:true}).isDisabled());
  await unitPage.unroute('**/api/faltas/solicitudes?*');await unitPage.getByRole('button',{name:'Actualizar',exact:true}).click();await unitPage.getByRole('alert').filter({hasText:'No se pudieron comprobar'}).waitFor({state:'hidden'});
  await recentRow.getByRole('button',{name:'Solicitar dejar sin efecto',exact:true}).click();
  await unitPage.getByRole('button',{name:'Error de insercion',exact:false}).click();
  await unitPage.getByLabel('Motivo de solicitud por error de insercion').fill('Motivo ficticio para comprobar el seguimiento');
  const sent=unitPage.waitForResponse(r=>r.url().endsWith('/api/faltas/solicitudes')&&r.request().method()==='POST');
  await unitPage.getByRole('button',{name:'Enviar solicitud',exact:true}).click();const response=await sent;assert.equal(response.status(),201);const {solicitudId}=await response.json();assert.ok(solicitudId);
  await unitPage.getByRole('button',{name:'Ver solicitud enviada',exact:true}).click();await unitPage.getByText('Solicitud seleccionada',{exact:true}).waitFor();
  assert.equal(await unitPage.getByRole('button',{name:'Aprobar',exact:true}).count(),0);assert.equal(await unitPage.getByRole('button',{name:'Rechazar',exact:true}).count(),0);
  const operator=await login('operador_unidad',{width:390,height:844});
  await operator.getByRole('button',{name:'Solicitudes de cancelación',exact:true}).last().click();await operator.getByText(recent,{exact:false}).waitFor();
  assert.equal(await operator.getByRole('button',{name:'Aprobar',exact:true}).count(),0);
  await operator.getByRole('button',{name:'Menú',exact:true}).click();await operator.getByRole('button',{name:'Sanciones registradas',exact:true}).first().click();
  await operator.getByRole('button',{name:'Tarjetas',exact:true}).click();await operator.getByRole('article').filter({hasText:recent}).getByRole('button',{name:'Ver historial del efectivo',exact:true}).click();
  assert.equal(await operator.getByRole('button',{name:'Ver historial departamental',exact:true}).count(),0);await operator.keyboard.press('Escape');
  await operator.setViewportSize({width:360,height:800});
  assert.ok(await operator.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth));
  await operator.screenshot({path:'.local-demo/navegacion-mobile.png',fullPage:true});
  await operator.getByRole('button',{name:'Menú',exact:true}).click();await operator.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await operator.getByLabel('Correo electrónico').fill(accounts.visor_dpto.email);await operator.getByLabel('Contraseña',{exact:true}).fill(password);await operator.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await operator.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();assert.equal(await operator.getByRole('button',{name:'Solicitudes de cancelación',exact:true}).count(),0);
  record('Cambio de sesión: reinicia módulo y permisos; ficha vacía, ciclo de foco, móvil 360/390 px y fallo de comprobación bloquea solicitudes');
  record('Unidad: solicitud real, enlace de seguimiento, operador sin resolución, menú móvil y ficha limitada a su unidad');
  await department.getByRole('button',{name:'Solicitudes de cancelación',exact:true}).first().click();
  const reqRow=department.getByRole('row').filter({hasText:recent});await reqRow.getByRole('button',{name:'Rechazar',exact:true}).click();
  await department.getByLabel('Motivo de rechazo',{exact:true}).fill('Rechazo ficticio para verificar la resolución');await department.getByRole('button',{name:'Confirmar rechazo',exact:true}).click();
  await department.getByRole('dialog',{name:'Rechazar solicitud'}).waitFor({state:'hidden'});
  assert.equal((await db.collection('solicitudes_eliminacion_falta').doc(solicitudId).get()).data().estado,'rechazada');
  // A second request on the same still-eligible sanction exercises approval.
  const again=await api('admin_unidad','/api/faltas/solicitudes','POST',{faltaId:recent,tipoSolicitud:'error_insercion',motivo:'Segunda solicitud ficticia para probar aprobación'});assert.equal(again.status,201);
  await department.getByRole('button',{name:'Actualizar',exact:true}).click();await reqRow.getByRole('button',{name:'Aprobar',exact:true}).click();
  await department.getByLabel('Motivo de aprobación para dejar sin efecto').fill('Aprobación ficticia con motivo de resolución');await department.getByRole('button',{name:'Aprobar y dejar sin efecto',exact:true}).click();
  await department.getByRole('dialog',{name:'Aprobar solicitud'}).waitFor({state:'hidden'});assert.equal((await db.collection('faltas').doc(recent).get()).data().estado,'anulada');
  record('Resolución real en emuladores: rechazo y aprobación con confirmación, motivo y sanción sin efecto');
  const visor=await login('visor_dpto');assert.equal(await visor.getByRole('button',{name:'Solicitudes de cancelación',exact:true}).count(),0);
  const superPage=await login('super_admin');await superPage.getByRole('button',{name:'Cancelaciones',exact:true}).first().click();await superPage.getByRole('button',{name:'Buscar sanción para dejar sin efecto',exact:true}).click();
  await superPage.getByLabel('Unidad sancionadora',{exact:true}).selectOption(unit);await superPage.getByRole('row').filter({hasText:base}).getByRole('button',{name:'Dejar sin efecto',exact:true}).click();
  await superPage.getByRole('dialog',{name:'Cancelación extraordinaria'}).getByLabel('Motivo obligatorio').waitFor();await superPage.keyboard.press('Escape');
  // A delayed old state response must never replace a newer filter.
  await department.getByRole('button',{name:'Sanciones registradas',exact:true}).first().click();await department.getByLabel('Unidad sancionadora',{exact:true}).selectOption(unit);
  let slow=false;await department.route('**/api/faltas?*',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('estado')==='anulada'){slow=true;await new Promise(r=>setTimeout(r,800));}await route.continue();});
  await department.getByRole('button',{name:'Sin efecto',exact:true}).click();await department.waitForTimeout(100);await department.getByRole('button',{name:'Registradas',exact:true}).click();await department.getByRole('row').filter({hasText:base}).waitFor();await department.waitForTimeout(1100);assert.ok(slow);assert.equal(await department.getByRole('row').filter({hasText:annulled}).count(),0);await department.unroute('**/api/faltas?*');
  await department.screenshot({path:'.local-demo/navegacion-sanciones.png',fullPage:true});
  record('Visor sin solicitudes; super conserva impacto extraordinario; respuestas tardías no sustituyen el filtro actual');
  // A failed request is an error, not an empty state, and can be retried.
  await department.getByRole('button',{name:'Solicitudes de cancelación',exact:true}).first().click();await department.route('**/api/faltas/solicitudes?*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Fallo ficticio de prueba'})}));
  await department.getByRole('button',{name:'Actualizar',exact:true}).click();await department.getByRole('alert').filter({hasText:'Fallo ficticio de prueba'}).waitFor();assert.equal(await department.getByText('Sin solicitudes',{exact:true}).count(),0);await department.unroute('**/api/faltas/solicitudes?*');await department.getByRole('button',{name:'Reintentar',exact:true}).click();await department.getByRole('alert').filter({hasText:'Fallo ficticio de prueba'}).waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);record('Error de carga y reintento; sin errores de ejecución en navegador');
} catch(error) {
  const page=contexts.at(-1)?.pages().at(-1);if(page)await page.screenshot({path:'.local-demo/navigation-failure.png',fullPage:true}).catch(()=>{});
  throw error;
} finally {
  for(const context of contexts)await context.close().catch(()=>{});
  await browser?.close();
  for(const collection of ['notificaciones','confirmaciones','audit_logs','solicitudes_eliminacion_falta','faltas','personal','users','unidades']) {
    const rows=await records(collection);for(const row of rows.filter(own))await db.collection(collection).doc(row.id).delete();
  }
  for(const uid of users)await auth.deleteUser(uid);
  const after=hash([await records('personal'),await records('faltas')]);assert.equal(after,before,'Existing demo roster and sanctions must be preserved');
  fs.writeFileSync('.local-demo/navigation-verification.json',JSON.stringify({date:new Date().toISOString(),project:'demo-app-faltas',results,errors,existingRosterAndSanctionsPreserved:true,fixtureNamespace:prefix,complete:results.length===7},null,2));
  await db.terminate();
}
console.log(JSON.stringify({passed:results.length,results}));
