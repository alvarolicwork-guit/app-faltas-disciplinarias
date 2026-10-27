import assert from "node:assert/strict";
import { test } from "node:test";
import { DISCIPLINARY_CATALOG } from "../domain/disciplinary-catalog";
import { applyHistoricalConsistencyChecks, normalizeHistoricalHeader, type ExistingSanctionLookup, type HistoricalSanctionPreviewRow } from "./historical-sanctions";
const art=(n:number)=>DISCIPLINARY_CATALOG.find(a=>a.id===`art${n}`)!;
function existing(id:string,a=9,i=1,date="2026-01-01"):ExistingSanctionLookup{return {id,personalId:"p",ci:"FICTICIO",articulo:art(a).label,inciso:art(a).incisos[i-1],fechaSancion:date,memorandum:`Documento ficticio-${id}`,unidadSancionId:"u",estado:"registrada"};}
function imported(n:number,a=10,i=1,parent?:string,date="2026-02-01"):HistoricalSanctionPreviewRow{
  return {rowKey:`row-${n}`,sourceRow:n,status:"valid",original:{},errors:[],warnings:[],normalized:{rowKey:`row-${n}`,sourceRow:n,ci:"FICTICIO",personalId:"p",nombreCompleto:"Persona ficticia",gradoActual:"Cabo",unidadActualId:"",unidadActualNombre:"",fechaSancion:date,articulo:art(a).label,inciso:art(a).incisos[i-1],memorandum:a===9?`Acta-00${n}/2026`:`Memorándum-00${n}/2026`,motivo:"Prueba ficticia de importación",motivoNoDisponible:false,unidadSancionId:"u",unidadSancionNombre:"Unidad ficticia",unidadEfectivoHistoricaId:"u",unidadEfectivoHistoricaNombre:"Unidad ficticia",importKey:`import-${n}`,isEscalada:(a===10||a===11)&&i===1,...(parent?{originFaltaId:parent}:{})}};
}
test("A26 R05: dos10/1 de la misma base no quedan ambos válidos",()=>{
  const rows=[imported(2,10,1,"a"),imported(3,10,1,"a","2026-03-01")];applyHistoricalConsistencyChecks(rows,[existing("a")]);
  assert.equal(rows[0].status,"valid");assert.equal(rows[1].status,"error");assert.match(rows[1].errors[0].message,/escalón/);
});
test("A27: el archivo exige antecedente concreto para una escalada",()=>{
  const rows=[imported(2)];applyHistoricalConsistencyChecks(rows,[existing("a")]);assert.equal(rows[0].status,"error");assert.match(rows[0].errors[0].message,/antecedente_id/);
  assert.equal(normalizeHistoricalHeader("falta referencia id"),"antecedente_id");
});
test("A05: dos10/1 de conductas distintas sí son válidos en el mismo archivo",()=>{
  const rows=[imported(2,10,1,"a"),imported(3,10,1,"x")];applyHistoricalConsistencyChecks(rows,[existing("a"),existing("x",9,2)]);
  assert.deepEqual(rows.map(r=>r.status),["valid","valid"]);assert.equal(rows[0].normalized?.conductaOrigen?.incisoNumero,1);assert.equal(rows[1].normalized?.conductaOrigen?.incisoNumero,2);
});
test("A17: la importación permite nueva10/X cuando venció la cadena original",()=>{
  const rows=[imported(2,10,5,undefined,"2026-10-01")];applyHistoricalConsistencyChecks(rows,[existing("a",10,5,"2025-10-01")]);assert.equal(rows[0].status,"valid");assert.equal(rows[0].normalized?.nivelEfectivo,0);assert.equal(rows[0].normalized?.fechaVencimientoCadena,"2027-10-01");
});
test("A20: la importación no inserta silenciosamente una base anterior a registros posteriores",()=>{
  const rows=[imported(2,9,1,undefined,"2026-01-01")];applyHistoricalConsistencyChecks(rows,[existing("a",9,1,"2026-02-01")]);assert.equal(rows[0].status,"error");assert.match(rows[0].errors[0].message,/retroactivo/);
});
test("A08: importar11/1 directamente desde9/X se rechaza",()=>{
  const rows=[imported(2,11,1,"a")];applyHistoricalConsistencyChecks(rows,[existing("a")]);assert.equal(rows[0].status,"error");
});
