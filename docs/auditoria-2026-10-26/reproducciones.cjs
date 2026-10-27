// Auditoria aislada: ejecuta los handlers reales con Auth/Firestore en memoria.
// Un test aprobado confirma el defecto descrito, NO certifica seguridad.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const { Timestamp } = require('firebase-admin/firestore');
const root = path.resolve(__dirname, '../..');

function fixture(actor, seed = {}) {
  const records = new Map(Object.entries(seed));
  const writes = [], queries = [], authCalls = [];
  let counter = 0;
  const snap = (ref) => ({ id: ref.id, ref, exists: records.has(ref.key), data: () => records.get(ref.key) });
  function ref(key) {
    return { key, id: key.split('/').at(-1), get: async () => snap(ref(key)),
      update: async (data) => apply(['update', ref(key), data]),
      set: async (data) => apply(['set', ref(key), data]) };
  }
  function apply(w) { writes.push(w); records.set(w[1].key, w[0] === 'update' ? { ...records.get(w[1].key), ...w[2] } : w[2]); }
  function collection(name) {
    const filters = []; let max = Infinity;
    const q = { doc: (id) => ref(`${name}/${id || `auto${++counter}`}`),
      add: async (data) => { const r = q.doc(); apply(['set', r, data]); return r; },
      where: (...args) => { filters.push(args); return q; },
      orderBy: () => q, limit: (n) => { max = n; return q; },
      get: async () => {
        queries.push({ name, filters: [...filters], max });
        const docs = [...records.keys()].filter(k => k.startsWith(name + '/') && k.split('/').length === 2)
          .map(k => snap(ref(k))).filter(d => filters.every(([field, op, value]) => {
            const actual = d.data()[field];
            if (op === '==') return actual === value;
            if (op === '<=') return actual <= value;
            if (op === '>=') return actual >= value;
            throw new Error(`Unsupported operator ${op}`);
          })).slice(0, max);
        return { docs, empty: !docs.length, size: docs.length };
      } };
    return q;
  }
  const db = { collection, runTransaction: async fn => {
    const pending = [];
    const result = await fn({ get: obj => obj.get(),
      set: (r, d) => pending.push(['set', r, d]), update: (r, d) => pending.push(['update', r, d]) });
    pending.forEach(apply); return result;
  } };
  const auth = { getUserByEmail: async () => ({ uid: 'target', displayName: 'Target' }),
    updateUser: async (...args) => authCalls.push(['updateUser', ...args]),
    revokeRefreshTokens: async (...args) => authCalls.push(['revoke', ...args]) };
  const cache = new Map();
  function load(file) {
    const full = path.resolve(root, file);
    if (cache.has(full)) return cache.get(full).exports;
    const mod = { exports: {} }; cache.set(full, mod);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    function localRequire(name) {
      if (name === '@/lib/auth/request-user') return { getRequestUser: async () => actor };
      if (name === '@/lib/firebase/admin') return { getAdminDb: () => db, getAdminAuth: () => auth };
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(full), name)) + '.ts');
      if (name.startsWith('firebase-admin/') && name !== 'firebase-admin/firestore') throw new Error('Real Auth forbidden');
      return require(name);
    }
    new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
    return mod.exports;
  }
  return { load, records, writes, queries, authCalls };
}
const actor = (role, extra = {}) => ({ uid: 'actor', email: 'actor@example.invalid', role, unidadId: 'U-A', unidadNombre: 'Unidad A', ...extra });
const request = (url, method = 'GET', body) => new NextRequest('http://localhost' + url, {
  method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
});

