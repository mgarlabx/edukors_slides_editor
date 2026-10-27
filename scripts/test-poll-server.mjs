// Runs the real poll service (PHP + MySQL) locally: creates a throwaway database,
// serves the folder with `php -S`, walks the whole protocol and drops the database.
// Needs `php` and a local MySQL that accepts `mysql -u root` (override with ESF_MYSQL_USER/ESF_MYSQL_PASS).
// Server folder: ESF_POLL_DIR or server/poll (the source of truth). Then an exported HTML opened from file:// (hidden
// Electron window) signs in with a key, opens a room, a student answers on r/ and the presenter sees the result.
import {spawn,execFileSync} from 'node:child_process';
import {_electron as electron} from 'playwright';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=path.resolve(process.env.ESF_POLL_DIR||'server/poll'),root=path.resolve('test-results/poll-server-'+Date.now()),db='edukors_poll_test_'+Date.now();
const user=process.env.ESF_MYSQL_USER||'root',pass=process.env.ESF_MYSQL_PASS||'',port=8000+Math.floor(Math.random()*900);
const sql=(q,database)=>execFileSync('mysql',['-u',user,...pass?['-p'+pass]:[],...database?[database]:[],'-N','-e',q],{encoding:'utf8'});
await fs.mkdir(root,{recursive:true});
const config=path.join(root,'poll.config.php');await fs.writeFile(config,`<?php\n$db_host_poll='127.0.0.1';$db_name_poll='${db}';$db_user_poll='${user}';$db_pass_poll='${pass}';$poll_base_url='';\n`);
sql(`CREATE DATABASE ${db} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
const server=spawn('php',['-S','127.0.0.1:'+port,'-t',dir],{env:{...process.env,EDUKORS_POLL_CONFIG:config},stdio:['ignore','pipe','pipe']});let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
const base=`http://127.0.0.1:${port}`;
const call=async(file,body,origin)=>{const r=await fetch(base+'/'+file,{method:'POST',headers:{'Content-Type':'application/json',...origin?{Origin:origin}:{}},body:JSON.stringify(body)});return{status:r.status,headers:r.headers,json:await r.json().catch(()=>null)};};
try{
  execFileSync('mysql',['-u',user,...pass?['-p'+pass]:[],db],{input:await fs.readFile(path.join(dir,'sql/poll.sql'))});
  for(let i=0;i<50;i++){try{await fetch(base+'/q.php');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  const pre=await fetch(base+'/q.php',{method:'OPTIONS',headers:{Origin:'null','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
  assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'*');assert.match(pre.headers.get('access-control-allow-headers')||'',/Content-Type/i);
  assert.deepEqual((await call('q.php',{proc:'ping'})).json,{data:{service:'edukors-poll',version:1}});
  const created=execFileSync('php',[path.join(dir,'bin/newkey.php'),'Test presenter'],{env:{...process.env,EDUKORS_POLL_CONFIG:config},encoding:'utf8'}),key=created.match(/Key: (EDK-[A-Z0-9-]+)/)[1];
  assert.equal(sql(`SELECT COUNT(*) FROM poll_presenter WHERE key_hash=SHA2('${key}',256)`,db).trim(),'1','only the hash is stored');
  const bad=await call('q.php',{proc:'auth',key:'EDK-WRONG'},'null');assert.equal(bad.status,401);assert.equal(bad.json.error,'invalid_key');
  const auth=await call('q.php',{proc:'auth',key},'null');assert.equal(auth.status,200);const {token,expiresAt}=auth.json.data;assert.match(token,/^[0-9a-f]{64}$/);
  assert.ok(Math.abs(expiresAt-(Date.now()+12*3600e3))<120e3,'session lasts 12 hours');
  assert.equal((await call('q.php',{proc:'prepare',type:'quiz',meta:3})).json.error,'session_expired');
  assert.equal((await call('q.php',{proc:'prepare',token,type:'quiz',meta:9})).json.error,'invalid_meta');
  const quiz=(await call('q.php',{proc:'prepare',token,type:'quiz',meta:3})).json.data;assert.match(quiz.room,/^[A-Z0-9]{6}$/);assert.equal(quiz.url,`${base}/r/?room=${quiz.room}`);
  const participant=n=>('p'+n).padEnd(16,'x');
  assert.equal((await call('r/r.php',{proc:'respond',room:quiz.room,participant:participant(1),response:0})).json.error,'closed');
  assert.equal((await call('q.php',{proc:'open',token,room:quiz.room})).json.data,'ok');
  assert.deepEqual((await call('r/r.php',{proc:'status',room:quiz.room})).json.data,{status:1,type:'quiz',meta:3});
  for(const [n,v] of [[1,0],[2,0],[3,2]])assert.equal((await call('r/r.php',{proc:'respond',room:quiz.room,participant:participant(n),response:v})).status,200);
  assert.equal((await call('r/r.php',{proc:'respond',room:quiz.room,participant:participant(1),response:1})).json.error,'already_responded');
  assert.equal((await call('r/r.php',{proc:'respond',room:quiz.room,participant:participant(4),response:3})).json.error,'invalid_response');
  assert.deepEqual((await call('q.php',{proc:'count',token,room:quiz.room})).json.data,{responses:3,status:1});
  assert.equal((await call('q.php',{proc:'close',token,room:quiz.room})).json.data,'ok');
  assert.deepEqual((await call('q.php',{proc:'results',token,room:quiz.room})).json.data,[{response:0,responses:2},{response:2,responses:1}]);
  const exported=(await call('q.php',{proc:'export',token,room:quiz.room})).json.data;assert.equal(exported.type,'quiz');assert.equal(exported.meta,3);assert.deepEqual(exported.rows.map(r=>r.response).sort(),['0','0','2']);assert.ok(exported.rows.every(r=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(r.at)&&!('participant' in r)));
  // A room belongs to the presenter who prepared it.
  const other=execFileSync('php',[path.join(dir,'bin/newkey.php'),'Other'],{env:{...process.env,EDUKORS_POLL_CONFIG:config},encoding:'utf8'}).match(/Key: (\S+)/)[1];
  const otherToken=(await call('q.php',{proc:'auth',key:other})).json.data.token;assert.equal((await call('q.php',{proc:'results',token:otherToken,room:quiz.room})).status,404);
  for(const type of ['tag','post']){
    const {room}=(await call('q.php',{proc:'prepare',token,type})).json.data;await call('q.php',{proc:'open',token,room});
    const texts=type==='tag'?['Colaboração','Colaboração','Ação 🙂']:['Opinião: aprender fazendo.','ok','<script>x</script>'];
    for(const [i,t] of texts.entries())assert.equal((await call('r/r.php',{proc:'respond',room,participant:participant(10+i),response:t})).status,200);
    await call('q.php',{proc:'close',token,room});const rows=(await call('q.php',{proc:'results',token,room})).json.data;
    if(type==='tag')assert.deepEqual(rows,[{response:'Colaboração',responses:2},{response:'Ação 🙂',responses:1}]);
    else assert.deepEqual(rows,[{response:'Opinião: aprender fazendo.'},{response:'<script>x</script>'}],'short texts are left out, text stays literal');
  }
  sql(`UPDATE poll_presenter SET active=0 WHERE key_hash=SHA2('${key}',256)`,db);assert.equal((await call('q.php',{proc:'count',token,room:quiz.room})).json.error,'session_expired','revoked keys end their sessions');
  const page=await (await fetch(base+'/r/?room='+quiz.room)).text();assert.match(page,/logo\.png/);assert.equal((await fetch(base+'/r/logo.png')).status,200);
  // The exported player, from disk, against this server: real CORS from origin null, real key sign-in.
  await build({entryPoints:['tests/poll-fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'fixture.mjs')});
  const {htmlFor}=await import(pathToFileURL(path.join(root,'fixture.mjs')).href),file=path.join(root,'activity.html');await fs.writeFile(file,htmlFor(base));
  const fresh=execFileSync('php',[path.join(dir,'bin/newkey.php'),'Browser'],{env:{...process.env,EDUKORS_POLL_CONFIG:config},encoding:'utf8'}).match(/Key: (\S+)/)[1];
  const env={...process.env,ESF_DATA_DIR:path.join(root,'appdata'),ESF_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:['.'],env,timeout:30000});
  try{
    const editor=await app.firstWindow();await editor.locator('.empty-desk').waitFor();
    // Settings → Test connection goes through the main process.
    assert.deepEqual(await editor.evaluate(b=>window.api.invoke('pollPing',b),base),{ok:true});assert.equal((await editor.evaluate(b=>window.api.invoke('pollPing',b+'/missing'),base)).ok,false);assert.deepEqual(await editor.evaluate(()=>window.api.invoke('pollPing','http://example.org')),{ok:false,error:'invalid'});
    const next=app.waitForEvent('window');await app.evaluate(async({BrowserWindow})=>{const w=new BrowserWindow({show:false,width:1440,height:950,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});await w.loadURL('about:blank');});
    const page=await next;page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(file).href);
    const active=()=>page.frameLocator('#stage > .frame.on'),press=async name=>{await active().getByRole('button',{name,exact:true}).focus();await page.keyboard.press('Space');};
    await press('Start');await page.locator('#poll-key').waitFor();await page.fill('#poll-key-input',fresh);await page.click('#poll-key-ok');
    await active().locator('.poll-status').filter({hasText:'Receiving responses'}).waitFor();const link=await active().locator('.poll-url').innerText();assert.match(link,new RegExp('^'+base+'/r/\\?room=[A-Z0-9]{6}$'));
    const phoneReady=app.waitForEvent('window');await app.evaluate(async({BrowserWindow})=>{const w=new BrowserWindow({show:false,width:390,height:844,webPreferences:{backgroundThrottling:false}});await w.loadURL('about:blank');});const phone=await phoneReady;phone.setDefaultTimeout(15000);
    await phone.goto(link);await phone.getByRole('button',{name:'B',exact:true}).click();await phone.locator('#r-done:not([hidden])').waitFor();await phone.screenshot({path:path.join(root,'student.png')});
    await active().locator('.poll-count').filter({hasText:'1'}).waitFor();await press('Close responses');await press('Show results');await active().locator('.poll-bars').waitFor();
    assert.equal(await active().locator('.poll-bar').nth(1).getAttribute('aria-label'),'B: 1 (100%)');await page.screenshot({path:path.join(root,'results.png')});
    assert.ok(Object.keys(await page.evaluate(()=>({...localStorage}))).includes('esf-poll-session:v1:'+base+'/q.php'));assert.deepEqual(errors,[]);
  }finally{await app.evaluate(({app})=>app.exit()).catch(()=>{});await app.close().catch(()=>{});}
  console.log('PASS poll server: preflight, ping, key auth (12 h), rooms, ownership, three types, duplicates, closed rooms, revocation, student page, export; settings ping; file:// HTML sign-in, phone answer and results. Artifacts: '+root);
}catch(e){console.error(log);throw e;}
finally{server.kill();try{sql(`DROP DATABASE IF EXISTS ${db}`);}catch{}}
