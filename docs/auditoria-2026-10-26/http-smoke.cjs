/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3317';
  const results = [];
  for (const file of fs.readdirSync('src/app/api', { recursive: true }).filter(f => f.endsWith('route.ts'))) {
    const source = fs.readFileSync(path.join('src/app/api', file), 'utf8');
    const url = '/api/' + file.replaceAll('\\', '/').replace(/\/route.ts$/, '').replace(/\[[^\]]+\]/g, 'audit-placeholder');
    for (const m of source.matchAll(/export async function (GET|POST|PATCH|DELETE)\(/g)) {
      const response = await fetch(base + url, { method: m[1] });
      results.push({ method: m[1], url, status: response.status });
    }
  }
  const home = await fetch(base + '/');
  const output = { base, authentication: 'none', homeStatus: home.status, headers: Object.fromEntries(home.headers), results };
  fs.writeFileSync('docs/auditoria-2026-10-26/http-smoke.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}
module.exports = main().catch(e => { console.error(e); process.exitCode = 1; });
