import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesPersonalSearch } from "./personal-search";
import { canViewGlobalPersonHistory, canReadCancellationRequests, canResolveCancellationRequests } from "./roles";

test("Búsqueda por CI, tildes, campos incompletos y nombres en distinto orden", () => {
  const person = { ci:"1234567", nombres:"José Luis", apellidos:"Pérez Núñez", nombreCompleto:"Cabo José Luis Pérez Núñez", grado:"Cabo" };
  for (const query of ["1234567", "1234", " JOSE   perez ", "NUÑEZ JOSÉ", "cabo pérez"]) assert.equal(matchesPersonalSearch(person, query), true, query);
  assert.equal(matchesPersonalSearch(person, "Pérez Gómez"), false);
  assert.equal(matchesPersonalSearch({nombreCompleto:"José Pérez"}, "perez jose"), true);
  assert.equal(matchesPersonalSearch(person, ""), true);
});

test("Historial departamental permitido a roles de consulta global; unidad denegada", () => {
  for (const role of ["admin_dpto","super_admin","visor_dpto"]) assert.equal(canViewGlobalPersonHistory(role), true);
  for (const role of ["admin_unidad","operador_unidad","desconocido",""]) assert.equal(canViewGlobalPersonHistory(role), false);
});

test("Seguimiento de solicitudes no concede resolución a roles de unidad", () => {
  for (const role of ["admin_unidad", "operador_unidad"]) {
    assert.equal(canReadCancellationRequests(role), true);
    assert.equal(canResolveCancellationRequests(role), false);
  }
  for (const role of ["admin_dpto", "super_admin"]) {
    assert.equal(canReadCancellationRequests(role), true);
    assert.equal(canResolveCancellationRequests(role), true);
  }
  for (const role of ["visor_dpto", "desconocido", ""]) {
    assert.equal(canReadCancellationRequests(role), false);
    assert.equal(canResolveCancellationRequests(role), false);
  }
});
