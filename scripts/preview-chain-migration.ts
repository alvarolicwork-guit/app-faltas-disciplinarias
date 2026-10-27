/** Strictly read-only against the selected project; never applies production writes. */
import { writeFileSync } from "node:fs";
import { getAdminDb } from "../src/lib/firebase/admin";
import { prepareChainMigration } from "../src/lib/server/chain-migration";

async function main(){
  const project=process.argv.find(a=>a.startsWith("--project="))?.slice(10);
  if(!process.argv.includes("--read-only")||!project||project!==process.env.FIREBASE_PROJECT_ID)throw new Error("Use --read-only --project=<FIREBASE_PROJECT_ID exacto>; este comando no escribe Firestore");
  const snap=await getAdminDb().collection("faltas").get();
  const manifest=prepareChainMigration(snap.docs.map(d=>({...d.data(),id:d.id})));
  const output=process.argv.find(a=>a.startsWith("--manifest="))?.slice(11);
  if(output)writeFileSync(output,JSON.stringify(manifest,null,2)+"\n");
  const reasons:Record<string,number>={};for(const issue of manifest.issues)reasons[issue.reason]=(reasons[issue.reason]??0)+1;
  console.log(JSON.stringify({project,readOnly:true,nodes:manifest.nodes,personsWithAdditiveChanges:manifest.persons.length,rowsWithAdditiveChanges:manifest.persons.reduce((n,p)=>n+p.changes.length,0),rowsRequiringReview:manifest.issues.length,reviewReasons:reasons,manifestSaved:!!output},null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:"No se pudo preparar el diagnóstico");process.exitCode=1;});
