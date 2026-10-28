import assert from "node:assert/strict";
import { test } from "node:test";
import { ancestorBlock, ancestorEligibility, canRequestCancellation, DAY_MS, lowerDependentChain, pendingRequest } from "./sanction-policy";
import { parseDelimited, escapeHtml } from "./delimited";
import { boliviaMonth, csvCell } from "./audit-report";

const start = Date.parse("2026-01-01T12:00:00Z");
const row = { createdAt: new Date(start).toISOString(), estado: "registrada", createdBy: {uid:"a"}, unidadId:"u" };
test("siete días: solo autor y unidad, frontera exacta excluida",()=>{
  const actor={uid:"a",role:"admin_unidad",unidadId:"u"};
  assert.equal(canRequestCancellation(actor,row,start+7*DAY_MS-1),true);
  assert.equal(canRequestCancellation(actor,row,start+7*DAY_MS),false);
  assert.equal(canRequestCancellation({...actor,uid:"b"},row,start),false);
  assert.equal(canRequestCancellation({...actor,unidadId:"v"},row,start),false);
  assert.equal(canRequestCancellation({...actor,role:"operador_unidad"},row,start),false);
});
test("cinco días: pendiente deja de bloquear exactamente al vencer",()=>{
  const request={estado:"pendiente",createdAt:row.createdAt};
  assert.equal(pendingRequest(request,start+5*DAY_MS-1),true);
  assert.equal(pendingRequest(request,start+5*DAY_MS),false);
  assert.equal(pendingRequest({estado:"pendiente"},start),true);
});
test("antecedentes vigentes esperan siete días y ausencia de solicitud",()=>{
  assert.match(ancestorBlock(row,[],start)!,/siete días/);
  assert.equal(ancestorBlock(row,[],start+7*DAY_MS),null);
  const request={estado:"pendiente",createdAt:new Date(start+6*DAY_MS).toISOString()};
  assert.match(ancestorBlock(row,[request],start+8*DAY_MS)!,/solicitud/);
  assert.equal(ancestorBlock(row,[request],start+11*DAY_MS),null);
  assert.match(ancestorBlock({...row,estado:"anulada"},[],start+20*DAY_MS)!,/sin efecto/);
});

