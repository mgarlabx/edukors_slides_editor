// Real sandboxed frames, CSS animations and OS preference emulation; no server or real AI account.
import {_electron as electron} from 'playwright';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=path.resolve('test-results/motion-'+Date.now());
await fs.mkdir(root,{recursive:true});
await build({entryPoints:['tests/motion-fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'fixture.mjs')});
const {withTools,withoutTools}=await import(pathToFileURL(path.join(root,'fixture.mjs')).href);
for(const [name,html] of Object.entries({withTools,withoutTools}))await fs.writeFile(path.join(root,name+'.html'),html);
const main=path.join(root,'main.cjs');
await fs.writeFile(main,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(root,'data'))});app.dock?.hide();app.whenReady().then(()=>{new BrowserWindow({show:false,width:1280,height:800,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}})});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:require('electron'),args:[main],env,timeout:15000});
try{
  const page=await app.firstWindow(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  const active=()=>page.frameLocator('#stage > .frame.on');
  const ready=async(n=1)=>{await active().locator('h1').filter({hasText:'Motion '+n}).waitFor();await active().locator('.slide').evaluate(()=>new Promise(resolve=>{const check=()=>window.__slideReady?resolve():setTimeout(check,10);check()}));};
  const animated=async(selector,expected,pseudo=null)=>{
    const got=await active().locator(selector).evaluate((el,p)=>getComputedStyle(el,p).animationName,pseudo);
    assert.equal(got,expected);
  };
  for(const name of ['withTools','withoutTools']){
    const open=async(mode)=>{
      await page.emulateMedia({reducedMotion:mode});
      await page.goto(pathToFileURL(path.join(root,name+'.html')).href);
      await page.evaluate(()=>localStorage.clear());await page.reload();await ready();
    };
    await open('no-preference');assert.equal(await page.locator('#motion-notice').isVisible(),false);
    await animated('.moving','move');await animated('.optional','move');

    await open('reduce');await page.locator('#motion-notice').waitFor();
    await animated('.moving','none');await animated('.optional','none');
    await page.locator('#motion-enable').focus();await page.keyboard.press('Space');
    await page.locator('#motion-notice').waitFor({state:'hidden'});
    await active().locator('html[data-esf-motion="full"]').waitFor();await ready();
    await animated('.moving','move');await animated('.moving','move','::before');await animated('.optional','move');
    assert.equal(await active().locator('.moving').evaluate(el=>getComputedStyle(el).color),'rgb(255, 0, 0)','other comma-separated media branches survive');
    assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true,'OS preference unchanged');
    assert.equal(await page.locator('body').getAttribute('data-step'),'0/1','Space activates the button without advancing');
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await ready(2);
    await animated('.moving','move');assert.equal(await page.locator('#motion-notice').isVisible(),false);
    if(name==='withTools'){
      await page.keyboard.press('l');await page.mouse.move(640,350);
      await page.frameLocator('#lens-frame').locator('html[data-esf-motion="full"]').waitFor();
      await page.keyboard.press('l');
    }
    await page.locator('#track button').first().evaluate(el=>el.dispatchEvent(new Event('mouseenter')));
    const preview=page.frameLocator('#preview iframe:not([hidden])');await preview.locator('.moving').waitFor();
    assert.equal(await preview.locator('.moving').evaluate(el=>getComputedStyle(el).animationName),'none','previews stay static');

    await open('reduce');await page.locator('#motion-keep').click();await animated('.moving','none');
    const tick=await active().locator('.walker').getAttribute('data-tick');
    await active().locator('.walker').evaluate((el,old)=>new Promise(resolve=>{const check=()=>el.dataset.tick!==old?resolve():requestAnimationFrame(check);check()}),tick);
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await ready(2);
    assert.equal(await page.locator('#motion-notice').isVisible(),false);await animated('.moving','none');

    await open('reduce');await page.keyboard.press('Escape');assert.equal(await page.locator('#motion-notice').isVisible(),false);await animated('.moving','none');
    await open('no-preference');await page.keyboard.press('ArrowRight');
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#motion-notice').waitFor();
    await page.locator('#motion-enable').click();await active().locator('html[data-esf-motion="full"]').waitFor();
    assert.equal(await page.locator('body').getAttribute('data-step'),'1/1','activation preserves current step');await animated('.moving','move');
    console.log('PASS reduced motion:',name);
  }
  assert.deepEqual(errors,[]);console.log('Motion regressions passed.');
}finally{await app.close();}
