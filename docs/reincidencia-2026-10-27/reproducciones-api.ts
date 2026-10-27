/** Reproduce fallos actuales en handlers reales con Auth/Firestore EMULADOS.
 * Nunca cargar .env.local. No usar este archivo como suite de aceptación.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';
import { getAdminDb, getAdminAuth } from '../../src/lib/firebase/admin';
import { prepareConfirmation, type Actor } from '../../src/lib/server/operations';
import { POST } from '../../src/app/api/faltas/route';
import { DISCIPLINARY_CATALOG } from '../../src/lib/domain/disciplinary-catalog';
import { articleNumber } from '../../src/lib/domain/disciplinary-recidivism';
import { DAY_MS } from '../../src/lib/domain/sanction-policy';

if(process.env.GCLOUD_PROJECT!=='demo-app-faltas'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8087'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9097') throw new Error('Solo emuladores locales explícitos demo-app-faltas');
process.env.FIREBASE_PROJECT_ID='demo-app-faltas';
const db=getAdminDb();
const actor={uid:'auditoria-reincidencia',email:'auditoria@example.test',role:'admin_unidad',unidadId:'auditoria-unidad'} as Actor;
const art=(n:number)=>DISCIPLINARY_CATALOG.find(a=>a.id===`art${n}`)!;
const results:Record<string,unknown>[]=[];
async function main(){
  await getAdminAuth().createUser({uid:actor.uid,email:actor.email,password:'SoloEmulador123!'});
  await db.collection('users').doc(actor.uid).set({email:actor.email,role:actor.role,unidadId:actor.unidadId,status:'activo',isActive:true});
  await db.collection('unidades').doc(actor.unidadId!).set({nombre:'Unidad ficticia auditoría',estado:'activa'});
  const login=await fetch('http://127.0.0.1:9097/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:actor.email,password:'SoloEmulador123!',returnSecureToken:true})});
  const auth=(await login.json()).idToken;assert.ok(auth);
  async function seed(person:string,id:string,n:number,inc:number,date:string,parent?:string){
    await db.collection('personal').doc(person).set({ci:`FICTICIO-${person}`,nombreCompleto:'Persona ficticia auditoría',grado:'Cabo'});
    const prior=parent?(await db.collection('faltas').doc(parent).get()).data()!:null;
    const origin=prior?{faltaReferenciaId:parent,articuloBase:prior.articulo,incisoBase:prior.inciso,origenReincidenciaPrevia:prior.reincidenciaOrigen??null}:null;
    await db.collection('faltas').doc(id).set({personalId:person,unidadId:actor.unidadId,unidadNombre:'Unidad ficticia auditoría',articulo:art(n).label,inciso:art(n).incisos[inc-1],fechaSancion:Timestamp.fromDate(new Date(`${date}T00:00:00Z`)),createdAt:Timestamp.fromMillis(Date.now()-30*DAY_MS),estado:'registrada',createdBy:{uid:actor.uid},memorandum:'Documento ficticio',reincidenciaOrigen:origin});
  }
  async function send(person:string,n:number,inc:number,parent?:string,date='2026-10-27'){
    const prior=parent?(await db.collection('faltas').doc(parent).get()).data()!:null;
    const payload={personalId:person,unidadId:actor.unidadId,articulo:art(n).label,inciso:art(n).incisos[inc-1],fechaSancion:date,memorandum:n===9?'Acta-999/2026':'Memorándum-999/2026',motivo:'Reproducción aislada de auditoría',reincidenciaOrigen:prior?{faltaReferenciaId:parent,articuloBase:prior.articulo,incisoBase:prior.inciso}:null};
    const confirmationId=await prepareConfirmation(actor,'registrar_sancion',payload);
    const response=await POST(new NextRequest('http://localhost/api/faltas',{method:'POST',headers:{authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify({...payload,payloadConfirmado:payload,confirmationId})}));
    return {status:response.status,body:await response.json()};
  }
  await seed('paralelas','a',9,1,'2026-01-01');await seed('paralelas','b',10,1,'2026-03-01','a');await seed('paralelas','c',11,1,'2026-05-01','b');
  await seed('paralelas','x',9,2,'2026-02-01');await seed('paralelas','y',10,1,'2026-04-01','x');
  const cross=await send('paralelas',11,1,'y');assert.equal(cross.status,409);assert.equal(articleNumber(cross.body.sancionSugerida.articulo),12);assert.equal(cross.body.referencia.faltaId,'c');
  results.push({id:'R01',estado:cross.status,defecto:'Rechaza11/1 de conducta9/2 usando11/1 de conducta9/1 y sugiere12/1'});
  const suggestion=await send('paralelas',9,1);assert.equal(suggestion.status,409);assert.equal(articleNumber(suggestion.body.sancionSugerida.articulo),11);assert.equal(suggestion.body.referencia.faltaId,'b');
  results.push({id:'R02',estado:suggestion.status,defecto:'Sugiere11/1 aunque esa cadena ya contiene11/1; omite el escalón final al buscar la raíz9/1'});
  await seed('ventana','vieja',9,1,'2025-10-01');await seed('ventana','vigente',10,1,'2026-01-01','vieja');
  const restart=await send('ventana',9,1);assert.equal(restart.status,201,JSON.stringify(restart.body));
  results.push({id:'R03',estado:restart.status,defecto:'Registra9/1 otra vez aunque existe10/1 de esa misma conducta dentro de365d'});
  await seed('salto','base-salto',9,1,'2026-01-01');
  const skip=await send('salto',11,1,'base-salto');assert.equal(skip.status,201,JSON.stringify(skip.body));
  results.push({id:'R04',estado:skip.status,defecto:'Registra11/1 desde9/1 sin escalón10/1'});
  await db.collection('personal').doc('futuro').set({ci:'FICTICIO-FUTURO',nombreCompleto:'Persona ficticia futura',grado:'Cabo'});
  const future=await send('futuro',9,1,undefined,'2099-01-01');assert.equal(future.status,201,JSON.stringify(future.body));
  results.push({id:'R06',estado:future.status,defecto:'Registra fecha de sanción2099-01-01'});
  const evidence={fecha:new Date().toISOString(),entorno:'Auth/Firestore locales demo-app-faltas; handlers reales invocados con NextRequest, sin servidor HTTP ni navegador',datosReales:false,nota:'Las cinco aserciones confirman defectos, no correcciones',results};
  writeFileSync('docs/reincidencia-2026-10-27/resultado-api.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
