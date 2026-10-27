import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {newDeck,duplicateSlides,validateDeck} from '../src/shared/model';
import {PollConfig,PollSessionStore,validPoll,createPollController,normalizePollServer,pollEndpoint} from '../src/shared/poll';
import {writeDeck,readDeck,serialize} from '../src/main/projects';
import {playerDocument} from '../src/shared/player';
import {slideDocument} from '../src/shared/render';
import {copySlides,pasteSlides} from '../src/shared/clipboard';
import {applySlideChanges} from '../src/main/ai';
import {qrRuntimeSource,qrSvg} from '../src/shared/qr';

const quiz:PollConfig={version:1,provider:'edukors',type:'quiz',prompt:'Qual opção?',options:['Primeira','Segunda','Terceira']};
const server='https://edukors.org/poll',endpoint=pollEndpoint(server),KEY='EDK-TEST-KEY1-2345';
// The service contract of poll/q.php: key → 12-hour token, rooms owned by the token's presenter.
function service(){
  const calls:any[]=[],rooms=new Map<string,any>(),tokens=new Set<string>();let fail='',delay:Promise<void>|undefined,serial=0,link=(room:string)=>`${server}/r/?room=${room}`;
  const reply=(status:number,body:any)=>new Response(JSON.stringify(body),{status});
  const fetcher=(async(url:string,init:RequestInit)=>{
    assert.equal(url,endpoint);assert.equal(init.credentials,'omit');assert.equal(init.mode,'cors');
    const b=JSON.parse(init.body as string);calls.push(b);if(delay)await delay;
    if(b.proc===fail)return reply(500,{error:'server_error'});
    if(b.proc==='auth'){if(b.key!==KEY)return reply(401,{error:'invalid_key'});const token=(++serial).toString(16).padStart(64,'0');tokens.add(token);return reply(200,{data:{token,expiresAt:Date.now()+12*3600e3}});}
    if(!tokens.has(b.token))return reply(401,{error:'session_expired'});
    if(b.proc==='prepare'){const room='R'+String(++serial).padStart(5,'0');rooms.set(room,{status:0,type:b.type,meta:b.meta,rows:[],count:0});return reply(200,{data:{room,url:link(room)}});}
    const s=rooms.get(b.room);if(!s)return reply(404,{error:'room_not_found'});
    if(b.proc==='open')s.status=1;if(b.proc==='close')s.status=0;
    const data=b.proc==='count'?{status:s.status,responses:s.count}:b.proc==='results'?s.rows:b.proc==='export'?{type:s.type,meta:s.meta,rows:s.answers||[]}:'ok';
    return reply(200,{data});
  }) as typeof fetch;
  return{calls,rooms,tokens,fetcher,fail(proc:string){fail=proc;},delay(p?:Promise<void>){delay=p;},link(f:(room:string)=>string){link=f;}};
}
// The player's localStorage and key dialog, scripted.
function store(keys:(string|null)[]=[KEY]){
  const asked:string[]=[],saved:any[]=[];let value:any=null;
  const s:PollSessionStore={load:()=>value,save:v=>{value=v;saved.push(v);},clear:()=>{value=null;},askKey:async reason=>{asked.push(reason);return keys.length?keys.shift()!:null;}};
  return{s,asked,saved,get value(){return value;},set value(v:any){value=v;}};
}
const controller=(api:ReturnType<typeof service>,session:ReturnType<typeof store>,emit:(i:number,s:any)=>void=()=>{},configs:(PollConfig|undefined)[]=[quiz])=>createPollController(configs,emit,()=>'<svg/>',api.fetcher,{endpoint},session.s);

