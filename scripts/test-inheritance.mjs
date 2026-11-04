// Runs original DOM/appearance regressions in headless Chrome and round-trips native ESLX files.
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('test-results/inheritance-'+Date.now());
await fs.mkdir(root,{recursive:true});
await build({entryPoints:['tests/inheritance.browser.ts'],bundle:true,platform:'browser',format:'iife',globalName:'Review',outfile:path.join(root,'browser.js')});
await build({entryPoints:['src/main/eslx.ts'],bundle:true,platform:'node',format:'esm',external:['edukors-common-ux/*'],outfile:path.join(root,'eslx.mjs')});
await fs.writeFile(path.join(root,'index.html'),'<html><body></body></html>');
const browser=await chromium.launch({headless:true,channel:'chrome'});
let result;
try{const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.addScriptTag({path:path.join(root,'browser.js')});result=await page.evaluate(()=>Review.run());
  console.log(result.passed.map(x=>'PASS '+x).join('\n'));
  // Compare actual Chromium colors, dimensions and fonts, including master objects.
  const looks=await page.evaluate(async({source,deck})=>{
    const measure=async(d,s)=>{const frame=document.createElement('iframe');frame.style.cssText='width:1600px;height:900px';document.body.append(frame);frame.srcdoc=Review.slideDocument(d,s,true);await new Promise(resolve=>frame.onload=resolve);
      const doc=frame.contentDocument;await doc.fonts.ready;const h=doc.querySelector('h1'),style=frame.contentWindow.getComputedStyle(h),r=h.getBoundingClientRect();const out={color:style.color,font:style.fontFamily,spacing:style.letterSpacing,width:r.width,height:r.height,logo:doc.querySelector('#master-logo')?.textContent};frame.remove();return out;};
    return[await measure(source,source.slides[0]),await measure(deck,deck.slides.find(s=>s.layoutId!==deck.slides[0].layoutId))];
  },result);assert.deepEqual(looks[0],looks[1]);console.log('PASS cross-presentation computed appearance');
}finally{await browser.close();}
const {readEslx,writeEslx}=await import(pathToFileURL(path.join(root,'eslx.mjs')).href),file=path.join(root,'roundtrip.eslx');await writeEslx(file,result.deck);assert.deepEqual((await readEslx(file)).deck,result.deck);console.log('PASS ESLX roundtrip preserves imported master, layout CSS and resources');
await fs.writeFile(path.join(root,'results.json'),JSON.stringify({passed:result.passed,appearance:true,roundtrip:true},null,2));
console.log('Inheritance regression artifacts: '+root);
