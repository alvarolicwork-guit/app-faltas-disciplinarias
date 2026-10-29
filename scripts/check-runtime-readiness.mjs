import {getAdminAuth} from "../src/lib/firebase/admin.ts";
import {getApp} from "firebase-admin/app";
const project=process.env.FIREBASE_PROJECT_ID;
if(project!=="control-disciplinario-comando"||process.env.FIRESTORE_EMULATOR_HOST)throw Error("Exact production project required; read-only");
getAdminAuth();
const token=(await getApp().options.credential.getAccessToken()).access_token;
async function inspect(url){
  try{
    const response=await fetch(url,{headers:{authorization:"Bearer "+token},signal:AbortSignal.timeout(15000)});
    return {status:response.status,body:await response.json()};
  }catch(error){return {status:0,body:{error:{message:error.message}}};}
}
const probe=await inspect("https://firestore.googleapis.com/v1/projects/"+project+"/databases/(default)/documents/users?pageSize=1&mask.fieldPaths=role");
const metadata=await inspect("https://firebase.googleapis.com/v1beta1/projects/"+project);
const billing=await inspect("https://cloudbilling.googleapis.com/v1/projects/"+project+"/billingInfo");
const scheduler=await inspect("https://cloudscheduler.googleapis.com/v1/projects/"+project+"/locations/us-central1/jobs?pageSize=100");
const error=x=>({code:x.body.error?.code??null,status:x.body.error?.status??null,reasons:x.body.error?.details?.filter(d=>d.reason).map(d=>d.reason)??[]});
const result={checkedAt:new Date().toISOString(),firestore:{status:probe.status,error:error(probe)},firebase:{status:metadata.status,projectNumber:metadata.body.projectNumber??null,error:error(metadata)},billing:{status:billing.status,billingEnabled:billing.body.billingEnabled??null,error:error(billing)},scheduler:{status:scheduler.status,jobs:(scheduler.body.jobs??[]).map(job=>({name:job.name.split("/").at(-1),schedule:job.schedule,state:job.state})),error:error(scheduler)}};
console.log(JSON.stringify(result,null,2));