const earlyRow = {...row,id:"antecedente"};
const rejected = {id:"solicitud",faltaId:earlyRow.id,estado:"rechazada",causaCierre:"decision",createdAt:new Date(start+DAY_MS).toISOString(),resolvedAt:new Date(start+2*DAY_MS).toISOString(),expiresAt:new Date(start+6*DAY_MS).toISOString(),resolvedBy:{uid:"departamental",role:"admin_dpto"},motivoResolucion:"La sanción está correctamente registrada",confirmacionId:"confirmacion"};
test("rechazo expreso dispensa únicamente la espera del antecedente asociado",()=>{
  const result=ancestorEligibility(earlyRow,[rejected],start+2*DAY_MS);
  assert.equal(result.disponible,true);assert.equal(result.rechazoExpreso?.solicitudId,"solicitud");
  assert.equal(ancestorEligibility({...earlyRow,id:"otro"},[rejected],start+2*DAY_MS).disponible,false);
  assert.equal(ancestorEligibility(earlyRow,[{...rejected,resolvedBy:{uid:"super",role:"super_admin"}}],start+2*DAY_MS).disponible,true);
  assert.equal(ancestorEligibility(earlyRow,[rejected],start+2*DAY_MS-1).disponible,false);
});
test("pendiente prevalece sobre rechazo previo incluso antes del séptimo día",()=>{
  const pending={estado:"pendiente",createdAt:new Date(start+3*DAY_MS).toISOString()};
  assert.equal(ancestorEligibility(earlyRow,[rejected,pending],start+4*DAY_MS).codigo,"solicitud_pendiente");
  assert.equal(ancestorEligibility(earlyRow,[rejected,{estado:"pendiente"}],start+4*DAY_MS).codigo,"solicitud_pendiente");
});
test("vencimiento al día seis espera solo hasta siete; vencimiento al once no añade días",()=>{
  const expired={...rejected,causaCierre:"vencimiento",resolvedBy:{uid:"sistema",role:"sistema"},resolvedAt:new Date(start+6*DAY_MS).toISOString()};
  assert.equal(ancestorEligibility(earlyRow,[expired],start+6*DAY_MS).codigo,"espera");
  assert.match(ancestorBlock(earlyRow,[expired],start+6*DAY_MS)!,/vencimiento/);
  assert.equal(ancestorBlock(earlyRow,[expired],start+7*DAY_MS),null);
  const unprocessed={estado:"pendiente",createdAt:new Date(start+6*DAY_MS).toISOString()};
  assert.equal(ancestorEligibility(earlyRow,[unprocessed],start+11*DAY_MS-1).codigo,"solicitud_pendiente");
  assert.equal(ancestorBlock(earlyRow,[unprocessed],start+11*DAY_MS),null);
});
test("evidencia incompleta, tardía, futura o sin autoridad no habilita anticipadamente",()=>{
  const patches:Record<string,unknown>[]=[{causaCierre:undefined},{estado:"aprobada"},{confirmacionId:""},{id:undefined},{motivoResolucion:""},{resolvedBy:{uid:"sistema",role:"sistema"}},{resolvedBy:{uid:"operador",role:"operador_unidad"}},{createdAt:new Date(start-1).toISOString()},{createdAt:new Date(start+7*DAY_MS).toISOString()},{resolvedAt:rejected.expiresAt},{resolvedAt:new Date(start).toISOString()},{expiresAt:new Date(start+10*DAY_MS).toISOString()},{resolvedAt:undefined}];
  for(const patch of patches) assert.equal(ancestorEligibility(earlyRow,[{...rejected,...patch}],start+3*DAY_MS).disponible,false,JSON.stringify(patch));
  assert.equal(ancestorEligibility({...earlyRow,createdAt:undefined},[rejected],start+3*DAY_MS).codigo,"fecha_no_verificable");
  assert.equal(ancestorEligibility({...earlyRow,createdAt:new Date(start+4*DAY_MS).toISOString()},[rejected],start+3*DAY_MS).codigo,"fecha_no_verificable");
});
test("rechazo no supera sin efecto ni revisión y la dispensa termina al cumplir siete días",()=>{
  assert.equal(ancestorEligibility({...earlyRow,estado:"anulada"},[rejected],start+3*DAY_MS).codigo,"sin_efecto");
  assert.equal(ancestorEligibility({...earlyRow,revisionReincidencia:"pendiente"},[rejected],start+3*DAY_MS).codigo,"revision");
  assert.equal(ancestorEligibility(earlyRow,[rejected],start+7*DAY_MS).rechazoExpreso,null);
  assert.equal(canRequestCancellation({uid:"a",role:"admin_unidad",unidadId:"u"},earlyRow,start+2*DAY_MS),true);
});
const chain=[
  {id:"a",personalId:"p",articulo:"Art. 9",inciso:"3. Base",estado:"registrada",fechaSancion:"2026-01-01"},
  {id:"b",personalId:"p",articulo:"Art. 10",inciso:"1. Reincidencia",estado:"registrada",fechaSancion:"2026-02-01",reincidenciaOrigen:{faltaReferenciaId:"a"}},
  {id:"c",personalId:"p",articulo:"Art. 11",inciso:"1. Reincidencia",estado:"registrada",fechaSancion:"2026-03-01",reincidenciaOrigen:{faltaReferenciaId:"b"}},
  {id:"x",personalId:"p",articulo:"Art. 9",inciso:"5. Independiente",estado:"registrada",fechaSancion:"2026-01-02"},
];
test("cancelar Art9: solo sus descendientes bajan un nivel y se enlazan",()=>{
  const result=lowerDependentChain(chain,"a");
  assert.deepEqual(result.map(r=>[r.id,r.articulo,r.inciso]),[["b","Art. 9","3. Base"],["c","Art. 10","1. Reincidencia"]]);
  assert.equal(result[0].reincidenciaOrigen,null);
  assert.equal((result[1].reincidenciaOrigen as {faltaReferenciaId:string}).faltaReferenciaId,"b");
  assert.equal(chain[1].articulo,"Art. 10");
});
test("cancelar Art10: Art11 pasa a Art10 con origen Art9",()=>{
  const result=lowerDependentChain(chain,"b");
  assert.equal(result.length,1);assert.equal(result[0].articulo,"Art. 10");
  assert.equal((result[0].reincidenciaOrigen as {faltaReferenciaId:string}).faltaReferenciaId,"a");
});
test("cancelar última sanción no modifica las anteriores",()=>assert.deepEqual(lowerDependentChain(chain,"c"),[]));
test("cadenas cíclicas, incompletas o con salto no se rebajan inventando antecedentes",()=>{
  assert.throws(()=>lowerDependentChain(chain.map(r=>r.id==="a"?{...r,articulo:"Art. 11",inciso:"1. Reincidencia",reincidenciaOrigen:{faltaReferenciaId:"c"}}:r),"a"),/ciclo|escalón|incompatible/);
  assert.throws(()=>lowerDependentChain(chain.filter(r=>r.id!=="a"),"b"),/ausente|incompleta/);
  assert.throws(()=>lowerDependentChain(chain.filter(r=>r.id!=="b").map(r=>r.id==="c"?{...r,reincidenciaOrigen:{faltaReferenciaId:"a"}}:r),"a"),/escalón/);
});
test("CSV con comas, comillas escapadas y multilínea",()=>assert.deepEqual(parseDelimited('ci,nombre\r\n1,"Ana, María"\r\n2,"A ""B""\nC"',","),[["ci","nombre"],["1","Ana, María"],["2",'A "B"\nC']]));
test("impresión y exportación no interpretan HTML/fórmulas",()=>{
  assert.equal(escapeHtml('<script>"&'),"&lt;script&gt;&quot;&amp;");
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
});
test("agrupación mensual utiliza Bolivia",()=>assert.equal(boliviaMonth("2026-02-01T02:00:00Z"),"2026-01"));

