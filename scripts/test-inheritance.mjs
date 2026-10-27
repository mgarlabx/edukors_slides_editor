// Regression suite runs DOM composition in Electron/Chromium, then round-trips the actual ESF package.
import {_electron as electron} from 'playwright';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('test-results/inheritance-'+Date.now()),require=createRequire(import.meta.url);
await fs.mkdir(root,{recursive:true});
await build({entryPoints:['tests/inheritance.browser.ts'],bundle:true,platform:'browser',format:'iife',globalName:'Review',outfile:path.join(root,'browser.js')});
await build({entryPoints:['src/main/projects.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'projects.mjs')});
await fs.writeFile(path.join(root,'index.html'),'<html><body></body></html>');
const main=path.join(root,'main.cjs');await fs.writeFile(main,`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{new BrowserWindow({show:false,webPreferences:{contextIsolation:true}}).loadFile(require('node:path').join(__dirname,'index.html'))});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:require('electron'),args:[main],env,timeout:20000});
let result;
try{const page=await app.firstWindow();await page.addScriptTag({path:path.join(root,'browser.js')});result=await page.evaluate(()=>Review.run());
  console.log(result.passed.map(x=>'PASS '+x).join('\n'));
  // Compare actual Chromium colors, dimensions and fonts, including master objects.
  const looks=await page.evaluate(async({source,deck})=>{
    const measure=async(d,s)=>{const frame=document.createElement('iframe');frame.style.cssText='width:1600px;height:900px';document.body.append(frame);frame.srcdoc=Review.slideDocument(d,s,true);await new Promise(resolve=>frame.onload=resolve);
      const doc=frame.contentDocument;await doc.fonts.ready;const h=doc.querySelector('h1'),style=frame.contentWindow.getComputedStyle(h),r=h.getBoundingClientRect();const out={color:style.color,font:style.fontFamily,spacing:style.letterSpacing,width:r.width,height:r.height,logo:doc.querySelector('#master-logo')?.textContent};frame.remove();return out;};
    return[await measure(source,source.slides[0]),await measure(deck,deck.slides.find(s=>s.layoutId!==deck.slides[0].layoutId))];
  },result);assert.deepEqual(looks[0],looks[1]);console.log('PASS cross-presentation computed appearance');
}finally{await app.close();}
const {readDeck,writeDeck}=await import(pathToFileURL(path.join(root,'projects.mjs')).href),file=path.join(root,'roundtrip.esf');await writeDeck(file,result.deck);assert.deepEqual(await readDeck(file),result.deck);console.log('PASS ESF roundtrip preserves imported master, layout CSS and resources');
await fs.writeFile(path.join(root,'results.json'),JSON.stringify({passed:result.passed,appearance:true,roundtrip:true},null,2));
console.log('Inheritance regression artifacts: '+root);
