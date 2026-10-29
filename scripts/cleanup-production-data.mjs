import {getAdminDb, getAdminAuth} from "../src/lib/firebase/admin.ts";
import {resetManifest, resetSummary, executeTestReset, cancelResetPreparation} from "../src/lib/server/test-data-reset.ts";
const arg=name=>process.argv.find(value=>value.startsWith("--"+name+"="))?.slice(name.length+3)??"";
const project=process.env.FIREBASE_PROJECT_ID;
if(!["demo-app-faltas","control-disciplinario-comando"].includes(project))throw Error("Proyecto inesperado");
if(process.env.FIRESTORE_EMULATOR_HOST && project!=="demo-app-faltas")throw Error("Emulador requiere demo-app-faltas");
const db=getAdminDb(), mode=arg("mode")||"preview";
try{
  if(mode==="preview"){
    console.log(JSON.stringify({mode,...resetSummary(await resetManifest(db,project))},null,2));
  }else{
    const operatorUid=arg("operator-uid")||(arg("operator-email")?(await getAdminAuth().getUserByEmail(arg("operator-email"))).uid:"");
    const account=await getAdminAuth().getUser(operatorUid);
    if(account.disabled)throw Error("La cuenta del operador está bloqueada");
    const options={projectId:project,operatorUid,reason:arg("reason"),hash:arg("manifest-hash"),...(arg("run-id")?{runId:arg("run-id")}:{})};
    if(mode==="execute" && options.runId)throw Error("Use mode=resume para continuar un procedimiento");
    if(mode==="resume" && !options.runId)throw Error("Indique run-id");
    if(mode==="cancel-preparation"){
      console.log(JSON.stringify(await cancelResetPreparation(db,project,operatorUid,arg("run-id")),null,2));
    }else if(["execute","resume"].includes(mode)){
      console.log(JSON.stringify(await executeTestReset(db,options),null,2));
    }else throw Error("Use preview, execute, resume o cancel-preparation");
  }
}catch(error){
  console.error(JSON.stringify({error:error.message,runId:error.runId??null}));
  process.exitCode=1;
}
