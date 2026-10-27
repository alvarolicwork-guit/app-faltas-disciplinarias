import assert from "node:assert/strict";
import { test } from "node:test";
import { DISCIPLINARY_CATALOG } from "./disciplinary-catalog";
import { canonicalConduct, evaluateRecurrence, inspectChains, matchesDecision, newChainMetadata, resolveChain, SanctionRow, validateSanctionDate, boliviaToday } from "./recurrence-chain";

const c = (a: number, i: number) => { const article = DISCIPLINARY_CATALOG.find(x => x.id === `art${a}`)!; return canonicalConduct(article.label, article.incisos[i - 1]); };
function row(id: string, a: number, i: number, date: string, parent?: SanctionRow): SanctionRow {
  const conduct = c(a, i);
  return { id, personalId: "p", estado: "registrada", articulo: conduct.articulo, inciso: conduct.inciso, fechaSancion: date,
    reincidenciaOrigen: parent ? { faltaReferenciaId: parent.id, articuloBase: parent.articulo, incisoBase: parent.inciso } : null };
}
const a = row("a", 9, 1, "2025-10-01"), b = row("b", 10, 1, "2026-01-01", a), d = row("d", 11, 1, "2026-06-01", b);
const x = row("x", 9, 2, "2025-11-01"), y = row("y", 10, 1, "2026-02-01", x);

