import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Network delays affect responses only; authentication and unit reads use the real demo API.
export async function checkUnitSession(browser, db, output) {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-app-faltas');
  const fence = db.collection('access_control').doc('maintenance');
  const previous = await fence.get();
  await fence.set({active:false,generation:1});
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page = await context.newPage();
  const requests = [], responses = [], errors = [];
  let released = false, release, releaseLate = () => {};
  const gate = new Promise(resolve => {release=resolve;});
  const unitPath = url => new URL(url).pathname === '/api/unidades';
  page.on('request', request => {if(unitPath(request.url())) requests.push({beforeSession:!released,generation:request.headers()['x-data-generation']});});
  page.on('response', response => {if(unitPath(response.url())) responses.push(response.status());});
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.unitErrorSeen = false;
    new MutationObserver(() => {
      if(document.body?.innerText.includes('No se pudieron cargar las unidades')) window.unitErrorSeen = true;
    }).observe(document,{childList:true,subtree:true});
  });
  await page.route('**/api/me', async route => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({response});
  });
  try {
    await page.goto('http://localhost:3137');
    await page.getByLabel('Correo electrónico').fill('e2e-super@example.test');
    await page.getByLabel('Contraseña',{exact:true}).fill('SoloPruebas123');
    const sessionRequested = page.waitForRequest(r => new URL(r.url()).pathname === '/api/me');
    await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
    await sessionRequested;
    // Keep the profile unavailable while Firebase already has a signed-in user.
    await page.waitForResponse(r => unitPath(r.url()),{timeout:1500}).catch(() => null);
    released = true; release();
    await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
    await page.waitForLoadState('networkidle');
    const observed = {generation:1,requests:[...requests],responses:[...responses],unitErrorSeen:await page.evaluate(()=>window.unitErrorSeen),browserErrors:errors};
    fs.writeFileSync(path.join(output,'unit-session.json'),JSON.stringify(observed,null,2));
    await page.screenshot({path:path.join(output,'unit-session.png'),fullPage:true,animations:'disabled'});
    assert.equal(requests.some(r => r.beforeSession),false,'Units requested before the session profile was ready');
    assert.ok(requests.length > 0);
    assert.ok(requests.every(r => r.generation === '1'));
    assert.ok(responses.every(status => status === 200));
    assert.equal(observed.unitErrorSeen,false,'A false unit error was shown during login');

    await page.unroute('**/api/me');
    requests.length=0;responses.length=0;
    await page.reload();
    await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
    await page.waitForLoadState('networkidle');
    assert.ok(requests.length > 0 && requests.every(r => r.generation === '1'));
    assert.ok(responses.every(status => status === 200));
    assert.equal(await page.evaluate(()=>window.unitErrorSeen),false);
    await page.getByRole('button',{name:'Menú',exact:true}).tap();
    await page.locator('aside').filter({visible:true}).getByRole('button',{name:'Unidades',exact:true}).tap();
    await page.getByRole('cell',{name:'Unidad de prueba',exact:true}).waitFor();

    // A genuine unavailable-service response remains visible and can be retried.
    await page.route('**/api/unidades', route => route.fulfill({status:503,json:{error:'Servicio temporalmente no disponible (prueba).'}}));
    await page.reload();
    await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
    await page.getByRole('button',{name:'Menú',exact:true}).tap();
    await page.locator('aside').filter({visible:true}).getByRole('button',{name:'Unidades',exact:true}).tap();
    await page.getByRole('main').getByRole('alert').getByText('Servicio temporalmente no disponible (prueba).',{exact:true}).waitFor();
    assert.equal(await page.getByText('No hay unidades registradas.',{exact:true}).count(),0);
    await page.unroute('**/api/unidades');
    await page.getByRole('button',{name:'Reintentar carga',exact:true}).tap();
    await page.getByRole('cell',{name:'Unidad de prueba',exact:true}).waitFor();
    assert.equal(await page.getByRole('main').getByRole('alert').count(),0);

    // A request belonging to a signed-out session must not show a stale error.
    const lateGate = new Promise(resolve => {releaseLate=resolve;});
    let markPending;
    const pending = new Promise(resolve => {markPending=resolve;});
    await page.route('**/api/unidades', async route => {
      markPending();await lateGate;
      await route.fulfill({status:503,json:{error:'Respuesta tardía de una sesión cerrada (prueba).'}});
    });
    await page.reload();
    await pending;
    await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
    await page.getByRole('button',{name:'Menú',exact:true}).tap();
    await page.locator('aside').filter({visible:true}).getByRole('button',{name:'Cerrar sesión',exact:true}).tap();
    await page.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
    const lateResponse = page.waitForResponse(r => unitPath(r.url()));
    releaseLate();await lateResponse;
    await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(()=>window.unitErrorSeen),false);
    await page.unroute('**/api/unidades');

    // The required password-change screen must not load a protected catalog.
    await db.collection('users').doc('e2e-super').update({mustChangePassword:true});
    requests.length=0;
    await page.getByLabel('Correo electrónico').fill('e2e-super@example.test');
    await page.getByLabel('Contraseña',{exact:true}).fill('SoloPruebas123');
    await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
    await page.getByRole('heading',{name:'Cambie su contrasena temporal',exact:true}).waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(requests.length,0);
    assert.equal(await page.evaluate(()=>window.unitErrorSeen),false);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'unit-session.json'),JSON.stringify({...observed,reloadPassed:true,catalogVisible:true,serviceFailureVisible:true,retryRecovered:true,lateSignedOutResponseIgnored:true,passwordChangeDoesNotLoadUnits:true},null,2));
  } finally {
    release();releaseLate();
    await context.close();
    await db.collection('users').doc('e2e-super').update({mustChangePassword:false});
    if(previous.exists) await fence.set(previous.data()); else await fence.delete();
  }
}
