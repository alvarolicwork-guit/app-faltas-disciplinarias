// Read-only production check: public login, headers and iframe protection.
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const origin = "https://app-faltas-disciplinarias.vercel.app";
const expected = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(expected ?? "")) throw Error("Expected full Git revision required");
const output = ".local-release";
fs.mkdirSync(output, { recursive: true });
const healthResponse = await fetch(origin + "/api/health");
const health = await healthResponse.json();
assert.equal(healthResponse.status, 200);
assert.equal(health.revision, expected, "Deployment is not the expected revision yet");
assert.equal(healthResponse.headers.get("x-frame-options"), "DENY");
assert.match(healthResponse.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
assert.match(healthResponse.headers.get("cache-control") ?? "", /no-store/);
const readinessResponse = await fetch(origin + "/api/health?dependencies=1");
assert.equal(readinessResponse.status, 200);
const readiness = await readinessResponse.json();
for (const [name, dependency] of Object.entries(readiness.dependencies ?? {})) assert.equal(dependency.loaded, true, name + " failed to load");
assert.ok(readiness.dependencies?.auth?.loaded, "Missing Firebase Auth readiness evidence");
for (const route of ["/api/me", "/api/internal/expire-requests"]) {
  const response = await fetch(origin + route);
  assert.equal(response.status, 401, route + " must reject anonymous access");
}

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === "win32" ? "chrome" : undefined) });
const errors = [], frameMessages = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto(origin);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor();
  assert.equal(response.headers()["x-frame-options"], "DENY");
  await page.screenshot({ path: output + "/login-publico.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.getByRole("button", { name: "Iniciar sesión", exact: true }).isVisible(), true);
  const framePage = await browser.newPage();
  framePage.on("console", message => frameMessages.push(message.text()));
  await framePage.setContent('<iframe title="Comprobación de encuadre" src="' + origin + '/"></iframe>');
  let frameLoginVisible = false;
  try { await framePage.frameLocator("iframe").getByRole("button", { name: "Iniciar sesión", exact: true }).waitFor({ timeout: 5000 }); frameLoginVisible = true; } catch { /* Expected browser refusal. */ }
  assert.equal(frameLoginVisible, false);
  assert.ok(frameMessages.some(message => /frame-ancestors|X-Frame-Options/i.test(message)), "Missing browser evidence of frame refusal");
  assert.deepEqual(errors, []);
  const result = { checkedAt: new Date().toISOString(), expectedRevision: expected, observedRevision: health.revision, readOnly: true, authenticatedProduction: false, dependenciesLoaded: true, anonymousApiRejected: true, loginDesktop: true, loginAt390: true, externalFrameBlocked: true, frameMessages, headers: { csp: healthResponse.headers.get("content-security-policy"), frame: healthResponse.headers.get("x-frame-options"), cache: healthResponse.headers.get("cache-control"), nosniff: healthResponse.headers.get("x-content-type-options"), referrer: healthResponse.headers.get("referrer-policy") }, errors };
  fs.writeFileSync(output + "/publicacion.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
