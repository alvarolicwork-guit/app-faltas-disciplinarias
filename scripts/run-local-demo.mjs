import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

for(const port of [3000,4400,8087,9097])await new Promise((resolve,reject)=>{
 const probe=net.createServer();probe.once('error',()=>reject(new Error(`El puerto local${port} está ocupado; no se iniciará otro entorno sobre esos servicios`)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));
});
const require=createRequire(import.meta.url);
let firebaseCli;
try{firebaseCli=require.resolve('firebase-tools/lib/bin/firebase.js');}catch{
 firebaseCli=path.join(process.env.APPDATA??'','npm','node_modules','firebase-tools','lib','bin','firebase.js');
}
if(!fs.existsSync(firebaseCli))throw new Error('No se encuentra Firebase CLI. Use la instalación local documentada antes de iniciar los emuladores');
const dataPath=path.resolve('.local-demo/emulator-data');
const args=[firebaseCli,'emulators:exec','--only','firestore,auth','--project','demo-app-faltas','--config','firebase.test.json','--export-on-exit',dataPath];
if(fs.existsSync(path.join(dataPath,'firebase-export-metadata.json')))args.push('--import',dataPath);
args.push('node --import tsx scripts/local-demo.mjs');
const child=spawn(process.execPath,args,{windowsHide:true,stdio:'inherit'});
// The CLI receives Ctrl+C from the same terminal and exports before exiting.
process.on('SIGINT',()=>{});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
await new Promise(resolve=>child.once('exit',code=>{process.exitCode=code??0;resolve();}));
