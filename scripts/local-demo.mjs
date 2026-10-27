/** Interactive local demo. All writes are restricted to explicit local emulators. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Timestamp } from 'firebase-admin/firestore';

if(process.env.GCLOUD_PROJECT!=='demo-app-faltas'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8087'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9097')throw new Error('La demostración solo acepta los emuladores locales demo-app-faltas');
process.env.FIREBASE_PROJECT_ID='demo-app-faltas';
const {getAdminAuth,getAdminDb}=await import('../src/lib/firebase/admin.ts');
const {canonicalConduct,newChainMetadata,snapshotChain}=await import('../src/lib/domain/recurrence-chain.ts');
const {DISCIPLINARY_CATALOG}=await import('../src/lib/domain/disciplinary-catalog.ts');
const db=getAdminDb(),auth=getAdminAuth(),day=86_400_000;
const password='PruebaLocal2026!';
const users=[
 ['LOCAL-SUPER','super@demo.local','super_admin',null,'Superadministrador de prueba'],
 ['LOCAL-DPTO','dpto@demo.local','admin_dpto',null,'Administrador departamental de prueba'],
 ['LOCAL-ADMIN1','unidad1@demo.local','admin_unidad','LOCAL-U01','Registrador Unidad Uno'],
 ['LOCAL-ADMIN2','unidad2@demo.local','admin_unidad','LOCAL-U02','Registrador Unidad Dos'],
 ['LOCAL-OPERADOR','operador@demo.local','operador_unidad','LOCAL-U01','Operador de prueba'],
 ['LOCAL-VISOR','visor@demo.local','visor_dpto',null,'Visor departamental de prueba'],
];
async function ensure(collection,id,data){const ref=db.collection(collection).doc(id);if(!(await ref.get()).exists)await ref.create({...data,datosPrueba:true,origenRegistro:'demo_local'});}
for(const [uid,email,role,unidadId,nombreCompleto]of users){
 try{await auth.getUser(uid);}catch(error){if(error.code!=='auth/user-not-found')throw error;await auth.createUser({uid,email,password});}
 await ensure('users',uid,{email,role,unidadId,unidadNombre:unidadId==='LOCAL-U01'?'Unidad ficticia Uno':unidadId?'Unidad ficticia Dos':null,nombreCompleto,nombres:nombreCompleto,apellidos:'Prueba',grado:'Cabo',status:'activo',isActive:true,mustChangePassword:false,createdAt:Timestamp.now()});
}
await ensure('unidades','LOCAL-U01',{id:'LOCAL-U01',nombre:'Unidad ficticia Uno',estado:'activa'});
await ensure('unidades','LOCAL-U02',{id:'LOCAL-U02',nombre:'Unidad ficticia Dos',estado:'activa'});
const people=[
 ['LOCAL-P001','99000001','Cabo Persona Nueva'],['LOCAL-P002','99000002','Cabo Cadenas Paralelas'],
 ['LOCAL-P003','99000003','Cabo Cadena Vencida'],['LOCAL-P004','99000004','Cabo Cancelación Reciente'],
 ['LOCAL-P005','99000005','Cabo Solicitud Pendiente'],['LOCAL-P006','99000006','Cabo Solicitud Vencida'],
];
for(const [id,ci,nombreCompleto]of people){await ensure('personal',id,{ci,nombreCompleto,nombres:nombreCompleto.slice(5),apellidos:'Prueba',grado:'Cabo',sexo:'Masculino',estado:'activo',createdAt:Timestamp.now()});await ensure('ci_registry',ci,{personalId:id,ci,createdAt:Timestamp.now()});}
const dateAgo=n=>new Date(Date.now()-n*day).toISOString().slice(0,10);
let documentNumber=100;
async function sanction(personalId,id,a,i,age,parentId=null,unit='LOCAL-U01'){
 const article=DISCIPLINARY_CATALOG.find(c=>c.id===`art${a}`),conduct=canonicalConduct(article.label,article.incisos[i-1]);
 const parent=parentId?(await db.collection('faltas').doc(parentId).get()).data():null;
 const ancestors=[];let current=parentId;
 while(current){const row=(await db.collection('faltas').doc(current).get()).data();if(!row)throw Error('Falta un antecedente ficticio');ancestors.unshift({...row,id:current});current=row.reincidenciaOrigen?.faltaReferenciaId??null;}
 const origin=snapshotChain(ancestors),metadata=parent?{conductaOrigen:parent.conductaOrigen,cadenaId:parent.cadenaId,raizHistoricaId:parent.raizHistoricaId,raizVigenteId:parent.raizVigenteId,fechaInicioCadena:parent.fechaInicioCadena,fechaVencimientoCadena:parent.fechaVencimientoCadena,nivelEfectivo:parent.nivelEfectivo+1,versionReglas:parent.versionReglas}:newChainMetadata(id,conduct,dateAgo(age));
 const person=(await db.collection('personal').doc(personalId).get()).data(),unitName=unit==='LOCAL-U01'?'Unidad ficticia Uno':'Unidad ficticia Dos';
 const createdBy={uid:unit==='LOCAL-U01'?'LOCAL-ADMIN1':'LOCAL-ADMIN2',email:unit==='LOCAL-U01'?'unidad1@demo.local':'unidad2@demo.local',role:'admin_unidad'};
 const document=`${a===9?'Acta':'Memorándum'}-${++documentNumber}/${dateAgo(age).slice(0,4)}`;
 await ensure('faltas',id,{...metadata,personalId,ci:person.ci,nombreCompleto:person.nombreCompleto,grado:person.grado,unidadId:unit,unidadNombre:unitName,unidadSancionId:unit,unidadSancionNombre:unitName,articulo:article.label,inciso:article.incisos[i-1],fechaSancion:Timestamp.fromDate(new Date(dateAgo(age)+'T00:00:00Z')),memorandum:document,motivo:'Escenario ficticio precargado para validación local',estado:'registrada',tipoRegistro:parent?'reincidencia_escalada':'falta_directa',reincidencia:!!parent,reincidenciaOrigen:origin,reincidenciaReferencia:origin,fundamentoOriginal:{...metadata,articulo:article.label,inciso:article.incisos[i-1],reincidenciaOrigen:origin},createdBy,updatedBy:createdBy,createdAt:Timestamp.fromMillis(Date.now()-age*day),updatedAt:Timestamp.now()});
}
await sanction('LOCAL-P002','LOCAL-A9-1',9,1,180);await sanction('LOCAL-P002','LOCAL-A10-1',10,1,150,'LOCAL-A9-1','LOCAL-U02');await sanction('LOCAL-P002','LOCAL-A11-1',11,1,120,'LOCAL-A10-1');
await sanction('LOCAL-P002','LOCAL-B9-2',9,2,160,null,'LOCAL-U02');await sanction('LOCAL-P002','LOCAL-B10-1',10,1,130,'LOCAL-B9-2','LOCAL-U02');
await sanction('LOCAL-P003','LOCAL-EXP10-5',10,5,400);await sanction('LOCAL-P003','LOCAL-EXP11-1',11,1,300,'LOCAL-EXP10-5');
await sanction('LOCAL-P004','LOCAL-CANCELABLE',9,3,2);await sanction('LOCAL-P005','LOCAL-PENDIENTE',9,4,9);await sanction('LOCAL-P006','LOCAL-VENCIDA',9,6,12);
for(const [id,faltaId,age]of [['LOCAL-SOL-PENDIENTE','LOCAL-PENDIENTE',3],['LOCAL-SOL-VENCIDA','LOCAL-VENCIDA',6]]){
 const row=(await db.collection('faltas').doc(faltaId).get()).data();
 await ensure('solicitudes_eliminacion_falta',id,{faltaId,motivo:'Solicitud ficticia para comprobar resolución y plazos',tipoSolicitud:'error_insercion',estado:'pendiente',solicitanteUnidadId:'LOCAL-U01',solicitanteUnidadNombre:'Unidad ficticia Uno',solicitadaPor:{uid:'LOCAL-ADMIN1',email:'unidad1@demo.local',role:'admin_unidad'},createdAt:Timestamp.fromMillis(Date.now()-age*day),expiresAt:Timestamp.fromMillis(Date.now()+(5-age)*day),faltaResumen:{ci:row.ci,nombreCompleto:row.nombreCompleto,memorandum:row.memorandum,articulo:row.articulo,inciso:row.inciso,unidadId:'LOCAL-U01'}});
}
const output=path.resolve('.local-demo');fs.mkdirSync(output,{recursive:true});
const log=fs.openSync(path.join(output,'server.log'),'a');
const env={...process.env,FIREBASE_PROJECT_ID:'demo-app-faltas',NEXT_PUBLIC_FIREBASE_PROJECT_ID:'demo-app-faltas',NEXT_PUBLIC_FIREBASE_API_KEY:'fake-api-key',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:'demo-app-faltas.firebaseapp.com',NEXT_PUBLIC_FIREBASE_APP_ID:'demo-app-id',NEXT_PUBLIC_FIREBASE_USE_EMULATORS:'true',BSFP_INTEGRATION_ENABLED:'false',LOCAL_DEMO_SKIP_RECURRENCE_WAIT:process.env.LOCAL_DEMO_SKIP_RECURRENCE_WAIT==='false'?'false':'true'};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3000'],{windowsHide:true,stdio:['inherit',log,log],env});
fs.writeFileSync(path.join(output,'session.json'),JSON.stringify({project:'demo-app-faltas',url:'http://localhost:3000',serverPid:server.pid,createdAt:new Date().toISOString()},null,2));
console.log('App local: http://localhost:3000 | proyecto demo-app-faltas | datos ficticios');
console.log('Cuentas y recorrido: docs/PRUEBA_LOCAL_MANUAL.md');
let stopping=false;
async function stop(){
 if(stopping)return;stopping=true;
 if(process.platform==='win32'){const killer=spawn('taskkill',['/pid',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise(resolve=>killer.once('exit',resolve));}
 else server.kill('SIGTERM');
}
process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
await new Promise(resolve=>server.once('exit',code=>{process.exitCode=stopping?0:code??0;resolve();}));
fs.closeSync(log);
