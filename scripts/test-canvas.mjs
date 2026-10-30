// Full editor regressions, no server, network or AI account. Optionally exercise a COPY of a real .esf.
import {_electron as electron} from 'playwright';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=path.resolve('test-results/canvas-'+Date.now());
await fs.mkdir(root,{recursive:true});
await build({entryPoints:['tests/canvas-fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'fixture.mjs')});
const {deck,readDeck,writeDeck}=await import(pathToFileURL(path.join(root,'fixture.mjs')).href);
const file=path.join(root,'fixture.esf');await writeDeck(file,deck);
const env={...process.env,ESF_ACCEPT_TERMS:'1',ESF_DATA_DIR:path.join(root,'appdata'),ESF_HIDDEN:process.env.ESF_SHOW?'':'1'};delete env.ELECTRON_RUN_AS_NODE;
const packaged=process.env.ESF_EXECUTABLE;
const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[file]:['.',file],env,timeout:15000});
try{
  const page=await app.firstWindow(),errors=[],canvas=page.frameLocator('.slide-canvas iframe');
  page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>canvas.locator('html[data-esf-ready=true]').waitFor();
  const near=(a,b,message,tolerance=1)=>assert.ok(Math.abs(a-b)<tolerance,`${message}: ${a} vs ${b}`);
  const center=async loc=>{await loc.waitFor({state:'visible'});const b=await loc.boundingBox();assert.ok(b);return{x:b.x+b.width/2,y:b.y+b.height/2};};
  const until=async(fn,message)=>{const end=Date.now()+8000;while(Date.now()<end){if(await fn())return;await page.waitForTimeout(25);}assert.fail(message);};
  const undo=async(loc,style)=>{await page.getByRole('button',{name:'Desfazer',exact:true}).click();await until(async()=>await loc.getAttribute('style')===style,'undo restores exact styles');await ready();};
  const drag=async(p,dx,dy,finish=true)=>{await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:6});if(finish)await page.mouse.up();};
  const clear=async()=>{await page.keyboard.press('Escape');await page.keyboard.press('Escape');};
  await ready();
  // Legacy text: computed styles populate the toolbar; formatting keeps text and inline markup.
  const title=canvas.locator('#legacy-text');await title.click();
  await page.getByRole('button',{name:'Fonte',exact:true}).waitFor();
  assert.match(await page.getByRole('button',{name:'Fonte',exact:true}).innerText(),/Georgia/);
  assert.match(await page.getByRole('button',{name:'Tamanho',exact:true}).innerText(),/60/);
  await title.evaluate(el=>getSelection().selectAllChildren(el));await page.keyboard.type('New legacy title');
  // Controlled checkbox: it turns on when the frame reports the new style, not on the click itself.
  await page.locator('.manual-check',{hasText:'Sombra'}).locator('input').click();
  await canvas.locator('#legacy-text[style*="box-shadow"]').waitFor();await ready();
  assert.equal(await title.innerText(),'New legacy title','box formatting commits pending typing');
  await undo(title,null);assert.equal(await title.innerText(),'Legacy formatted title');
  // A copied nested text uses its own source index; the containing card stays a separate object.
  await clear();await canvas.locator('#nested-text').dblclick();await canvas.locator('#nested-text[contenteditable]').waitFor();
  await page.getByRole('button',{name:'Cor do texto',exact:true}).click();await page.locator('.pick-menu button[aria-label="Vermelho"]').click();
  await canvas.locator('#nested-text span[style*="color"]').waitFor();await ready();
  assert.equal(await canvas.locator('#card').getAttribute('style'),null);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('#nested-text:not(:has(span))').waitFor();await ready();
  // Every corner, at several viewport scales. The opposite corner stays fixed, even in flex centering.
  for(const width of [1100,1500]){
    await app.evaluate(({BrowserWindow},w)=>BrowserWindow.getAllWindows()[0].setSize(w,950),width);await ready();
    for(const id of ['photo','cropped','centered-photo','transformed-photo'])for(const corner of ['nw','ne','sw','se']){
      await clear();const el=canvas.locator('#'+id);await el.click();const style=await el.getAttribute('style'),b=await el.boundingBox();
      const handle=canvas.locator(`[data-esf-ui=resize][data-corner=${corner}]`),opposite=canvas.locator(`[data-esf-ui=resize][data-corner=${{nw:'se',ne:'sw',sw:'ne',se:'nw'}[corner]}]`),fixed=await center(opposite);
      await drag(await center(handle),corner.includes('w')?-30:30,corner.includes('n')?-15:15);
      await until(async()=>(await el.boundingBox()).width>b.width+15,'resize persisted');
      const after=await el.boundingBox(),anchor=await center(opposite);near(anchor.x,fixed.x,id+' opposite x');near(anchor.y,fixed.y,id+' opposite y');near(after.width/after.height,b.width/b.height,id+' aspect',.01);
      await undo(el,style);
    }
  }
  // Eight text grips (free resize), generic boxes, and a transformed SVG/image remain editable.
  for(const id of ['legacy-text','card'])for(const corner of ['nw','ne','sw','se','n','s','e','w']){
    await clear();const el=canvas.locator('#'+id);await el.click({position:{x:10,y:10}});const style=await el.getAttribute('style');
    await drag(await center(canvas.locator(`[data-esf-ui=resize][data-corner=${corner}]`)),corner.includes('w')?-30:corner.includes('e')?30:0,corner.includes('n')?-25:corner.includes('s')?25:0);
    await until(async()=>await el.getAttribute('style')!==style,'each grip resizes');await undo(el,style);
  }
  // Group movement is one undo step and uses screen deltas consistently for each selected object.
  {await clear();const first=canvas.locator('#photo'),last=canvas.locator('#vector');await first.click();await last.click({modifiers:['Shift']});
    assert.equal(await canvas.locator('[data-esf-ui=sel]:visible').count(),2);
    const a=await first.boundingBox(),b=await last.boundingBox(),style=await first.getAttribute('style');
    await page.keyboard.down('Alt');await drag(await center(first),31,17);await page.keyboard.up('Alt');
    near((await first.boundingBox()).x-a.x,31,'group first x');near((await last.boundingBox()).y-b.y,17,'group last y');
    await undo(first,style);assert.equal(await last.getAttribute('style'),null);
  }
  // Crop cancellation uses the same pointer ownership as movement and resizing.
  {await clear();const el=canvas.locator('#photo');await el.click();const style=await el.getAttribute('style');
    const button=page.getByRole('button',{name:'Cortar imagem',exact:true});await button.click();
    await el.evaluate(()=>addEventListener('pointerdown',e=>window.__pointer=e.pointerId,{once:true}));
    await drag(await center(canvas.locator('[data-esf-ui=cropgrip][data-corner=nw]')),24,12,false);
    await el.evaluate(()=>dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.__pointer})));await page.mouse.up();
    await page.keyboard.press('Enter');await until(async()=>await el.getAttribute('style')!==style,'interrupted crop commits the last preview');await undo(el,style);
    await button.click();await drag(await center(canvas.locator('[data-esf-ui=cropgrip][data-corner=nw]')),24,12);
    await page.keyboard.press('Escape');assert.equal((await el.getAttribute('style'))||'',style||'','Escape restores the full crop');
    await button.click();await drag(await center(canvas.locator('[data-esf-ui=cropgrip][data-corner=nw]')),24,12);await button.click();
    await canvas.locator('#photo[style*="clip-path: inset"]').waitFor();await undo(el,style);
  }
  // Movement uses each parent's coordinate system and keeps the same live frame between gestures.
  for(const id of ['photo','transformed-photo','vector']){
    await clear();const el=canvas.locator('#'+id);await el.click();const style=await el.getAttribute('style'),before=await el.boundingBox();
    await el.evaluate(()=>window.__canvasIdentity='kept');await page.keyboard.down('Alt');
    for(let i=0;i<3;i++)await drag(await center(el),19,13);
    await page.keyboard.up('Alt');const after=await el.boundingBox();near(after.x-before.x,57,id+' horizontal move');near(after.y-before.y,39,id+' vertical move');
    assert.equal(await el.evaluate(()=>window.__canvasIdentity),'kept','geometry never reloads the canvas');
    await page.getByRole('button',{name:'Desfazer',exact:true}).click();await ready();await page.getByRole('button',{name:'Desfazer',exact:true}).click();await ready();await undo(el,style);
  }
  // One pointer owns the gesture. Escape cancels; interruptions commit the last preview, as documented by the controller.
  for(const reason of ['Escape','pointercancel','blur','lostcapture','resize']){
    await clear();const el=canvas.locator('#photo');await el.click();const style=await el.getAttribute('style');
    await el.evaluate(()=>addEventListener('pointerdown',e=>window.__pointer=e.pointerId,{once:true}));
    await drag(await center(el),45,20,false);
    await el.evaluate(()=>dispatchEvent(new PointerEvent('pointerup',{pointerId:999,clientX:0,clientY:0})));
    assert.notEqual(await el.getAttribute('style'),style,'foreign pointer cannot finish the move');
    if(reason==='Escape')await page.keyboard.press('Escape');
    else await el.evaluate((_,reason)=>{
      if(reason==='lostcapture')document.documentElement.releasePointerCapture(window.__pointer);
      else if(reason==='pointercancel')dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.__pointer}));
      else dispatchEvent(new Event(reason));
    },reason);
    await page.mouse.move(10,10);await page.mouse.up();if(reason==='Escape')assert.equal((await el.getAttribute('style'))||'',style||'',reason+' restores exact CSS');else{await until(async()=>await el.getAttribute('style')!==style,reason+' commits the last preview');await undo(el,style);}
  }
  // The release position is authoritative even when there was no intermediate move event.
  {await clear();const el=canvas.locator('#photo');await el.click();const before=await el.boundingBox(),style=await el.getAttribute('style'),p=await center(el);
    await el.evaluate(()=>addEventListener('pointerdown',e=>window.__press={pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY},{once:true}));
    await page.mouse.move(p.x,p.y);await page.mouse.down();await el.evaluate(()=>{const e=window.__press;dispatchEvent(new PointerEvent('pointerup',{...e,clientX:e.clientX+33,clientY:e.clientY+17,altKey:true}));});await page.mouse.up();
    const after=await el.boundingBox();near(after.x-before.x,33,'final up x');near(after.y-before.y,17,'final up y');await undo(el,style);}
  // Context menu: order for any object; text also gets horizontal and vertical alignment, each one undoable step.
  const menu=page.locator('.canvas-menu'),item=name=>menu.getByRole('menuitem',{name,exact:true});
  await clear();await title.click({button:'right'});await menu.waitFor();
  assert.deepEqual(await menu.getByRole('menuitem').allInnerTexts(),['Trazer para frente','Enviar para o fundo','Direita','Centro','Esquerda','Cima','Meio','Baixo']);
  await item('Centro').click();await menu.waitFor({state:'detached'});await canvas.locator('#legacy-text[style*="text-align: center"]').waitFor();await ready();
  // Style operations reload the frame; reads retry until the new document answers.
  const css=(loc,fn,arg)=>loc.evaluate(fn,arg).catch(()=>undefined);
  await until(async()=>await css(title,el=>getComputedStyle(el).textAlign)==='center','text centered');
  await title.click({button:'right'});await item('Baixo').click();await canvas.locator('#legacy-text[style*="align-content: end"]').waitFor();await ready();
  await undo(title,'text-align: center !important;');await undo(title,null);
  const photo=canvas.locator('#photo');await clear();await photo.click({button:'right'});await menu.waitFor();
  assert.deepEqual(await menu.getByRole('menuitem').allInnerTexts(),['Trazer para frente','Enviar para o fundo'],'no alignment for images');
  await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});
  await photo.click({button:'right'});await item('Trazer para frente').click();await canvas.locator('#photo[style*="z-index"]').waitFor();await ready();
  await until(async()=>await css(photo,el=>+getComputedStyle(el).zIndex>0),'front: above the others');
  await photo.click({button:'right'});await item('Enviar para o fundo').click();await until(async()=>await css(photo,el=>+getComputedStyle(el).zIndex<0),'back: below the others');await ready();
  await until(async()=>await css(canvas.locator('section.slide'),el=>getComputedStyle(el).isolation)==='isolate','the parent keeps the object above its background');
  await clear();const top=await page.evaluate(()=>{const f=document.querySelector('.slide-canvas iframe').getBoundingClientRect();return{x:f.x,y:f.y};});
  await until(async()=>{const b=await photo.boundingBox().catch(()=>null);return b&&await css(canvas.locator('body'),(_,p)=>document.elementFromPoint(p.x,p.y)?.id,{x:b.x-top.x+b.width/2,y:b.y-top.y+b.height/2})==='photo';},'still visible over the slide background');
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await ready();await undo(photo,null);
  // Copy on one slide, paste on the active one: the object keeps the source slide's CSS look and its place.
  const menuClick=(top,label)=>app.evaluate(({Menu},[top,label])=>{Menu.getApplicationMenu().items.find(x=>x.label===top).submenu.items.find(x=>x.label===label).click();},[top,label]);
  {await clear();const look=el=>el.evaluate(e=>{const c=getComputedStyle(e);return[c.fontFamily,c.fontSize,c.color].join('|');});
    {const b=await title.boundingBox();await page.mouse.click(b.x+3,b.y+3);}await canvas.locator('[data-esf-ui=resize]:visible').first().waitFor();const before=await title.boundingBox(),source=await look(title);
    await menuClick('Editar','Copiar');await until(async()=>/esf-objects/.test(await app.evaluate(({clipboard})=>clipboard.readText())),'objects copied');
    await page.locator('.slide-item button').nth(1).click();await until(async()=>!await canvas.locator('#legacy-text').count(),'second slide shown');await ready();
    await menuClick('Editar','Colar');const pasted=canvas.locator('h2',{hasText:'Legacy formatted title'});await pasted.waitFor();await ready();
    // The animation of the source CSS comes along, scoped to the copy, with its keyframes renamed.
    {const c=JSON.parse(await app.evaluate(({clipboard})=>clipboard.readText()));const cls=(await pasted.getAttribute('class')||'').match(/esf-m-\S+/)?.[0];assert.ok(cls,'pasted object gets the motion class');
      assert.match(c.css,new RegExp(`\\.${cls}\\{animation:[^}]*rise-\\w+`));assert.match(c.css,/@keyframes rise-\w+\{/);
      // Theme variables, state rules (classes added at run time) and the slide's script come along too.
      assert.match(await pasted.getAttribute('style'),/--rise:\s*1s/,'variables used by the animation resolve on the copy');
      assert.match(c.css,/\.slide\.lit #legacy-text\{[^}]*letter-spacing:2px!important/,'state rules are kept');
      assert.match(c.script,/#legacy-text/,'the script goes with its object');
      await until(async()=>await pasted.getAttribute('data-ran')==='1','the copied script runs on the pasted object (new ID)');}
    await until(async()=>await look(pasted).catch(()=>'')===source,'same font, size and color without the source CSS');
    const after=await pasted.boundingBox();near(after.x,before.x,'pasted x',2);near(after.y,before.y,'pasted y',2);near(after.width,before.width,'pasted width',2);
    assert.equal((await readDeck(file)).slides.length,2);
    await page.getByRole('button',{name:'Desfazer',exact:true}).click();await pasted.waitFor({state:'detached'});
    await page.locator('.slide-item button').nth(0).click();await title.waitFor();await ready();}
  // Selection mode: after a click on the slide list Delete removes slides; after a click on an object, only the object.
  {const slides=()=>page.locator('.slide-item').count();
    await page.locator('.slide-item button').nth(0).click();await until(async()=>await page.locator('.slide-rail.inactive').count()===0,'slide mode');
    const b=await title.boundingBox();await page.mouse.click(b.x+3,b.y+3);await page.locator('.slide-rail.inactive').waitFor();
    await page.keyboard.press('Delete');await title.waitFor({state:'detached'});assert.equal(await slides(),2,'Delete after selecting an object keeps the slides');
    await page.getByRole('button',{name:'Desfazer',exact:true}).click();await title.waitFor();await ready();
    await page.locator('.slide-item button').nth(1).click();await page.keyboard.press('Delete');await until(async()=>await slides()===1,'Delete after a click on the slide list removes the slide');
    await page.getByRole('button',{name:'Desfazer',exact:true}).click();await until(async()=>await slides()===2,'slide restored');
    await page.locator('.slide-item button').nth(0).click();await title.waitFor();await ready();}
  // Save/reopen must match live CSS, including an original percentage translate and !important sizes.
  await clear();const moved=canvas.locator('#transformed-photo');await moved.click();await page.keyboard.down('Alt');await drag(await center(moved),37,21);await page.keyboard.up('Alt');
  const finalBox=await moved.boundingBox();await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await until(async()=>/translate:.*px/.test((await readDeck(file)).slides[0].html),'move reaches the package');
  const saved=await readDeck(file);assert.ok(!/data-esf-edit|contenteditable/.test(saved.slides[0].html));assert.match(saved.slides[0].staticHtml,/translate:/);
  await page.locator('.statusbar .saved').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('command','close'));await page.locator('.empty-desk').waitFor();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  await page.getByRole('button',{name:'Abrir apresentação',exact:true}).click();await ready();
  const reopened=await canvas.locator('#transformed-photo').boundingBox();near(reopened.x,finalBox.x,'reopened x');near(reopened.y,finalBox.y,'reopened y');
  // Optional user's presentation: only the copied file is opened/saved; iterate all legacy text/SVG objects.
  if(process.env.ESF_LEGACY_FILE){
    const original=await fs.readFile(process.env.ESF_LEGACY_FILE),hash=createHash('sha256').update(original).digest('hex'),copy=path.join(root,'legacy.esf');await fs.writeFile(copy,original);
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},copy);
    await page.getByRole('button',{name:'Abrir apresentação',exact:true}).click();await ready();
    const legacy=await readDeck(copy),report=[];
    for(let i=0;i<legacy.slides.length;i++){
      await page.locator('.slide-item button').nth(i).click();await ready();
      const texts=canvas.locator('[data-esf-kind=text]'),images=canvas.locator('svg[data-esf-kind=media]');let textCount=0,svgCount=0;
      for(let j=0;j<await texts.count();j++){const el=texts.nth(j);if(!await el.isVisible())continue;await el.dblclick();await page.getByRole('button',{name:'Fonte',exact:true}).waitFor();await clear();textCount++;}
      for(let j=0;j<await images.count();j++){const el=images.nth(j),b=await el.boundingBox();if(!b||b.width<10||b.height<10)continue;await el.click();await canvas.locator('[data-esf-ui=resize]:visible').first().waitFor();await clear();svgCount++;}
      report.push({slide:i+1,textCount,svgCount});
    }
    await fs.writeFile(path.join(root,'legacy-report.json'),JSON.stringify(report,null,2));
    assert.equal(createHash('sha256').update(await fs.readFile(process.env.ESF_LEGACY_FILE)).digest('hex'),hash,'original presentation unchanged');
  }
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'passed.json'),JSON.stringify({finalBox,passed:true},null,2));
  console.log('Canvas regressions passed:',root);
// A modified presentation asks before closing; the process is ended after a short wait.
}finally{await Promise.race([app.close(),new Promise(r=>setTimeout(r,5000))]);try{app.process()?.kill();}catch{}}