test('H01: personalId permite leer sancion de otra unidad; scope explicito devuelve 403', async () => {
  const f = fixture(actor('operador_unidad'), { 'faltas/f1': { personalId: 'p-externo', unidadId: 'U-B', motivo: 'Dato sensible' } });
  const api = f.load('src/app/api/faltas/route.ts');
  assert.equal((await api.GET(request('/api/faltas?personalId=p-externo&scope=global_person'))).status, 403);
  const response = await api.GET(request('/api/faltas?personalId=p-externo'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data[0].motivo, 'Dato sensible');
  assert.equal(f.queries.at(-1).filters.some(x => x[0] === 'unidadId'), false);
});
test('H02: admin_dpto puede degradar super_admin mediante relevo', async () => {
  const f = fixture(actor('admin_dpto'), { 'users/target': { role: 'super_admin', status: 'activo' } });
  const response = await f.load('src/app/api/users/handover/route.ts').POST(request('/api/users/handover', 'POST', {
    unidadId: 'U-A', unidadNombre: 'Unidad A', role: 'admin_unidad', incomingEmail: 'target@example.invalid',
    incomingGrado: 'Cap.', incomingNombres: 'Prueba', incomingApellidos: 'Aislada', reason: 'Prueba local aislada'
  }));
  assert.equal(response.status, 200);
  assert.equal(f.records.get('users/target').role, 'admin_unidad');
});
test('H03: confirmacion de cambio de password sin cambiar password', async () => {
  const f = fixture(actor('admin_unidad', { mustChangePassword: true }), { 'users/actor': { mustChangePassword: true } });
  const response = await f.load('src/app/api/users/password-change/route.ts').POST(request('/api/users/password-change', 'POST', {}));
  assert.equal(response.status, 200);
  assert.equal(f.records.get('users/actor').mustChangePassword, false);
  assert.equal(f.authCalls.length, 0);
});
test('H04: PATCH deja sin unidad a un rol de unidad aunque la validacion cree que conserva la anterior', async () => {
  const f = fixture(actor('super_admin'), { 'users/target': { role: 'admin_unidad', status: 'activo', unidadId: 'U-B', grado: 'Cap.', nombres: 'Prueba', apellidos: 'Aislada' } });
  const response = await f.load('src/app/api/users/route.ts').PATCH(request('/api/users?uid=target', 'PATCH', { unidadId: null }));
  assert.equal(response.status, 200);
  assert.equal(f.records.get('users/target').unidadId, null);
});
test('H05: se registra una tipificacion inexistente en catalogo', async () => {
  const f = fixture(actor('admin_unidad'), { 'personal/p1': { unidadId: 'U-A', unidadNombre: 'Unidad A', ci: '123456', nombreCompleto: 'Persona Ficticia', grado: 'Cap.' } });
  const response = await f.load('src/app/api/faltas/route.ts').POST(request('/api/faltas', 'POST', {
    personalId: 'p1', unidadId: 'U-A', articulo: 'Art. 888', inciso: '999. Inventado',
    fechaSancion: '2026-10-20', memorandum: 'Memorándum-001/2026', motivo: 'Prueba local aislada'
  }));
  assert.equal(response.status, 201);
  assert.equal([...f.records.entries()].find(([k]) => k.startsWith('faltas/'))[1].articulo, 'Art. 888');
});
test('H06: vencimiento lanza error y revierte sus propias escrituras', async () => {
  const f = fixture(actor('admin_unidad'), { 'transferencias_solicitudes/t1': { estado: 'pendiente', expiresAt: Timestamp.fromMillis(1), toUnidadId: 'U-A' } });
  const response = await f.load('src/app/api/transferencias/solicitudes/[id]/resolver/route.ts').PATCH(
    request('/api/transferencias/solicitudes/t1/resolver', 'PATCH', { decision: 'aceptada' }), { params: Promise.resolve({ id: 't1' }) });
  assert.equal(response.status, 400);
  assert.equal(f.records.get('transferencias_solicitudes/t1').estado, 'pendiente');
  assert.equal(f.writes.length, 0);
});
test('H07: admin_unidad puede trasladar a su unidad personal ajeno sin solicitud', async () => {
  const f = fixture(actor('admin_unidad'), { 'personal/p1': { unidadId: 'U-B', unidadNombre: 'Unidad B' } });
  const response = await f.load('src/app/api/personal/[id]/transfer/route.ts').POST(
    request('/api/personal/p1/transfer', 'POST', { motivoTransferencia: 'Prueba aislada' }), { params: Promise.resolve({ id: 'p1' }) });
  assert.equal(response.status, 200);
  assert.equal(f.records.get('personal/p1').unidadId, 'U-A');
});
test('H08: solicitud de anulacion admite sancion de otra unidad', async () => {
  const f = fixture(actor('operador_unidad'), { 'faltas/f1': { estado: 'registrada', unidadId: 'U-B', ci: '123456', motivo: 'Dato ajeno' } });
  const response = await f.load('src/app/api/faltas/solicitudes/route.ts').POST(request('/api/faltas/solicitudes', 'POST', {
    faltaId: 'f1', tipoSolicitud: 'error_insercion', motivo: 'Prueba local aislada'
  }));
  assert.equal(response.status, 201);
  const saved = [...f.records.entries()].find(([k]) => k.startsWith('solicitudes_eliminacion_falta/'))[1];
  assert.equal(saved.faltaResumen.unidadId, 'U-B');
  assert.equal(saved.solicitanteUnidadId, 'U-A');
});
test('H09: PATCH permite al unico super_admin darse de baja', async () => {
  const f = fixture(actor('super_admin'), { 'users/actor': { role: 'super_admin', status: 'activo', grado: 'Cap.', nombres: 'Prueba', apellidos: 'Aislada' } });
  const response = await f.load('src/app/api/users/route.ts').PATCH(request('/api/users?uid=actor', 'PATCH', { status: 'baja' }));
  assert.equal(response.status, 200);
  assert.equal(f.records.get('users/actor').status, 'baja');
});

