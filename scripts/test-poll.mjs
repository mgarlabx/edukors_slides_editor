// The file:// player and its real sandbox/CSP, with the existing HTTPS protocol mocked.
// This verifies the browser client, not availability of the production server.
import {_electron as electron} from 'playwright';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=path.resolve('test-results/poll-browser-'+Date.now());
await fs.mkdir(root,{recursive:true});
await build({entryPoints:['tests/poll-fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'fixture.mjs')});
const {html,htmlFor}=await import(pathToFileURL(path.join(root,'fixture.mjs')).href),file=path.join(root,'activity.html');await fs.writeFile(file,html);
const env={...process.env,ESF_DATA_DIR:path.join(root,'appdata'),ESF_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
await fs.mkdir(env.ESF_DATA_DIR,{recursive:true});await fs.writeFile(path.join(env.ESF_DATA_DIR,'preferences.json'),JSON.stringify({language:'pt',profiles:[],recent:[],activeProfile:''}));
const packaged=process.argv.includes('--packaged')?path.resolve('release/Edukors Slides Editor.app/Contents/MacOS/Edukors Slides Editor'):undefined;
const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:['.'],env,timeout:30000});
let testPage;
const calls=[],rooms=new Map(),tokens=new Set(),errors=[],KEY='EDK-TEST-KEY1-2345',ENDPOINT='https://poll.example.org/q.php';let fail='',networkDown=false,foreignRequests=0,serial=0;
try{
  const editor=await app.firstWindow();editor.setDefaultTimeout(15000);await editor.locator('.empty-desk').waitFor();
  await editor.getByRole('button',{name:'Nova apresentação',exact:true}).click();await editor.locator('.template-card').filter({hasText:'Blank presentation'}).dblclick();await editor.locator('.slide-canvas iframe').waitFor();
  // Settings: blank by default; the address is validated and only a valid one (or none) is kept.
  await editor.getByRole('button',{name:'Configurações',exact:true}).click();await editor.getByRole('button',{name:'Perguntas interativas',exact:true}).click();
  const server=editor.getByLabel('Servidor das perguntas interativas',{exact:true});assert.equal(await server.inputValue(),'');assert.equal(await editor.getByRole('button',{name:'Testar conexão',exact:true}).isDisabled(),true);
  await server.fill('http://example.org/poll');await editor.getByRole('alert').filter({hasText:'https://'}).waitFor();await editor.screenshot({path:path.join(root,'00-settings-invalid.png')});
  await server.fill('https://school.example/poll/');await editor.waitForTimeout(300);assert.equal(JSON.parse(await fs.readFile(path.join(env.ESF_DATA_DIR,'preferences.json'),'utf8')).pollServer,'https://school.example/poll');
  await server.fill('');await editor.waitForTimeout(300);assert.equal(JSON.parse(await fs.readFile(path.join(env.ESF_DATA_DIR,'preferences.json'),'utf8')).pollServer,undefined);await editor.keyboard.press('Escape');
  await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(m=>m.label==='Inserir').submenu.items.find(m=>m.label==='Pergunta interativa').click());
  const dialog=editor.getByRole('dialog',{name:'Pergunta interativa'});await dialog.waitFor();await editor.screenshot({path:path.join(root,'00-type-selector.png')});assert.match(await dialog.locator('.poll-editor-server').innerText(),/nenhum/);await dialog.getByLabel('Pergunta',{exact:true}).fill('Como aprendemos?');await dialog.getByLabel('Alternativas A').fill('Experimentando');await dialog.getByLabel('Alternativas B').fill('Conversando');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();
  const canvas=editor.frameLocator('.slide-canvas iframe');await canvas.locator('.esf-poll h2').filter({hasText:'Como aprendemos?'}).waitFor();assert.equal(await canvas.locator('.poll-qr svg').count(),1);assert.equal(await canvas.locator('.poll-qr.is-blurred').count(),1);assert.equal(await canvas.locator('.poll-lock:disabled').count(),1);await editor.getByRole('button',{name:'Desfazer',exact:true}).click();await canvas.locator('.esf-poll').waitFor({state:'detached'});await editor.getByRole('button',{name:'Refazer',exact:true}).click();await canvas.locator('.esf-poll').waitFor();
  await editor.screenshot({path:path.join(root,'00-editor.png')});
  // In-app Present: the key dialog works and accepts a paste. Playwright's Meta+V bypasses the native menu, so this
  // does not exercise the menu accelerator that index.ts intercepts with before-input-event; that needs a manual check.
  await editor.getByRole('button',{name:'Configurações',exact:true}).click();await editor.getByRole('button',{name:'Perguntas interativas',exact:true}).click();await editor.getByLabel('Servidor das perguntas interativas',{exact:true}).fill('https://poll.example.org');await editor.waitForTimeout(300);await editor.keyboard.press('Escape');
  {const shown=app.waitForEvent('window');await editor.getByRole('button',{name:'Apresentar',exact:true}).click();const present=await shown;present.setDefaultTimeout(15000);
    const start=present.frameLocator('#stage > .frame.on').getByRole('button',{name:'Iniciar',exact:true});await start.focus();await present.keyboard.press('Space');await present.locator('#poll-key').waitFor();
    assert.equal(await present.locator('#poll-key-title').innerText(),'Chave do apresentador');await app.evaluate(({clipboard},k)=>clipboard.writeText(k),KEY);await present.locator('#poll-key-input').focus();await present.keyboard.press('Meta+V');
    await present.waitForFunction(k=>document.getElementById('poll-key-input').value===k,KEY,{timeout:5000});await present.keyboard.press('Escape');await present.locator('#poll-key').waitFor({state:'hidden'});
    await present.evaluate(()=>window.close());}
  const windowReady=app.waitForEvent('window');await app.evaluate(async({BrowserWindow})=>{const w=new BrowserWindow({show:false,width:1440,height:950,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});await w.loadURL('about:blank');});const page=testPage=await windowReady;page.setDefaultTimeout(10000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});console.log('Browser launched');
  await page.route(ENDPOINT,async route=>{
    const req=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','content-type':'application/json'};
    if(networkDown){await route.abort();return;}
    if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers,body:''});return;}
    const b=req.postDataJSON(),reply=(status,body)=>route.fulfill({status,headers,body:JSON.stringify(body)});calls.push(b);
    if(fail===b.proc)return reply(500,{error:'server_error',detail:'Internal SQL detail'});
    if(b.proc==='auth'){if(b.key!==KEY)return reply(401,{error:'invalid_key'});const token=(++serial).toString(16).padStart(64,'0');tokens.add(token);return reply(200,{data:{token,expiresAt:Date.now()+12*3600e3}});}
    if(!tokens.has(b.token))return reply(401,{error:'session_expired'});
    if(b.proc==='prepare'){const room='R'+String(++serial).padStart(5,'0');rooms.set(room,{type:b.type,meta:b.meta,status:0,count:0,rows:[]});return reply(200,{data:{room,url:'https://poll.example.org/r/?room='+room}});}
    const r=rooms.get(b.room);if(!r)return reply(404,{error:'room_not_found'});
    if(b.proc==='open')r.status=1;if(b.proc==='close')r.status=0;
    return reply(200,{data:b.proc==='count'?{responses:r.count,status:r.status}:b.proc==='results'?r.rows:b.proc==='export'?{type:r.type,meta:r.meta,rows:r.answers||[]}:'ok'});
  });
  await page.route('https://example.com/**',route=>{foreignRequests++;return route.abort();});
  await page.goto(pathToFileURL(file).href);console.log('Local HTML loaded');await page.evaluate(()=>localStorage.clear());await page.reload();
  const active=()=>page.frameLocator('#stage > .frame.on');
  // Playwright's locator coordinates omit the ancestor scale for these srcdoc frames.
  // Send a real mouse click using viewport rectangles measured on each side of the frame.
  const button=name=>{const loc=active().getByRole('button',{name,exact:true});return{waitFor:options=>loc.waitFor(options),isVisible:()=>loc.isVisible(),click:async()=>{
    await loc.waitFor();const p=await loc.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};});const f=await page.locator('#stage > .frame.on').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});await page.mouse.click(f.x+p.x*f.w/p.w,f.y+p.y*f.h/p.h);
  }};};
  await button('Start').waitFor();assert.equal(calls.length,0,'opening HTML has no network effects');assert.equal(await active().locator('.poll-qr.is-blurred svg').count(),1);assert.equal(await active().locator('.poll-lock').getAttribute('aria-pressed'),'false');assert.equal((await active().locator('.poll-lock').innerText()).trim(),'');await page.screenshot({path:path.join(root,'00-locked.png'),animations:'disabled'});
  // First start asks for the presenter key in the player (not in the sandboxed slide); a wrong key is refused.
  const keyDialog=page.locator('#poll-key');await button('Start').click();await keyDialog.waitFor();assert.equal(await page.locator('#poll-key-error').isVisible(),false);await page.screenshot({path:path.join(root,'00-key.png')});
  // The eye shows and hides the key; the paste button reads the clipboard.
  const keyInput=page.locator('#poll-key-input');assert.equal(await keyInput.getAttribute('type'),'password');await page.click('#poll-key-eye');assert.equal(await keyInput.getAttribute('type'),'text');assert.equal(await page.locator('#poll-key-eye').getAttribute('aria-label'),'Hide key');await page.click('#poll-key-eye');assert.equal(await keyInput.getAttribute('type'),'password');
  await app.evaluate(({clipboard},k)=>clipboard.writeText('  '+k+'\n'),KEY);await page.click('#poll-key-paste');await page.waitForFunction(k=>document.getElementById('poll-key-input').value===k,KEY,{timeout:3000}).catch(async()=>{throw Error('paste failed: '+await page.evaluate(()=>navigator.clipboard.readText().then(t=>'read '+JSON.stringify(t),e=>String(e))));});
  await page.fill('#poll-key-input','EDK-WRONG');await page.click('#poll-key-ok');await page.locator('#poll-key-error').filter({hasText:'Key not recognized'}).waitFor();assert.equal(rooms.size,0);
  await page.fill('#poll-key-input',KEY);await page.click('#poll-key-ok');await active().locator('.poll-status').filter({hasText:'Receiving responses'}).waitFor();assert.equal(await keyDialog.isVisible(),false);
  const stored=await page.evaluate(()=>({...localStorage}));assert.ok(!JSON.stringify(stored).includes(KEY),'the key is never stored');const sessionValue=JSON.parse(stored['esf-poll-session:v1:https://poll.example.org/q.php']);assert.match(sessionValue.token,/^[0-9a-f]{64}$/);assert.ok(sessionValue.expiresAt>Date.now()+11*3600e3);
  const first=calls.find(c=>c.proc==='prepare'),r=[...rooms.values()][0];assert.equal(first.meta,4);assert.equal(first.type,'quiz');assert.equal(calls.filter(c=>c.proc==='auth').length,2);assert.ok(await active().locator('.poll-qr svg').count());assert.equal(await active().locator('.poll-qr.is-blurred').count(),0);assert.equal(await active().locator('.poll-lock').getAttribute('aria-pressed'),'true');
  r.count=12;r.rows=[{response:'0',responses:'6'},{response:'1',responses:'4'},{response:'2',responses:'2'}];
  await active().locator('.poll-count').filter({hasText:'12'}).waitFor();
  const shot=async name=>{await page.mouse.move(720,35);await page.screenshot({path:path.join(root,name),animations:'disabled'});};
  assert.equal(await active().locator('.poll-live').isVisible(),true);assert.ok(await active().locator('.poll-status').evaluate(el=>el.getBoundingClientRect().width<=1),'status text only for screen readers');assert.equal(await active().locator('.poll-time').count(),0);
  await app.evaluate(({clipboard})=>clipboard.writeText(''));await button('Copy link').click();await active().locator('.poll-copy.is-copied').waitFor();assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),await active().locator('.poll-url').innerText());assert.match(await active().locator('.poll-url').innerText(),/room=/);
  await shot('01-collecting.png');
  // Thumbnails, magnifier and presenter replicas must never prepare/open an extra room.
  const before=calls.filter(c=>c.proc==='prepare').length;
  await page.locator('#track button').nth(1).hover();assert.equal(calls.filter(c=>c.proc==='prepare').length,before);
  await page.locator('#track button').nth(0).hover();
  // Cross-origin results data is rendered by our frame, not inserted as HTML.
  await button('Close responses').click();await button('Show results').waitFor();assert.equal(await active().locator('.poll-lock').getAttribute('aria-pressed'),'false');assert.equal(await active().locator('.poll-qr.is-blurred').count(),1);assert.equal(await active().locator('.poll-lock').isVisible(),false,'no lock over a closed round');assert.equal(await active().locator('.poll-live').isVisible(),false);assert.equal(await active().locator('.poll-status').innerText(),'');assert.equal(await active().locator('.poll-link').isVisible(),false);await button('Show results').click();await active().locator('.poll-bars').waitFor();
  assert.equal(await active().locator('.poll-bar').count(),4);assert.match(await active().locator('.poll-bars').innerText(),/50%/);assert.equal(await active().locator('.poll-bar').nth(3).getAttribute('aria-label'),'D: 0 (0%)');assert.equal(await active().locator('.poll-side').isVisible(),false);assert.equal(await active().locator('.poll-option').first().isVisible(),true);
  await shot('02-quiz-results.png');
  // CSV: a discreet button at the bottom left; the player builds the file (captured here instead of a save dialog).
  r.answers=[{response:'0',at:'2026-10-26T21:00:01Z'},{response:'1',at:'2026-10-26T21:00:02Z'}];
  await page.evaluate(()=>{URL.createObjectURL=b=>{window.__csv=b;return 'blob:test';};HTMLAnchorElement.prototype.click=function(){window.__csvName=this.download;};});
  const csvBox=await active().locator('.poll-csv').boundingBox();const footBox=await active().locator('.poll-footer').boundingBox();assert.ok(csvBox&&footBox&&csvBox.x<=footBox.x+1,'CSV button at the left edge');
  await button('Download responses (CSV)').click();await page.waitForFunction(()=>window.__csv);
  assert.deepEqual(await page.evaluate(async()=>[...new Uint8Array(await window.__csv.arrayBuffer()).slice(0,3)]),[0xef,0xbb,0xbf],'UTF-8 BOM for spreadsheets');assert.equal(await page.evaluate(()=>window.__csv.text()),'Time (UTC),Option,Text\r\n2026-10-26T21:00:01Z,A,Experimentar na prática\r\n2026-10-26T21:00:02Z,B,Discutir em grupo\r\n');assert.match(await page.evaluate(()=>window.__csvName),/^responses-R\d{5}-\d{8}-\d{4}\.csv$/);
  // Icon buttons show their own tooltip (native titles are unreliable inside the scaled frames).
  const refresh=active().getByRole('button',{name:'Refresh results',exact:true});assert.equal(await refresh.getAttribute('title'),null);
  {const p=await refresh.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};});const f=await page.locator('#stage > .frame.on').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});await page.mouse.move(f.x+p.x*f.w/p.w,f.y+p.y*f.h/p.h);}
  await page.waitForTimeout(600);assert.deepEqual(await refresh.evaluate(el=>{const a=getComputedStyle(el,'::after');return[a.content,a.opacity];}),['"Refresh results"','1']);await page.screenshot({path:path.join(root,'02b-tooltip.png'),animations:'disabled'});
  // Frame scripts still cannot fetch, and the player cannot reach arbitrary destinations.
  assert.equal(await page.evaluate(()=>fetch('https://example.com/test').then(()=>true,()=>false)),false);assert.equal(foreignRequests,0);
  assert.equal(await active().locator('.esf-poll').evaluate(()=>fetch('https://poll.example.org/q.php').then(()=>true,()=>false)),false);
  assert.equal(await page.evaluate(()=>fetch('https://poll.example.org/r/r.php').then(()=>true,()=>false)),false);
  assert.equal(await page.evaluate(()=>fetch('https://www.solvertank.tech/solverpoll/q_app.php').then(()=>true,()=>false)),false);
  await page.keyboard.press('ArrowRight');await active().locator('h2').filter({hasText:'Qual palavra'}).waitFor();assert.equal(calls.filter(c=>c.proc==='prepare').length,1);
  await active().getByRole('button',{name:'Start',exact:true}).focus();await page.keyboard.press('Space');await active().locator('.poll-status').filter({hasText:'Receiving responses'}).waitFor();assert.equal(await keyDialog.isVisible(),false,'a live session is reused');const tag=rooms.get(calls.at(-1).room);tag.count=8;tag.rows=[{response:'Aprendizagem',responses:'4'},{response:'Colaboração',responses:'3'},{response:'<img src=x onerror=alert(1)>',responses:'1'}];
  await button('Close responses').click();await button('Show results').click();await active().locator('.poll-cloud').waitFor();assert.equal(await active().locator('.poll-word').count(),3);assert.equal(await active().locator('.poll-results img').count(),0);
  await shot('03-word-cloud.png');await button('Show frequencies').click();assert.equal(await active().locator('.poll-frequency').count(),3);
  await page.keyboard.press('ArrowRight');await active().locator('h2').filter({hasText:'O que você'}).waitFor();
  // A session past its 12 hours is not used: the key is asked again.
  await page.evaluate(()=>{const k='esf-poll-session:v1:https://poll.example.org/q.php',v=JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify({...v,expiresAt:Date.now()-1}));});
  await button('Start').click();await keyDialog.waitFor();await page.fill('#poll-key-input',KEY);await page.click('#poll-key-ok');await active().locator('.poll-status').filter({hasText:'Receiving responses'}).waitFor();
  const post=rooms.get(calls.at(-1).room);post.count=60;post.rows=[{response:'Aprender exige espaço para experimentar.'},{response:'<script>window.pollInjected=true</script>'}];
  // Failed close does not claim the room is closed or expose server diagnostics.
  fail='close';await button('Close responses').click();await active().locator('.poll-error').filter({hasText:'The operation could not be confirmed'}).waitFor();assert.equal(await button('Show results').isVisible(),false);assert.ok(!(await active().locator('.poll-error').innerText()).includes('SQL'));
  fail='';await button('Try again').click();await button('Show results').click();await active().locator('.poll-comments').waitFor();assert.equal(await active().locator('.poll-comment').count(),2);assert.match(await active().locator('.poll-count').innerText(),/60/);assert.match(await active().locator('.poll-limit').innerText(),/^2 /);assert.equal(await active().locator('.poll-results script').count(),0);
  await shot('04-comments.png');
  await page.keyboard.press('ArrowLeft');await active().locator('.poll-cloud,.poll-frequency').first().waitFor();assert.equal(calls.filter(c=>c.proc==='prepare').length,3,'return restores snapshot');
  await page.keyboard.press('ArrowRight');await active().locator('.poll-comments').waitFor();
  // The server ends the session (expired or revoked key): the player says so and asks for the key.
  tokens.clear();page.once('dialog',d=>d.accept());await button('New round').click();await page.locator('#poll-key-error').filter({hasText:'Your session expired'}).waitFor();await page.fill('#poll-key-input',KEY);await page.click('#poll-key-ok');
  await active().locator('.poll-status').filter({hasText:'Receiving responses'}).waitFor();assert.equal(calls.filter(c=>c.proc==='prepare'&&tokens.has(c.token)).length,1);assert.equal(rooms.size,4,'new round opens without pressing Start');assert.equal(await active().locator('.poll-comments').isVisible(),false);assert.notEqual(calls.at(-1).room,first.room);assert.equal(await active().locator('.poll-qr.is-blurred').count(),0);
  // Navigating away closes the current collection before showing the next slide.
  await page.keyboard.press('ArrowRight');await active().getByRole('heading',{name:'Fim da atividade'}).waitFor();assert.equal(calls.at(-1).proc,'count');assert.equal(rooms.get(calls.at(-1).room).status,0);
  assert.ok(calls.every(c=>!('user' in c)&&c.proc!=='q_update'));assert.deepEqual(errors,[]);
  // Exported with no server set: the activity says so and nothing reaches the network.
  const bare=path.join(root,'no-server.html');await fs.writeFile(bare,htmlFor(''));const before2=calls.length;await page.goto(pathToFileURL(bare).href);await page.keyboard.press('Home');
  await active().locator('h2').filter({hasText:'Qual abordagem'}).waitFor();await button('Start').click();await active().locator('.poll-error').filter({hasText:'No interactive questions server is set'}).waitFor();assert.equal(await keyDialog.isVisible(),false);assert.equal(calls.length,before2);await shot('05-no-server.png');
  console.log('PASS file:// player: presenter key (wrong, eye, paste button, paste in Present, stored token, local and server expiry, no server), settings, 3 types, counter, results, isolated rooms, failed close, navigation and CSP. HTTPS responses mocked. Artifacts: '+root);
}catch(e){const page=testPage||await app.firstWindow();console.error('Calls',JSON.stringify(calls));console.error('HTML status',await page.locator('body').getAttribute('data-slide'));await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});console.error('Artifacts: '+root);throw e;}finally{await app.evaluate(({app})=>app.exit()).catch(()=>{});await app.close().catch(()=>{});}
