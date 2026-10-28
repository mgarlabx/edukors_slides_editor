if(process.argv.includes('--poll')){await import('./test-poll.mjs');process.exit();}
if(process.argv.includes('--poll-server')){await import('./test-poll-server.mjs');process.exit(process.exitCode||0);}
if(process.argv.includes('--poll-live')){await import('./test-poll-live.mjs');process.exit(process.exitCode||0);}
import {_electron as electron} from 'playwright';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=path.resolve('test-results/e2e-'+Date.now());
// Windows: no AI assistant in 1.0, no Keychain, and the ⌘ shortcuts are not adapted yet; those blocks run elsewhere.
const win=process.platform==='win32';
await fs.mkdir(root,{recursive:true});
const env={...process.env,ESF_EXTERNAL_LOG:path.join(root,'external.txt'),ESF_DATA_DIR:path.join(root,'appdata'),ESF_HIDDEN:process.env.ESF_SHOW?'':'1'};delete env.ELECTRON_RUN_AS_NODE;
// The AI library's fake provider stands in for Claude and Codex: a real separate CLI process, no account.
env.ESF_AI_FAKE=path.resolve('node_modules/@edukors/ai-cli/fixtures/fake-ai.mjs');
const tinyPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
// Pages the agent's web tools (screenshot, download) fetch.
const webServer=(await import('node:http')).createServer((q,r)=>{if(q.url==='/logo.png'){r.writeHead(200,{'content-type':'image/png'}).end(tinyPng);return;}r.writeHead(200,{'content-type':'text/html'}).end('<h1>Fonte</h1>');});
await new Promise(r=>webServer.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${webServer.address().port}`;
// ESF_EXECUTABLE runs the same flow against a packaged app (e.g. release/Edukors Slides Editor.app/Contents/MacOS/Edukors Slides Editor).
const packaged=process.env.ESF_EXECUTABLE||(process.argv.includes('--packaged')?path.resolve('release/Edukors Slides Editor.app/Contents/MacOS/Edukors Slides Editor'):undefined);
const launch=(...extra)=>electron.launch({executablePath:packaged||require('electron'),args:packaged?extra:['.',...extra],env,timeout:30000});
const log=[],shot=(page,name)=>page.screenshot({path:path.join(root,name)});
const watch=page=>{page.on('pageerror',e=>log.push(e.message));page.on('console',m=>{if(m.type()==='error')log.push(m.text());});return page;};
// New asks for nothing; the first save asks for the file (always .esf, lowercase) and nothing else is created next to it.
const projectDir=path.join(root,'Minha pasta'),esf=path.join(projectDir,'Apresentacao-de-teste.esf');
const unzip=async file=>require('fflate').unzipSync(new Uint8Array(await fs.readFile(file))),zipEntries=async file=>Object.keys(await unzip(file)),zipText=async(file,name)=>new TextDecoder().decode(require('fflate').unzipSync(new Uint8Array(await fs.readFile(file)))[name]);
await fs.mkdir(projectDir);
// Blank is the only built-in template; "Essencial" stands for one the user saved (a package with content layouts).
await fs.mkdir(env.ESF_DATA_DIR,{recursive:true});await fs.writeFile(path.join(env.ESF_DATA_DIR,'preferences.json'),'{"language":"pt"}');
{const css=`:root{--paper:#faf8f2;--ink:#202535;--accent:#5365de;--muted:#657085;--surface:#ffffff}
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:var(--paper)}
.slide{position:relative;width:1600px;height:900px;padding:85px 100px;overflow:hidden;background:var(--paper)}
h1,h2,h3,p{margin:0}h1{font-size:88px;line-height:1.13;letter-spacing:-3px;max-width:1300px}h2{font-size:64px;line-height:1.15;letter-spacing:-2px;margin-bottom:32px}h3{font-size:36px;line-height:1.2}
p,li{font-size:32px;line-height:1.5;color:var(--muted)}p{margin-top:24px}.cover{display:flex;flex-direction:column;justify-content:center}
.cards{display:flex;gap:30px;margin-top:55px}.card{flex:1;min-width:0;padding:40px;border:1px solid #8895ac30;border-radius:20px;background:var(--surface)}.card .number{color:var(--accent);font-size:54px;margin-bottom:32px}.card p{font-size:29px}
img{max-width:100%;max-height:640px;object-fit:contain}[data-step]{transition:opacity .25s,transform .25s}[data-step].pending{opacity:0;transform:translateY(12px)}`;
 const layouts=[['blank','Em branco','<section class="slide"></section>'],['cover','Capa','<section class="slide cover"><h1 data-field="title">Título da apresentação</h1><p data-field="subtitle">Uma ideia para compartilhar</p></section>'],
  ['cards','Cartões','<section class="slide"><h2 data-field="title">Título do slide</h2><div class="cards">'+['Primeira ideia','Segunda ideia','Terceira ideia'].map((x,i)=>`<div class="card" data-step><div class="number">0${i+1}</div><h3 data-field="card${i}">${x}</h3><p data-field="body${i}">Adicione uma breve explicação.</p></div>`).join('')+'</div></section>']];
 const base='masters/m-essencial',files={[base+'/master.html']:'',[base+'/theme.css']:css,'slides/s-cover-1/content.html':layouts[1][2]};for(const [id,,html] of layouts)files[`layouts/${id}.html`]=html;
 const manifest={format:'edukors-slides',packageVersion:1,schemaVersion:3,runtimeVersion:1,id:'deck-essencial',revision:0,title:'Essencial',canvas:{width:1600,height:900},
  masters:[{id:'m-essencial',name:'Mestre',html:base+'/master.html',css:base+'/theme.css'}],activeMaster:'m-essencial',layouts:layouts.map(([id,name])=>({id,name,html:`layouts/${id}.html`})),
  slides:[{id:'s-cover-1',title:'Título da apresentação',layoutId:'cover',notes:'',html:'slides/s-cover-1/content.html',staticState:'final'}],assets:[]};
 const {zipSync,strToU8}=require('fflate'),dir=path.join(env.ESF_DATA_DIR,'templates','essencial');await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'template.ESF'),zipSync(Object.fromEntries([['manifest.json',strToU8(JSON.stringify(manifest))],...Object.entries(files).map(([k,v])=>[k,strToU8(v)])])));
 await fs.writeFile(path.join(dir,'template.json'),JSON.stringify({title:'Essencial'}));}
let app=await launch();
try{
 const page=watch(await app.firstWindow());
 // Startup shows an empty workspace; New and Recent open as modals from the File menu or the toolbar.
 await page.locator('.empty-desk').waitFor();assert.equal(await page.locator('.modal,.tabs,.template-card').count(),0,'nothing but the empty workspace');assert.equal(await page.locator('.toolbar button').count(),4,'only the File section and Settings');assert.match(await page.locator('.statusbar .app-version').innerText(),/^v\d+\.\d+\.\d+$/,'version shown without a presentation');await shot(page,'00-empty.png');
 // Native menu: without a presentation, only what works on the empty workspace stays enabled.
 // Slides / slide master is a segmented control; the old toggle button is emulated by clicking the other view.
 const viewToggle=()=>({click:async()=>{const bar=page.locator('.toolbar'),master=bar.getByRole('tab',{name:'Slide mestre',exact:true});await(await master.getAttribute('aria-selected')==='true'?bar.getByRole('tab',{name:'Slides',exact:true}):master).click();}});
 const menuEnabled=()=>app.evaluate(({Menu})=>Object.fromEntries(Menu.getApplicationMenu().items.flatMap(m=>m.submenu.items.filter(x=>x.label).map(x=>[m.label+'/'+x.label,x.enabled]))));
 {const m=await menuEnabled();for(const k of ['Arquivo/Salvar','Arquivo/Fechar aba','Arquivo/Exportar…','Slides/Novo slide','Editar/Excluir','Inserir/Texto','Apresentação/Apresentar','Apresentação/Slide mestre','Visualizar/Assistente de IA'])assert.equal(m[k],false,k+' disabled');
  for(const k of ['Editar/Desfazer','Editar/Colar','Editar/Selecionar tudo'])assert.equal(m[k],false,k+' disabled');
  for(const k of ['Arquivo/Novo','Arquivo/Abrir…','Arquivo/Recentes…'])assert.equal(m[k],true,k+' enabled');}
 await app.evaluate(({Menu})=>{Menu.getApplicationMenu().items.find(x=>x.label==='Arquivo').submenu.items.find(x=>x.label==='Recentes…').click();});
 await page.locator('.modal.sheet').getByRole('heading',{name:'Recentes',exact:true}).waitFor();await page.keyboard.press('Escape');await page.locator('.modal.sheet').waitFor({state:'detached'});await page.locator('.empty-desk').waitFor();
 assert.equal(await page.locator('.menubar').count(),0,'only the native menu');await page.locator('.toolbar').getByRole('button',{name:'Nova apresentação',exact:true}).click();
 await page.locator('.modal.sheet').getByRole('heading',{name:'Nova apresentação',exact:true}).waitFor();
 await shot(page,'01-gallery.png');
 await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});dialog.showSaveDialog=async(_w,o)=>({canceled:false,filePath:/\.esf$/.test(o.defaultPath)?dir+'/Apresentacao-de-teste.ESF':o.defaultPath});globalThis.__boxes=[];dialog.showMessageBox=async(_w,o)=>{globalThis.__boxes.push(o.message);return{response:0};};},projectDir);
 assert.equal(await page.locator('.modal.sheet .home-nav,.modal.sheet .segmented').count(),0,'one category, no side bar');
 assert.deepEqual(await page.locator('.template-grid > .template-card, .template-grid .custom-card').allInnerTexts().then(x=>x.map(v=>v.trim())),['Blank presentation','Essencial'],'Blank first, then the templates');
 await page.locator('.custom-card .template-art iframe.preview').waitFor();
 assert.equal(await page.locator('.template-grid > .template-card').count(),1,'Blank cannot be renamed or deleted');assert.equal(await page.locator('.template-grid .custom-card').getByRole('button',{name:'Renomear template'}).count(),1);
 assert.equal(await page.getByPlaceholder('Sem título').count(),0,'no name field');assert.equal(await page.getByText('Clique duas vezes',{exact:false}).count(),0,'no double-click hint');
 await page.locator('.custom-card').filter({hasText:'Essencial'}).locator('.template-card').click();assert.equal(await page.locator('.tab').count(),0,'a single click only selects');
 await page.locator('.modal.sheet').getByRole('button',{name:'Criar',exact:true}).click();
 await page.locator('.slide-canvas iframe').waitFor();await page.locator('.tab').filter({hasText:'Sem título'}).waitFor();assert.deepEqual(await fs.readdir(projectDir),[],'no file before the first save');
 {const h1=page.frameLocator('.slide-canvas iframe').locator('h1');await page.frameLocator('.slide-canvas iframe').locator('html[data-esf-ready=true]').waitFor();for(let last='',i=0;i<40;i++){const b=JSON.stringify(await h1.boundingBox());if(b===last)break;last=b;await page.waitForTimeout(100);}
  await h1.filter({hasText:'Título da apresentação'}).click();await page.frameLocator('.slide-canvas iframe').locator('h1[contenteditable]').waitFor();await h1.evaluate(el=>getSelection().selectAllChildren(el));await page.keyboard.type('Apresentação de teste');await page.keyboard.press('Escape');
  await h1.filter({hasText:'Apresentação de teste'}).waitFor();await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.tab').filter({hasText:'Apresentacao-de-teste'}).waitFor();}
 for(let i=0;i<50&&!(await menuEnabled())['Slides/Novo slide'];i++)await page.waitForTimeout(50);assert.equal((await menuEnabled())['Arquivo/Exportar…'],true,'menu enabled with a presentation');
 assert.deepEqual(await fs.readdir(projectDir),['Apresentacao-de-teste.esf'],'a single file with a lowercase extension, no project folder');assert.ok((await zipEntries(esf)).includes('manifest.json'));
 const [toolbarBox,tabsBox]=[await page.locator('.toolbar').boundingBox(),await page.locator('.tabs').boundingBox()];
 assert.ok(toolbarBox.y<tabsBox.y,'toolbar above the tabs');
 await page.locator('.app-header .app-wordmark img.app-logo').waitFor();
 // The logo opens edukors.org in the browser.
 await page.locator('.app-wordmark').click();{let text='';for(let i=0;i<40&&!text;i++){text=await fs.readFile(env.ESF_EXTERNAL_LOG,'utf8').catch(()=>'');if(!text)await page.waitForTimeout(50);}assert.equal(text,'https://edukors.org\n');}assert.equal(await page.locator('.provider-badge').count(),0);
 await page.frameLocator('.slide-canvas iframe').locator('h1').filter({hasText:'Apresentação de teste'}).waitFor();
 await page.getByRole('button',{name:'Novo slide',exact:true}).click();await page.locator('.layout-pick .template-card').first().waitFor();await shot(page,'01a-layouts.png');await page.locator('.layout-pick .template-card').filter({hasText:'Cartões'}).dblclick();
 await page.waitForFunction(()=>document.querySelectorAll('.slide-item').length===2);
 // Slide master view: bases and layouts have separate tabs; the canvas edits the selected item.
 {const toggle=viewToggle(),c=page.frameLocator('.slide-canvas iframe'),ready=()=>c.locator('html[data-esf-ready=true]').waitFor();
  // It opens on the layout of the current slide.
  await toggle.click();await page.locator('.master-rail .layout-item.selected button[aria-label="Cartões"]').waitFor();
  assert.equal(await page.locator('.master-rail .layout-item').count(),3,'all layouts in their tab');
  assert.equal(await page.getByRole('tab',{name:'Layouts',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('.master-rail .master-item').count(),0);
  {const actions=await page.locator('.master-rail .rail-tools').boundingBox(),list=await page.locator('.master-rail .slide-list').boundingBox();assert.ok(actions.y+actions.height<=list.y,'master toolbar above the list');}
  await page.getByRole('tab',{name:'Layouts',exact:true}).press('ArrowLeft');assert.equal(await page.getByRole('tab',{name:'Bases',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('.master-rail .layout-item').count(),0);
  await page.locator('.master-rail .master-item .master-preview').click();await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:'Bases',exact:true}).getAttribute('aria-selected'),'true','list navigation stays in current tab');
  await page.getByRole('tab',{name:'Bases',exact:true}).press('ArrowRight');
  assert.equal(await page.getByRole('button',{name:'Novo slide',exact:true}).count(),0,'no slide tools');assert.equal(await page.locator('.notes-bar').count(),0,'no notes');
  assert.equal(await page.locator('.modal').count(),0,'no code dialog');await page.locator('.statusbar').getByText('Slide mestre · Cartões').waitFor();assert.equal(await page.locator('.master-hint,.master-language').count(),0,'no hint or language');
  await page.locator('.master-rail .layout-item button[aria-label="Capa"]').click();await page.locator('.master-rail .layout-item.selected button[aria-label="Capa"]').waitFor();
  // The previous item's frame can still be ready: wait for this layout's title and for it to stop moving (fit after fonts).
  await c.locator('h1').waitFor();await ready();for(let last='',i=0;i<40;i++){const b=JSON.stringify(await c.locator('h1').boundingBox());if(b===last)break;last=b;await page.waitForTimeout(100);}
  await c.locator('h1').click();await c.locator('h1[contenteditable]').waitFor();await c.locator('h1').evaluate(el=>getSelection().selectAllChildren(el));await page.keyboard.type('Capa do layout');await page.keyboard.press('Escape');
  await c.locator('h1').filter({hasText:'Capa do layout'}).waitFor();
  await page.getByRole('tab',{name:'Bases',exact:true}).click();await page.locator('.master-rail .master-item .master-preview').click();await page.locator('.master-rail .master-item.selected').waitFor();await ready();
  await page.getByRole('button',{name:'Inserir texto',exact:true}).click();await c.locator('[data-manual=text][contenteditable]').waitFor();await page.keyboard.type('Rodapé mestre');await page.keyboard.press('Escape');
  await c.locator('[data-manual=text]').filter({hasText:'Rodapé mestre'}).waitFor();await shot(page,'01b-master.png');
  await toggle.click();await page.locator('.master-rail').waitFor({state:'detached'});await page.locator('.notes-bar').waitFor();await ready();
  // Master objects are drawn on every slide, behind the content, and cannot be selected there; new slides start from the edited layout.
  await c.locator('.esf-master').filter({hasText:'Rodapé mestre'}).waitFor();assert.equal(await c.locator('.esf-master [data-esf-edit]').count(),0,'master objects not selectable on slides');
  await page.getByRole('button',{name:'Novo slide',exact:true}).click();await page.locator('.layout-pick .template-card').filter({hasText:'Capa'}).click();await page.getByRole('button',{name:'Inserir',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.slide-item').length===3);await c.locator('h1').filter({hasText:'Capa do layout'}).waitFor();
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'Desfazer',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.slide-item').length===2);await ready();assert.equal(await c.locator('.esf-master').count(),0,'undo restores the master');
  await page.locator('.slide-item').nth(1).locator('button').click();}
 // Layout objects are locked on the slides, like the master's, and a change to the layout reaches every slide that uses it.
 {const c=page.frameLocator('.slide-canvas iframe'),toggle=viewToggle(),ready=()=>c.locator('html[data-esf-ready=true]').waitFor();
  await page.locator('.slide-item').first().locator('button').click();await toggle.click();await page.locator('.master-rail .layout-item.selected button[aria-label="Capa"]').waitFor();await c.locator('h1').waitFor();await ready();
  await page.getByRole('button',{name:'Inserir texto',exact:true}).click();await c.locator('[data-manual=text][contenteditable]').waitFor();await page.keyboard.type('Faixa do layout');await page.keyboard.press('Escape');
  await c.locator('[data-manual=text]').filter({hasText:'Faixa do layout'}).waitFor();await toggle.click();await page.locator('.master-rail').waitFor({state:'detached'});await ready();
  const band=c.locator('[data-from-layout][data-manual=text][data-esf-locked]').filter({hasText:'Faixa do layout'});await band.waitFor();
  const style=await band.getAttribute('style'),b=await band.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+80,b.y+b.height/2+40,{steps:6});await page.mouse.up();await page.waitForTimeout(400);
  assert.equal(await band.getAttribute('style'),style,'a layout object does not move on the slide');
  const title=c.locator('h1[data-from-layout],[data-from-layout] h1').first();await title.click();await c.locator('h1[contenteditable]').waitFor();await page.keyboard.press('Escape');
  for(let i=0;i<6&&await c.locator('[data-from-layout][data-manual]').count();i++){await page.getByRole('button',{name:'Desfazer',exact:true}).click();await page.waitForTimeout(300);}
  assert.equal(await c.locator('[data-manual]').count(),0,'undo removes it from the layout and the slides');
  await page.locator('.slide-item').nth(1).locator('button').click();await ready();}
 // Masters and layouts are added, renamed in place and deleted in the slide master view; at least one of each remains.
 {const toggle=viewToggle(),rail=page.locator('.master-rail');
  await toggle.click();await rail.locator('.layout-item.selected button[aria-label="Cartões"]').waitFor();
  await page.getByRole('button',{name:'Novo layout',exact:true}).click();await rail.locator('.layout-item.selected button[aria-label="Layout 4"]').waitFor();
  await rail.locator('.layout-item.selected span.item-name').dblclick();{const input=rail.locator('input.item-name');await input.fill('Fechamento');await input.press('Enter');}
  await rail.locator('.layout-item.selected button[aria-label="Fechamento"]').waitFor();
  await page.evaluate(()=>{window.__confirm=window.confirm;window.confirm=()=>true;});
  await page.getByRole('button',{name:'Excluir layout',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.master-rail .layout-item').length===3);
  // A new master is only a new main slide (layouts are shared); the user chooses the active one, which every slide uses.
  await rail.getByRole('tab',{name:'Bases',exact:true}).click();await page.getByRole('button',{name:'Nova base',exact:true}).click();await rail.locator('.master-item.selected button[aria-label="Base 2"]').waitFor();
  assert.equal(await rail.locator('.master-item').count(),2);assert.equal(await rail.locator('.layout-item').count(),0,'layouts hidden in Bases');assert.equal(await rail.locator('.active-master').count(),1);
  {const item=rail.locator('.master-item').first(),preview=await item.locator('.master-preview').boundingBox(),check=await item.locator('.master-activate').boundingBox();assert.ok(check.y>=preview.y+preview.height,'base check stays below the slide preview');}
  assert.equal(await rail.locator('.rail-tools .master-activate').count(),0);assert.equal(await rail.locator('.master-activate[aria-pressed=true]').count(),1);
  const paper=()=>page.frameLocator('.slide-canvas iframe').locator('.slide').evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.getByRole('button',{name:'Usar esta base: Base 2',exact:true}).click();await rail.locator('.active-master button[aria-label="Base 2 (Ativa)"]').waitFor();
  await rail.getByRole('tab',{name:'Layouts',exact:true}).click();assert.equal(await rail.locator('.layout-item').count(),3,'no new layouts');await rail.locator('.layout-item button[aria-label="Capa"]').click();await page.frameLocator('.slide-canvas iframe').locator('h1').waitFor();assert.equal(await paper(),'rgb(255, 255, 255)','layouts use the active master');
  await rail.getByRole('tab',{name:'Bases',exact:true}).click();await page.getByRole('button',{name:'Usar esta base: Mestre',exact:true}).click();await rail.locator('.active-master button[aria-label="Mestre (Ativa)"]').waitFor();assert.equal(await rail.getByRole('button',{name:'Usar esta base: Mestre',exact:true}).getAttribute('aria-pressed'),'true');await page.screenshot({path:path.join(root,'01c-base-check.png'),animations:'disabled'});
  await rail.locator('.master-item button[aria-label="Base 2"]').click();
  await page.getByRole('button',{name:'Excluir base',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.master-rail .master-item').length===1);
  assert.equal(await page.getByRole('button',{name:'Excluir base',exact:true}).isDisabled(),true,'the last master stays');
  await page.evaluate(()=>{window.confirm=window.__confirm;});await toggle.click();await rail.waitFor({state:'detached'});
  // Each slide has a layout, changed from the status bar: its texts go to the new layout's fields.
  const c=page.frameLocator('.slide-canvas iframe');
  await page.locator('.statusbar .layout-name').filter({hasText:'Cartões'}).click();await page.locator('.layout-pick .template-card').filter({hasText:'Capa'}).click();await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  await page.locator('.statusbar .layout-name').filter({hasText:'Capa'}).waitFor();await c.locator('h1').filter({hasText:'Título do slide'}).waitFor();
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await page.locator('.statusbar .layout-name').filter({hasText:'Cartões'}).waitFor();
  await c.locator('html[data-esf-ready=true]').waitFor();}
 // Direct editing on the canvas: a click puts the caret in the text, Esc commits it (one undo step); there is no content form.
 const canvas=page.frameLocator('.slide-canvas iframe'),readyCanvas=()=>canvas.locator('html[data-esf-ready=true]').waitFor(),inner=loc=>loc.evaluate(el=>el.innerHTML.replace(/ data-esf-[\w-]+="[^"]*"/g,'')),caretEnd=el=>{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);};
 assert.equal(await page.getByRole('button',{name:'Editar conteúdo'}).count(),0,'no content form');
 // A click before the new frame is ready lands on the iframe element of the window instead.
 await readyCanvas();await canvas.locator('h2').first().click();await canvas.locator('h2[contenteditable]').waitFor();
 await canvas.locator('h2').first().evaluate(el=>getSelection().selectAllChildren(el));await page.keyboard.type('Aprender fazendo');await page.keyboard.press('Escape');
 await canvas.locator('h2').filter({hasText:'Aprender fazendo'}).waitFor();
 await page.locator('.slide-item.selected button[aria-label$=": Aprender fazendo"]').waitFor();
 if(!process.argv.includes('--without-legacy-canvas')){
 // Inside a card (a visible box) the first click selects the card, the second goes down to the text and edits it.
 // Enter is a new line (<br>); the edited text keeps the layout field.
 await canvas.locator('[data-field="body0"]').click();await canvas.locator('[data-esf-ui=sel]:visible').waitFor();assert.equal(await canvas.locator('[contenteditable]').count(),0,'card selected, not edited');
 await canvas.locator('[data-field="body0"]').click();await canvas.locator('[data-field="body0"][contenteditable]').waitFor();await canvas.locator('[data-field="body0"]').evaluate(el=>getSelection().selectAllChildren(el));
 await page.keyboard.type('Linha X');await page.keyboard.press('Enter');await page.keyboard.type('Linha Y');await page.keyboard.press('Escape');
 await canvas.locator('[data-field="body0"]').filter({hasText:'Linha Y'}).waitFor();
 assert.equal(await inner(canvas.locator('[data-field="body0"]')),'Linha X<br>Linha Y');
 // Dragging moves an element with the CSS translate property, in slide units; Delete removes the selected element.
 {await readyCanvas();await page.keyboard.down('Alt');const box=await canvas.locator('h2').first().boundingBox();await page.mouse.move(box.x+20,box.y+2);await page.mouse.down();await page.mouse.move(box.x+120,box.y+2+60,{steps:6});await page.mouse.up();
  await page.keyboard.up('Alt');await canvas.locator('h2[style*="translate"]').waitFor();
  const moved=await canvas.locator('h2').first().boundingBox();assert.ok(Math.abs(moved.x-box.x-100)<3&&Math.abs(moved.y-box.y-60)<3,`moved ${box.x},${box.y} → ${moved.x},${moved.y}`);}
 await canvas.locator('[data-esf-ui=sel]:visible').waitFor();await shot(page,'02-editor.png');
 await page.keyboard.press('Delete');
 await canvas.locator('h3').first().waitFor();assert.equal(await canvas.locator('h2').count(),0,'title deleted');assert.equal(await page.locator('.slide-item').count(),2,'Delete on the canvas keeps the slides');
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'Desfazer',exact:true}).click();
 await canvas.locator('h2:not([style])').filter({hasText:'Aprender fazendo'}).waitFor();await canvas.locator('[data-field="body0"]').filter({hasText:'Adicione uma breve explicação.'}).waitFor();
 // Selection band (press on empty space): objects fully inside are selected; dragging one moves them all, as one undo step.
 {await readyCanvas();const cards=await canvas.locator('.cards').boundingBox();await page.mouse.move(cards.x-8,cards.y+cards.height+12);await page.mouse.down();await page.mouse.move(cards.x+cards.width+8,cards.y-8,{steps:6});await page.mouse.up();
  assert.equal(await canvas.locator('[data-esf-ui=sel]:visible').count(),3,'band selects the three cards');await shot(page,'02b-multi.png');assert.equal(await canvas.locator('[contenteditable]').count(),0);
  const card=await canvas.locator('.card').nth(1).boundingBox();await page.mouse.move(card.x+card.width/2,card.y+12);await page.mouse.down();await page.mouse.move(card.x+card.width/2+40,card.y+52,{steps:5});await page.mouse.up();
  await canvas.locator('.card[style*="translate"]').nth(2).waitFor();assert.equal(await canvas.locator('h2[style]').count(),0,'title not moved');assert.equal(await canvas.locator('[data-esf-ui=sel]:visible').count(),3,'selection kept after the change');
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('.card').first().waitFor();assert.equal(await canvas.locator('.card[style]').count(),0);}
 // Gesture regressions: cancellation restores the DOM, Shift locks an axis, Alt bypasses snapping.
 {await page.keyboard.press('Escape');await canvas.locator('.card').first().click({position:{x:12,y:12}});
  const card=canvas.locator('.card').first(),box=await card.boundingBox(),start=await card.getAttribute('style');
  await page.mouse.move(box.x+12,box.y+12);await page.mouse.down();await page.mouse.move(box.x+82,box.y+65,{steps:5});
  await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await card.getAttribute('style'),start,'Escape restores original inline position');
  assert.equal(await canvas.locator('[data-esf-ui=guide]:visible').count(),0,'cancel clears guides');
  await page.mouse.move(box.x+12,box.y+12);await page.mouse.down();await page.mouse.move(box.x+72,box.y+60,{steps:5});
  await card.evaluate(el=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
  await page.mouse.up();assert.equal(await card.getAttribute('style'),start,'pointer cancellation also restores position');
  await page.keyboard.down('Shift');await page.keyboard.down('Alt');
  // The selection border starts a move even with Shift held (Shift+object click toggles selection).
  const grip=await canvas.locator('[data-esf-ui=sel]:visible [data-esf-edge=n]').boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2+73,grip.y+grip.height/2+24,{steps:5});
  const live=await card.boundingBox();assert.ok(Math.abs(live.y-box.y)<1,'Shift preserves the vertical position');assert.ok(Math.abs(live.x-box.x-73)<1,'Alt preserves free horizontal displacement');
  await page.mouse.up();await page.keyboard.up('Shift');await page.keyboard.up('Alt');await canvas.locator('.card[style*="translate"]').waitFor();
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('.card:not([style])').nth(2).waitFor();
  await page.keyboard.press('Escape');await card.click({position:{x:12,y:12}});
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Tab');
  await canvas.locator('.card[style*="translate"]').waitFor();
  assert.match(await card.getAttribute('style'),/translate: 1px(?: 0px)?/,'nudge survives an immediate selection change');
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('.card:not([style])').nth(2).waitFor();
 }
 // Shift+click adds objects; Delete removes the whole selection.
 await canvas.locator('.card').nth(0).click({position:{x:12,y:12}});await canvas.locator('.card').nth(2).click({position:{x:12,y:12},modifiers:['Shift']});
 assert.equal(await canvas.locator('[data-esf-ui=sel]:visible').count(),2);await page.keyboard.press('Delete');
 await canvas.locator('.card').nth(1).waitFor({state:'detached'});assert.equal(await canvas.locator('.card').count(),1);
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('.card').nth(2).waitFor();
 // Slide without data-field (as written by the AI): each visible text block is editable; <br> stays a new line and inline formatting (colors, bold) is kept.
 await app.evaluate(({clipboard},slide)=>clipboard.writeText(JSON.stringify({format:'esf-slides',deckId:'other',slides:[slide],assets:[],masterCss:'',masterHtml:''})),{id:'raw',title:'Sem marcação',layoutId:'blank',html:'<section class="slide"><h2>Sem   marcação</h2><p>Linha A<br>Linha <b>B</b> <span style="color: rgb(204, 0, 0);">vermelha</span></p></section>',css:'',script:'',staticHtml:'',notes:''});
 await page.locator('.rail-tools').getByRole('button',{name:'Colar',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.slide-item').length===3);
 await readyCanvas();await canvas.locator('p').filter({hasText:'Linha A'}).click();await canvas.locator('p[contenteditable]').evaluate(caretEnd);await page.keyboard.type(' fim');await page.keyboard.press('Escape');
 await canvas.locator('p').filter({hasText:'fim'}).waitFor();
 {const html=await inner(canvas.locator('p'));assert.match(html,/^Linha A<br>Linha <b>B<\/b> <span style="color: rgb\(204, 0, 0\);">vermelha( fim)?<\/span>( fim)?$/,html);assert.ok(!/contenteditable/.test(html),html);}
 // Image without a layout slot: free on the current slide, selected, removable with Delete; Delete only removes slides when the rail has focus.
 {const image=path.join(root,'imagem.png');await fs.writeFile(image,tinyPng);await app.evaluate(({dialog},file)=>{globalThis.__open=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},image);
  await page.getByRole('button',{name:'Colar imagem',exact:true}).click();await canvas.locator('img[style*="absolute"]').waitFor({state:'attached'});
  assert.equal(await page.locator('.slide-item').count(),3,'no new slide for the image');await app.evaluate(({dialog})=>{dialog.showOpenDialog=globalThis.__open;});
  await readyCanvas();const img=canvas.locator('img'),originalStyle=await img.getAttribute('style'),originalBox=await img.boundingBox();
  await canvas.locator('[data-esf-ui=resize]:visible').nth(3).waitFor();
  const resizeCorner=async(dx,dy)=>{const h=await canvas.locator('[data-esf-ui=resize][data-corner=se]').boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+dx,h.y+h.height/2+dy,{steps:6});};
  await resizeCorner(60,60);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await img.getAttribute('style'),originalStyle,'Escape restores image dimensions');
  await resizeCorner(60,60);await page.mouse.up();await canvas.locator('img[style*="box-sizing"]').waitFor();
  const resized=await img.boundingBox();assert.ok(resized.width>originalBox.width+40,'image grows with corner drag');assert.ok(Math.abs(resized.width/resized.height-originalBox.width/originalBox.height)<.01,'aspect ratio kept');
  assert.ok(Math.abs(resized.x-originalBox.x)<1&&Math.abs(resized.y-originalBox.y)<1,'opposite corner stays fixed even for a centered image');
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('img:not([style*="box-sizing"])').waitFor();
  assert.equal(await img.getAttribute('style'),originalStyle,'resize is one undo step');
  await page.getByRole('button',{name:'Refazer',exact:true}).click();await canvas.locator('img[style*="box-sizing"]').waitFor();
  // Reproduce focus moving out of the iframe: Delete still removes the selected object, never the slide.
  await page.locator('.toolbar').evaluate(el=>{el.tabIndex=-1;el.focus();});
  await page.keyboard.press('Delete');await canvas.locator('img').waitFor({state:'detached'});await canvas.locator('p').filter({hasText:'fim'}).waitFor();}
 await page.locator('.slide-item button').nth(2).click();await page.keyboard.press('Delete');await page.waitForFunction(()=>document.querySelectorAll('.slide-item').length===2);
 assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.slide-item.selected')),true,'focus stays on the slide list after Delete');
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.slide-item').length===3);
 await page.locator('.slide-item button').nth(2).click();await page.locator('.rail-tools').getByRole('button',{name:'Excluir',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.slide-item').length===2);
 await page.locator('.slide-item button').nth(1).click();await canvas.locator('h2').filter({hasText:'Aprender fazendo'}).waitFor();
 // Images nested in styled/data-field wrappers, inline SVG and CSS backgrounds all expose resize handles on the first click.
 {const data='data:image/png;base64,'+tinyPng.toString('base64');
  const html=`<section class="slide"><div data-field="picture" style="position:absolute;left:100px;top:200px;background:#ddd;padding:20px"><img id="nested-image" data-field="photo" src="${data}" style="width:240px;height:160px"></div><svg id="vector-image" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:500px;top:200px;width:240px;height:160px" viewBox="0 0 240 160"><rect width="240" height="160" fill="blue"/></svg><div id="background-image" style="position:absolute;left:900px;top:200px;width:240px;height:160px;background-image:url('${data}');background-size:cover"></div><p id="text-box" style="position:absolute;left:100px;top:520px;width:600px;font-size:32px;margin:0">Uma caixa de texto que quebra em linhas</p></section>`;
  await app.evaluate(({clipboard},slide)=>clipboard.writeText(JSON.stringify({format:'esf-slides',deckId:'other',slides:[slide],assets:[],masterCss:'',masterHtml:''})),{id:'resize-fixture',title:'Resize fixtures',layoutId:'blank',html,css:'div[data-esf-ui]{display:none!important}',script:'',staticHtml:'',notes:''});
  await page.locator('.rail-tools').getByRole('button',{name:'Colar',exact:true}).click();await canvas.locator('#nested-image').waitFor();
  for(const id of ['nested-image','vector-image','background-image']){
    // The frame scales the slide only after fonts and images load (and after each reload); click once the object stops moving.
    const object=canvas.locator('#'+id);await page.keyboard.press('Escape');
    for(let last='',i=0;i<40;i++){const b=JSON.stringify(await object.boundingBox());if(b===last)break;last=b;await page.waitForTimeout(100);}
    await object.click();
    assert.equal(await canvas.locator('[data-esf-ui=resize]:visible').count(),4,`${id}: first click exposes four handles despite slide CSS`);
    assert.equal(await canvas.locator('[contenteditable]').count(),0,'media data-fields never enter text editing');
    const before=await object.boundingBox(),h=await canvas.locator('[data-esf-ui=resize][data-corner=se]').boundingBox();
    await page.mouse.move(h.x+5,h.y+5);await page.mouse.down();await page.mouse.move(h.x+65,h.y+45,{steps:6});await page.mouse.up();
    await canvas.locator('#'+id+'[style*="box-sizing"]').waitFor();const after=await object.boundingBox();assert.ok(after.width>before.width+30,`${id} resizes`);
    assert.ok(Math.abs(after.width/after.height-before.width/before.height)<.01,'ratio preserved');
    await page.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('#'+id+':not([style*="box-sizing"])').waitFor();
  }
  // PowerPoint-style text hit zones: interior selects characters, borders move the object.
  {const box=canvas.locator('#text-box');await page.keyboard.press('Escape');
   await box.evaluate(()=>getSelection().removeAllRanges());
   const b=await box.boundingBox(),cursor=()=>box.evaluate(el=>getComputedStyle(el).cursor);
   await page.mouse.move(b.x+b.width/3,b.y+2);assert.equal(await cursor(),'move','unselected text border offers move');
   await page.mouse.move(b.x+12,b.y+b.height/4);assert.equal(await cursor(),'text','text interior offers editing');
   await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/4,{steps:8});await page.mouse.up();
   assert.ok(await box.evaluate(()=>getSelection().toString().length>0),'first drag in text selects characters');
   assert.equal(await box.evaluate(el=>el.style.translate),'','selecting characters never moves the box');
   assert.equal(await canvas.locator('[data-esf-ui] i').count(),0,'no extra move square');
   const edge=await canvas.locator('[data-esf-ui=sel]:visible [data-esf-edge=n]').boundingBox();
   const x=edge.x+edge.width/3,y=edge.y+edge.height/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.keyboard.down('Alt');await page.mouse.move(x+48,y+24,{steps:6});await page.mouse.up();await page.keyboard.up('Alt');
   await canvas.locator('#text-box[style*="translate"]').waitFor();
   assert.equal(await canvas.locator('[contenteditable]').count(),0,'border drag exits text editing');
   const moved=await box.boundingBox();assert.ok(Math.abs(moved.x-b.x-48)<2&&Math.abs(moved.y-b.y-24)<2,'border moves by pointer displacement');
   await page.keyboard.press('Delete');await box.waitFor({state:'detached'});
   await page.getByRole('button',{name:'Desfazer',exact:true}).click();await box.waitFor();
   await page.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('#text-box:not([style*="translate"])').waitFor();
  }
  // Text boxes: corners and sides resize freely; narrower boxes wrap and grow with the text (min-height, never a fixed height).
  {const box=canvas.locator('#text-box');await page.keyboard.press('Escape');await box.click();
   assert.equal(await canvas.locator('[data-esf-ui=resize]:visible').count(),8,'text box exposes corner and side handles');
   const before=await box.boundingBox(),h=await canvas.locator('[data-esf-ui=resize][data-corner=e]').boundingBox();
   await page.mouse.move(h.x+5,h.y+5);await page.mouse.down();await page.mouse.move(h.x-before.width/2,h.y+40,{steps:6});await page.mouse.up();
   await canvas.locator('#text-box[style*="min-height"]').waitFor();const after=await box.boundingBox(),style=await box.getAttribute('style');
   assert.ok(after.width<before.width*.6,'text box narrows');assert.ok(after.height>before.height*1.5,'text wraps and the box grows');
   assert.ok(Math.abs(after.x-before.x)<1&&Math.abs(after.y-before.y)<1,'west side and top stay fixed');assert.match(style,/height: auto/);
   assert.equal(await canvas.locator('[contenteditable]').count(),0,'resizing ends text editing');
   await page.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('#text-box:not([style*="min-height"])').waitFor();}
  await shot(page,'02c-resize-types.png');await page.locator('.rail-tools').getByRole('button',{name:'Excluir',exact:true}).click();
  await page.locator('.slide-item button').nth(1).click();await canvas.locator('h2').filter({hasText:'Aprender fazendo'}).waitFor();
 }
 }
 await page.getByRole('button',{name:'Fechar assistente de IA',exact:true}).first().click();assert.equal(await page.locator('.ai-sidebar').count(),0);
 await page.getByRole('button',{name:'Abrir assistente de IA',exact:true}).click();
 await page.getByRole('button',{name:'Configurações',exact:true}).first().click();
 await page.getByRole('radio',{name:'English en'}).check();await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
 await page.getByRole('radio',{name:'Español es'}).check();await page.getByRole('heading',{name:'Configuración',exact:true}).waitFor();
 await page.getByRole('radio',{name:'Português pt'}).check();
 await shot(page,'03-settings.png');
 assert.equal(await page.getByText('Reabrir apresentações',{exact:false}).count(),0,'no reopen option');
 await page.getByRole('button',{name:'Assistente de IA',exact:true}).click();
 // Accounts come from the AI library (here its fake provider); a new account signs in at once and, being the first, is the one in use.
 await page.getByRole('button',{name:'Adicionar conta',exact:true}).click();await page.getByRole('radio',{name:'Fake AI',exact:true}).click();
 await page.getByLabel('Nome da conta').fill('Conta de teste');await page.getByRole('button',{name:'Criar conta',exact:true}).click();
 await page.locator('.account-card .provider-status').filter({hasText:/^Conectada/}).waitFor({timeout:30000});await shot(page,'03b-accounts.png');
 assert.notEqual(await page.locator('.active-account select').inputValue(),'','the first account becomes the one in use');
 assert.equal(await page.locator('.modal.sheet').getByRole('button',{name:'Templates',exact:true}).count(),0,'templates live in the New gallery');
 // Advanced always holds the instructions, the user's MCP servers and the skills, in this order.
 await page.locator('.assistant-advanced summary').click();
 assert.deepEqual(await page.locator('.assistant-advanced h3').allInnerTexts(),['Instruções para o agente','Servidores MCP','Skills']);
 await page.getByLabel('Servidores MCP',{exact:true}).fill('{oops');await page.locator('.mcp-problems').waitFor();await page.getByLabel('Servidores MCP',{exact:true}).fill('');await page.locator('.mcp-problems').waitFor({state:'detached'});
 await page.getByText('Nenhuma skill na pasta.').waitFor();await page.getByRole('button',{name:'Abrir pasta de skills'}).click();
 await page.getByLabel('Global',{exact:true}).fill('Use frases curtas.');
 // The presentation's own prompt sits in a second tab and goes into the package (ai/system-prompt.md), not into templates.
 await page.getByRole('tab',{name:'Esta apresentação'}).click();await page.getByLabel('Esta apresentação',{exact:true}).fill('Palestra para professores.');assert.equal(await page.getByText('O agente trabalha dentro',{exact:false}).count(),0);
 assert.equal(await page.locator('.toolbar').count(),1,'settings open as a modal over the editor');await page.locator('.modal.sheet').getByRole('button',{name:'Fechar',exact:true}).click();await page.locator('.modal.sheet').waitFor({state:'detached'});
 // Templates: saved from the File menu, renamed and deleted in the New gallery.
 await app.evaluate(({Menu})=>{Menu.getApplicationMenu().items.find(x=>x.label==='Arquivo').submenu.items.find(x=>x.label==='Salvar como template…').click();});
 {const input=page.getByLabel('Nome do template');assert.equal(await input.inputValue(),'Apresentacao-de-teste');await input.fill('Meu modelo');await input.press('Enter');}await page.locator('.toast').filter({hasText:'Template salvo'}).waitFor();
 const templateDirs=async()=>(await fs.readdir(path.join(env.ESF_DATA_DIR,'templates'))).filter(x=>!x.startsWith('.')&&x!=='essencial');
 {const dirs=await templateDirs();assert.equal(dirs.length,1);assert.ok((await zipEntries(path.join(env.ESF_DATA_DIR,'templates',dirs[0],'template.ESF'))).includes('manifest.json'),'templates are ESF packages');assert.ok(!(await zipEntries(path.join(env.ESF_DATA_DIR,'templates',dirs[0],'template.ESF'))).includes('ai/system-prompt.md'),'templates leave the talk prompt out');assert.equal(JSON.parse(await fs.readFile(path.join(env.ESF_DATA_DIR,'templates',dirs[0],'template.json'),'utf8')).title,'Meu modelo');}
 await page.locator('.toolbar').getByRole('button',{name:'Nova apresentação',exact:true}).click();
 {const card=name=>page.locator('.template-grid .custom-card').filter({hasText:name});
  await card('Meu modelo').getByRole('button',{name:'Renomear template'}).click();{const input=page.locator('.template-grid input[aria-label="Renomear template"]');await input.fill('Modelo final');await input.press('Enter');}await card('Modelo final').waitFor();
  await page.evaluate(()=>{window.__confirm=window.confirm;window.confirm=()=>true;});await card('Modelo final').getByRole('button',{name:'Excluir template'}).click();await card('Modelo final').waitFor({state:'detached'});
  assert.equal((await templateDirs()).length,0,'template folder deleted');await page.evaluate(()=>{window.confirm=window.__confirm;});
  await page.keyboard.press('Escape');await page.locator('.modal.sheet').waitFor({state:'detached'});}
 await page.getByRole('button',{name:'Salvar',exact:true}).click();
 await page.getByRole('button',{name:'Exportar',exact:true}).click();
 await shot(page,'04-export.png');
 await page.getByRole('button',{name:'Exportar HTML',exact:true}).click();
 await page.locator('.toast').filter({hasText:'Exportação concluída: Apresentacao-de-teste.html'}).waitFor({timeout:20000});await page.locator('.modal').waitFor({state:'detached'});
 assert.deepEqual(await app.evaluate(()=>globalThis.__boxes),[],'no alert after exporting');
 const htmlFile=path.join(projectDir,'Apresentacao-de-teste.html');assert.ok(!(await zipEntries(esf)).some(n=>n.startsWith('exports/')),'no copy of the export inside the package');
 assert.match(await fs.readFile(htmlFile,'utf8'),/<title>Apresentacao-de-teste\.html<\/title>/,'export named after the .ESF, title = file name');assert.equal(await page.locator('.export-fields').count(),0);
 await fs.access(htmlFile);
 const requests=[];app.context().on('request',r=>{if(!/^(file|data|about|blob|esf-frame):/.test(r.url()))requests.push(r.url());});
 const opened=app.waitForEvent('window');
 await app.evaluate(({BrowserWindow},file)=>{const show=process.env.ESF_HIDDEN!=='1',web={sandbox:true,contextIsolation:true,backgroundThrottling:show};const w=new BrowserWindow({width:1280,height:760,useContentSize:true,show,webPreferences:web});w.webContents.setWindowOpenHandler(()=>({action:'allow',overrideBrowserWindowOptions:{show,webPreferences:web}}));void w.loadFile(file);},htmlFile);
 const player=await opened;player.on('pageerror',e=>log.push('player: '+e.message));
 const at=(slide,step)=>player.waitForFunction(([a,b])=>document.body.dataset.slide===a&&(!b||document.body.dataset.step===b),[slide,step]);
 await at('1/2');assert.equal(await player.locator('html').getAttribute('lang'),'en');assert.match(await player.locator('#credit').innerText(),/^Made with Edukors Slides Editor/);assert.equal(await player.locator('#motion-enable').innerText(),'Enable animations');
 // Hot corners are the corners of the slide stage, as in the reference player.
 const corner=async top=>{const b=await player.locator('#stage').boundingBox();await player.mouse.move(b.x+6,top?b.y+6:b.y+b.height-6);};
 await player.mouse.click(1000,380);await at('2/2','0/3');                 // click on the right half of the slide
 await player.keyboard.press('ArrowRight');await at('2/2','1/3');
 await player.keyboard.press('ArrowLeft');await player.keyboard.press('ArrowLeft');await at('1/2');
 await player.keyboard.press('End');await at('2/2');
 // Bottom dock opens from the hot corner; hovering a dot shows a real preview of that slide.
 await corner(false);await player.locator('#track button').first().hover();
 await player.locator('#preview.on .frame iframe:not([hidden])').waitFor();
 await player.frameLocator('#preview .frame iframe:not([hidden])').locator('h1').filter({hasText:'Apresentação de teste'}).waitFor();
 await shot(player,'05a-player-preview.png');
 // Pen draws on the ink layer; the whiteboard keeps objects and stores the session in this browser.
 await player.mouse.move(640,380);await player.keyboard.press('p');
 assert.equal(await player.evaluate(()=>document.documentElement.dataset.tool),'pen');
 await player.mouse.move(500,300);await player.mouse.down();await player.mouse.move(700,420,{steps:8});await player.mouse.up();
 assert.ok(await player.evaluate(()=>{const c=document.getElementById('ink');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v=>v>0);}),'pen stroke drawn');
 await player.keyboard.press('w');await player.locator('#wb-bar').waitFor();
 await player.mouse.move(400,300);await player.mouse.down();await player.mouse.move(600,350,{steps:6});await player.mouse.up();
 await player.waitForFunction(()=>{try{return Object.keys(localStorage).filter(k=>k.startsWith('esf-session:')).some(k=>JSON.parse(localStorage.getItem(k)).whiteboard.items.length===1);}catch{return false;}});
 // One infinite board: scrolling moves the view, and what is drawn next lands further down the board.
 await player.mouse.move(640,380);await player.mouse.wheel(0,600);
 await player.mouse.move(400,300);await player.mouse.down();await player.mouse.move(600,350,{steps:6});await player.mouse.up();
 await player.waitForFunction(()=>{try{return Object.keys(localStorage).filter(k=>k.startsWith('esf-session:')).some(k=>{const w=JSON.parse(localStorage.getItem(k)).whiteboard;return w.y>0&&w.items.length===2&&w.items[1].pts[0][1]>w.items[0].pts[0][1]+w.y-1;});}catch{return false;}});
 await shot(player,'05b-player-board.png');
 await player.keyboard.press('w');
 // Presenter panel opens in another window with every slide and the current one marked.
 const panelOpened=app.waitForEvent('window');
 await corner(true);await player.locator('#presenter-btn').click();
 const panel=await panelOpened;await panel.locator('.overview-card').nth(1).waitFor();
 assert.equal(await panel.locator('.overview-card').count(),2);await panel.locator('.overview-card.here').filter({hasText:'Aprender fazendo'}).waitFor();
 await panel.getByRole('button',{name:'← Previous'}).click();await at('1/2');await panel.locator('.overview-card.here').filter({hasText:'Apresentação de teste'}).waitFor();
 assert.ok(await panel.evaluate(()=>outerWidth)<=377+16,'panel opens 377 px wide');
 await panel.locator('.overview-card').nth(1).locator('.mini-frame').click({position:{x:12,y:12}});await panel.waitForTimeout(300);
 await panel.locator('.overview-card.here').filter({hasText:'Apresentação de teste'}).waitFor();          // clicking the card itself does not navigate
 await panel.locator('.overview-card').nth(1).getByRole('button',{name:/Go to slide 2/}).click();await at('2/2');
 await panel.getByRole('button',{name:'← Previous'}).click();await at('1/2');
 await panel.frameLocator('.overview-card:nth-child(2) iframe').locator('h2').filter({hasText:'Aprender fazendo'}).waitFor({timeout:8000}).catch(async e=>{
   for(const f of panel.frames())console.log('PANELFRAME',f.url(),await f.evaluate(()=>{const h=document.querySelector('h2');return[document.body?.innerHTML.length,h?.textContent,JSON.stringify(h?.getBoundingClientRect()),h&&getComputedStyle(h).opacity,document.querySelector('.slide')?.getAttribute('style'),innerWidth,innerHeight];}).catch(x=>x.message.slice(0,80)));
   throw e;});await shot(panel,'05c-presenter-panel.png');await panel.close();
 assert.equal(requests.length,0,requests.join('\n'));await shot(player,'05-player.png');await player.close();
 await page.getByRole('button',{name:'Exportar',exact:true}).click();await page.getByRole('button',{name:'PDF Uma página por slide'}).click();
 await page.getByRole('button',{name:'Exportar PDF',exact:true}).click();
 await page.locator('.toast').filter({hasText:'Apresentacao-de-teste.pdf'}).waitFor({timeout:30000});
 await fs.access(path.join(projectDir,'Apresentacao-de-teste.pdf'));
 await page.getByRole('button',{name:'Exportar',exact:true}).click();await page.getByRole('button',{name:'PPTX Slides como imagens'}).click();
 await page.getByRole('button',{name:'Exportar PPTX',exact:true}).click();
 await page.locator('.toast').filter({hasText:'Apresentacao-de-teste.pptx'}).waitFor({timeout:30000});
 await fs.access(path.join(projectDir,'Apresentacao-de-teste.pptx'));await page.locator('.modal').waitFor({state:'detached'});
 // Native menu clipboard: copy slide 2, paste after it, then undo the paste.
 const menuClick=(top,item)=>app.evaluate(({Menu},[top,item])=>{Menu.getApplicationMenu().items.find(x=>x.label===top).submenu.items.find(x=>x.label===item).click();},[top,item]);
 await page.locator('.slide-item button').nth(1).click();
 await menuClick('Editar','Copiar');await menuClick('Editar','Colar');
 await page.waitForFunction(()=>document.querySelectorAll('.slide-item').length===3);
 await page.locator('.slide-item.selected').nth(0).locator('button[aria-label$=": Aprender fazendo"]').waitFor();
 assert.match(await page.locator('.slide-item').nth(2).locator('button').getAttribute('aria-label'),/: Aprender fazendo$/);assert.equal(await page.locator('.slide-caption').count(),0,'no caption under thumbnails');
 await menuClick('Editar','Desfazer');await page.waitForFunction(()=>document.querySelectorAll('.slide-item').length===2);
 // Reordering keeps both thumbnails rendered.
 await page.locator('.slide-item button').first().click();await page.getByRole('button',{name:'Mover para baixo'}).click();
 await page.locator('.slide-item').first().locator('button[aria-label$=": Aprender fazendo"]').waitFor();
 await page.frameLocator('.slide-item:nth-child(1) iframe').locator('h2').filter({hasText:'Aprender fazendo'}).waitFor();
 await page.frameLocator('.slide-item:nth-child(2) iframe').locator('h1').filter({hasText:'Apresentação de teste'}).waitFor();
 await page.getByRole('button',{name:'Mover para cima'}).click();
 await page.locator('.slide-item').first().locator('button[aria-label$=": Apresentação de teste"]').waitFor();
 // In-app presentation: navigation only, no annotation tools.
 const presentOpened=app.waitForEvent('window');await page.getByRole('button',{name:'Apresentar',exact:true}).click();
 const present=await presentOpened;await present.locator('#track button').first().waitFor({state:'attached'});
 assert.equal(await present.locator('#top-bar,#wb,#ink').count(),0);await present.close();
 // AI flow, against the library's fake provider: attach, pick a model, a change the app rejects, the web tools, a valid change
 // applied when the turn ends, a question, sessions, undo. The fake reads its command from the request's last paragraph.
 {await page.locator('.slide-item button').first().click();
 const manifest=JSON.parse(await zipText(esf,'manifest.json')),cover=manifest.slides[0].id,coverHtml=await zipText(esf,manifest.slides[0].html);
 const ask=async(text,wait)=>{const box=page.getByPlaceholder('Peça uma alteração…');await box.fill(text);await box.press('Enter');await page.locator('.chat-list').getByText(wait,{exact:false}).last().waitFor({timeout:40000});await page.locator('.composer .send').waitFor();};
 const attachment=path.join(root,'anexo.png');await fs.copyFile(path.resolve('build/icon.png'),attachment).catch(()=>fs.writeFile(attachment,tinyPng));
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},attachment);
 await page.getByRole('button',{name:'Anexar arquivo'}).click();await page.locator('.context-chip.attachment').filter({hasText:'anexo.png'}).waitFor();
 await page.locator('.model-button').click();await page.getByRole('radio',{name:'Fake Deep'}).click();await page.locator('.model-pop input[type=range]').fill('3');await page.locator('.model-button').filter({hasText:'Fake Deep · Alto'}).waitFor();await shot(page,'05-model.png');await page.keyboard.press('Escape');await page.locator('.model-pop').waitFor({state:'detached'});
 // A slide script that never finishes is rejected by the app's check; the agent is told, and nothing changes.
 await ask('tool apply_changes '+JSON.stringify({slideUpdates:[{id:cover,script:'while(true){}'}]}),'Not applied');
 for(const text of ['Iniciando assistente…','Sessão iniciada · Fake AI','Validando e renderizando os slides alterados…','A resposta não passou na validação; pedindo uma correção…'])await page.locator('.activity').filter({hasText:text}).first().waitFor();
 assert.equal(await page.locator('.context-chip.attachment').count(),0,'attachments clear after sending');
 await page.locator('.slide-item button[aria-label$=": Apresentação de teste"]').waitFor();
 // The web tools save into the presentation folder only.
 await ask('tool download '+JSON.stringify({url:origin+'/logo.png',path:'media/logo.png'}),'Saved media/logo.png');
 await ask('tool screenshot '+JSON.stringify({url:origin+'/pagina',path:'media/pagina',width:800,height:450,delay:0}),'Saved media/pagina.png');
 await ask('tool download '+JSON.stringify({url:origin+'/logo.png',path:'slides/x.png'}),'belongs to the app');
 // A valid change: a new title and the downloaded image as an asset, applied as one step when the turn ends.
 await ask('tool apply_changes '+JSON.stringify({message:'Feito pela IA',slideUpdates:[{id:cover,title:'Título pela IA',html:coverHtml.replace(/<h1([^>]*)>[^<]*<\/h1>/,'<h1$1>Título pela IA</h1><img src="asset:asset-mock-logo" alt="">')}],assets:[{id:'asset-mock-logo',path:'media/logo.png'}]}),'Accepted');
 await page.locator('.slide-item button[aria-label$=": Título pela IA"]').waitFor();await page.frameLocator('.slide-canvas iframe').locator('img').waitFor({state:'attached'});
 assert.equal(await page.locator('.composer-account select').count(),1,'account picker is also available in the assistant');
 await page.locator('.usage-tokens').waitFor();assert.equal(await page.locator('.usage').filter({hasText:'Consumo desta conversa'}).count(),0);
 // The agent asks during its turn; an option answers it and the turn goes on.
 const box=page.getByPlaceholder('Peça uma alteração…');await box.fill('ask');await box.press('Enter');
 await page.locator('.questions legend').filter({hasText:'Which color?'}).waitFor({timeout:40000});
 await page.locator('.question-options button').filter({hasText:'blue'}).click();await shot(page,'06a-questions.png');await page.getByRole('button',{name:'Enviar respostas'}).click();
 await page.getByText('You chose blue').waitFor({timeout:40000});await page.locator('.questions .answered').waitFor();
 await page.locator('.activity').filter({hasText:'Enviando para a sessão atual…'}).first().waitFor();await page.locator('.activity').filter({hasText:'Sessão retomada'}).first().waitFor();
 assert.equal(JSON.parse(await fs.readFile(path.join(env.ESF_DATA_DIR,'preferences.json'),'utf8')).attachDir,root,'last attach folder remembered');
 assert.match(await fs.readFile(env.ESF_EXTERNAL_LOG,'utf8'),/skills/,'the skills folder opens');
 {const handle=await page.locator('.ai-resize').boundingBox(),before=(await page.locator('.ai-sidebar').boundingBox()).width;
  await page.mouse.move(handle.x+3,handle.y+200);await page.mouse.down();await page.mouse.move(handle.x+53,handle.y+200,{steps:5});await page.mouse.up();
  // Narrowing works on any screen (CI runners have small displays that leave no room to widen).
  const after=(await page.locator('.ai-sidebar').boundingBox()).width;assert.ok(Math.abs(before-after-50)<3,`sidebar narrowed ${before}→${after}`);}
 await shot(page,'06-ai.png');
 await page.getByRole('button',{name:'Nova sessão'}).click();await page.locator('.chat-empty').waitFor();
 await page.getByRole('button',{name:'Sessões anteriores'}).click();
 await page.locator('.session-item').filter({hasText:'tool apply_changes'}).locator('button').first().click();
 await page.getByText('You chose blue').waitFor();
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();
 await page.locator('button[aria-label$=": Apresentação de teste"]').waitFor();
 await page.getByRole('button',{name:'Desfazer',exact:false}).first().waitFor();}
 // The conversation is written (and marks the presentation modified) shortly after the chat changes.
 await page.locator('.statusbar .dirty').waitFor();await page.waitForTimeout(1000);
 await page.getByRole('button',{name:'Salvar',exact:true}).click();
 await page.locator('.statusbar .saved').waitFor();
 // Only the presentation and the conversations are saved inside the package (not the assistant's own files nor exports); no project folder appears.
 {const files=await unzip(esf),names=Object.keys(files);assert.ok(names.includes('.edukors/ai/conversations.json'),'conversations in the package');for(const n of ['media/logo.png','media/pagina.png','research/fontes.md','exports/Apresentacao-de-teste.pptx'])assert.ok(!names.includes(n),n+' left out of the package');
  assert.ok(!names.some(n=>/^\.edukors\/(?!ai\/conversations\.json$)/.test(n)),'no internal state in the package');
  assert.deepEqual((await fs.readdir(projectDir)).sort(),['Apresentacao-de-teste.esf','Apresentacao-de-teste.html','Apresentacao-de-teste.pdf','Apresentacao-de-teste.pptx']);}
 // Inserted text: the format bar keeps the canvas selection (its menus never take the focus) and colors only the selected word.
 // Selecting the box never moves the canvas, so a press-and-drag on a new selection moves it. Objects copy, paste and cut.
 {assert.equal(typeof await page.evaluate(()=>window.api.invoke('clipboardText')),'string','clipboard text reachable from the UI');
  const canvas=page.frameLocator('.slide-canvas iframe'),box=canvas.locator('[data-manual=text]'),menu=c=>app.evaluate(({BrowserWindow},c)=>BrowserWindow.getAllWindows()[0].webContents.send('command',c),c);
  const bar=await page.locator('.manual-toolbar').boundingBox();
  await page.getByRole('button',{name:'Inserir texto',exact:true}).click();await canvas.locator('[data-manual=text][contenteditable]').waitFor();await page.keyboard.type('Hello world');
  assert.deepEqual(await page.locator('.manual-toolbar').boundingBox(),bar,'the format bar keeps its row');assert.ok(bar.height<50,'format bar in one line');
  await box.evaluate(el=>{const t=el.firstChild,r=document.createRange();r.setStart(t,6);r.setEnd(t,11);getSelection().removeAllRanges();getSelection().addRange(r);});
  await page.locator('.manual-toolbar .pick-button[aria-label="Cor do texto"]').click();assert.equal(await box.evaluate(()=>getSelection().toString()),'world','selection kept while the menu is open');
  await page.locator('.pick-menu button[aria-label="Vermelho"]').click();await canvas.locator('[data-manual=text] span[style*="color"]').filter({hasText:/^world$/}).waitFor();
  // Formatting reloads the frame, which restores the selection; slow machines may still be swapping frames here.
  const selected=async()=>{for(let i=0,v;;i++){v=await box.evaluate(()=>getSelection().toString()).catch(e=>{if(!/detached|destroyed/.test(e.message))throw e;});if(v==='world'||i>=50)return v;await page.waitForTimeout(100);}};
  assert.equal(await selected(),'world','selection kept after the color');
  await page.locator('.manual-toolbar .format-button.bold').click();await canvas.locator('[data-manual=text] b').filter({hasText:/^world$/}).waitFor();
  // After the bold the frame reloads; a click while it reloads is lost, so click again until the text leaves editing.
  for(let i=0;;i++){await canvas.locator('html[data-esf-ready=true]').waitFor();const c=await page.locator('.slide-canvas').boundingBox();await page.mouse.click(c.x+5,c.y+5);
   try{await canvas.locator('[data-manual=text][contenteditable]').waitFor({state:'detached',timeout:5000});break;}catch(e){if(i===4)throw e;}}
  const b0=await box.boundingBox(),x=b0.x+30,y=b0.y+1;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+50,y+30,{steps:8});await page.mouse.up();
  await canvas.locator('[data-manual=text][style*="translate"]').waitFor();const b1=await box.boundingBox();assert.ok(Math.abs(b1.x-b0.x-50)<6&&Math.abs(b1.y-b0.y-30)<6,`text box moved ${b0.x},${b0.y} → ${b1.x},${b1.y}`);
  await menu('copy');await page.waitForTimeout(200);await menu('paste');await page.waitForFunction(()=>true);await canvas.locator('[data-manual=text]').nth(1).waitFor();
  await menu('cut');await canvas.locator('[data-manual=text]').nth(1).waitFor({state:'detached'});assert.equal(await canvas.locator('[data-manual=text]').count(),1,'cut removes the pasted copy');
  // ⌘D duplicates the selected box (not the slide); every handle resizes, even over the move strip; Delete works after a toolbar checkbox.
  {const slides=await page.locator('.slide-item').count();const bb=await box.boundingBox();await page.mouse.click(bb.x+20,bb.y+1);await canvas.locator('[data-esf-ui=resize][data-corner=n]:visible').waitFor();
   await menu('duplicate');await canvas.locator('[data-manual=text]').nth(1).waitFor();assert.equal(await page.locator('.slide-item').count(),slides,'⌘D on the canvas does not duplicate the slide');
   const one=canvas.locator('[data-manual=text]').nth(1),b0=await one.boundingBox(),h=await canvas.locator('[data-esf-ui=resize][data-corner=n]').boundingBox();
   await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2,h.y+h.height/2-30,{steps:6});await page.mouse.up();
   for(let i=0;i<50&&(await one.boundingBox()).height-b0.height<=20;i++)await page.waitForTimeout(100);const b1=await one.boundingBox();assert.ok(b1.height-b0.height>20,`n handle resizes (${b0.height} → ${b1.height})`);
   await page.locator('.manual-check',{hasText:'Sombra'}).locator('input').click();await canvas.locator('[data-manual=text][style*="box-shadow"]').waitFor();
   await page.keyboard.press('Delete');await canvas.locator('[data-manual=text]').nth(1).waitFor({state:'detached'});}
  // A link is plain text; its caption replaces the URL; the QR code is a separate 360 px image that can be cropped by dragging.
  {await page.getByRole('button',{name:'Inserir link',exact:true}).click();const link=canvas.locator('[data-manual=link]');await link.waitFor();
   await page.getByLabel('Legenda').fill('Meu site');await page.getByLabel('Legenda').press('Enter');await link.locator('a').filter({hasText:/^Meu site$/}).waitFor();
   assert.ok(!/(^|; )border(-width|-color)?:|background/.test(await link.getAttribute('style')),'no card around the link');
   {let l=await link.boundingBox();for(let i=0;i<30;i++){await page.waitForTimeout(100);const n=await link.boundingBox();if(JSON.stringify(n)===JSON.stringify(l))break;l=n;}
    await page.mouse.move(l.x+30,l.y+l.height/2);await page.mouse.down();await page.mouse.move(l.x+90,l.y+l.height/2+40,{steps:8});await page.mouse.up();
    await canvas.locator('[data-manual=link][style*="translate"]').waitFor();assert.equal(await canvas.locator('[data-esf-ui=resize]:visible').count(),8,'the link box moves and has resize handles');}
   await page.locator('.manual-check',{hasText:'QR code'}).locator('input').check();const qr=canvas.locator('img[data-link-qr]');await qr.waitFor();
   assert.equal(await qr.evaluate(el=>!!el.closest('[data-manual=link]')),false,'QR outside the link box');assert.match(await qr.getAttribute('style'),/width: 360px; height: 360px/);
   // The frame places the slide once its images load; wait for the position to settle before clicking.
   let q=await qr.boundingBox();for(let i=0;i<30;i++){await page.waitForTimeout(100);const n=await qr.boundingBox();if(JSON.stringify(n)===JSON.stringify(q))break;q=n;}
   await page.mouse.click(q.x+q.width/2,q.y+q.height/2);await page.getByRole('button',{name:'Cortar imagem',exact:true}).click();
   const g=await canvas.locator('[data-esf-ui=cropgrip][data-corner=nw]').boundingBox();await page.mouse.move(g.x+5,g.y+5);await page.mouse.down();await page.mouse.move(g.x+5+q.width*.2,g.y+5+q.height*.25,{steps:6});await page.mouse.up();
   await page.getByRole('button',{name:'Cortar imagem',exact:true}).click();await canvas.locator('img[data-link-qr][style*="clip-path: inset(25% 0% 0% 20%)"]').waitFor();}
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.locator('.statusbar .saved').waitFor();}
 await page.waitForTimeout(1200);
}catch(e){for(const [i,w] of app.windows().entries())await w.screenshot({path:path.join(root,`failure-${i}.png`)}).catch(()=>{});throw e;}
finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
// Opening the .ESF by path (as Finder does) must open it, with its conversation, from the package alone.
app=await launch(esf);
try{
 const page=watch(await app.firstWindow());
 await page.locator('.tab').filter({hasText:'Apresentacao-de-teste'}).waitFor();assert.match(await page.locator('.app-version').innerText(),/^v\d+\.\d+\.\d+$/);
 if(!win){await page.locator('.workbench').click({position:{x:5,y:5}});await page.keyboard.press('End');await page.locator('.slide-item').last().and(page.locator('.selected')).waitFor();await page.keyboard.press('Home');await page.locator('.slide-item').first().and(page.locator('.selected')).waitFor();
 {const ids=()=>page.locator('.slide-item').evaluateAll(l=>l.map(x=>x.dataset.id));const before=await ids();await page.keyboard.press('Meta+ArrowDown');await page.locator('.slide-item').nth(1).and(page.locator('.selected')).waitFor();assert.deepEqual(await ids(),[before[1],before[0],...before.slice(2)],'Cmd+Down moves the slide');await page.keyboard.press('Meta+ArrowUp');await page.locator('.slide-item').first().and(page.locator('.selected')).waitFor();assert.deepEqual(await ids(),before,'Cmd+Up moves it back');}
 {const selectAll=()=>app.evaluate(({Menu})=>{Menu.getApplicationMenu().items.find(x=>x.label==='Editar').submenu.items.find(x=>x.label==='Selecionar tudo').click();});
  await page.locator('.slide-item').first().locator('button').click();await selectAll();await page.waitForFunction(()=>document.querySelectorAll('.slide-item.selected').length===document.querySelectorAll('.slide-item').length);
  await page.locator('.slide-item').first().locator('button').click();await page.locator('.slide-canvas iframe').click({position:{x:4,y:4}});await page.locator('.slide-rail.inactive').waitFor();await selectAll();await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>getSelection().toString()),'','Cmd+A on the canvas does not select the window');assert.equal(await page.locator('.slide-item.selected').count(),1,'Cmd+A on the canvas keeps the slide selection');}}
 assert.equal(await page.locator('.tab').count(),1,'reopen + file argument must not duplicate the tab');
 await page.getByText('You chose blue').waitFor();
 assert.ok((await zipText(esf,'.edukors/ai/conversations.json')).includes('You chose blue'),'conversations are stored in the package');
 await page.getByRole('button',{name:process.platform==='darwin'?'Mostrar no Finder':'Mostrar na pasta'}).waitFor();
 await page.locator('.statusbar button').filter({hasText:'Minha pasta'}).waitFor();
 await page.frameLocator('.slide-canvas iframe').locator('h1').filter({hasText:'Apresentação de teste'}).waitFor();
 await page.frameLocator('.slide-item:nth-child(2) iframe').locator('h2').filter({hasText:'Aprender fazendo'}).waitFor();
 await shot(page,'07-reopened.png');
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:true,log,projectDir},null,2));
 assert.equal(log.length,0,log.join('\n'));
 console.log('E2E passed:',root);
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
webServer.close();