test("A01: primera conducta inicia una base con fecha y códigos canónicos", () => {
  const decision = evaluateRecurrence([], "p", "2026-10-01", c(9, 1));
  assert.equal(decision.tipo, "base"); assert.equal(decision.antecedenteId, null);
  assert.equal(decision.periodoAnteriorVencido, false);
  assert.equal(evaluateRecurrence([x], "p", "2026-12-01", c(9, 1)).periodoAnteriorVencido, false);
  assert.equal(newChainMetadata("n", c(9, 1), "2026-10-01").fechaVencimientoCadena, "2027-10-01");
});
test("A02-A03: la misma conducta escala exactamente un nivel desde el último registro", () => {
  assert.equal(evaluateRecurrence([a], "p", "2026-02-01", c(9, 1)).sancion.articulo, c(10, 1).articulo);
  const decision = evaluateRecurrence([a, b], "p", "2026-03-01", c(9, 1));
  assert.equal(decision.antecedenteId, "b"); assert.equal(decision.sancion.articulo, c(11, 1).articulo);
  assert.equal(matchesDecision(c(11, 1).articulo, c(11, 1).inciso, "a", decision), false);
});
test("A04-A05 R01: cadenas9/1 y9/2 alcanzan11/1 sin colisión", () => {
  const decision = evaluateRecurrence([a, b, d, x, y], "p", "2026-08-01", c(9, 2));
  assert.equal(decision.tipo, "escalada"); assert.equal(decision.antecedenteId, "y");
  assert.equal(decision.metadata?.conductaOrigen.incisoNumero, 2); assert.equal(decision.metadata?.nivelEfectivo, 2);
  assert.equal(evaluateRecurrence([a, b, d, x, y], "p", "2026-08-01", c(9, 1)).tipo, "remision");
});
test("A06-A07: las conductas sustantivas10/X no son la conducta10/1", () => {
  const p = row("p10", 10, 2, "2026-01-01"), q = row("q10", 10, 3, "2026-01-01"), p11 = row("p11", 11, 1, "2026-02-01", p);
  const decision = evaluateRecurrence([p, q, p11], "p", "2026-03-01", c(10, 3));
  assert.equal(decision.antecedenteId, "q10"); assert.equal(decision.metadata?.nivelEfectivo, 1);
  assert.equal(resolveChain([p, p11], "p11").metadata.conductaOrigen.articuloNumero, 10);
});
test("A08: no se admite salto9→11 ni10/2→10/1", () => {
  assert.throws(() => resolveChain([a, row("bad", 11, 1, "2026-01-01", a)], "bad"), /escalón/);
  const base10 = row("base10", 10, 2, "2026-01-01");
  assert.throws(() => resolveChain([base10, row("bad", 10, 1, "2026-02-01", base10)], "bad"), /escalón/);
});
test("A09 R02: la raíz9/1 identifica el11/1 final y remite, sin repetir escalón", () => {
  const decision = evaluateRecurrence([a, b, d], "p", "2026-09-01", c(9, 1));
  assert.equal(decision.tipo, "remision"); assert.equal(decision.antecedenteId, "d");
});
test("A15: día364 escala; días365/366 reinician; el último escalón no renueva", () => {
  assert.equal(evaluateRecurrence([a, b], "p", "2026-09-30", c(9, 1)).tipo, "escalada");
  for (const day of ["2026-10-01", "2026-10-02"]) assert.equal(evaluateRecurrence([a, b], "p", day, c(9, 1)).tipo, "base");
});
test("A16 R03: raíz vencida con descendiente reciente permite nueva9/X", () => {
  const decision = evaluateRecurrence([a, b, d], "p", "2026-10-27", c(9, 1));
  assert.equal(decision.tipo, "base"); assert.equal(decision.metadata, null); assert.equal(decision.antecedenteId, null);
  assert.equal(decision.periodoAnteriorVencido, true);
});
test("A17: raíz10/X vencida permite nueva10/X", () => {
  const root = row("ten", 10, 5, "2025-10-01"), child = row("eleven", 11, 1, "2026-09-01", root);
  const decision = evaluateRecurrence([root, child], "p", "2026-10-01", c(10, 5));
  assert.equal(decision.tipo, "base"); assert.equal(decision.sancion.inciso, c(10, 5).inciso);
});
test("A18: fechas futuras, inválidas y medianoche en Bolivia", () => {
  assert.throws(() => validateSanctionDate("2099-01-01", "2026-10-27"), /futura/);
  assert.throws(() => validateSanctionDate("2026-02-30", "2026-10-27"), /inválida/);
  assert.equal(boliviaToday(new Date("2026-10-27T02:00:00Z")), "2026-10-26");
});
test("A19-A20: referencia explícita permite mismo día; inserción anterior a registros exige revisión", () => {
  const root = row("same", 9, 1, "2026-01-01"), child = row("same10", 10, 1, "2026-01-01", root);
  assert.equal(resolveChain([root, child], "same10").nodes.length, 2);
  assert.throws(() => evaluateRecurrence([a, b], "p", "2025-12-01", c(9, 1)), /retroactivo/);
});
test("A26-A37: bifurcación, huérfano terminal, ciclo e identidad cruzada se detectan", () => {
  assert.throws(() => resolveChain([a, b, row("b2", 10, 1, "2026-02-01", a)], "b"), /bifurcación/);
  assert.ok(inspectChains([b])[0].error);
  assert.throws(() => resolveChain([{ ...a, reincidenciaOrigen: { faltaReferenciaId: "b" } }, b], "b"), /incompatible|ciclo/);
  assert.throws(() => resolveChain([a, { ...b, personalId: "otro" }], "b"), /otra persona/);
});
test("A37: referencia y metadatos alterados requieren revisión", () => {
  assert.throws(() => resolveChain([a, { ...b, reincidenciaOrigen: { faltaReferenciaId: "a", articuloBase: c(9, 1).articulo, incisoBase: c(9, 2).inciso } }], "b"), /referencia histórica/);
  assert.throws(() => resolveChain([{ ...a, ...newChainMetadata("a", c(9, 1), "2025-10-01"), fechaVencimientoCadena: "2028-01-01" }], "a"), /alterado/);
});
test("A45: cada escalón conserva fecha de vencimiento de la raíz", () => {
  for (const tip of ["a", "b", "d"]) assert.equal(resolveChain([a, b, d], tip).metadata.fechaVencimientoCadena, "2026-10-01");
});
test("A46 R13: una cadena ya escrita después de vencer requiere revisión; no se extiende", () => {
  const invalid = row("late", 10, 1, "2026-10-01", a);
  assert.throws(() => resolveChain([a, invalid], "late"), /fuera del plazo/);
});
test("A47: vencimiento independiente por conducta", () => {
  assert.equal(evaluateRecurrence([a, b, x, y], "p", "2026-10-01", c(9, 1)).tipo, "base");
  assert.equal(evaluateRecurrence([a, b, x, y], "p", "2026-10-01", c(9, 2)).tipo, "escalada");
});
test("A48: cadenas sucesivas de la misma conducta no heredan niveles", () => {
  const next = row("next", 9, 1, "2026-10-01");
  const decision = evaluateRecurrence([a, b, d, next], "p", "2026-10-27", c(9, 1));
  assert.equal(decision.metadata?.cadenaId, "next"); assert.equal(decision.metadata?.nivelEfectivo, 1);
});
test("A50: una evaluación histórica dentro del plazo no depende del día actual", () => {
  assert.equal(evaluateRecurrence([a, b], "p", "2026-03-01", c(9, 1)).tipo, "escalada");
});
test("A52: vencimiento no altera filas ni estado de sanciones", () => {
  const rows = structuredClone([a, b, d]); const before = structuredClone(rows);
  evaluateRecurrence(rows, "p", "2026-10-27", c(9, 1)); assert.deepEqual(rows, before);
});
test("365 días se mantienen en año bisiesto", () => {
  assert.equal(newChainMetadata("leap", c(9, 1), "2024-02-29").fechaVencimientoCadena, "2025-02-28");
});

test("A42: un historial mayor a100 registros no trunca la selección de la cadena",()=>{
  const rows=Array.from({length:160},(_,i)=>row(`long-${i}`,9,1,new Date(Date.parse("1865-01-01T00:00:00Z")+i*366*86_400_000).toISOString().slice(0,10)));
  const last=rows.at(-1)!;const date=new Date(Date.parse(String(last.fechaSancion)+"T00:00:00Z")+30*86_400_000).toISOString().slice(0,10);
  const decision=evaluateRecurrence(rows,"p",date,c(9,1));assert.equal(decision.antecedenteId,last.id);assert.equal(decision.metadata?.cadenaId,last.id);
});
