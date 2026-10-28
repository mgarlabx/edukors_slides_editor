import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {newDeck,Profile,Preferences} from '../src/shared/model';
import {normalizeProfiles,providers} from '../src/shared/providers';
import {AIProviders,strictSchema,parseAnswer,probeProvider,connectAntigravity,windowsAI} from '../src/main/providers';
import {accountEnv,providerEnv,loginCommand,Launch,launchProvider,sandboxPolicy} from '../src/main/provider-runtime';
import {googleAuthorizationUrl} from '../src/main/acp';
import {outputSchema,CancelledError} from '../src/main/ai';
const root=path.resolve('test-results/providers');await fs.mkdir(root,{recursive:true});
const fixture=async()=>{const dir=await fs.mkdtemp(path.join(root,'case-'));await fs.mkdir(path.join(dir,'files'));return dir;};
const profile=(dir:string,provider:Profile['provider']='codex',id='one'):Profile=>({id,name:id,provider,executable:path.join(dir,'mock.cjs'),configDir:path.join(dir,'account-'+id)});
// Protocol tests inject a launcher; the production orchestrator always uses the OS sandbox.
const direct:Launch=async(p,args,cwd)=>spawn(process.execPath,[p.executable,...args],{cwd,env:providerEnv(p),detached:true,stdio:['pipe','pipe','pipe']});
const mock=async(dir:string,code:string)=>fs.writeFile(path.join(dir,'mock.cjs'),code);
const noWindowsAI={skip:process.platform==='win32'?'other providers are disabled on Windows':false};
test('on Windows only Claude Code is offered: other providers are refused before any process starts',{skip:process.platform!=='win32'&&'Windows only'},async()=>{
  const launch:Launch=async()=>{throw Error('must not launch');},ai=new AIProviders(()=>{},{},()=>{},launch),p=profile(os.tmpdir());
  await assert.rejects(ai.send(newDeck('x'),p,'x',os.tmpdir(),[]),{message:windowsAI});await assert.rejects(probeProvider(p,os.tmpdir(),false,launch),{message:windowsAI});
});
test('provider profiles migrate Claude model settings and preserve independent choices',()=>{
  const p:Preferences={language:'pt',activeProfile:'a',recent:[],aiModel:'existing-model',aiEffort:'high',profiles:[{id:'a',name:'Pessoal',executable:'claude',configDir:'~/.claude'},{id:'b',name:'Trabalho',provider:'codex',executable:'codex',configDir:'~/.codex-b',model:'custom-model',effort:'low'}]};
  const next=normalizeProfiles(p);assert.equal(next[0].provider,'claude');assert.equal(next[0].model,'existing-model');assert.equal(next[1].model,'custom-model');assert.equal(next[1].effort,'low');
  assert.throws(()=>normalizeProfiles({...p,profiles:[next[0],next[0]]}),/Invalid CLI/);assert.throws(()=>normalizeProfiles({...p,profiles:[{...next[0],provider:'unknown' as any}]}),/Unknown/);
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-inherited';
  for(const provider of providers){const env=providerEnv({...next[0],provider:provider.id});assert.equal(env.OPENAI_API_KEY,undefined);if(provider.id!=='claude')assert.equal(env.CLAUDE_CONFIG_DIR,undefined);}
  if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;
  assert.equal(accountEnv(next[1]).CODEX_HOME,path.join(os.homedir(),'.codex-b'));
  assert.notDeepEqual(accountEnv({...next[1],provider:'opencode'}),accountEnv({...next[1],provider:'opencode',configDir:'~/.opencode-other'}));
  assert.match(loginCommand({...next[1],executable:"/tmp/it's a cli"}),/it'\\''s/);
});
test('Codex transport parses UTF-8, strict JSON patches, model flags, and sessions per account',noWindowsAI,async()=>{
  const dir=await fixture(),cwd=path.join(dir,'files'),deck=newDeck('Providers'),events:any[]=[];
  await mock(dir,`const fs=require('fs');let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const args=process.argv.slice(2);fs.appendFileSync('calls.jsonl',JSON.stringify({args,home:process.env.CODEX_HOME,input})+'\\n');const out=[{type:'thread.started',thread_id:'session-'+require('path').basename(process.env.CODEX_HOME)},{type:'turn.completed',usage:{input_tokens:30,output_tokens:8,cached_input_tokens:4}},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify({message:'Olá, ação 🐢',slideUpdates:null,slideOrder:null})}}].map(x=>JSON.stringify(x)).join('\\n');const b=Buffer.from(out);for(let i=0;i<b.length;i+=3)process.stdout.write(b.subarray(i,i+3));});`);
  let saved:any;const ai=new AIProviders(e=>events.push(e),{},s=>saved=s,direct),a=profile(dir),b=profile(dir,'codex','two');
  const out=await ai.send(deck,a,'First',cwd,[],{model:'test-model',effort:'high',conversation:'c',scope:'workspace-a'});assert.equal(out.message,'Olá, ação 🐢');assert.equal(out.deck,undefined);
  await ai.send(deck,a,'Continue',cwd,[],{conversation:'c',scope:'workspace-a'});await ai.send(deck,b,'Other account',cwd,[],{conversation:'c',scope:'workspace-a'});
  const calls=(await fs.readFile(path.join(cwd,'calls.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));assert.ok(calls[0].args.includes('test-model'));assert.ok(calls[0].args.includes('model_reasoning_effort="high"'));assert.ok(calls[1].args.includes('session-account-one'));assert.ok(!calls[2].args.includes('resume'));assert.notEqual(calls[0].home,calls[2].home);
  assert.equal(events.find(x=>x.type==='usage').input,30);assert.equal(Object.keys(saved).length,2);ai.forgetProfile(a.id);assert.equal(ai.sessions.size,1);assert.equal(ai.busy(deck.id),false);
  const schema=strictSchema(outputSchema);assert.equal(schema.required.length,Object.keys(schema.properties).length);assert.equal(schema.properties.slideUpdates.anyOf[1].type,'null');
});
test('ACP negotiates, discovers models, handles file boundaries and resumes only its account',noWindowsAI,async()=>{
  const dir=await fixture(),cwd=path.join(dir,'files'),deck=newDeck('ACP');await fs.writeFile(path.join(cwd,'safe.txt'),'safe');await fs.writeFile(path.join(dir,'outside.txt'),'private');
  await mock(dir,`const fs=require('fs'),rl=require('readline').createInterface({input:process.stdin});let pendingPrompt;const send=x=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...x})+'\\n');rl.on('line',line=>{const m=JSON.parse(line);fs.appendFileSync('acp-log.jsonl',line+'\\n');if(m.method==='initialize')send({id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true},agentInfo:{name:'mock',version:'1'}}});else if(m.method==='session/new')send({id:m.id,result:{sessionId:'s-'+require('path').basename(process.env.KIMI_SHARE_DIR),configOptions:[{id:'model',category:'model',options:[{value:'model-a',name:'Model A'}]}]}});else if(m.method==='session/load')send({id:m.id,result:{sessionId:m.params.sessionId}});else if(m.method==='session/set_config_option'||m.method==='session/set_model')send({id:m.id,result:{}});else if(m.method==='session/prompt'){pendingPrompt=m;send({id:901,method:'fs/read_text_file',params:{path:require('path').resolve('../outside.txt')}});}else if(m.id===901){if(!m.error)process.exit(3);send({id:902,method:'fs/write_text_file',params:{path:require('path').resolve('manifest.json'),content:'bad'}});}else if(m.id===902){if(!m.error)process.exit(4);send({id:903,method:'fs/read_text_file',params:{path:require('path').resolve('safe.txt')}});}else if(m.id===903){if(m.result?.content!=='safe')process.exit(5);send({method:'session/update',params:{sessionId:pendingPrompt.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'{"message":"ACP pronto"}'}}}});send({id:pendingPrompt.id,result:{stopReason:'end_turn'}});}});`);
  const p=profile(dir,'kimi'),ai=new AIProviders(()=>{},{},()=>{},direct);
  const probe=await probeProvider(p,cwd,true,direct);assert.equal(probe.authenticated,undefined);assert.equal(probe.models![0].id,'model-a');
  assert.equal((await ai.send(deck,p,'Hello',cwd,[],{model:'model-a'})).message,'ACP pronto');await ai.send(deck,p,'Again',cwd,[]);
  const log=(await fs.readFile(path.join(cwd,'acp-log.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));assert.ok(log.some(x=>x.method==='session/load'));assert.ok(log.some(x=>x.method==='session/set_config_option'));assert.equal(await fs.readFile(path.join(dir,'outside.txt'),'utf8'),'private');
  ai.dispose();
});
test('Antigravity uses official ACP login and an isolated Google account directory',noWindowsAI,async()=>{
  const dir=await fixture(),cwd=path.join(dir,'files'),p=profile(dir,'agy'),deck=newDeck('Agy');
  const url='https://accounts.google.com/o/oauth2/v2/auth?state=test&response_type=code&redirect_uri='+encodeURIComponent('http://127.0.0.1:9876/');
  assert.equal(googleAuthorizationUrl(url),url);assert.throws(()=>googleAuthorizationUrl(url.replace('accounts.google.com','evil.example')));
  await mock(dir,`const fs=require('fs'),rl=require('readline').createInterface({input:process.stdin});const send=x=>console.log(JSON.stringify({jsonrpc:'2.0',...x}));rl.on('line',line=>{const m=JSON.parse(line);fs.appendFileSync('agy-log.jsonl',line+'\\n');if(m.method==='initialize')send({id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true}}});else if(m.method==='authenticate'){if(m.params.methodId!=='oauth-personal')process.exit(2);fs.writeFileSync('env.json',JSON.stringify({home:process.env.GEMINI_HOME,storage:process.env.AGY_ACP_FORCE_FILE_STORAGE,args:process.argv.slice(2)}));send({id:m.id,result:{}});}else if(m.method==='session/new'||m.method==='session/resume')send({id:m.id,result:{sessionId:'agy-one'}});else if(m.method==='session/prompt'){send({method:'session/update',params:{sessionId:'agy-one',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'{"message":"Agy pronto"}'}}}});send({id:m.id,result:{stopReason:'end_turn'}});}});`);
  assert.equal((await connectAntigravity(p,cwd,()=>{},direct)).authenticated,true);
  const ai=new AIProviders(()=>{},{},()=>{},direct);assert.equal((await ai.send(deck,p,'Hello',cwd,[])).message,'Agy pronto');await ai.send(deck,p,'Again',cwd,[]);
  const env=JSON.parse(await fs.readFile(path.join(cwd,'env.json'),'utf8'));assert.equal(env.home,p.configDir);assert.equal(env.storage,'1');assert.deepEqual(env.args,[]);assert.match(await fs.readFile(path.join(cwd,'agy-log.jsonl'),'utf8'),/session\/resume/);ai.dispose();
});
test('provider failure after a plausible answer never applies changes',noWindowsAI,async()=>{
  const dir=await fixture(),cwd=path.join(dir,'files');await mock(dir,`process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"message":"not applied"}'}}));process.exitCode=2;});`);
  const ai=new AIProviders(()=>{},{},()=>{},direct);await assert.rejects(ai.send(newDeck('Failure'),profile(dir),'x',cwd,[]),/code 2/);assert.equal(ai.sessions.size,0);
  assert.throws(()=>parseAnswer(newDeck('Invalid'),'just prose'));assert.throws(()=>parseAnswer(newDeck('Invalid'),{slideUpdates:[]}));
});
test('cancellation during process startup and ACP initialization cannot publish a late answer',noWindowsAI,async()=>{
  const dir=await fixture(),cwd=path.join(dir,'files');await mock(dir,`setInterval(()=>{},1000);`);
  const deck=newDeck('Cancel'),events:any[]=[],slow:Launch=async(...args)=>{await new Promise(r=>setTimeout(r,80));return direct(...args);};
  const ai=new AIProviders(e=>events.push(e),{},()=>{},slow),pending=ai.send(deck,profile(dir),'x',cwd,[]);assert.equal(ai.busy(deck.id),true);await assert.rejects(ai.send(deck,profile(dir),'x',cwd,[]),/already running/);ai.cancel(deck.id);await assert.rejects(pending,CancelledError);assert.equal(ai.busy(deck.id),false);assert.equal(events.length,0);
  const acp=ai.send(deck,profile(dir,'kiro'),'x',cwd,[]);await new Promise(r=>setTimeout(r,140));ai.cancel(deck.id);await assert.rejects(acp,CancelledError);assert.equal(ai.busy(deck.id),false);
});
test('macOS provider sandbox denies outside files and editor-owned writes',async t=>{
  if(process.platform!=='darwin'){t.skip('macOS only');return;}
  const control=spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)','/bin/echo','control'],{encoding:'utf8'});if(/sandbox_apply: Operation not permitted/.test(control.stderr||'')){t.skip('Host disallows nested sandbox-exec');return;}
  const dir=await fixture(),cwd=path.join(dir,'files'),outside=path.join(dir,'private.txt');await fs.writeFile(outside,'private');
  const p={...profile(dir),executable:process.execPath};
  const code=`const fs=require('fs');const checks=[];for(const [op,file] of [['read',${JSON.stringify(outside)}],['write',${JSON.stringify(outside)}],['write','manifest.json']]){try{if(op==='read')fs.readFileSync(file);else fs.writeFileSync(file,'bad');checks.push(false);}catch{checks.push(true);}}fs.writeFileSync('allowed.txt','ok');console.log(JSON.stringify(checks));`;
  const child=await launchProvider(p,['-e',code],cwd);let out='',err='';child.stdout!.on('data',b=>out+=b);child.stderr!.on('data',b=>err+=b);const exit=await new Promise<number|null>((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  if(/sandbox_apply: Operation not permitted/.test(err)){t.skip('Host disallows nested sandbox-exec: '+err.trim());return;}
  assert.equal(exit,0,err);assert.deepEqual(JSON.parse(out),[true,true,true]);assert.equal(await fs.readFile(path.join(cwd,'allowed.txt'),'utf8'),'ok');
  assert.match(sandboxPolicy(cwd,[],[],[]),/deny file-write/);
});
