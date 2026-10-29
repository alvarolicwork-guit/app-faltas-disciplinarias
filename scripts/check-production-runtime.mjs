// Match Vercel's module-loading behavior against the built HTTP server.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const log = fs.openSync(".local-production-runtime.log", "w");
const server = spawn(process.execPath, ["--no-experimental-require-module", "node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
  windowsHide: true, stdio: ["ignore", log, log], env: { ...process.env, FIREBASE_PROJECT_ID: "demo-app-faltas", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8188", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9198", CRON_SECRET: "" },
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) { ready = true; break; } } catch { /* Server starts asynchronously. */ }
    if (server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.ok(ready, "Built HTTP server did not start");
  const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health?dependencies=1`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  for (const [name, dependency] of Object.entries(health.dependencies)) assert.equal(dependency.loaded, true, name + " failed to load");
  for (const route of ["/api/me", "/api/internal/expire-requests"]) {
    for (const headers of [{}, { Authorization: "Bearer invalid-token" }]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers });
      assert.equal(response.status, 401, route + " must reject an unauthenticated request");
    }
  }
  console.log(JSON.stringify({ productionBuild: true, requireEsmDisabled: true, dependenciesLoaded: true, anonymousAndInvalidTokensRejected: true, productionDataAccess: false }));
} finally { server.kill(); fs.closeSync(log); }