test('poll config is optional, bounded, persistent and independent of runtime sessions',async()=>{
  const d=newDeck('Activity');d.slides[0].poll=quiz;validateDeck(d);
  assert.equal(validPoll({...quiz,provider:'solverpoll'}),true,'files saved before the Edukors service still open');
  for(const bad of [{...quiz,options:['A','']},{...quiz,prompt:' '},{...quiz,room:'leak'},{...quiz,type:'post'},{...quiz,options:['1','2','3','4','5','6']},{...quiz,provider:'other'}])assert.equal(validPoll(bad),false);
  await fs.mkdir('test-results/poll',{recursive:true});const file='test-results/poll/roundtrip.ESF';await writeDeck(file,d);assert.deepEqual((await readDeck(file)).slides[0].poll,quiz);
  assert.deepEqual((serialize(d).manifest.slides[0] as any).poll,quiz);
  assert.deepEqual(duplicateSlides(d.slides)[0].poll,quiz);
  const copied=pasteSlides(d,copySlides(d,[d.slides[0].id]),d.slides[0].id);assert.deepEqual(copied[0].poll,quiz);assert.notEqual(copied[0].id,d.slides[0].id);
  const next=applySlideChanges(d,{slideUpdates:[{...d.slides[0],poll:undefined,title:'New title'}]});assert.deepEqual(next?.slides[0].poll,quiz,'ordinary assistant edits preserve activities');
  const html=playerDocument(d,{pollServer:server});assert.ok(html.includes('connect-src '+endpoint+';'));assert.ok(!html.includes('solvertank'));assert.ok(html.includes('id="poll-key"'));
  assert.ok(slideDocument(d,d.slides[0]).includes("connect-src 'none'"));assert.ok(slideDocument(d,d.slides[0],true).includes('poll-static'));
  const plain=newDeck('Offline');assert.ok(playerDocument(plain).includes("connect-src 'none'"));
  assert.equal(Function('return '+qrRuntimeSource())()('https://edukors.org/poll/r/?room=ABC234'),qrSvg('https://edukors.org/poll/r/?room=ABC234'));
});
test('self-hosted servers: addresses are normalized and each export keeps its own',()=>{
  assert.equal(normalizePollServer('https://example.org/poll/'),'https://example.org/poll');
  assert.equal(normalizePollServer(' https://example.org:8443/a/b?x=1#y '),'https://example.org:8443/a/b');
  assert.equal(normalizePollServer('http://localhost:8010/poll'),'http://localhost:8010/poll');
  assert.equal(normalizePollServer('http://127.0.0.1/poll'),'http://127.0.0.1/poll');
  for(const bad of ['http://example.org/poll','ftp://example.org','https://user:pw@example.org/poll','https://example.org/a;b','https://example.org/a b','javascript:alert(1)','',null,42])assert.equal(normalizePollServer(bad),null,String(bad));
  const d=newDeck('Activity');d.slides[0].poll=quiz;
  const own=playerDocument(d,{pollServer:'https://school.example/poll/'});assert.ok(own.includes('connect-src https://school.example/poll/q.php;'));assert.ok(own.includes('"pollEndpoint":"https://school.example/poll/q.php"'));assert.ok(!own.includes('edukors.org/poll/q.php'));
  // There is no default server: without one (or with an invalid one) the export never reaches the network.
  for(const pollServer of [undefined,'','not a url']){const html=playerDocument(d,{pollServer});assert.ok(html.includes("connect-src 'none';"),String(pollServer));assert.ok(html.includes('"pollEndpoint":""'));assert.ok(!html.includes('edukors.org/poll/q.php'));}
});
test('presenter key: asked once, only the 12-hour token is kept, expired sessions ask again',async()=>{
  const api=service(),session=store([KEY]);let s:any;const c=controller(api,session,(_,v)=>s=v);c.activate(0);
  assert.equal(api.calls.length,0);await c.action(0,'start');
  assert.deepEqual(session.asked,['new']);assert.deepEqual(api.calls.map(x=>x.proc),['auth','prepare','open','count']);
  assert.ok(!JSON.stringify(session.saved).includes(KEY),'the key is never stored');assert.match(session.value.token,/^[0-9a-f]{64}$/);assert.ok(session.value.expiresAt>Date.now()+11*3600e3);
  assert.ok(api.calls.slice(1).every(x=>x.token===session.value.token&&!('key' in x)));assert.equal(s.phase,'open');assert.match(c.link(0),/^https:\/\/edukors\.org\/poll\/r\/\?room=R\d{5}$/);
  await c.action(0,'stop');assert.equal(session.asked.length,1,'a live session is reused');
  // A token near its end is not used; the presenter signs in again.
  for(const expiresAt of [Date.now()-1,Date.now()+30000]){const again=store([KEY]);again.value={token:session.value.token,expiresAt};
    const c2=controller(api,again);c2.activate(0);await c2.action(0,'start');assert.deepEqual(again.asked,['new']);assert.notEqual(again.value.token,session.value.token);c2.dispose();}
  // The server ends a session (expired or revoked key): the token is dropped and the key asked again.
  const api3=service(),s3=store([KEY,KEY]);const c3=controller(api3,s3);c3.activate(0);await c3.action(0,'start');api3.tokens.clear();await c3.action(0,'stop');
  assert.deepEqual(s3.asked,['new','expired']);assert.equal(c3.needsClose(0),false);c.dispose();c3.dispose();
});
test('wrong keys and a cancelled dialog leave the activity ready without contacting rooms',async()=>{
  const api=service(),session=store(['wrong',KEY]);let s:any;const c=controller(api,session,(_,v)=>s=v);c.activate(0);await c.action(0,'start');
  assert.deepEqual(session.asked,['new','invalid']);assert.equal(s.phase,'open');
  const api2=service(),cancel=store([null]);let s2:any;const c2=controller(api2,cancel,(_,v)=>s2=v);c2.activate(0);await c2.action(0,'start');
  assert.equal(s2.phase,'ready');assert.equal(s2.error,false);assert.equal(s2.prepared,false);assert.equal(api2.calls.length,0);
  // Background counts never open the key dialog.
  const api3=service(),s3=store([KEY]);let v3:any;const c3=createPollController([quiz],(_,v)=>v3=v,()=>'',api3.fetcher,{endpoint,interval:5},s3.s);c3.activate(0);await c3.action(0,'start');api3.tokens.clear();
  await new Promise(r=>setTimeout(r,60));assert.equal(s3.asked.length,1);assert.equal(v3.stale,true);c.dispose();c2.dispose();c3.dispose();
});
test('independent rooms: prepare, collect, close, results, round and navigation snapshots',async()=>{
  const api=service(),session=store(),snapshots=new Map<number,any>();const c=controller(api,session,(i,s)=>snapshots.set(i,s),[quiz,quiz]);
  c.activate(0);await c.action(0,'start');const first=api.calls.find(x=>x.proc==='prepare');assert.equal(first.meta,3);assert.equal(first.type,'quiz');
  const room=api.calls.find(x=>x.proc==='open').room,r=api.rooms.get(room);r.count=3;r.rows=[{response:'0',responses:'2'},{response:2,responses:1}];
  await c.action(0,'results');assert.equal(api.calls.at(-1).proc,'count','results not fetched while open');
  await c.action(0,'stop');await c.action(0,'results');assert.deepEqual(snapshots.get(0).rows,[{response:0,responses:2},{response:2,responses:1}]);assert.equal(snapshots.get(0).count,3);
  c.activate(1);await c.action(1,'start');assert.notEqual(api.calls.at(-1).room,room);await c.leave(1);assert.equal(c.needsClose(1),false);
  const length=api.calls.length;c.activate(0);assert.equal(api.calls.length,length);assert.equal(snapshots.get(0).view,'results');
  await c.action(0,'again');assert.deepEqual(api.calls.slice(length).map(x=>x.proc),['prepare','open','count'],'a new round opens at once');assert.notEqual(api.calls.at(-1).room,room);assert.equal(snapshots.get(0).phase,'open');assert.equal(snapshots.get(0).view,'question');assert.ok(api.calls.every(x=>x.proc!=='clean'));c.dispose();
});
test('without a server the activity says so and makes no request',async()=>{
  let s:any,asked=0;const calls:any[]=[];const c=createPollController([quiz],(_,v)=>s=v,()=>'',(async(...a:any[])=>{calls.push(a);return new Response('{}');}) as any,{endpoint:''},{load:()=>null,save(){},clear(){},askKey:async()=>{asked++;return KEY;}});
  c.activate(0);assert.equal(s.noServer,true);await c.action(0,'start');assert.equal(s.error,true);assert.equal(s.prepared,false);assert.equal(calls.length,0);assert.equal(asked,0);c.dispose();
});
test('CSV download: every answer, option letters and texts, spreadsheet-safe cells',async()=>{
  const {pollWords}=await import('../src/shared/poll'),w=pollWords.en,api=service();const c=controller(api,store());c.activate(0);
  assert.equal(await c.csv(0,w),null,'nothing before a room exists');await c.action(0,'start');
  [...api.rooms.values()][0].answers=[{response:'0',at:'2026-10-26T21:00:01Z'},{response:'2',at:'2026-10-26T21:00:02Z'}];
  const quizFile=(await c.csv(0,w))!;assert.match(quizFile.name,/^responses-R\d{5}-\d{8}-\d{4}\.csv$/);assert.ok(quizFile.text.startsWith('\ufeff'));
  assert.equal(quizFile.text.slice(1),'Time (UTC),Option,Text\r\n2026-10-26T21:00:01Z,A,Primeira\r\n2026-10-26T21:00:02Z,C,Terceira\r\n');
  const api2=service();const c2=controller(api2,store(),()=>{},[{version:1,provider:'edukors',type:'post',prompt:'?'}]);c2.activate(0);await c2.action(0,'start');
  [...api2.rooms.values()][0].answers=[{response:'=HYPERLINK("x")',at:'t1'},{response:'Olá, "turma"\nlinha 2',at:'t2'},{response:'-1',at:'t3'}];
  assert.equal((await c2.csv(0,w))!.text.slice(1),'Time (UTC),Response\r\nt1,"\'=HYPERLINK(""x"")"\r\nt2,"Olá, ""turma""\nlinha 2"\r\nt3,\'-1\r\n');
  api2.fail('export');await assert.rejects(c2.csv(0,w));c.dispose();c2.dispose();
});
test('a link to another origin never becomes a QR code',async()=>{
  const api=service();api.link(room=>`https://elsewhere.example/r/?room=${room}`);let s:any;const c=controller(api,store(),(_,v)=>s=v);c.activate(0);await c.action(0,'start');
  assert.equal(s.error,true);assert.equal(s.qr,'');assert.equal(c.link(0),'');assert.ok(api.calls.every(x=>x.proc!=='open'));c.dispose();
});
test('server errors, uncertain open and failed close retain ownership and safe retry',async()=>{
  const api=service();let s:any;const c=controller(api,store(),(_,v)=>s=v);c.activate(0);
  api.fail('open');await c.action(0,'start');assert.equal(s.phase,'unknown');assert.equal(s.mayBeOpen,true);assert.equal(c.needsClose(0),true);const room=api.calls.find(x=>x.proc==='prepare')&&[...api.rooms.keys()][0];
  api.fail('close');assert.equal(await c.leave(0),false);assert.equal(s.error,true);assert.equal(s.count,0);
  api.fail('');await c.action(0,'retry');assert.equal(s.mayBeOpen,false);assert.equal(s.phase,'closed');assert.ok(api.calls.filter(x=>x.room).every(x=>x.room===room));assert.equal(api.calls.filter(x=>x.proc==='prepare').length,1);c.dispose();
});
test('invalid counts/results are rejected and tag/post preserve service semantics',async()=>{
  for(const type of ['tag','post'] as const){const api=service();let s:any;const c=controller(api,store(),(_,v)=>s=v,[{version:1,provider:'edukors',type,prompt:'Resposta'}]);c.activate(0);await c.action(0,'start');const r=[...api.rooms.values()][0];r.count=70;r.rows=Array.from({length:50},(_,i)=>({response:`<img src=x onerror=alert(1)> ${i}`,responses:2}));await c.action(0,'stop');await c.action(0,'results');assert.equal(s.rows.length,50);assert.equal(s.count,70);assert.ok(s.rows[0].response.includes('<img'));assert.equal(api.calls.find(x=>x.proc==='prepare').meta,0);c.dispose();}
  const api=service();let s:any;const c=controller(api,store(),(_,v)=>s=v);c.activate(0);await c.action(0,'start');await c.action(0,'stop');[...api.rooms.values()][0].rows=[{response:'99',responses:'1'}];await c.action(0,'results');assert.equal(s.error,true);assert.equal(s.rows.length,0);c.dispose();
});
test('overlapping commands cannot prepare twice or reset an open room',async()=>{
  const api=service();let release!:()=>void;api.delay(new Promise<void>(r=>release=r));const c=controller(api,store());c.activate(0);const first=c.action(0,'start');await c.action(0,'start');assert.equal(api.calls.length,1);assert.equal(await c.leave(0),false);release();await first;api.delay();await c.action(0,'start');assert.equal(api.calls.filter(x=>x.proc==='prepare').length,1);c.dispose();
});
// server/poll is the source of truth; the edukors.org site gets a copy from scripts/sync-poll-server.mjs.
test('the deployed poll server copy matches server/poll',async t=>{
  const {pollSource,pollDiff}=await import('../scripts/poll-files.mjs'),site='../_code/public_html/poll';
  if(!await fs.stat(site).then(()=>true,()=>false)){t.skip('no site checkout beside this repository');return;}
  assert.deepEqual(await pollDiff(pollSource,site),[],'run node scripts/sync-poll-server.mjs (never edit the site copy by hand)');
});
