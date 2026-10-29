// Functional acceptance: isolated demo only, including touch navigation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

if (process.env.GCLOUD_PROJECT !== 'demo-app-faltas' || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Only demo-app-faltas emulators');
process.env.FIREBASE_PROJECT_ID='demo-app-faltas';
const { getAdminDb, getAdminAuth }=await import('../src/lib/firebase/admin.ts');
const db=getAdminDb(), auth=getAdminAuth();
await auth.createUser({uid:'e2e-registrador',email:'registrador-e2e@example.test',password:'SoloPruebas123'});
await db.collection('users').doc('e2e-registrador').set({role:'admin_unidad',unidadId:'u-e2e',unidadNombre:'Unidad de prueba',email:'registrador-e2e@example.test',status:'activo',isActive:true});
await db.collection('unidades').doc('u-e2e').set({id:'u-e2e',nombre:'Unidad de prueba',estado:'activa'});
await db.collection('personal').doc('e2e-persona').set({ci:'12345678',grado:'Cabo',nombreCompleto:'Cabo Persona Ficticia',nombres:'Persona',apellidos:'Ficticia',sexo:'Masculino',estado:'activo'});
for(const [uid,role] of [['e2e-dept','admin_dpto'],['e2e-super','super_admin']]) {
  await auth.createUser({uid,email:`${uid}@example.test`,password:'SoloPruebas123'});
  await db.collection('users').doc(uid).set({email:`${uid}@example.test`,role,status:'activo',isActive:true});
}
const {Timestamp}=await import('firebase-admin/firestore');
const {DISCIPLINARY_CATALOG:catalog}=await import('../src/lib/domain/disciplinary-catalog.ts');
async function seedChainRow(person,id,a,i,date,parent){
 const prior=parent?(await db.collection('faltas').doc(parent).get()).data():null;
 const article=catalog.find(c=>c.id===a);
 await db.collection('faltas').doc(id).set({personalId:person,unidadId:'u-e2e',unidadNombre:'Unidad de prueba',articulo:article.label,inciso:article.incisos[i-1],fechaSancion:Timestamp.fromDate(new Date(date+'T00:00:00Z')),createdAt:Timestamp.fromMillis(Date.now()-30*86400000),createdBy:{uid:'e2e-registrador'},estado:'registrada',memorandum:'Documento ficticio '+id,reincidenciaOrigen:prior?{faltaReferenciaId:parent,articuloBase:prior.articulo,incisoBase:prior.inciso}:null});
}
await db.collection('personal').doc('e2e-parallel').set({ci:'12345000',grado:'Cabo',nombreCompleto:'Cabo Conductas Paralelas',estado:'activo'});
await seedChainRow('e2e-parallel','e2e-a','art9',1,'2026-01-01');await seedChainRow('e2e-parallel','e2e-b','art10',1,'2026-03-01','e2e-a');await seedChainRow('e2e-parallel','e2e-c','art11',1,'2026-05-01','e2e-b');
await seedChainRow('e2e-parallel','e2e-x','art9',2,'2026-02-01');await seedChainRow('e2e-parallel','e2e-y','art10',1,'2026-04-01','e2e-x');
await db.collection('personal').doc('e2e-expired').set({ci:'12345001',grado:'Cabo',nombreCompleto:'Cabo Cadena Vencida',estado:'activo'});
await seedChainRow('e2e-expired','e2e-old-root','art10',5,'2025-10-01');await seedChainRow('e2e-expired','e2e-old-child','art11',1,'2026-09-01','e2e-old-root');
const {personalIndex}=await import('../src/lib/domain/personal-index.ts');
for(const doc of (await db.collection('personal').get()).docs)await doc.ref.update(personalIndex(doc.data()));
await db.collection('access_control').doc('search_index').set({version:1});
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const output='.local-demo/e2e';fs.mkdirSync(output,{recursive:true});
const logs=fs.openSync(path.join(output,'next-e2e.log'),'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3137'],{windowsHide:true,stdio:['ignore',logs,logs],env:{...process.env,NEXT_PUBLIC_FIREBASE_PROJECT_ID:'demo-app-faltas',NEXT_PUBLIC_FIREBASE_API_KEY:'fake-api-key',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:'demo-app-faltas.firebaseapp.com',NEXT_PUBLIC_FIREBASE_APP_ID:'demo-app-id',NEXT_PUBLIC_FIREBASE_USE_EMULATORS:'true',BSFP_INTEGRATION_ENABLED:'false'}});
let browser;
try {
  let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch('http://localhost:3137')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  assert.ok(ready,'Local demo app did not start');
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL??(process.platform==='win32'?'chrome':undefined)});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(30_000);
  const failures=[];page.on('pageerror',e=>{failures.push(e.message);console.log('Browser error:',e.message);});
  await page.goto('http://localhost:3137');
  await page.getByLabel('Correo electrónico').fill('registrador-e2e@example.test');
  await page.getByLabel('Contraseña',{exact:true}).fill('SoloPruebas123');
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.getByRole('button',{name:'Registro de Falta',exact:true}).click();
  await page.getByPlaceholder('Buscar por CI, nombre o apellido').fill('12345678');
  await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await page.getByRole('button',{name:/Cabo Persona Ficticia/}).click();
  await page.getByLabel('Artículo de la falta cometida',{exact:true}).selectOption('art9');
  await page.getByLabel('Inciso de la falta cometida',{exact:true}).selectOption({index:1});
  await page.getByLabel(/Memorándum|Acta/).fill('0012026');
  await page.getByLabel(/Motivo/).fill('Registro ficticio para validación de interfaz');
  await page.getByRole('button',{name:/Registrar Sanción/i}).click();
  await page.getByRole('checkbox',{name:/Confirmo mi intención/}).check();
  await page.screenshot({path:path.join(output,'confirmacion-desktop.png'),fullPage:true});
  const resultPromise=page.waitForResponse(r=>r.url().endsWith('/api/faltas')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Confirmar Registro',exact:true}).click();
  const result=await resultPromise;assert.equal(result.status(),201,await result.text());
  const saved=await db.collection('faltas').where('personalId','==','e2e-persona').get();assert.equal(saved.size,1);assert.equal(saved.docs[0].data().unidadId,'u-e2e');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Sanciones registradas',exact:true}).last().click();
  await page.getByText('Acta-001/2026',{exact:true}).first().waitFor();
  await page.getByText('Sanción registrada',{exact:true}).waitFor({state:'hidden'});
  await page.screenshot({path:path.join(output,'historial-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Solicitar dejar sin efecto',exact:true}).click();
  await page.getByLabel('Nro. de memorandum de representacion').fill('TEST-001/2026');
  await page.getByLabel('Motivo de la representación (obligatorio)').fill('Error ficticio identificado para validar la cancelación');
  const requestResponse=page.waitForResponse(r=>r.url().endsWith('/api/faltas/solicitudes')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Enviar solicitud',exact:true}).click();
  assert.equal((await requestResponse).status(),201);
  const department=await browser.newPage({viewport:{width:1440,height:1000}});
  await department.goto('http://localhost:3137');
  await department.getByLabel('Correo electrónico').fill('e2e-dept@example.test');
  await department.getByLabel('Contraseña',{exact:true}).fill('SoloPruebas123');
  await department.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await department.getByRole('button',{name:'Solicitudes de cancelación',exact:true}).click();
  await department.getByRole('button',{name:'Aprobar',exact:true}).click();
  await department.getByLabel('Motivo de aprobación para dejar sin efecto').fill('Error ficticio comprobado en validación');
  const resolution=department.waitForResponse(r=>r.url().includes('/resolver')&&r.request().method()==='PATCH');
  await department.getByRole('button',{name:'Aprobar y dejar sin efecto',exact:true}).click();
  assert.equal((await resolution).status(),200);
  assert.equal((await saved.docs[0].ref.get()).data().estado,'anulada');
  await page.reload();
  await page.getByText('Notificaciones de la app',{exact:false}).click();
  await page.getByText('Solicitud aprobada',{exact:true}).waitFor();
  const superPage=await browser.newPage({viewport:{width:1440,height:1000}});
  superPage.on('pageerror',e=>failures.push(e.message));
  await superPage.goto('http://localhost:3137');
  await superPage.getByLabel('Correo electrónico').fill('e2e-super@example.test');
  await superPage.getByLabel('Contraseña',{exact:true}).fill('SoloPruebas123');
  await superPage.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await superPage.getByRole('button',{name:'Auditoría',exact:true}).click();
  await superPage.getByRole('button',{name:'Generar informe',exact:true}).click();
  await superPage.getByRole('cell',{name:'Acta-001/2026',exact:false}).waitFor();
  await superPage.getByLabel('Informe',{exact:true}).selectOption('cancelaciones');
  await superPage.getByRole('button',{name:'Generar informe',exact:true}).click();
  await superPage.getByText('Sanción sin efecto / Sin efecto',{exact:false}).waitFor();
  await superPage.screenshot({path:path.join(output,'auditoria-cancelaciones-desktop.png'),fullPage:true});
  // Register11/1 for9/2 while the same person already has11/1 for9/1.
  await page.getByRole('button',{name:'Registro de Falta',exact:true}).click();
  await page.getByPlaceholder('Buscar por CI, nombre o apellido').fill('12345000');await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:/Cabo Conductas Paralelas/}).click();
  await page.getByLabel('Artículo de la falta cometida',{exact:true}).selectOption('art9');
  await page.getByLabel('Inciso de la falta cometida',{exact:true}).selectOption(catalog[0].incisos[0]);
  await page.getByLabel('Inciso de la falta cometida',{exact:true}).selectOption(catalog[0].incisos[1]);
  await page.getByText('Documento ficticio e2e-y',{exact:false}).first().waitFor();
  await page.getByLabel(/Memorándum|Acta/).fill('9012026');await page.getByLabel(/Motivo/).fill('Reiteración ficticia de conducta9 inciso2');
  await page.getByRole('button',{name:/Registrar Sanción/i}).click();await page.getByRole('checkbox',{name:/Confirmo mi intención/}).check();
  await page.screenshot({path:path.join(output,'reincidencia-conducta-9-2.png'),fullPage:true});
  const recurrenceResponse=page.waitForResponse(r=>r.url().endsWith('/api/faltas')&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirmar Registro',exact:true}).click();assert.equal((await recurrenceResponse).status(),201);
  const parallel=(await db.collection('faltas').where('personalId','==','e2e-parallel').get()).docs.map(d=>({...d.data(),id:d.id}));
  const justRegistered=parallel.find(r=>r.memorandum==='Memorándum-901/2026');assert.ok(justRegistered);assert.equal(justRegistered.conductaOrigen.incisoNumero,2);assert.equal(justRegistered.cadenaId,'e2e-x');assert.equal(justRegistered.reincidenciaOrigen.faltaReferenciaId,'e2e-y');
  // A new10/5 base is available when its original chain has expired.
  await page.getByPlaceholder('Buscar por CI, nombre o apellido').fill('12345001');await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:/Cabo Cadena Vencida/}).click();
  await page.getByLabel('Artículo de la falta cometida',{exact:true}).selectOption('art10');await page.getByLabel('Inciso de la falta cometida',{exact:true}).selectOption(catalog[1].incisos[4]);
  await page.getByRole('heading',{name:'Nuevo registro tras finalizar el período anterior',exact:true}).waitFor();
  await page.getByLabel(/Memorándum|Acta/).fill('9022026');await page.getByLabel(/Motivo/).fill('Nueva falta ficticia después de vencer la cadena');
  await page.getByRole('button',{name:/Registrar Sanción/i}).click();await page.getByRole('checkbox',{name:/Confirmo mi intención/}).check();
  const restartedResponse=page.waitForResponse(r=>r.url().endsWith('/api/faltas')&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirmar Registro',exact:true}).click();assert.equal((await restartedResponse).status(),201);
  const restart=(await db.collection('faltas').where('personalId','==','e2e-expired').get()).docs.find(d=>d.data().memorandum==='Memorándum-902/2026');assert.ok(restart);assert.equal(restart.data().nivelEfectivo,0);assert.equal(restart.data().raizHistoricaId,restart.id);assert.equal(restart.data().reincidenciaOrigen,null);
  // Persisted import can be reopened after a full reload.
  await superPage.getByRole('button',{name:'Importar Personal',exact:true}).click();
  await superPage.locator('input[type=file]').setInputFiles({name:'control-ficticio.csv',mimeType:'text/csv',buffer:Buffer.from('ci;grado;nombres;apellidos;sexo\n99887766;Sgto.;Prueba;Carga Uno;Masculino\n99887767;Sgto.;Prueba;Carga Dos;Femenino\n99887766;Sgto.;Prueba;Duplicada;Masculino')});
  const importResponse=superPage.waitForResponse(r=>r.url().endsWith('/api/imports/personal')&&r.request().method()==='POST');
  await superPage.getByRole('button',{name:'Importar Personal',exact:true}).last().click();
  const imported=await (await importResponse).json();assert.equal(imported.createdRows,2);assert.equal(imported.errorRows,1);
  await superPage.getByRole('heading',{name:'Resultado de Importación',exact:true}).waitFor();
  await superPage.reload();await superPage.getByRole('button',{name:'Importar Personal',exact:true}).click();
  await superPage.getByRole('button',{name:'Ver resultado',exact:true}).first().click();
  await superPage.getByRole('heading',{name:'Resultado de Importación',exact:true}).waitFor();
  // R01: recover an interrupted preparation through the real UI after reload.
  const {payloadHash}=await import('../src/lib/server/operations.ts');
  const {preparePersonalRows}=await import('../src/lib/imports/personal-rows.ts');
  const recoveryRows=[
    {ci:'99887766',grado:'Sgto.',nombres:'Prueba',apellidos:'Recuperada Uno',sexo:'Masculino'},
    {ci:'99887768',grado:'Sgto.',nombres:'Prueba',apellidos:'Recuperada Dos',sexo:'Femenino'},
    {ci:'99887769',grado:'Grado ficticio inválido',nombres:'Prueba',apellidos:'Rechazada',sexo:'Masculino'},
  ];
  const recoveryRef=db.collection('imports_personal').doc('e2e-recovery-staging');
  const prepared=preparePersonalRows(recoveryRows);
  await recoveryRef.set({fileName:'recuperacion-ficticia.csv',hash:payloadHash(recoveryRows),totalRows:3,status:'staging',createdRows:0,updatedRows:0,okRows:0,errorRows:1,processedRows:1,createdBy:{uid:'original-super',role:'super_admin'},createdAt:Timestamp.fromMillis(1)});
  await recoveryRef.collection('rows').doc('000000').set({...prepared[0],status:'pending'});
  const originalIdentity=(await db.collection('personal').where('ci','==','99887766').get()).docs[0].id;
  const lotsBefore=(await db.collection('imports_personal').count().get()).data().count;
  const recoveryCsv=rows=>Buffer.from('ci;grado;nombres;apellidos;sexo\n'+rows.map(r=>[r.ci,r.grado,r.nombres,r.apellidos,r.sexo].join(';')).join('\n'));
  await superPage.reload();await superPage.getByRole('button',{name:'Importar Personal',exact:true}).click();
  const recoveryRow=superPage.locator(`[data-import-id="${recoveryRef.id}"]`);
  await recoveryRow.getByRole('button',{name:'Continuar importación',exact:true}).click();
  await superPage.getByText('Recuperar importación: recuperacion-ficticia.csv',{exact:true}).waitFor();
  await superPage.getByLabel('Seleccionar archivo original',{exact:true}).setInputFiles({name:'incorrecto.csv',mimeType:'text/csv',buffer:recoveryCsv([{...recoveryRows[0],nombres:'Otro contenido'},...recoveryRows.slice(1)])});
  const mismatched=superPage.waitForResponse(r=>r.url().endsWith('/api/imports/personal')&&r.request().method()==='POST');
  await superPage.getByRole('button',{name:'Continuar esta importación',exact:true}).click();
  assert.equal((await mismatched).status(),409);
  await superPage.getByText('El archivo no coincide con esta importación. Seleccione el archivo original.',{exact:true}).waitFor();
  assert.equal((await recoveryRef.get()).data().status,'staging');
  assert.equal((await recoveryRef.collection('rows').count().get()).data().count,1);
  // Leaving recovery never deletes the pending import. Re-enter it from persisted state.
  await superPage.getByRole('button',{name:'Salir de la recuperación',exact:true}).click();
  assert.equal(await superPage.getByRole('button',{name:'Continuar esta importación',exact:true}).count(),0);
  await superPage.reload();await superPage.getByRole('button',{name:'Importar Personal',exact:true}).click();
  await recoveryRow.getByRole('button',{name:'Continuar importación',exact:true}).click();
  await superPage.getByLabel('Seleccionar archivo original',{exact:true}).setInputFiles({name:'renombrado.csv',mimeType:'text/csv',buffer:recoveryCsv(recoveryRows)});
  // Drop only the response after the actual API commits preparation. No fake success.
  let recoverRequests=0;let lostResponseId;
  await superPage.route('**/api/imports/personal',async route=>{
    const request=route.request();
    if(request.method()==='POST'&&request.postDataJSON()?.action==='resume_preparation'){
      recoverRequests++;assert.equal(request.postDataJSON().importId,recoveryRef.id);assert.equal(request.postDataJSON().operationId,undefined);
      const response=await route.fetch();assert.equal(response.status(),200);lostResponseId=(await response.json()).importId;
      await route.abort('failed');
    }else await route.continue();
  });
  // Two clicks in the same event turn must still send only one recovery request.
  await superPage.getByRole('button',{name:'Continuar esta importación',exact:true}).evaluate(button=>{button.click();button.click();});
  await recoveryRow.getByText(/Pendiente de continuar/).waitFor();
  assert.equal(lostResponseId,recoveryRef.id);assert.equal(recoverRequests,1);
  await superPage.unroute('**/api/imports/personal');
  await superPage.reload();await superPage.getByRole('button',{name:'Importar Personal',exact:true}).click();
  const recoveredResponse=superPage.waitForResponse(r=>r.url().endsWith('/api/imports/personal')&&r.request().method()==='POST');
  await recoveryRow.getByRole('button',{name:'Continuar importación',exact:true}).click();
  const recovered=await(await recoveredResponse).json();assert.equal(recovered.importId,recoveryRef.id);assert.equal(recovered.status,'confirmed');
  assert.equal(recovered.createdRows,1);assert.equal(recovered.updatedRows,1);assert.equal(recovered.errorRows,1);
  await recoveryRow.getByRole('button',{name:'Ver resultado',exact:true}).waitFor();
  assert.equal((await db.collection('imports_personal').count().get()).data().count,lotsBefore);
  const header=(await recoveryRef.get()).data();assert.equal(header.createdBy.uid,'original-super');assert.equal(header.recoveredBy.uid,'e2e-super');
  assert.equal((await recoveryRef.collection('rows').doc('000000').get()).data().personalId,originalIdentity);
  assert.equal((await db.collection('audit_logs').where('action','==','resume_import_personal').where('importId','==',recoveryRef.id).get()).size,1);
  await superPage.screenshot({path:path.join(output,'importacion-recuperada.png'),fullPage:true});
  fs.writeFileSync(path.join(output,'r01.json'),JSON.stringify({sameImportId:true,recoveryRequestsAfterDoubleClick:recoverRequests,lostResponseRecovered:true,reloadRecovered:true,mismatchRejected:true,originalAuthorPreserved:true,existingPersonalIdPreserved:true,createdRows:1,updatedRows:1,rejectedRows:1,noExtraImport:true},null,2));
  // Closed extraordinary requests remain visible to the authorized unit.
  const {createCancellationRequest,cancelDirectly}=await import('../src/lib/server/cancellations.ts');
  const {prepareConfirmation}=await import('../src/lib/server/operations.ts');
  const unitActor={uid:'e2e-registrador',email:'registrador-e2e@example.test',role:'admin_unidad',unidadId:'u-e2e',token:{}};
  const superActor={uid:'e2e-super',email:'e2e-super@example.test',role:'super_admin',token:{}};
  await createCancellationRequest(unitActor,{faltaId:restart.id,motivo:'Solicitud ficticia para comprobar cierre extraordinario'});
  const cancelPayload={id:restart.id,motivo:'Cancelación extraordinaria ficticia para comprobar seguimiento'};
  await cancelDirectly(superActor,cancelPayload,await prepareConfirmation(superActor,'cancelar_sancion',cancelPayload));
  await superPage.getByRole('button',{name:'Cancelaciones',exact:true}).click();
  await superPage.getByRole('button',{name:'Extraordinarias',exact:true}).click();
  await superPage.getByText('Cerrada por cancelación extraordinaria',{exact:true}).waitFor();
  await superPage.screenshot({path:path.join(output,'solicitud-extraordinaria.png'),fullPage:true});
  const {devices}=require('playwright');
  const phoneContext=await browser.newContext({...devices['Pixel 7']});
  const phone=await phoneContext.newPage();phone.on('pageerror',e=>failures.push(e.message));
  await phone.goto('http://localhost:3137');
  await phone.getByLabel('Correo electrónico').fill('e2e-super@example.test');
  await phone.getByLabel('Contraseña',{exact:true}).fill('SoloPruebas123');
  await phone.getByRole('button',{name:'Iniciar sesión',exact:true}).tap();
  await phone.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  await phone.getByRole('button',{name:'Menú',exact:true}).tap();
  const visibleSidebar=phone.locator('aside').filter({visible:true});await visibleSidebar.waitFor();
  assert.equal(await visibleSidebar.evaluate(el=>getComputedStyle(el).display),'flex');
  await visibleSidebar.screenshot({path:path.join(output,'menu-pixel7.png')});
  await visibleSidebar.getByRole('button',{name:'Reportes',exact:true}).tap();
  await phone.getByRole('heading',{name:'Reportes Estadísticos',exact:true}).waitFor();
  assert.equal(await phone.locator('aside').filter({visible:true}).count(),0);
  await phone.getByRole('button',{name:'Generar',exact:true}).tap();
  await phone.getByText('Sanciones por conducta original',{exact:true}).waitFor();
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await phone.screenshot({path:path.join(output,'reporte-pixel7.png'),fullPage:true});
  await phoneContext.close();
  assert.deepEqual(failures,[]);
  fs.writeFileSync(path.join(output,'e2e.json'),JSON.stringify({project:'demo-app-faltas',passed:true,checkedAt:new Date().toISOString(),checks:['login','global-roster-selection-indexed','explicit-confirmation','persisted-unit-and-author','mobile-history','author-request','department-resolution','unit-notification','separate-superadmin-reports','parallel-conducts-independent-escalation','expired-article10-new-base','rapid-conduct-selection','personal-import-and-reopen','personal-import-recovery-reload-mismatch-lost-response-double-click','extraordinary-request-visible','pixel7-touch-menu','mobile-report'],browserErrors:failures},null,2));
  console.log('E2E: login, padrón global, confirmación, registro por unidad y móvil correctos');
} catch(error) {
  if(browser) for(const [index,page] of browser.contexts().flatMap(c=>c.pages()).entries()) { await page.screenshot({path:path.join(output,`failure-${index}.png`),fullPage:true});fs.writeFileSync(path.join(output,`failure-${index}.txt`),await page.locator('body').innerText()); }
  throw error;
} finally {
  await browser?.close();
  if(process.platform==='win32') {const kill=spawn('taskkill',['/pid',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise(r=>kill.once('exit',r));} else server.kill('SIGTERM');
  fs.closeSync(logs);
}
