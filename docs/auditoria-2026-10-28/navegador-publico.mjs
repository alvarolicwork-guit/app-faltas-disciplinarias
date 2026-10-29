import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire('C:/Users/Alvaro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],result={checkedAt:new Date().toISOString(),anonymousOnly:true,authenticatedProduction:false,errors};
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://app-faltas-disciplinarias.vercel.app/');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
 await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>undefined))));
 await page.waitForFunction(()=>{let e=document.querySelector('form');while(e){if(Number(getComputedStyle(e).opacity)<0.99)return false;e=e.parentElement;}return true;});
 await page.screenshot({path:'docs/auditoria-2026-10-28/login-publico.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});result.loginAt390=await page.getByRole('button',{name:'Iniciar sesión',exact:true}).isVisible();
 const framePage=await browser.newPage();
 await framePage.setContent('<iframe title="Prueba de encuadre sin interacción" src="https://app-faltas-disciplinarias.vercel.app/" width="1000" height="800"></iframe>');
 await framePage.frameLocator('iframe').getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
 result.embeddableInExternalFrame=true;
 assert.equal(result.loginAt390,true);assert.deepEqual(errors,[]);
 writeFileSync('docs/auditoria-2026-10-28/navegador-publico.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
