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
const runtime=process.env.PLAYWRIGHT_MODULES ?? 'C:/Users/Alvaro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require=createRequire(path.resolve(runtime,'package.json'));
const {chromium}=require('playwright');
const output='docs/validacion-reincidencia-2026-10-27';fs.mkdirSync(output,{recursive:true});
const logs=fs.openSync(path.join(output,'next-e2e.log'),'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3137'],{windowsHide:true,stdio:['ignore',logs,logs],env:{...process.env,NEXT_PUBLIC_FIREBASE_PROJECT_ID:'demo-app-faltas',NEXT_PUBLIC_FIREBASE_API_KEY:'fake-api-key',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:'demo-app-faltas.firebaseapp.com',NEXT_PUBLIC_FIREBASE_APP_ID:'demo-app-id',NEXT_PUBLIC_FIREBASE_USE_EMULATORS:'true',BSFP_INTEGRATION_ENABLED:'false'}});
let browser;
try {
  let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch('http://localhost:3137')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  assert.ok(ready,'Local demo app did not start');
  browser=await chromium.launch({headless:true,channel:'chrome'});
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
  await page.getByLabel('Artículo de la conducta',{exact:true}).selectOption('art9');
  await page.getByLabel('Inciso de la conducta',{exact:true}).selectOption({index:1});
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
  await page.getByLabel('Artículo de la conducta',{exact:true}).selectOption('art9');
  await page.getByLabel('Inciso de la conducta',{exact:true}).selectOption(catalog[0].incisos[0]);
  await page.getByLabel('Inciso de la conducta',{exact:true}).selectOption(catalog[0].incisos[1]);
  await page.getByText('Documento ficticio e2e-y',{exact:false}).waitFor();
  await page.getByLabel(/Memorándum|Acta/).fill('9012026');await page.getByLabel(/Motivo/).fill('Reiteración ficticia de conducta9 inciso2');
  await page.getByRole('button',{name:/Registrar Sanción/i}).click();await page.getByRole('checkbox',{name:/Confirmo mi intención/}).check();
  await page.screenshot({path:path.join(output,'reincidencia-conducta-9-2.png'),fullPage:true});
  const recurrenceResponse=page.waitForResponse(r=>r.url().endsWith('/api/faltas')&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirmar Registro',exact:true}).click();assert.equal((await recurrenceResponse).status(),201);
  const parallel=(await db.collection('faltas').where('personalId','==','e2e-parallel').get()).docs.map(d=>({...d.data(),id:d.id}));
  const justRegistered=parallel.find(r=>r.memorandum==='Memorándum-901/2026');assert.ok(justRegistered);assert.equal(justRegistered.conductaOrigen.incisoNumero,2);assert.equal(justRegistered.cadenaId,'e2e-x');assert.equal(justRegistered.reincidenciaOrigen.faltaReferenciaId,'e2e-y');
  // A new10/5 base is available when its original chain has expired.
  await page.getByPlaceholder('Buscar por CI, nombre o apellido').fill('12345001');await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:/Cabo Cadena Vencida/}).click();
  await page.getByLabel('Artículo de la conducta',{exact:true}).selectOption('art10');await page.getByLabel('Inciso de la conducta',{exact:true}).selectOption(catalog[1].incisos[4]);
  await page.getByRole('heading',{name:'Nuevo registro tras finalizar el período anterior',exact:true}).waitFor();
  await page.getByLabel(/Memorándum|Acta/).fill('9022026');await page.getByLabel(/Motivo/).fill('Nueva falta ficticia después de vencer la cadena');
  await page.getByRole('button',{name:/Registrar Sanción/i}).click();await page.getByRole('checkbox',{name:/Confirmo mi intención/}).check();
  const restartedResponse=page.waitForResponse(r=>r.url().endsWith('/api/faltas')&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirmar Registro',exact:true}).click();assert.equal((await restartedResponse).status(),201);
  const restart=(await db.collection('faltas').where('personalId','==','e2e-expired').get()).docs.find(d=>d.data().memorandum==='Memorándum-902/2026');assert.ok(restart);assert.equal(restart.data().nivelEfectivo,0);assert.equal(restart.data().raizHistoricaId,restart.id);assert.equal(restart.data().reincidenciaOrigen,null);
  assert.deepEqual(failures,[]);
  fs.writeFileSync(path.join(output,'e2e.json'),JSON.stringify({project:'demo-app-faltas',passed:true,checkedAt:new Date().toISOString(),checks:['login','global-roster-selection','explicit-confirmation','persisted-unit-and-author','mobile-history','author-request','department-resolution','unit-notification','separate-superadmin-reports','parallel-conducts-independent-escalation','expired-article10-new-base','rapid-conduct-selection'],browserErrors:failures},null,2));
  console.log('E2E: login, padrón global, confirmación, registro por unidad y móvil correctos');
} catch(error) {
  if(browser) for(const [index,page] of browser.contexts().flatMap(c=>c.pages()).entries()) { await page.screenshot({path:path.join(output,`failure-${index}.png`),fullPage:true});fs.writeFileSync(path.join(output,`failure-${index}.txt`),await page.locator('body').innerText()); }
  throw error;
} finally {
  await browser?.close();
  if(process.platform==='win32') {const kill=spawn('taskkill',['/pid',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise(r=>kill.once('exit',r));} else server.kill('SIGTERM');
  fs.closeSync(logs);
}
