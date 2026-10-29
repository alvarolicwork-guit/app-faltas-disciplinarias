/* eslint-disable @typescript-eslint/no-require-imports */
const {execFileSync}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
const commits=git('rev-list','--all').trim().split('\n');
const candidates=new Map();
for(const line of git('rev-list','--objects','--all').trim().split('\n')){
 const [oid,...parts]=line.split(' ');const p=parts.join(' ');
 if(/\.(?:[cm]?[jt]sx?|json|md|ya?ml|toml|rules|env|pem|key)$|(^|\/)\.env/.test(p))candidates.set(oid,p);
}
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{40,}\b/,/\bAKIA[0-9A-Z]{16}\b/];
const matches=[];
for(const [oid,p]of candidates){const content=git('cat-file','blob',oid);if(patterns.some(r=>r.test(content)))matches.push({blob:oid,path:p,requiresManualReview:true});}
const source=readFileSync('src/components/registro/importar-sanciones-historicas.tsx','utf8');
const body=source.match(/function escapeCsv\(value: unknown\): string \{([\s\S]*?)\n  \}/)[1];
const escapeCsv=Function('value',body.replace(' == null',' == null'));
const formula='=1+1',result=escapeCsv(formula);
const cleanup=readFileSync('scripts/cleanup-production-data.mjs','utf8');
const targets=cleanup.match(/const TARGET_COLLECTIONS = \[([\s\S]*?)\];/)[1];
const data={checkedAt:new Date().toISOString(),secretScan:{commits:commits.length,textBlobs:candidates.size,patterns:4,matches,limits:'Pattern-based review only; no credential validation and no guarantee of absence'},csv:{function:'actual escapeCsv extracted from source',input:formula,output:result,formulaNeutralized:result.startsWith('"\'')},cleanup:{coversHistoricalImports:targets.includes('"imports_sanciones"'),coversNotifications:targets.includes('"notificaciones"'),coversConfirmations:targets.includes('"confirmaciones"'),hasPerRecordTestFilter:/isTest|testData|dryRunManifest/.test(cleanup)}};
writeFileSync('docs/auditoria-2026-10-28/estatico.json',JSON.stringify(data,null,2));console.log(JSON.stringify(data,null,2));
