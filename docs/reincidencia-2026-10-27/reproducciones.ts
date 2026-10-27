/** Auditoría local: reproduce defectos actuales; NO es una suite de aceptación.
 * No inicializa Firebase ni realiza llamadas de red. Datos exclusivamente ficticios.
 * Ejecutar desde la raíz: node --import tsx docs/reincidencia-2026-10-27/reproducciones.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { isReincidenciaOrigenMatch, isSameTipificacion, getArticulosBaseForSancionEscalada, sameArticulo } from '../../src/lib/domain/disciplinary-recidivism';
import { lowerDependentChain, ancestorBlock, DAY_MS } from '../../src/lib/domain/sanction-policy';
import { createFaltaSchema } from '../../src/lib/domain/schemas';
import { buildReincidenciaWindow } from '../../src/lib/faltas/reincidencia';
import { applyHistoricalConsistencyChecks, type HistoricalSanctionPreviewRow, type ExistingSanctionLookup } from '../../src/lib/imports/historical-sanctions';
import { recurrenceSnapshot } from '../../src/lib/server/operations';

const results: {id: string; tipo: string; observado: string}[] = [];
function record(id: string, tipo: string, observado: string) { results.push({id,tipo,observado}); }
const root = (id: string, inciso: string) => ({id,personalId:'persona-ficticia',estado:'registrada',articulo:'Art. 9',inciso});
const origin = (id: string, articulo: string, inciso: string, previous: unknown = null) => ({faltaReferenciaId:id,articuloBase:articulo,incisoBase:inciso,origenReincidenciaPrevia:previous});
const a=root('a','1. Conducta A'), x=root('x','2. Conducta B');
const b={...a,id:'b',articulo:'Art. 10',inciso:'1. Reincidencia',reincidenciaOrigen:origin('a',a.articulo,a.inciso)};
const y={...x,id:'y',articulo:'Art. 10',inciso:'1. Reincidencia',reincidenciaOrigen:origin('x',x.articulo,x.inciso)};
const c={...a,id:'c',articulo:'Art. 11',inciso:'1. Reincidencia',reincidenciaOrigen:origin('b',b.articulo,b.inciso,b.reincidenciaOrigen)};
const z={...x,id:'z',articulo:'Art. 11',inciso:'1. Reincidencia',reincidenciaOrigen:origin('y',y.articulo,y.inciso,y.reincidenciaOrigen)};

async function main() {
  assert.equal(isReincidenciaOrigenMatch(c.reincidenciaOrigen,y.articulo,y.inciso),true);
  record('R01','defecto reproducido en helper real','Art.11 de conducta A coincide con antecedente Art.10/1 de conducta B; ignora ID y raíz.');
  assert.equal(isReincidenciaOrigenMatch(b.reincidenciaOrigen,a.articulo,a.inciso),true);
  assert.equal(isReincidenciaOrigenMatch(c.reincidenciaOrigen,a.articulo,a.inciso),false);
  record('R02','defecto reproducido en helper real','La búsqueda por conducta 9/1 encuentra su escalón 10/1 pero pierde el 11/1 con origen inmediato 10/1.');
  const window=buildReincidenciaWindow('2026-10-27');
  const dated=[{...a,fecha:'2025-10-01'},{...b,fecha:'2026-01-01'}];
  const visible=dated.filter(r=>{const t=Date.parse(r.fecha+'T00:00:00Z');return t>=window.start.toMillis()&&t<=window.end.toMillis();});
  // Reproduce la selección de la ruta; no ejecuta el handler HTTP.
  assert.equal(visible.length,1);
  assert.equal(visible.filter(r=>isSameTipificacion(r.articulo,r.inciso,a.articulo,a.inciso)).length,0);
  record('R03','selección de ruta reproducida en memoria','Base fuera de ventana y reincidencia dentro: matching queda vacío y la ruta no entra a examinar escaladas.');
  assert.ok(getArticulosBaseForSancionEscalada('Art. 11','1. Reincidencia').some(v=>sameArticulo(v,'Art. 9')));
  assert.throws(()=>lowerDependentChain([a,{...c,reincidenciaOrigen:origin('a',a.articulo,a.inciso)}],'a'),/escalón/);
  record('R04','contradicción reproducida en helpers reales','Registro permite base9 para11/1; reajuste rechaza la misma cadena por faltar escalón10.');

  const existing: ExistingSanctionLookup[]=[{...a,ci:'FICTICIO',fechaSancion:'2026-01-01',memorandum:'Acta-001/2026',unidadSancionId:'unidad-ficticia'}];
  function imported(n:number):HistoricalSanctionPreviewRow {
    return {rowKey:`fila-${n}`,sourceRow:n,status:'valid',original:{},errors:[],warnings:[],normalized:{rowKey:`fila-${n}`,sourceRow:n,personalId:a.personalId,ci:'FICTICIO',nombreCompleto:'Persona ficticia',gradoActual:'Ficticio',unidadActualId:'',unidadActualNombre:'',fechaSancion:`2026-02-0${n}`,articulo:'Art. 10',inciso:'1. Reincidencia',memorandum:`Memorándum-00${n}/2026`,motivo:'Prueba aislada',motivoNoDisponible:false,unidadSancionId:'unidad-ficticia',unidadSancionNombre:'Unidad ficticia',unidadEfectivoHistoricaId:'unidad-ficticia',unidadEfectivoHistoricaNombre:'Unidad ficticia',importKey:`distinta-${n}`,isEscalada:true}};
  }
  const rows=[imported(2),imported(3)];
  applyHistoricalConsistencyChecks(rows,existing);
  assert.deepEqual(rows.map(r=>[r.status,r.normalized?.originFaltaId]),[['valid','a'],['valid','a']]);
  record('R05','defecto reproducido en importador real','Dos filas10/1 con memorándums distintos quedan válidas y apuntan al mismo9/1; no escalona la segunda.');

  const future=createFaltaSchema.safeParse({personalId:'p',unidadId:'u',articulo:'Art. 9',inciso:'1. Conducta ficticia',fechaSancion:'2099-01-01',memorandum:'Acta-001/2099',motivo:'Prueba local'});
  assert.equal(future.success,true);
  assert.equal(buildReincidenciaWindow('2099-01-01').end.toDate().getUTCFullYear(),2099);
  record('R06','defecto reproducido en esquema y fechas reales','Fecha futura admitida por esquema y ventana; inspección del POST no encuentra control posterior contra hoy.');

  const now=Date.now();
  // Se usa el reconstructor real con transporte en memoria; no se conecta Firestore.
  const malformed = new Map([['root10',{...a,id:'root10',articulo:'Art. 10',inciso:'2. Conducta C',createdAt:Timestamp.fromMillis(now-30*DAY_MS)}],['child10',{...b,id:'child10',createdAt:Timestamp.fromMillis(now-20*DAY_MS),reincidenciaOrigen:origin('root10','Art. 10','2. Conducta C')}]]);
  const db={collection:(name:string)=>({doc:(id:string)=>({name,id}),where:()=>({query:true})})};
  const tx={get:async(ref:{query?:boolean;id?:string})=>ref.query?{docs:[]}:{data:()=>malformed.get(ref.id!)}};
  const snapshot=await recurrenceSnapshot(tx as never,db as never,a.personalId,'child10');
  assert.equal(snapshot?.faltaReferenciaId,'child10');
  record('R07','defecto reproducido en reconstructor real con transporte simulado','Acepta cadena10/2→10/1 sin validar transición de artículo, aunque la cancelación la rechaza. No prueba existencia de estos datos reales.');

  const adjusted=lowerDependentChain([a,b,c,x,y,z],'a');
  assert.deepEqual(adjusted.map(r=>[r.id,r.articulo,r.inciso]),[['b','Art. 9',a.inciso],['c','Art. 10',b.inciso]]);
  assert.equal(adjusted.some(r=>['x','y','z'].includes(r.id)),false);
  record('C01','control positivo','Rebaja por referencias concretas respeta una segunda cadena independiente correctamente vinculada.');
  assert.match(ancestorBlock({...a,createdAt:Timestamp.fromMillis(now-6*DAY_MS)},[],now)!,/siete días/);
  assert.match(ancestorBlock({...a,createdAt:Timestamp.fromMillis(now-8*DAY_MS)},[{estado:'pendiente',expiresAt:Timestamp.fromMillis(now+DAY_MS)}],now)!,/pendiente/);
  assert.equal(ancestorBlock({...a,createdAt:Timestamp.fromMillis(now-8*DAY_MS)},[{estado:'pendiente',expiresAt:Timestamp.fromMillis(now)}],now),null);
  record('C02','control positivo','Espera7d, solicitud pendiente y vencimiento efectivo5d mantienen bloqueo/desbloqueo previsto.');
  const files=['src/lib/domain/disciplinary-recidivism.ts','src/lib/domain/sanction-policy.ts','src/lib/server/operations.ts','src/app/api/faltas/route.ts','src/lib/imports/historical-sanctions.ts','src/app/api/imports/faltas/[id]/confirm/route.ts'];
  console.log(JSON.stringify({fecha:new Date().toISOString(),alcance:'Local sin red; helpers reales y una selección equivalente al POST, sin ejecutar HTTP ni Firebase',advertencia:'Los defectos reproducidos son expectativas del estado defectuoso, no aprobación funcional',results,sha256:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
