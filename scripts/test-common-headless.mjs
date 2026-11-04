// The editor inside Edukors Common's shell, in headless Chrome (no Electron, no window): the real page (dist/index.html,
// build first), with Common's simulated host. Covers the gallery, canvas editing and formatting, the slide list,
// undo, notes, the slide master, layouts, export rules, conversations and the save/open routing (import-save-headless).
import {chromium} from 'playwright';
import {build} from 'esbuild';
import path from 'node:path';
import assert from 'node:assert/strict';
const mod=process.platform==='darwin'?'Meta':'Control';
import {startServers,prepare} from './headless-server.mjs';
import {verifyImportedSave} from './import-save-headless.mjs';

const servers=await startServers();
const browser=await chromium.launch({headless:true,channel:'chrome'});
const content=page=>page.evaluate(async()=>EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes));
try{
  // Unit tests of the document state and the assistant's tools need a DOM (layouts are HTML).
  await build({entryPoints:['tests/common-state.browser.ts'],bundle:true,platform:'browser',format:'iife',globalName:'StateTests',outfile:'test-results/common-state.browser.js',
    alias:{'node:test':'./tests/browser-test-shim.ts','node:assert/strict':'./tests/browser-test-shim.ts'}});
  {
    const page=await browser.newPage();await page.goto(servers.page);await page.waitForFunction(()=>!!globalThis.EdukorsAppDocument);
    await page.addScriptTag({url:new URL('../test-results/common-state.browser.js',servers.page).href});
    const results=await page.evaluate(()=>StateTests.run());
    for(const r of results)console.log((r.error?'FAIL ':'PASS ')+r.name+(r.error?'\n'+r.error:''));
    assert.equal(results.filter(r=>r.error).length,0);assert.ok(results.length>=7);
    await page.close();
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(prepare,servers.frame);
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Renderer:',error.message);});
  await page.goto(servers.page);
  await page.waitForFunction(()=>!!globalThis.EdukorsAppDocument&&!!document.getElementById('slides-root'));
  // New opens the gallery; Blank presentation creates on double click.
  await page.locator('.toolbar [data-command="new"]').click();
  await page.locator('.template-card').first().dblclick();
  await page.locator('#document-placeholder iframe:not(.preview-stale)').waitFor();
  assert.equal(await page.evaluate(()=>EdukorsDocuments.list().length),1);
  assert.equal(await page.evaluate(()=>EdukorsDocuments.active().modified),false);
  assert.equal(await page.locator('.slides-view-actions .tool-present').count(),1);
  // A text object on the slide: edit, bold, then the HTML in the saved package.
  await page.evaluate(async()=>{
    const doc=EdukorsDocuments.active(),c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(doc)).bytes);
    c.deck.slides[0].html='<section class="slide"><p data-manual="text" style="position:absolute;left:100px;top:100px;width:800px;font-size:48px">Common canvas</p></section>';
    const next=EdukorsDocuments.add({name:'Headless integration'});EdukorsAppDocument.adopt(next,c);EdukorsDocuments.activate(next.id);
  });
  const canvas=page.frameLocator('#document-placeholder iframe:not(.preview-stale)');
  await canvas.locator('html[data-esf-ready=true]').waitFor();
  await page.locator('#sidebar-panel').evaluate(panel=>Promise.all(panel.getAnimations().map(a=>a.finished)));
  await page.waitForTimeout(300);
  await canvas.locator('p').dblclick();
  await canvas.locator('p[contenteditable]').waitFor();
  await canvas.locator('p').evaluate(element=>getSelection().selectAllChildren(element));
  await page.keyboard.type('Headless text edit');
  await canvas.locator('p').evaluate(element=>getSelection().selectAllChildren(element));
  await page.locator('#context-toolbar [data-control="bold"]').click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return/Headless text edit/.test(c.deck.slides[0].html)&&/<(b|strong)\b/.test(c.deck.slides[0].html);});
  assert.equal(await page.evaluate(()=>EdukorsDocuments.active().modified),true);
  // The object menu (right click on the canvas) closes on a click inside the canvas, which never reaches the page.
  {const box=await page.locator('#document-placeholder iframe:not(.preview-stale)').boundingBox();
    await page.waitForTimeout(300);await canvas.locator('p').click({button:'right'});
    await page.locator('.context-menu').waitFor();
    await page.mouse.click(box.x+box.width*0.85,box.y+box.height*0.85);
    await page.locator('.context-menu').waitFor({state:'detached'});}
  // Side panels: the inner-edge handle resizes (drag, arrows, double click restores) and the width is remembered.
  {if(await page.locator('.toolbar [data-command="sidebar"]').getAttribute('aria-pressed')!=='true')await page.locator('.toolbar [data-command="sidebar"]').click();
    await page.locator('#sidebar-panel').evaluate(panel=>Promise.all(panel.getAnimations().map(a=>a.finished)));
    const width=()=>page.locator('#sidebar-panel').evaluate(p=>Math.round(p.getBoundingClientRect().width));
    const before=await width(),handle=page.locator('#sidebar-panel .panel-resize'),h=await handle.boundingBox();
    await page.mouse.move(h.x+3,h.y+200);await page.mouse.down();await page.mouse.move(h.x+83,h.y+200,{steps:5});await page.mouse.up();
    assert.ok(Math.abs(await width()-(before+80))<=2,'sidebar drag');
    assert.ok(Math.abs(Number(await page.evaluate(()=>localStorage.getItem('edukors.common.panel-width.sidebar')))-(before+80))<=2,'sidebar width remembered');
    await handle.focus();await page.keyboard.press('ArrowLeft');assert.ok(Math.abs(await width()-(before+70))<=2,'sidebar arrow');
    await handle.dblclick();assert.equal(await width(),before);assert.equal(await page.evaluate(()=>localStorage.getItem('edukors.common.panel-width.sidebar')),null);
    await page.locator('.toolbar [data-command="assistant"]').click();
    await page.locator('#assistant-panel-side').evaluate(panel=>Promise.all(panel.getAnimations().map(a=>a.finished)));
    const ai=page.locator('#assistant-panel-side'),aw=await ai.evaluate(p=>p.getBoundingClientRect().width),ah=await ai.locator('.panel-resize').boundingBox();
    await page.mouse.move(ah.x+3,ah.y+200);await page.mouse.down();await page.mouse.move(ah.x-97,ah.y+200,{steps:5});await page.mouse.up();
    assert.ok(Math.abs(await ai.evaluate(p=>p.getBoundingClientRect().width)-(aw+100))<=2,'assistant drag');
    await ai.locator('.panel-resize').dblclick();await page.locator('.toolbar [data-command="assistant"]').click();}
  // Insert shape: Common's shape picker (icons), then Common's shape controls (type, line, fill, shadow…).
  await page.locator('#insert-actions [data-command="insertShape"]').click();
  assert.equal(await page.locator('.shape-picker .shape-option').count(),10);
  await page.locator('.shape-picker .shape-option').nth(2).click();
  await canvas.locator('[data-shape="ellipse"]').waitFor();
  await page.locator('#context-toolbar [data-group="shape"]').waitFor();
  assert.equal(await page.locator('#context-toolbar [data-control="shapeType"]').count(),1);
  await page.locator('#context-toolbar [data-control="shadow"]').click();
  await page.waitForFunction(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return/data-shape="ellipse"[^>]*drop-shadow|drop-shadow[^>]*data-shape="ellipse"/.test(c.deck.slides[0].html);});
  await page.locator('#context-toolbar [data-control="shapeType"]').click();
  await page.locator('.shape-picker .shape-option').nth(9).click();
  await canvas.locator('[data-shape="star"]').waitFor();
  const html0=async()=>(await content(page)).deck.slides[0].html;
  // Opacity reaches the object (the canvas accepts it), without reloading the frame.
  const frameHandle=await page.locator('#document-placeholder iframe:not(.preview-stale)').elementHandle();
  await page.evaluate(()=>document.querySelector('#document-placeholder iframe:not(.preview-stale)').contentWindow.postMessage({app:'esf-editor-command',type:'style',style:{opacity:'0.5'}},'*'));
  await page.waitForFunction(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return/data-shape="star"[^>]*opacity: 0\.5/.test(c.deck.slides[0].html);});
  // Stacking order from Common's context menu: applied in place (the same frame, no reload flash).
  await canvas.locator('[data-shape="star"]').click({button:'right'});
  await page.locator('.context-menu [role=menuitem]',{hasText:'Bring to front'}).click();
  await page.waitForFunction(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return/data-shape="star"[^>]*z-index: 1[1-9]/.test(c.deck.slides[0].html);});
  assert.equal(await frameHandle.evaluate(f=>f.isConnected),true,'the canvas frame was not replaced');
  // Several objects: Common's menu aligns and distributes them.
  await page.evaluate(()=>document.querySelector('#document-placeholder iframe:not(.preview-stale)').contentWindow.postMessage({app:'esf-editor-command',type:'selectAll'},'*'));
  await page.waitForTimeout(300);
  await canvas.locator('[data-shape="star"]').click({button:'right'});
  for(const label of ['Align top','Align left','Distribute horizontally','Cut','Duplicate'])assert.equal(await page.locator('.context-menu [role=menuitem]',{hasText:label}).count(),1,label);
  await page.locator('.context-menu [role=menuitem]',{hasText:'Align left'}).click();
  await page.waitForFunction(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return(c.deck.slides[0].html.match(/translate:/g)||[]).length>=1;});
  await page.keyboard.press('Escape');
  // The slide list (Common's left panel): new slide through the layout picker, duplicate, delete, undo.
  if(await page.locator('.toolbar [data-command="sidebar"]').getAttribute('aria-pressed')!=='true')await page.locator('.toolbar [data-command="sidebar"]').click();
  await page.locator('#sidebar-panel').evaluate(panel=>Promise.all(panel.getAnimations().map(a=>a.finished)));
  const rail=page.locator('.slides-sidebar .slide-rail');
  await rail.locator('.rail-tools button').first().click();
  await page.locator('.layout-pick .template-card').first().dblclick();
  assert.equal(await rail.locator('.slide-item').count(),2);
  await rail.locator('.rail-tools button[aria-label="Duplicate"]').click();
  assert.equal(await rail.locator('.slide-item').count(),3);
  await rail.locator('.rail-tools .tool-delete').click();
  assert.equal(await rail.locator('.slide-item').count(),2);
  await page.locator('#edit-actions [data-command="undo"]').click();
  assert.equal(await rail.locator('.slide-item').count(),3);
  await page.locator('#edit-actions [data-command="redo"]').click();
  assert.equal(await rail.locator('.slide-item').count(),2);
  // Keys of the list: the selection mode follows the last area clicked.
  await rail.locator('.slide-item button').nth(1).click();
  await page.keyboard.press(mod+'+d');
  assert.equal(await rail.locator('.slide-item').count(),3);
  await page.keyboard.press('Delete');
  assert.equal(await rail.locator('.slide-item').count(),2);
  assert.equal((await page.locator('.notes-bar label').innerText()).trim(),'','notes have no label');
  await page.locator('.notes-bar textarea').fill('Presenter notes in Common');
  assert.equal((await content(page)).deck.slides[1].notes,'Presenter notes in Common');
  // Slide master: a new base, activated; a duplicate undone; a new layout used by a slide (status bar).
  await page.locator('.slides-view-actions .segmented-view .tool').nth(1).click();
  const master=page.locator('.slides-sidebar .master-rail');
  assert.equal(await master.locator('.slide-item').count(),1);
  await master.locator('.master-tabs [role=tab]').first().click();
  await master.locator('.rail-tools button').first().click();
  assert.equal(await master.locator('.slide-item').count(),2);
  await master.locator('.master-activate').nth(1).click();
  const c1=(await content(page)).deck;assert.equal(c1.activeMaster,c1.masters[1].id);
  await master.locator('.rail-tools button[aria-label="Duplicate"]').click();
  assert.equal(await master.locator('.slide-item').count(),3);
  await page.locator('#edit-actions [data-command="undo"]').click();
  assert.equal(await master.locator('.slide-item').count(),2);
  await master.locator('.master-tabs [role=tab]').nth(1).click();
  await master.locator('.rail-tools button').first().click();
  await master.locator('.slide-item.selected .item-name').dblclick();
  await master.locator('input.item-name').fill('Second layout');await master.locator('input.item-name').press('Enter');
  await page.locator('.slides-view-actions .segmented-view .tool').first().click();
  await page.locator('.slides-status .layout-name').click();
  await page.locator('.layout-pick .template-card',{hasText:'Second layout'}).click();
  await page.locator('#slides-root .file-footer .primary').click();
  await page.waitForFunction(()=>/Second layout/.test(document.querySelector('.slides-status')?.textContent||''));
  // Interactive questions: an HTML export needs a server; the dialog says so and points to Settings.
  await page.evaluate(()=>{});
  await page.locator('#insert-actions [data-command="insertPoll"]').click();
  await page.locator('.poll-editor textarea').fill('Which option?');
  for(const [i,v] of ['A','B'].entries())await page.locator('.poll-editor-option input').nth(i).fill(v);
  await page.locator('.poll-editor .primary').click();
  assert.equal((await content(page)).deck.slides.filter(s=>s.poll).length,1);
  await page.evaluate(()=>Object.assign(EdukorsDocuments.active(),{saved:true,folder:'/virtual',name:'Headless integration'}));
  await page.keyboard.press(mod+'+e');
  const exportDialog=page.locator('dialog.file-dialog[open]');
  await exportDialog.locator('input[type=radio][value="html"]').check();
  await exportDialog.locator('.file-footer .primary:visible').click();
  await page.waitForFunction(()=>/server|servidor/i.test(document.querySelector('dialog.file-dialog[open] .file-message')?.textContent||''));
  await page.keyboard.press('Escape');
  // Saved state and conversations: a restored conversation marks the document modified and goes into the package.
  await page.evaluate(async()=>{const doc=EdukorsDocuments.active(),s=await EdukorsAppDocument.toBytes(doc,{name:'Headless integration'});document.dispatchEvent(new CustomEvent('edukors:document-saved',{detail:{doc,committed:s.committed}}));});
  await page.waitForFunction(()=>!EdukorsDocuments.active().modified);
  // Conversations read from a file are not a change (Common's baseline); changing one is, until the next save.
  await page.evaluate(()=>EdukorsAiAssistant.restoreConversations(EdukorsDocuments.active(),[{id:'headless-conversation',updated:'2026-11-02T13:00:00Z',items:[{kind:'user',text:'A saved conversation'},{kind:'assistant',text:'Preserved in ESLX'}]}]));
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>EdukorsDocuments.isModified(EdukorsDocuments.active())),false);
  await page.evaluate(()=>{const doc=EdukorsDocuments.active();EdukorsAiAssistant.conversationsOf(doc).find(c=>c.id==='headless-conversation').items.push({kind:'note',text:'changed'});document.dispatchEvent(new CustomEvent('edukors:preferences-changed'));});
  await page.waitForFunction(()=>EdukorsDocuments.active().conversationsModified&&EdukorsDocuments.isModified(EdukorsDocuments.active()));
  const history=(await content(page)).conversations;
  assert.equal(history[0].id,'headless-conversation');assert.equal(history[0].items[1].text,'Preserved in ESLX');
  // Settings: the editor's sections next to Common's.
  await page.locator('.toolbar [data-command="settings"]').click();
  await page.locator('[data-section="slides-poll"]').click();
  await page.locator('#slides-poll-panel .poll-server').waitFor();
  assert.equal(await page.locator('#application-panel').isHidden(),true);
  await page.locator('[data-section="slides-deck"]').click();
  await page.locator('#slides-deck-panel textarea').fill('Audience: teachers.');
  assert.equal((await content(page)).deck.systemPrompt,'Audience: teachers.');
  await page.keyboard.press('Escape');
  // Portuguese interface.
  await page.evaluate(()=>{const s=document.getElementById('language');s.value='pt';s.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>document.documentElement.lang==='pt');
  await page.waitForFunction(()=>document.querySelector('.slides-sidebar .rail-tools button')?.getAttribute('aria-label')==='Novo slide');
  assert.equal(await page.locator('.slides-view-actions .tool-present').getAttribute('aria-label'),'Apresentar');
  // Chinese and Hindi: the editor's labels, the interactive question dialog and the help texts.
  for(const [lang,newSlide,present,question,guide] of [['zh','新建幻灯片','放映','互动问题','教师指南'],['hi','नई स्लाइड','प्रस्तुत करें','इंटरैक्टिव प्रश्न','शिक्षक मार्गदर्शिका']]){
    await page.evaluate(l=>{const s=document.getElementById('language');s.value=l;s.dispatchEvent(new Event('change',{bubbles:true}));},lang);
    await page.waitForFunction(label=>document.querySelector('.slides-sidebar .rail-tools button')?.getAttribute('aria-label')===label,newSlide);
    assert.equal(await page.locator('.slides-view-actions .tool-present').getAttribute('aria-label'),present);
    assert.equal(await page.locator('#insert-actions [data-command="insertPoll"]').getAttribute('aria-label'),question);
    assert.equal(await page.evaluate(l=>EdukorsAppConfig.help.fullGuide[l].includes('.eslx')&&!!EdukorsAppConfig.help.termsOfUse[l]&&!!EdukorsAppConfig.help.quickGuide[l],lang),true);
    assert.match(await page.evaluate(l=>EdukorsAppConfig.help.fullGuide[l],lang),new RegExp(guide));
  }
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('Headless Common passed: gallery, canvas editing and formatting, slide list, undo/redo, keys, notes, slide master, layouts, questions and export rule, conversations, settings, Portuguese, Chinese and Hindi.');
  await verifyImportedSave(browser,servers);
}finally{await browser.close();servers.close();}
