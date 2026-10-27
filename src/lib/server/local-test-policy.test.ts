import assert from "node:assert/strict";
import { test } from "node:test";
import { skipLocalRecurrenceWait } from "./local-test-policy";
import { ancestorBlock, canRequestCancellation, DAY_MS } from "../domain/sanction-policy";

const env={NODE_ENV:"development",LOCAL_DEMO_SKIP_RECURRENCE_WAIT:"true",FIREBASE_PROJECT_ID:"demo-app-faltas",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8087",FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9097"};
test("La excepción requiere desarrollo, proyecto demo y ambos emuladores locales",()=>{
 assert.equal(skipLocalRecurrenceWait(env),true);
 for(const key of Object.keys(env))assert.equal(skipLocalRecurrenceWait({...env,[key]:undefined}),false);
 assert.equal(skipLocalRecurrenceWait({...env,NODE_ENV:"production"}),false);
 assert.equal(skipLocalRecurrenceWait({...env,FIREBASE_PROJECT_ID:"control-disciplinario-comando"}),false);
 assert.equal(skipLocalRecurrenceWait({...env,FIRESTORE_EMULATOR_HOST:"otro:8087"}),false);
 assert.equal(skipLocalRecurrenceWait({...env,LOCAL_DEMO_SKIP_RECURRENCE_WAIT:"false"}),false);
});
test("Se omite solo la espera de registro; se conservan estado, fecha y solicitudes",()=>{
 const now=Date.now(),row={estado:"registrada",createdAt:new Date(now).toISOString()};
 assert.match(ancestorBlock(row,[],now)!,/siete días/);
 assert.equal(ancestorBlock(row,[],now,{skipRegistrationWait:true}),null);
 assert.match(ancestorBlock(row,[{estado:"pendiente",expiresAt:new Date(now+DAY_MS).toISOString()}],now,{skipRegistrationWait:true})!,/pendiente/);
 assert.match(ancestorBlock({...row,estado:"anulada"},[],now,{skipRegistrationWait:true})!,/sin efecto/);
 assert.match(ancestorBlock({estado:"registrada"},[],now,{skipRegistrationWait:true})!,/fecha/);
});
test("La excepción no amplía el plazo de cancelación de siete días",()=>{
 const now=Date.now();assert.equal(canRequestCancellation({uid:"a",role:"admin_unidad",unidadId:"u"},{estado:"registrada",unidadId:"u",createdBy:{uid:"a"},createdAt:new Date(now-8*DAY_MS).toISOString()},now),false);
});
