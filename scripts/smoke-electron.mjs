// Smoke test of the real app (Electron main process + Common's host + the editor) with hidden windows (ESF_HIDDEN):
// nothing appears on screen. Data, documents and exports go to a temporary folder; native dialogs are answered in the
// main process. Usage: node scripts/smoke-electron.mjs [--packaged <path to the .app or executable>]
import {_electron as electron} from 'playwright';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
const mod=process.platform==='darwin'?'Meta':'Control';

const packagedArg=process.argv.indexOf('--packaged'),packaged=packagedArg>0?process.argv[packagedArg+1]:null;
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'esf-smoke-')),docs=path.join(tmp,'Documents');await fs.mkdir(docs);
await build({entryPoints:['tests/import-save-fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:path.resolve('test-results/smoke-fixture.mjs'),external:['edukors-common-ux/*']});
const {importFixtures,largePptx}=await import(pathToFileURL(path.resolve('test-results/smoke-fixture.mjs')).href);
const sources={};for(const f of importFixtures()){const file=path.join(docs,'Original.'+f.format.toLowerCase());await fs.writeFile(file,Uint8Array.from(f.bytes));sources[f.format]=file;}
const sha=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex'),before={ESF:await sha(sources.ESF),PPTX:await sha(sources.PPTX)};
const executable=packaged&&(packaged.endsWith('.app')?path.join(packaged,'Contents/MacOS',path.basename(packaged,'.app')):packaged);
const env={...process.env,ESF_HIDDEN:'1',ESF_DATA_DIR:path.join(tmp,'data'),EDUKORS_ACCEPT_TERMS:'1',EDUKORS_NO_UPDATES:'1',ESF_EXTERNAL_LOG:path.join(tmp,'external.log')};
delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch(packaged?{executablePath:executable,env}:{args:['dist/main.mjs','--data-dir',path.join(tmp,'common')],env});
const results=[];const pass=m=>{results.push(m);console.log('PASS '+m);};
try{
  const page=await app.firstWindow();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>!!globalThis.EdukorsAppDocument&&!!document.getElementById('slides-root'));
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
  pass('starts with hidden windows; Common shell and editor loaded');
  assert.equal(await page.evaluate(()=>typeof globalThis.slides?.invoke),'function');
  assert.equal(await page.evaluate(()=>typeof globalThis.EdukorsDesktop?.files?.save),'function');
  pass('both bridges (Common and Slides) are exposed to the page');
  // Packaged apps always ask for the terms.
  if(await page.locator('.terms-dialog').count())await page.locator('.terms-dialog .primary').click();
  // Native dialogs and the documents folder point to the temporary folder.
  await app.evaluate(({app,dialog},{docs})=>{app.setPath('documents',docs);globalThis.__next={open:[],save:[]};
    dialog.showOpenDialog=async()=>{const p=globalThis.__next.open.shift();return p?{canceled:false,filePaths:[p]}:{canceled:true,filePaths:[]};};
    dialog.showSaveDialog=async()=>{const p=globalThis.__next.save.shift();return p?{canceled:false,filePath:p}:{canceled:true};};
    dialog.showMessageBoxSync=()=>1;},{docs});
  const next=(kind,file)=>app.evaluate((_e,{kind,file})=>globalThis.__next[kind].push(file),{kind,file});
  // New presentation from the gallery; the slide frame renders through esf-frame:.
  await page.locator('.toolbar [data-command="new"]').click();
  await page.locator('.template-card').first().dblclick();
  const canvas=page.frameLocator('#document-placeholder iframe:not(.preview-stale)');
  await canvas.locator('html[data-esf-ready=true]').waitFor();
  assert.match(await page.locator('#document-placeholder iframe:not(.preview-stale)').getAttribute('src'),/^esf-frame:/);
  pass('new presentation; the canvas renders in an isolated esf-frame: document');
  await page.locator('#insert-actions [data-command="insertText"]').click();
  await canvas.locator('[data-manual=text][contenteditable]').waitFor();
  await page.keyboard.type('Smoke native text');
  await page.keyboard.press('Escape');
  await page.waitForFunction(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return c.deck.slides[0].html.includes('Smoke native text');});
  await page.locator('#insert-actions [data-command="insertShape"]').click();await page.locator('.shape-picker .shape-option').nth(9).click();
  await canvas.locator('[data-shape="star"]').waitFor();
  // Save → Common's save screen → .eslx in the documents folder.
  await page.locator('.toolbar [data-command="save"]').click();
  const dialog=page.locator('dialog[open]');await dialog.locator('input[id^="file-name-"]').fill('Smoke');
  await dialog.locator('button.primary:visible').click();await dialog.waitFor({state:'detached'});
  const saved=path.join(docs,'Smoke.eslx');assert.ok((await fs.stat(saved)).size>0);
  assert.equal(await page.evaluate(()=>EdukorsDocuments.active().modified),false);
  pass('Save writes Smoke.eslx; the tab is no longer modified');
  // Open ESF and PPTX: imported without a file; Save asks for an .eslx; the originals stay as they were.
  for(const format of ['ESF','PPTX']){
    await next('open',sources[format]);await page.locator('.toolbar [data-command="open"]').click();
    await page.waitForFunction(f=>EdukorsDocuments.active()?.origin?.endsWith('.'+f),format.toLowerCase());
    assert.equal(await page.evaluate(()=>EdukorsDocuments.active().saved),false);
    await page.keyboard.press(mod+'+s');
    await dialog.locator('input[id^="file-name-"]').fill('Converted '+format);
    assert.match(await dialog.innerText(),/\.eslx/);
    await dialog.locator('button.primary:visible').click();await dialog.waitFor({state:'detached'});
    assert.ok((await fs.stat(path.join(docs,'Converted '+format+'.eslx'))).size>0);
    assert.equal(await sha(sources[format]),before[format]);
    pass(`${format} opens as an import and saves only as .eslx; the original is unchanged`);
  }
  // A PowerPoint above Common's 50 MB open limit still opens (read by the main process).
  const large=path.join(docs,'Large.pptx');await fs.writeFile(large,largePptx());
  // Common's opening indicator shows (with the file's name) while it is read and imported, and goes away after.
  await page.evaluate(()=>{globalThis.__seenLoading='';const seen=()=>{const n=document.querySelector('.loading-indicator');if(n&&!n.hidden)globalThis.__seenLoading=n.textContent;};
    globalThis.__loadingWatch=new MutationObserver(seen);globalThis.__loadingWatch.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});});
  await next('open',large);await page.locator('.toolbar [data-command="open"]').click();
  await page.waitForFunction(()=>EdukorsDocuments.active()?.origin?.endsWith('Large.pptx'),undefined,{timeout:60000});
  assert.equal(await page.evaluate(()=>EdukorsDocuments.active().saved),false);
  pass(`a ${Math.round((await fs.stat(large)).size/2**20)} MB PowerPoint opens as an import`);
  assert.match(await page.evaluate(()=>{globalThis.__loadingWatch.disconnect();return globalThis.__seenLoading;}),/Large\.pptx/);
  await page.waitForFunction(()=>document.querySelector('.loading-indicator')?.hidden!==false);
  pass('an animated opening indicator shows while the file loads, then goes away');
  // Reopen the saved .eslx through Recent.
  await page.locator('.toolbar [data-command="recent"]').click();
  await page.locator('.recent-menu').waitFor();
  await page.locator('.recent-menu [role=menuitem][title$="Smoke.eslx"]').click();
  await page.waitForFunction(()=>EdukorsDocuments.active()?.name==='Smoke');
  pass('Recent reopens the saved .eslx');
  // Insert image from a file: Common's picker (the system dialog answered here); the picture enters the slide.
  {const png=path.join(docs,'Picture.png');await fs.writeFile(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64'));
    await app.evaluate(({clipboard})=>clipboard.clear());await next('open',png);
    const before=await canvas.locator('img').count();await page.locator('#insert-actions [data-command="insertImage"]').click();
    await page.waitForFunction(async n=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return c.deck.assets.some(a=>a.name==='Picture.png'&&a.mime==='image/png');},before);
    await page.keyboard.press(mod+'+s');await page.waitForFunction(()=>!EdukorsDocuments.isModified(EdukorsDocuments.active()));}
  pass('Insert image takes a picture from a file through Common\'s picker');
  // Export HTML (player, fonts) next to the document; an export never replaces the document.
  // Common's export screen: the file goes next to the document, with its name.
  const exportAs=async(format,timeout=60000)=>{await page.locator('.toolbar [data-command="slidesExport"]').click();const d=page.locator('dialog.file-dialog[open]');
    await d.locator(`input[type=radio][value="${format}"]`).check();await d.locator('.file-footer .primary:visible').click();await d.waitFor({state:'detached',timeout});};
  await exportAs('html');
  const html=await fs.readFile(path.join(docs,'Smoke.html'),'utf8');assert.match(html,/<meta name="generator"/);assert.match(html,/Content-Security-Policy/);
  pass('Export HTML writes the offline player');
  // Exporting again to an existing file asks first: Choose another name keeps it, Replace writes it.
  {const before=(await fs.stat(path.join(docs,'Smoke.html'))).mtimeMs;await page.locator('.toolbar [data-command="slidesExport"]').click();const d=page.locator('dialog.file-dialog[open]');
    await d.locator('input[type=radio][value="html"]').check();await d.locator('.file-footer .primary:visible').click();
    await d.locator('.file-footer button:visible',{hasText:/Replace|Substituir/}).waitFor();assert.equal((await fs.stat(path.join(docs,'Smoke.html'))).mtimeMs,before);
    assert.equal(await d.locator('.file-footer button:visible').count(),2,'export offers only Cancel and Replace');
    await d.locator('.file-footer button:visible',{hasText:/Replace|Substituir/}).click();await d.waitFor({state:'detached',timeout:60000});
    assert.ok((await fs.stat(path.join(docs,'Smoke.html'))).mtimeMs>before);}
  pass('Export asks before replacing an existing file');
  await exportAs('pdf');
  assert.equal((await fs.readFile(path.join(docs,'Smoke.pdf'))).subarray(0,4).toString(),'%PDF');
  pass('Export PDF captures the slides');
  // Editable PowerPoint: native text, shape and the picture background; every part well formed, every reference resolved.
  await exportAs('pptx');
  const parts=unzipSync(new Uint8Array(await fs.readFile(path.join(docs,'Smoke.pptx'))));
  for(const [name,bytes] of Object.entries(parts))if(/\.(xml|rels)$/.test(name)){let bad=false;new DOMParser({errorHandler:{error:()=>bad=true,fatalError:()=>bad=true}}).parseFromString(strFromU8(bytes),'application/xml');assert.equal(bad,false,'malformed '+name);}
  for(const name of Object.keys(parts).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))){
    const xml=strFromU8(parts[name]),rels=strFromU8(parts[name.replace('slides/','slides/_rels/')+'.rels']);
    for(const [,id] of xml.matchAll(/r:(?:embed|id)="(rId\d+)"/g)){assert.ok(rels.includes(`Id="${id}"`),`${name}: ${id} not in rels`);const target=new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)[1];if(!/TargetMode="External"/.test(new RegExp(`<Relationship[^>]*Id="${id}"[^>]*>`).exec(rels)[0]))assert.ok(parts[path.posix.normalize('ppt/slides/'+target)],`${name}: ${target} missing`);}
  }
  const slideXml=strFromU8(parts['ppt/slides/slide1.xml']);
  assert.match(slideXml,/<a:t>Smoke native text<\/a:t>/);assert.match(slideXml,/prst="star5"/);assert.match(slideXml,/<p:bg><p:bgPr><a:blipFill/);
  pass('Export PPTX: editable text and shape over a picture background; package well formed');
  await next('open',path.join(docs,'Smoke.pptx'));await page.locator('.toolbar [data-command="open"]').click();
  await page.waitForFunction(()=>EdukorsDocuments.active()?.origin?.endsWith('Smoke.pptx'));
  assert.match(await page.evaluate(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return c.deck.slides[0].html;}),/Smoke native text/);
  pass('the exported PPTX opens again in the app with its text');
  // Present opens the player in its own (hidden) window.
  const windows=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length);
  const count=await windows();await page.locator('.slides-view-actions .tool-present').click();
  for(let i=0;i<50&&await windows()===count;i++)await new Promise(r=>setTimeout(r,100));
  assert.equal(await windows(),count+1);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
  pass('Present opens the player window (hidden in tests)');
  // Templates: save the presentation as a template; the gallery lists it.
  await page.keyboard.press(mod+'+n');
  await page.locator('#slides-root .file-footer button',{hasText:/template/i}).click();
  await page.locator('#slides-root dialog[open] form input').fill('Smoke template');await page.locator('#slides-root dialog[open] form .primary').click();
  await page.locator('.custom-card',{hasText:'Smoke template'}).waitFor();
  pass('Save as template, listed in the gallery');
  await page.keyboard.press('Escape');
  // Drafts, external changes and recovery, on the reopened Smoke.eslx.
  await page.evaluate(()=>{const doc=EdukorsDocuments.list().find(d=>d.name==='Smoke');EdukorsDocuments.activate(doc.id);});
  // Common keeps the drafts in the app's data folder (packaged: the user data folder; unpackaged: --data-dir/apps/slides).
  const draftsDirs=[path.join(tmp,'data','drafts'),path.join(tmp,'common','apps','slides','drafts')];
  const drafts=async()=>{let n=0;for(const dir of draftsDirs)n+=(await fs.readdir(dir).catch(()=>[])).filter(n=>n.endsWith('.draft')).length;return n;};
  // Imports opened earlier are unsaved and keep their own drafts: count from here.
  // (The large import's draft takes a while to encode: wait until the count is stable.)
  let base=-1;for(let i=0,last=-2;i<120;i++){const n=await drafts();if(n===last&&n>=1)break;last=n;base=n;await new Promise(r=>setTimeout(r,1000));}
  base=await drafts();const draftCount=async()=>await drafts()-base;
  await page.locator('#insert-actions [data-command="insertText"]').click();await page.keyboard.press('Escape');
  for(let i=0;i<40&&!await draftCount();i++)await new Promise(r=>setTimeout(r,150));
  assert.equal(await draftCount(),1);
  pass('an unsaved change is kept as a draft');
  const external=await fs.readFile(path.join(docs,'Converted ESF.eslx'));await fs.writeFile(saved,external);
  // Common's question: the file changed on disk since it was opened here.
  const conflict=page.locator('dialog.file-dialog[open]');
  await page.keyboard.press(mod+'+s');await conflict.waitFor();
  await conflict.locator('.file-footer button:not(.primary)').click();
  await page.waitForTimeout(500);assert.deepEqual(await fs.readFile(saved),external);
  await page.keyboard.press(mod+'+s');await conflict.locator('.primary').click();
  await page.waitForFunction(()=>!EdukorsDocuments.isModified(EdukorsDocuments.active()));
  assert.notDeepEqual(await fs.readFile(saved),external);
  for(let i=0;i<40&&await draftCount();i++)await new Promise(r=>setTimeout(r,150));
  assert.equal(await draftCount(),0);
  pass('saving over a file changed outside the app asks first; saving removes the draft');
  await page.locator('#insert-actions [data-command="insertText"]').click();await page.keyboard.press('Escape');
  for(let i=0;i<40&&!await draftCount();i++)await new Promise(r=>setTimeout(r,150));
  // Calls to the main process around the crash get a deadline, so a stuck renderer fails the check instead of hanging CI.
  const within=(ms,what,p)=>Promise.race([p,new Promise((_,no)=>setTimeout(()=>no(new Error(`${what}: no answer in ${ms} ms`)),ms))]);
  // Wait until Electron reports the crash before loading again (a reload sent too early is ignored on Linux).
  await within(30000,'crash and reload',app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html')),url=w.webContents.getURL();
    await new Promise(r=>{w.webContents.once('render-process-gone',r);w.webContents.forcefullyCrashRenderer();});await w.loadURL(url);}));
  // The crashed page object is gone; the reloaded page is checked from the main process.
  const names=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html')).webContents.executeJavaScript('document.querySelector("dialog.file-dialog[open] .primary")?.click();globalThis.EdukorsDocuments?EdukorsDocuments.list().map(d=>d.name):[]').catch(()=>[]));
  let recovered=[];for(let i=0;i<80&&!recovered.some(n=>/\(recovered\)$/.test(n||''));i++){await new Promise(r=>setTimeout(r,250));recovered=await within(5000,'list documents',names()).catch(()=>[]);}
  assert.ok(recovered.some(n=>/\(recovered\)$/.test(n||'')),'recovered: '+JSON.stringify(recovered));
  pass('after a crash, the next start recovers the draft as an unsaved presentation');
  errors.length=0;
  assert.deepEqual(errors,[]);
  console.log(`Electron smoke passed (${packaged?'packaged':'dist'}): ${results.length} checks.`);
}finally{await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,15000))]);try{app.process().kill('SIGKILL');}catch{}await fs.rm(tmp,{recursive:true,force:true});}