test("A54: cancelar raíz cuenta un nuevo año desde la sanción promovida a base",()=>{
 const result=lowerDependentChain(chain,"a");
 assert.equal(result[0].fechaInicioCadena,"2026-02-01"); assert.equal(result[0].fechaVencimientoCadena,"2027-02-01");
 assert.equal(result[1].fechaVencimientoCadena,"2027-02-01"); assert.equal(result[0].raizHistoricaId,"a"); assert.equal(result[0].raizVigenteId,"b");
});
test("A34: cancelaciones sucesivas vuelven a promover la base conservando historia",()=>{
 const first=lowerDependentChain(chain,"a"); const rows=chain.map(r=>r.id==="a"?{...r,estado:"anulada"}:first.find(x=>x.id===r.id)??r);
 const second=lowerDependentChain(rows,"b"); assert.equal(second[0].fechaInicioCadena,"2026-03-01");assert.equal(second[0].raizHistoricaId,"a");assert.equal(second[0].raizVigenteId,"c");
});

test("A33: cancelar la base10/X promueve11/1 a10/X y abre el año desde esa sanción",()=>{
 const rows=[{id:"ten-root",personalId:"p",articulo:"Art. 10",inciso:"5. Encubrir faltas leves.",fechaSancion:"2026-01-01",estado:"registrada"},{id:"ten-child",personalId:"p",articulo:"Art. 11",inciso:"1. Reincidencia",fechaSancion:"2026-02-01",estado:"registrada",reincidenciaOrigen:{faltaReferenciaId:"ten-root"}}];
 const result=lowerDependentChain(rows,"ten-root");assert.equal(result[0].articulo,"Art. 10");assert.equal(result[0].inciso,"5. Encubrir faltas leves.");assert.equal(result[0].nivelEfectivo,0);assert.equal(result[0].fechaVencimientoCadena,"2027-02-01");
});
test("A35-A53: otra conducta y un episodio posterior de la misma conducta permanecen intactos",()=>{
 const rows=[...chain,{id:"y",personalId:"p",articulo:"Art. 10",inciso:"1. Reincidencia",fechaSancion:"2026-02-01",estado:"registrada",reincidenciaOrigen:{faltaReferenciaId:"x"}},{id:"later",personalId:"p",articulo:"Art. 9",inciso:"3. Base",fechaSancion:"2027-03-01",estado:"registrada"}];
 const before=structuredClone(rows);const result=lowerDependentChain(rows,"a");assert.deepEqual(result.map(r=>r.id),["b","c"]);assert.deepEqual(rows,before);
});
test("Una promoción que solapa otra cadena exige revisión, sin mezclar episodios",()=>{
 const rows=[...chain,{id:"later",personalId:"p",articulo:"Art. 9",inciso:"3. Base",fechaSancion:"2027-01-15",estado:"registrada"}];assert.throws(()=>lowerDependentChain(rows,"a"),/superpone/);
});
test("Una hoja histórica inválida se puede dejar sin efecto sin retipificar otros registros",()=>{
 const rows=[{id:"orphan",personalId:"p",articulo:"Art. 10",inciso:"1. Reincidencia",fechaSancion:"2026-01-01",estado:"registrada",reincidenciaOrigen:{faltaReferenciaId:"missing"}}];assert.deepEqual(lowerDependentChain(rows,"orphan"),[]);assert.equal(rows[0].estado,"registrada");
});
