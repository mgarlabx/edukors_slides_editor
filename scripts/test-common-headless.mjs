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
  // Several texts selected: the format bar formats them all (bold, alignment, line spacing, lists); in a list, Enter starts an item.
  {
    await page.evaluate(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);
      c.deck.slides[0].html='<section class="slide"><div data-manual="text" data-field="a" style="position:absolute;left:100px;top:100px;width:500px;font-size:40px">One<br>Two</div><div data-manual="text" data-field="b" style="position:absolute;left:100px;top:500px;width:500px;font-size:40px">Three</div></section>';
      const next=EdukorsDocuments.add({name:'Several texts'});EdukorsAppDocument.adopt(next,c);EdukorsDocuments.activate(next.id);});
    const frame=page.frameLocator('#document-placeholder iframe:not(.preview-stale)'),html=async()=>(await content(page)).deck.slides[0].html,bar=page.locator('#context-toolbar');
    await frame.locator('html[data-esf-ready=true]').waitFor();await page.locator('#sidebar-panel').evaluate(panel=>Promise.all(panel.getAnimations().map(a=>a.finished)));await page.waitForTimeout(500);
    await frame.locator('[data-field=a]').click({position:{x:3,y:3},force:true});await frame.locator('[data-field=b]').click({position:{x:3,y:3},modifiers:['Shift'],force:true});
    // The compact bar: alignment and paragraph (lists, line spacing) are menus.
    const choose=async(menu,option)=>{await bar.locator(`[data-control="${menu}"]`).click();await (typeof option==='number'?page.locator('.pick-menu [role=option]').nth(option):page.locator('.pick-menu [role=option]').filter({hasText:option}).first()).click();await page.waitForTimeout(700);};
    await bar.locator('[data-control="bold"]').click();await page.waitForTimeout(700);
    await choose('alignMenu',1);await choose('paragraphMenu',/^1\.5$/);await choose('paragraphMenu',0);
    const look=await page.evaluate(h=>{const doc=new DOMParser().parseFromString(h,'text/html');return['a','b'].map(f=>{const el=doc.querySelector(`[data-field=${f}]`);return{style:el.getAttribute('style'),list:!!el.querySelector(':scope>ul>li>b'),items:el.querySelectorAll('li').length};});},await html());
    for(const x of look){assert.ok(/text-align: center/.test(x.style)&&/line-height: 1.5/.test(x.style),'alignment and line spacing on every text');assert.ok(x.list,'bold bulleted list in every text');}
    assert.equal(look[0].items,2,'each line is an item, also inside the bold');
    // A bigger font (typed: 48) on list texts keeps their items (it used to wrap the items in a span and add new bullets).
    await bar.locator('[data-control="fontSize"]').fill('48');await bar.locator('[data-control="fontSize"]').press('Enter');await page.waitForTimeout(700);
    {const h=await html();assert.equal(h.match(/<li\b/g).length,3,'font size keeps the list items');const li=h.match(/<li style="([^"]*)"/)[1];assert.ok(/--edukors-marker-font-size: 48px/.test(li)&&/--edukors-marker-font-weight: 700/.test(li),'the marker has the size and weight of its text');}
    await frame.locator('html[data-esf-ready=true]').waitFor();
    assert.deepEqual(await frame.locator('[data-field=a] li').first().evaluate(li=>{const m=getComputedStyle(li,'::marker');return[m.fontWeight,m.fontSize];}),['700','48px'],'the marker is drawn bold and at 48 px');
    await page.keyboard.press('Escape');await page.waitForTimeout(300);
    await frame.locator('[data-field=a] li').nth(1).dblclick({force:true});await frame.locator('[contenteditable]').waitFor();
    await frame.locator('[contenteditable]').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el.querySelectorAll('li')[1]);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});
    // A color on characters from one item to the next colors them without new items.
    await frame.locator('[contenteditable]').evaluate(el=>{const text=(li)=>document.createTreeWalker(li,NodeFilter.SHOW_TEXT).nextNode(),[a,b]=el.querySelectorAll('li'),r=document.createRange();r.setStart(text(a),1);r.setEnd(text(b),2);getSelection().removeAllRanges();getSelection().addRange(r);});
    await page.waitForTimeout(200);await bar.locator('[data-control="color"]').click();await page.locator('.pick-menu [aria-label*="#FF0000"]').click();await page.waitForTimeout(700);
    {const h=await html();assert.equal(h.split('data-field="b"')[0].match(/<li\b/g).length,2,'a color across items keeps them');assert.match(h,/One.*color: rgb\(255, 0, 0\)|color: (red|#ff0000|rgb\(255, 0, 0\))[^>]*>ne/,'the characters are colored');}
    await frame.locator('[contenteditable]').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el.querySelectorAll('li')[1]);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});
    await page.keyboard.press('Enter');await page.keyboard.type('Four');await page.keyboard.press('Escape');
    await page.waitForFunction(async()=>(await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes)).deck.slides[0].html.match(/<li>/g)?.length===4);
    await choose('paragraphMenu',0);
    assert.ok(!/<li>/.test((await html()).split('data-field="b"')[0])&&((await html()).split('data-field="b"')[0].match(/<br>/g)||[]).length===2&&/Four/.test(await html()),'the list goes back to lines');
    // An image file dropped on the canvas is inserted on the slide.
    await frame.locator('html[data-esf-ready=true]').waitFor();
    await frame.locator('body').evaluate(()=>{const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
      const data=new DataTransfer();data.items.add(new File([png],'dropped.png',{type:'image/png'}));document.body.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true,clientX:200,clientY:200}));});
    await page.waitForFunction(async()=>/<img[^>]+src="asset:asset-/.test((await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes)).deck.slides[0].html));
  }
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
  // Pasting copied text into a text keeps its font, size and color (not the page markup around it).
  await canvas.locator('html[data-esf-ready=true]').waitFor();await page.waitForTimeout(400);
  await canvas.locator('p b').dblclick();await canvas.locator('[contenteditable]').waitFor();
  await canvas.locator('[contenteditable]').evaluate(p=>{const r=document.createRange();r.selectNodeContents(p);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);
    const data=new DataTransfer();data.setData('text/html','<meta charset="utf-8"><div style="text-align:center"><span style="font-family: Georgia; font-size: 20px; color: rgb(255, 0, 0); position: absolute">Pasted look</span></div>');data.setData('text/plain','Pasted look');
    document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await page.keyboard.press('Escape');
  await page.waitForFunction(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);const h=c.deck.slides[0].html;return/Pasted look/.test(h)&&/Georgia[^>]*>Pasted look|font-size: 20px[^>]*>Pasted look/.test(h)&&!/position: absolute[^>]*>Pasted/.test(h);});
  // The object menu (right click on the canvas) closes on a click inside the canvas, which never reaches the page.
  {const box=await page.locator('#document-placeholder iframe:not(.preview-stale)').boundingBox();
    await page.waitForTimeout(300);await canvas.locator('p').click({button:'right'});
    await page.locator('.context-menu').waitFor();
    await page.mouse.click(box.x+box.width*0.85,box.y+box.height*0.85);
    await page.locator('.context-menu').waitFor({state:'detached'});}
  // Group and ungroup objects of any kind, anywhere: a text, a shape, an image in its shadow box, a text in the normal flow
  // and a text inside a container next to another one. A group is a mark on its members (data-group-id), so nothing
  // moves; a press on a member selects the group, a drag moves all members, ⌘D makes a new group, ungrouping removes the mark.
  {
    const previous=await page.evaluate(()=>EdukorsDocuments.active().id);
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await page.evaluate(async png=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);
      c.deck.slides[0].html='<section class="slide"><p data-manual="text" data-field="f" style="font-size:40px;margin:0">Flow</p><div data-manual="text" data-field="a" style="position:absolute;left:100px;top:300px;width:400px;font-size:40px">One</div><div data-manual="shape" data-shape="rect" style="position:absolute;left:600px;top:300px;width:300px;height:200px"><svg width="100%" height="100%"><rect data-shape-part="" width="100%" height="100%" style="fill:#4a6cf7"></rect></svg></div><div data-image-shadow="" style="position:absolute;inset:0;pointer-events:none;filter:drop-shadow(0 12px 18px #17203366)"><img data-manual="image" alt="" src="'+png+'" style="position:absolute;left:1000px;top:300px;width:300px;height:200px"></div><div class="pair" style="position:absolute;left:100px;top:600px;display:flex;flex-direction:column"><span data-field="t1" style="font-size:40px">Term</span><span data-field="d1" style="font-size:30px">Definition</span></div></section>';
      const next=EdukorsDocuments.add({name:'Groups'});EdukorsAppDocument.adopt(next,c);EdukorsDocuments.activate(next.id);},png);
    const F='#document-placeholder iframe:not(.preview-stale)',frame=()=>page.frameLocator(F),html=async()=>(await content(page)).deck.slides[0].html,bar=page.locator('#context-toolbar');
    const ready=async()=>{await frame().locator('html[data-esf-ready=true]').waitFor();await page.waitForTimeout(500);};await ready();
    const count=n=>page.waitForFunction(async n=>((await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes)).deck.slides[0].html.match(/data-group-id=/g)||[]).length===n,n);
    const members=['[data-field=f]','[data-field=a]','[data-shape]','img','[data-field=t1]'],box=async f=>frame().locator(f).boundingBox(),before=await Promise.all(members.map(box));
    await frame().locator(members[0]).click({position:{x:3,y:3},force:true});
    for(const f of members.slice(1))await frame().locator(f).click({position:{x:3,y:3},modifiers:['Shift'],force:true});
    await page.waitForTimeout(300);await bar.locator('[data-control=group]').click();await count(5);await ready();
    const ids=[...(await html()).matchAll(/data-group-id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,1,'one group id on the five members');
    assert.ok(!/data-field="d1"[^>]*data-group-id|data-group-id[^>]*data-field="d1"/.test(await html()),'the text next to a member stays out');
    assert.deepEqual(await Promise.all(members.map(box)),before,'grouping moves nothing');
    await frame().locator('body').click({position:{x:5,y:5},force:true});await page.waitForTimeout(300);
    await frame().locator('[data-shape]').click({position:{x:20,y:20},force:true});await page.waitForTimeout(400);
    assert.equal(await bar.locator('[data-control=ungroup]').count(),1,'a press on a member selects the group (ungroup button)');
    const s=await box('[data-shape]');
    await page.mouse.move(s.x+20,s.y+20);await page.mouse.down();await page.mouse.move(s.x+60,s.y+40,{steps:5});await page.mouse.up();
    await page.waitForFunction(async()=>((await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes)).deck.slides[0].html.match(/translate:/g)||[]).length>=5);await ready();
    const after=await Promise.all(members.map(box)),d=after.map((r,i)=>[Math.round(r.x-before[i].x),Math.round(r.y-before[i].y)].join());
    assert.ok(d.every(x=>x===d[0])&&d[0]!=='0,0','a drag on a member moves every member alike: '+d);
    await page.keyboard.press(`${mod}+d`);await count(10);
    assert.equal(new Set([...(await html()).matchAll(/data-group-id="([^"]+)"/g)].map(m=>m[1])).size,2,'the duplicate is a group of its own');
    await page.keyboard.press(`${mod}+z`);await count(5);await ready();
    await frame().locator('[data-shape]').click({position:{x:20,y:20},force:true});await page.waitForTimeout(400);
    await bar.locator('[data-control=arrangeMenu]').click();assert.equal(await page.locator('.pick-menu [role=option]').count(),2,'the arrange menu has only the stacking order');await bar.locator('[data-control=arrangeMenu]').click();
    await bar.locator('[data-control=ungroup]').click();await count(0);
    await page.evaluate(id=>EdukorsDocuments.activate(id),previous);await page.locator('#document-placeholder iframe:not(.preview-stale)').waitFor();await page.waitForTimeout(500);
  }
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
  // Several objects resize together from the group's handles (two stars; the bold text is inline and has no box).
  {await canvas.locator('[data-shape="star"]').click({button:'right'});await page.locator('.context-menu [role=menuitem]',{hasText:'Duplicate'}).click();
    await page.waitForFunction(async()=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return(c.deck.slides[0].html.match(/data-shape="star"/g)||[]).length===2;});
    const stars=canvas.locator('[data-shape="star"]'),widths=()=>stars.evaluateAll(list=>list.map(e=>e.getBoundingClientRect().width));
    await canvas.locator('html[data-esf-ready=true]').waitFor();await page.waitForTimeout(300);
    await page.evaluate(()=>document.querySelector('#document-placeholder iframe:not(.preview-stale)').contentWindow.postMessage({app:'esf-editor-command',type:'selectAll'},'*'));
    const handle=canvas.locator('[data-esf-ui="resize"][data-corner="se"]');await handle.waitFor();await page.waitForTimeout(200);
    const before=await widths(),html=await html0(),h=await handle.boundingBox();
    await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+60,h.y+h.height/2+30,{steps:6});await page.mouse.up();
    await page.waitForFunction(async previous=>{const c=await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes);return c.deck.slides[0].html!==previous;},html);
    await canvas.locator('html[data-esf-ready=true]').waitFor();
    const after=await widths();assert.equal(after.length,2);before.forEach((w,i)=>assert.ok(after[i]>w*1.05,`star ${i} resized with the group (${w} → ${after[i]})`));}
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
  // Text selected on the page (an assistant message) is copied as text, not as the selected slides.
  await page.evaluate(()=>{const p=document.createElement('p');p.id='copy-probe';p.textContent='Text from the assistant';document.body.append(p);getSelection().selectAllChildren(p);});
  await page.keyboard.press(mod+'+c');await page.keyboard.press(mod+'+v');await page.waitForTimeout(200);
  assert.equal(await rail.locator('.slide-item').count(),2,'copying page text did not copy slides');
  await page.evaluate(()=>{getSelection().removeAllRanges();document.getElementById('copy-probe').remove();});
  await rail.locator('.slide-item button').nth(1).click();
  assert.equal((await page.locator('.notes-bar label').innerText()).trim(),'','notes have no label');
  await page.locator('.notes-bar textarea').fill('Presenter notes in Common');
  assert.equal((await content(page)).deck.slides[1].notes,'Presenter notes in Common');
  // A press in the canvas takes the keys from a page field (the notes): Delete then removes the selected object.
  await page.locator('.toolbar [data-command="insertShape"]').click();await page.locator('.shape-picker button').first().click();
  await page.waitForFunction(async()=>/data-manual="shape"/.test((await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes)).deck.slides[1].html));
  await canvas.locator('html[data-esf-ready=true]').waitFor();await page.waitForTimeout(400);
  await page.locator('.notes-bar textarea').click();await canvas.locator('[data-manual=shape]').click();await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.waitForFunction(async()=>!/data-manual="shape"/.test((await EdukorsAppDocument.fromBytes((await EdukorsAppDocument.toBytes(EdukorsDocuments.active())).bytes)).deck.slides[1].html));
  assert.equal((await content(page)).deck.slides[1].notes,'Presenter notes in Common','Delete did not reach the notes');
  // Slide master: a new base, activated; a duplicate undone; a new layout used by a slide (status bar).
  await page.locator('.slides-view-actions .segmented-view .tool').nth(1).click();
  const master=page.locator('.slides-sidebar .master-rail');
  assert.equal(await master.locator('.slide-item').count(),1);
  await master.locator('.master-tabs [role=tab]').first().click();
  await master.locator('.rail-tools button').first().click();
  assert.equal(await master.locator('.slide-item').count(),2);
  // The base selected in the panel is the active (checked) one: a new base, a click on another base.
  {const c=(await content(page)).deck;assert.equal(c.activeMaster,c.masters[1].id);}
  assert.equal(await master.locator('.master-activate').nth(1).getAttribute('aria-pressed'),'true');
  await master.locator('.master-preview').first().click();
  {const c=(await content(page)).deck;assert.equal(c.activeMaster,c.masters[0].id);}
  assert.equal(await master.locator('.master-activate').first().getAttribute('aria-pressed'),'true');
  await master.locator('.master-preview').nth(1).click();
  assert.equal(await master.locator('.master-activate').first().isVisible(),false,'only the active base shows its badge');
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
