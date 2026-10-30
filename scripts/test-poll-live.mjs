// Explicit opt-in smoke test against a deployed poll service:
//   ESF_POLL_SERVER=https://your-server/poll ESF_POLL_KEY=EDK-… node scripts/e2e.mjs --poll-live
// Presenter calls run in a file:// page (origin null, real CORS); student answers go from Node, like a phone.
// Creates new rooms with synthetic answers (the service deletes rooms after 30 days). Nothing existing is touched.
import {_electron as electron} from 'playwright';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
const key=process.env.ESF_POLL_KEY,server=(process.env.ESF_POLL_SERVER||'').replace(/\/+$/,'');
if(!server||!key){console.error('Set ESF_POLL_SERVER to your server and ESF_POLL_KEY to one of its presenter keys.');process.exit(1);}
const require=createRequire(import.meta.url),root=path.resolve('test-results/poll-live-'+Date.now());await fs.mkdir(root,{recursive:true});
const file=path.join(root,'probe.html');await fs.writeFile(file,'<!doctype html><meta charset="utf-8"><title>Poll file probe</title><h1>Poll file://</h1>');
const env={...process.env,ESF_ACCEPT_TERMS:'1',ESF_DATA_DIR:path.join(root,'appdata'),ESF_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:require('electron'),args:['.'],env,timeout:30000}),report={date:new Date().toISOString(),browser:'Electron Chromium',origin:'file://',server,tests:[]};
try{
  await app.firstWindow();const next=app.waitForEvent('window');await app.evaluate(async({BrowserWindow})=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});await w.loadURL('about:blank');});const page=await next;await page.goto(pathToFileURL(file).href);
  const presenter=body=>page.evaluate(async({endpoint,body})=>{const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{const r=await fetch(endpoint,{method:'POST',credentials:'omit',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});const v=await r.json().catch(()=>null);if(!r.ok||!v||!('data' in v))throw Error('HTTP '+r.status+' / '+(v?.error||'no JSON'));return v.data;}finally{clearTimeout(timer);}},{endpoint:server+'/q.php',body});
  const student=async body=>{const r=await fetch(server+'/r/r.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json().catch(()=>null);if(!r.ok||!v||!('data' in v))throw Error('student HTTP '+r.status+' / '+(v?.error||'no JSON'));return v.data;};
  if((await presenter({proc:'ping'})).service!=='edukors-poll')throw Error('Not an Edukors poll service');
  const {token,expiresAt}=await presenter({proc:'auth',key});report.tests.push({step:'auth',success:true,hours:Math.round((expiresAt-Date.now())/36e5)});
  for(const type of ['quiz','tag','post']){let room='';
    try{
      const prepared=await presenter({proc:'prepare',token,type,meta:type==='quiz'?2:0});room=prepared.room;await presenter({proc:'open',token,room});
      const status=await student({proc:'status',room});if(status.status!==1||status.type!==type)throw Error('Unexpected student status');
      const answer=type==='quiz'?0:type==='tag'?'Colaboração':'Opinião de teste: colaboração e ação.';
      await student({proc:'respond',room,participant:randomBytes(8).toString('hex'),response:answer});
      await presenter({proc:'close',token,room});const closedRoom=room;room='';
      const count=await presenter({proc:'count',token,room:closedRoom}),rows=await presenter({proc:'results',token,room:closedRoom});
      if(count.responses!==1||!Array.isArray(rows)||rows.length!==1||rows[0].response!==answer)throw Error('Unexpected results');
      report.tests.push({type,success:true,url:prepared.url});
    }catch(e){report.tests.push({type,success:false,error:String(e.message)});}
    finally{if(room)await presenter({proc:'close',token,room}).catch(()=>{});}
  }
  report.success=report.tests.every(t=>t.success);console.log(JSON.stringify(report,null,2));if(!report.success)process.exitCode=1;
}catch(e){report.error=String(e.message);report.success=false;process.exitCode=1;console.error(report.error);}
finally{await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log('Live test report: '+root);await app.evaluate(({app})=>app.exit()).catch(()=>{});await app.close().catch(()=>{});}
