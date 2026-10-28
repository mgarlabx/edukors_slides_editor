import './poll.test';
import './providers.test';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {newDeck,newSlide,validateDeck,duplicateSlides} from '../src/shared/model';
import {ProjectStore,ConflictError,inside,readDeck,writeDeck} from '../src/main/projects';
import {openPackage,packageLimits} from '../src/main/package';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {slideDocument,withMaster} from '../src/shared/render';
import {playerDocument} from '../src/shared/player';
import {minifyJs} from '../src/main/minify';
import {childEnv,ClaudeProvider,CancelledError,sessionLimits,instruction,agentSettings,agentTools,toolsFor,ownedPaths,applySlideChanges,agentContext,removedSlides,sentKeys,contextDir} from '../src/main/ai';
import esfSchema from '../src/shared/esf.schema.json';
import {embedFonts} from '../src/main/fonts';
// The AI assistant is disabled on Windows in 1.0 (no sandbox for the CLI there); these tests spawn a simulated CLI.
const noWindowsAI={skip:process.platform==='win32'?'mock CLI scripts cannot be spawned without a shell on Windows':false};
const root=path.resolve('test-results/core');
await fs.mkdir(root,{recursive:true});
const fixture=async()=>fs.mkdtemp(path.join(root,'case-'));
const workspaces=path.join(root,'workspaces'),newStore=()=>new ProjectStore(workspaces);
const esfIn=async(dir:string,name='Apresentação.ESF')=>path.join(dir,name);
// New decks start blank; these layouts stand in for the content layouts people build.
const sampleLayouts=[{id:'cover',name:'Capa',html:'<section class="slide cover"><h1 data-field="title">Título da apresentação</h1><p data-field="subtitle">Uma ideia</p></section>'},
  {id:'cards',name:'Cartões',html:'<section class="slide"><h2 data-field="title">Título</h2><div class="cards">'+[0,1,2].map(i=>`<div class="card" data-step><h3 data-field="card${i}">Ideia</h3><p data-field="body${i}">Texto</p></div>`).join('')+'</div></section>'},
  {id:'quote',name:'Citação',html:'<section class="slide"><blockquote data-field="quote">Frase</blockquote><cite data-field="author">Nome</cite></section>'}];
function themed(title:string){const d=newDeck(title);d.layouts.push(...structuredClone(sampleLayouts));d.slides=[newSlide(d.layouts[1])];return d;}
const sample=(id:string)=>newSlide(sampleLayouts.find(l=>l.id===id)!);
const entries=async(file:string)=>{const pkg=await openPackage(file);try{return[...pkg.entries.keys()].sort();}finally{await pkg.close();}};
test('ESF is a single ZIP package that survives copy, move and reopen',async()=>{
  const dir=await fixture(),store=newStore();
  const a=await store.create(await esfIn(dir,'Apresentação com acentos.ESF'),themed('Apresentação com acentos'));
  a.deck.slides.push(sample('cards'));a.deck.slides[1].html=a.deck.slides[1].html.replace('</section>','<img src="asset:asset-image" alt=""></section>');
  a.deck.assets.push({id:'asset-image',name:'tiny.png',mime:'image/png',data:'aGVsbG8='},{id:'asset-old',name:'old.png',mime:'image/png',data:'b2xk'});
  const s=store.location(a.deck.id);await fs.mkdir(path.join(s.workspace,'research'),{recursive:true});await fs.writeFile(path.join(s.workspace,'research','notas.md'),'fonte');
  await fs.mkdir(path.join(s.workspace,'.edukors/ai'),{recursive:true});await fs.writeFile(path.join(s.workspace,'.edukors/ai/conversations.json'),'{"sessions":[]}');await fs.writeFile(path.join(s.workspace,'.edukors/lock'),'x');
  const saved=(await store.save(a.deck)).project;
  assert.deepEqual(await fs.readdir(dir),['Apresentação com acentos.ESF'],'one visible file, nothing next to it');
  assert.equal((await fs.readFile(saved.path)).subarray(0,4).toString('latin1'),'PK\x03\x04');
  const names=await entries(saved.path);
  for(const n of ['manifest.json',`masters/${a.deck.masters[0].id}/theme.css`,`slides/${a.deck.slides[0].id}/content.html`,'images/asset-image.png','.edukors/ai/conversations.json'])assert.ok(names.includes(n),n);
  for(const n of ['.edukors/lock','research/notas.md','images/asset-old.png'])assert.ok(!names.includes(n),n+' stays out: internal state, auxiliary files and unused images');
  assert.deepEqual(saved.deck.assets.map(x=>x.id),['asset-image'],'the saved deck drops the unused image');
  const other=await fixture(),copy=path.join(other,'Cópia movida.ESF');await fs.copyFile(saved.path,copy);await store.close(a.deck.id);await fs.rm(saved.path);
  const reopened=await newStore().open(copy);
  assert.equal(reopened.deck.slides.length,2);assert.equal(reopened.deck.assets[0].data,'aGVsbG8=');assert.equal(reopened.path,await fs.realpath(copy));assert.equal(reopened.deck.revision,saved.deck.revision);
  assert.ok(!('root' in reopened),'the working folder is not exposed');
});
test('a new presentation has no file until its first save, which keeps its ID, files and conversations',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.untitled({...themed(''),title:'Sem título'});
  assert.equal(p.path,'');assert.deepEqual(await fs.readdir(dir),[]);const blank=newDeck('');assert.deepEqual([blank.masters.length,blank.layouts.length,blank.masters[0].html,blank.slides[0].html],[1,1,'','<section class="slide"></section>'],'Blank: one white master with one white layout');
  await assert.rejects(()=>store.save(p.deck),/Save As/);await store.draft(p.deck);
  const s=store.location(p.deck.id),old=s.dir;await fs.mkdir(path.join(s.workspace,'research'),{recursive:true});await fs.writeFile(path.join(s.workspace,'research','notas.md'),'fonte');
  const saved=await store.attach(p.deck.id,path.join(dir,'Nova.esf'),{...p.deck,title:'Nova'});
  assert.equal(saved.deck.id,p.deck.id);assert.equal(saved.deck.title,'Nova');assert.deepEqual(await fs.readdir(dir),['Nova.esf']);assert.ok(!(await entries(saved.path)).includes('research/notas.md'));
  await assert.rejects(fs.access(old),'the untitled working folder moved');await assert.rejects(()=>store.attach(p.deck.id,path.join(dir,'Outra.esf'),p.deck),/already has a file/);
  await store.untitled(newDeck('X'));const left=(await fs.readdir(workspaces)).filter(n=>n.startsWith('untitled-'));await newStore().cleanup();
  for(const n of left)await assert.rejects(fs.access(path.join(workspaces,n)),'cleanup removes untitled leftovers');
});
test('several presentations share a folder; copies with one ID never share a session',async()=>{
  const dir=await fixture(),store=newStore();
  const a=await store.create(await esfIn(dir,'A.ESF'),newDeck('A'));const b=await store.create(await esfIn(dir,'B.ESF'),newDeck('B'));
  assert.notEqual(store.location(a.deck.id).workspace,store.location(b.deck.id).workspace);
  await fs.copyFile(a.path,path.join(dir,'A cópia.ESF'));
  const c=await store.open(path.join(dir,'A cópia.ESF'));assert.notEqual(c.deck.id,a.deck.id,'the second copy gets its own ID');
  assert.equal((await store.open(a.path)).deck.id,a.deck.id,'opening the same file again reuses its session');
  await assert.rejects(()=>store.create(a.path,newDeck('Outra')),/open in another tab/);
  const ws=store.location(a.deck.id).dir;await store.close(a.deck.id);await assert.rejects(fs.access(ws),'closing removes the working folder');
});
test('external changes and missing files are never overwritten',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await esfIn(dir),newDeck('Conflicts'));
  await fs.writeFile(p.path,'external');
  await assert.rejects(()=>store.save(p.deck),(e:any)=>e instanceof ConflictError&&e.reason==='changed');assert.equal(await fs.readFile(p.path,'utf8'),'external');
  await fs.rm(p.path);await assert.rejects(()=>store.save(p.deck),(e:any)=>e instanceof ConflictError&&e.reason==='missing');
});
test('a failed save keeps the previous package and leaves no temporary file',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await esfIn(dir),themed('Atomic'));
  const before=await fs.readFile(p.path),s=store.location(p.deck.id);
  await fs.writeFile(path.join(s.workspace,'big.bin'),Buffer.alloc(16));const limit=packageLimits.file;packageLimits.file=8;
  try{await assert.rejects(()=>store.save(p.deck),/exceeds/);}finally{packageLimits.file=limit;}
  assert.deepEqual(await fs.readFile(p.path),before);assert.deepEqual(await fs.readdir(dir),['Apresentação.ESF']);
  await fs.rm(path.join(s.workspace,'big.bin'));assert.ok((await store.save(p.deck)).project.deck.revision>p.deck.revision,'the session keeps working');
});
test('draft recovery is tied to the file and its version, with its working folder',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await esfIn(dir),newDeck('Draft'));
  const draft=structuredClone(p.deck);draft.title='Recovered';await store.draft(draft);await fs.writeFile(path.join(store.location(p.deck.id).workspace,'media.txt'),'unsaved');
  // A crash: the session is gone but its working folder and draft remain.
  const crashed=newStore();await crashed.cleanup();
  const restored=await crashed.open(p.path);assert.equal(restored.recovered,true);assert.equal(restored.deck.title,'Recovered');
  assert.equal(await fs.readFile(path.join(crashed.location(restored.deck.id).workspace,'media.txt'),'utf8'),'unsaved');
  const next=(await crashed.save(draft)).project;const afterUndo=(await crashed.save(p.deck)).project;assert.ok(afterUndo.deck.revision>next.deck.revision);
  assert.ok(!(await entries(p.path)).includes('media.txt'),'auxiliary files are not packed');
  const copy=path.join(dir,'Copia.ESF');await fs.copyFile(p.path,copy);await crashed.draft({...afterUndo.deck,title:'Só no original'});
  const third=newStore(),other=await third.open(copy);assert.ok(!other.recovered,'a copy never takes the draft of another file');
  await writeDeck(p.path,{...afterUndo.deck,title:'Externa'});const changed=await newStore().open(p.path);assert.notEqual(changed.deck.title,'Só no original','a draft of another version is ignored');
});
test('conversations the assistant is still writing are not packed half written',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await esfIn(dir),newDeck('IA'));const s=store.location(p.deck.id),c=path.join(s.workspace,'.edukors/ai/conversations.json');
  await fs.mkdir(path.dirname(c),{recursive:true});await fs.writeFile(c,'v1');await store.save(p.deck);
  await fs.utimes(c,new Date(Date.now()-5000),new Date(Date.now()-5000));
  store.aiStart(p.deck.id);await fs.writeFile(c,'v2 parcial');
  const r=await store.save(p.deck);assert.equal(r.pending,true);assert.equal(r.project.pending,true);
  const read=async()=>{const pkg=await openPackage(p.path);try{return(await pkg.read('.edukors/ai/conversations.json')).toString();}finally{await pkg.close();}};
  assert.equal(await read(),'v1');store.aiEnd(p.deck.id);assert.equal((await store.save(p.deck)).pending,false);assert.equal(await read(),'v2 parcial');
});
test('invalid, unsafe and oversized packages are rejected',async()=>{
  const dir=await fixture(),store=newStore(),file=path.join(dir,'x.ESF');
  const valid=await store.create(path.join(dir,'ok.ESF'),newDeck('OK'));const m=(await openPackage(valid.path));const manifest=JSON.parse((await m.read('manifest.json')).toString());await m.close();
  const reject=async(files:Record<string,any>,re:RegExp,opts?:any)=>{await fs.writeFile(file,zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,typeof v==='string'?strToU8(v):v])),opts));await assert.rejects(()=>newStore().open(file),re);};
  await fs.writeFile(file,JSON.stringify(manifest));await assert.rejects(()=>newStore().open(file),/not a valid ESF package/,'the old JSON format is not read');
  await reject({'manifest.json':JSON.stringify({...manifest,packageVersion:2})},/Unsupported ESF version/);
  for(const schemaVersion of [1,2])await reject({'manifest.json':JSON.stringify({...manifest,schemaVersion})},/Unsupported ESF version/);
  await reject({'manifest.json':'{}'},/not a valid ESF package/);
  await reject({'manifest.json':JSON.stringify(manifest),'../fora.txt':'x'},/Invalid path/);
  await reject({'manifest.json':JSON.stringify(manifest),'/abs.txt':'x'},/Invalid path/);
  await reject({'manifest.json':JSON.stringify(manifest),'media/A.txt':'x','media/a.txt':'y'},/Duplicate path/);
  await reject({'manifest.json':JSON.stringify(manifest),'media':'x','media/a.txt':'y'},/both a file and a folder/);
  await reject({'manifest.json':JSON.stringify(manifest),'a:b.txt':'x'},/Invalid path/);
  await reject({'manifest.json':JSON.stringify(manifest)},/Missing file in package/);
  // A symbolic link entry (Unix mode in the external attributes).
  {const zip=Buffer.from(zipSync({'manifest.json':strToU8(JSON.stringify(manifest)),'link':[strToU8('/etc/passwd'),{os:3,attrs:(0o120777<<16)>>>0}]} as any));await fs.writeFile(file,zip);await assert.rejects(()=>newStore().open(file),/Symbolic links/);}
  // Limits are checked before extraction and again against the bytes produced.
  const limit=packageLimits.file;packageLimits.file=1000;
  try{await reject({'manifest.json':JSON.stringify(manifest),'big.txt':'x'.repeat(5000)},/exceeds/);}finally{packageLimits.file=limit;}
  {const zip=Buffer.from(zipSync({'manifest.json':strToU8(JSON.stringify(manifest)),'bomb.txt':strToU8('x'.repeat(100000))}));const cd=zip.lastIndexOf(Buffer.from('bomb.txt'));
   zip.writeUInt32LE(10,cd-46+24);await fs.writeFile(file,zip);await assert.rejects(()=>newStore().open(file),/Corrupted|not a valid/,'declared size smaller than the data');}
  await assert.rejects(fs.access((newStore() as any).dirFor(await fs.realpath(file))),'a rejected package leaves no working folder');
});
test('packages written by the app are standard ZIP files',async()=>{
  const dir=await fixture(),p=await newStore().create(await esfIn(dir),themed('Padrão'));
  const files=unzipSync(new Uint8Array(await fs.readFile(p.path)));assert.ok(files['manifest.json']);
  assert.equal(JSON.parse(strFromU8(files['manifest.json'])).packageVersion,1);
  const tpl=path.join(dir,'t.ESF');await writeDeck(tpl,p.deck);assert.equal((await readDeck(tpl)).title,'Padrão');assert.ok(!(await entries(tpl)).some(n=>n.startsWith('.edukors')));
});
test('path confinement handles traversal and symlinks',async()=>{
  const dir=await fixture(),outside=await fixture();await fs.writeFile(path.join(outside,'secret'),'x');await fs.symlink(outside,path.join(dir,'link'));
  await assert.rejects(()=>inside(dir,'../secret'),/Invalid/);
  await assert.rejects(()=>inside(dir,'link/secret'),/Symbolic/);
  await assert.rejects(()=>inside(dir,'link/new',true),/Symbolic/);
});
test('validation rejects unsupported versions, missing assets and active HTML',()=>{
  const d=newDeck('Valid');validateDeck(d);
  assert.throws(()=>validateDeck({...d,schemaVersion:4} as any),/Unsupported/);
  const s=d.slides[0];s.html='<section class="slide"><img src="asset:missing"></section>';assert.throws(()=>validateDeck(d),/Missing/);
  s.html='<section><script>alert(1)</script></section>';assert.throws(()=>validateDeck(d),/Unsupported HTML/);
  const duplicated=duplicateSlides([sample('cards')]);assert.ok(duplicated[0].id.startsWith('s-'));
});
test('HTML export minifies the player, slide runtimes and slide scripts',()=>{
  const d=themed('Mini');d.slides.push(sample('cards'));d.slides[1].script='window.esfMarker = function markerFn (value) {\n  // comment\n  return value + 1;\n};';
  d.slides.push({...sample('cards'),id:'s-bad',script:'this is not js'});
  const plain=playerDocument(d),html=playerDocument(d,{minify:minifyJs});assert.ok(html.length<plain.length*0.85,`${html.length} vs ${plain.length}`);
  assert.ok(!/__ESF_(DATA|CONFIG|WORDS)__/.test(html));const code=html.match(/<script>([\s\S]*)<\/script><\/body>/)![1];new Function(code);
  assert.ok(html.includes('window.esfMarker=function')&&!html.includes('// comment'));assert.ok(html.includes('this is not js'));
  const runtimes=minifyJs(`(${'function(a){return a}'})(__ESF_CONFIG__);`);assert.ok(runtimes.includes('__ESF_CONFIG__'));
});
test('HTML export contains all content without editor commands or sibling dependencies',()=>{
  const d=themed('Offline');d.slides.push(sample('cards'));d.slides[0].title='</script><script>bad</script>';
  const html=playerDocument(d);assert.ok(html.startsWith('<!doctype html>'));assert.ok(html.includes('esf-player'));assert.ok(html.includes('Offline'));
  assert.ok(!html.includes('showDirectoryPicker'));assert.ok(!html.includes('delete-slide'));assert.ok(!html.includes('export-btn'));assert.ok(!html.includes('fetch('));
  assert.ok(!html.includes('</script><script>bad'));
  assert.match(slideDocument(d,d.slides[1],true),/__slideReady/);
});
test('exported player messages use English regardless of the editor language',()=>{
  const d=newDeck('Apresentação');d.slides[0].poll={version:1,provider:'edukors',type:'quiz',prompt:'Qual alternativa?',options:['Primeira','Segunda']};
  for(const lang of ['pt','es','en'] as const){
    const html=playerDocument(d,{lang});
    for(const text of ['<html lang="en">','Made with Edukors Slides Editor','Enable animations','Open presenter panel','Clear everything on the whiteboard?','Receiving responses','No responses to display.','The operation could not be confirmed','Qual alternativa?','Primeira'])assert.ok(html.includes(text),text);
    for(const text of ['Gerado pelo','Ativar animações','Recebendo respostas','Generado con','Activar animaciones','Recibiendo respuestas'])assert.ok(!html.includes(text),text);
  }
  const internal=playerDocument(d,{tools:false,lang:'pt'});assert.ok(internal.includes('<html lang="pt">'));assert.ok(internal.includes('Ativar animações'));
});
test('CLI profile environment isolates inherited auth and preserves requested config',()=>{
  const old=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='not-a-real-key';
  const e=childEnv({id:'a',name:'a',executable:'claude',configDir:'~/.claude-A'});
  assert.equal(e.ANTHROPIC_API_KEY,undefined);assert.ok(e.CLAUDE_CONFIG_DIR?.endsWith(path.sep+'.claude-A'));assert.equal(e.CLAUDE_CODE_DISABLE_AUTO_MEMORY,'1');
  if(old===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=old;
});
test('CLI stream parses split chunks, validates structured result and resumes by profile',noWindowsAI,async()=>{
  const dir=await fixture(),mock=path.join(dir,'mock-cli.cjs');
  await fs.writeFile(mock,`#!/usr/bin/env node
let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const c=JSON.parse(input);process.stdout.write(JSON.stringify({type:'system',session_id:'session-a'})+'\\n');const out=JSON.stringify({type:'result',session_id:'session-a',structured_output:{message:'Done',slideUpdates:c.project.slides},usage:{input_tokens:12,output_tokens:8},total_cost_usd:0.01})+'\\n';process.stdout.write(out.slice(0,20));setTimeout(()=>process.stdout.write(out.slice(20)),15);});`);
  await fs.chmod(mock,0o755);
  const d=newDeck('AI');const events:any[]=[];let saved:Record<string,string>={};
  const provider=new ClaudeProvider(e=>events.push(e),{},s=>saved=s);
  const out=await provider.send(d,{id:'a',name:'A',executable:mock,configDir:dir},'test',dir,[d.slides[0].id]);
  assert.equal(out.deck!.slides[0].id,d.slides[0].id);assert.equal(out.message,'Done');
  assert.equal(provider.sessions.get(d.id+':a'),'session-a');assert.equal(saved[d.id+':a'],'session-a');
  assert.equal(events.find(e=>e.type==='usage').input,12);
  assert.equal(provider.busy(d.id),false,'a settled request must free the project for an immediate retry');
  provider.forgetProfile('a');assert.equal(provider.sessions.size,0);assert.deepEqual(saved,{});
});
test('agent has the full CLI toolset, confined to the presentation folder',noWindowsAI,async()=>{
  const dir=await fixture(),mock=path.join(dir,'args-cli.cjs');
  await fs.writeFile(mock,`#!/usr/bin/env node
require('fs').writeFileSync(${JSON.stringify(path.join(dir,'argv.json'))},JSON.stringify(process.argv.slice(2)));
process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({type:'result',structured_output:{message:'Para quem é a apresentação?',questions:[{question:'Público?',options:['Professores','Gestores'],multiSelect:false}]}})+'\\n'));`);
  await fs.chmod(mock,0o755);
  const d=newDeck('AI'),provider=new ClaudeProvider(()=>{});
  const out=await provider.send(d,{id:'a',name:'A',executable:mock,configDir:dir},'x',dir,[],{mcp:{url:'http://127.0.0.1:1/mcp',token:'t'}});
  assert.equal(out.deck,undefined,'a question changes nothing');assert.deepEqual(out.questions,[{question:'Público?',options:['Professores','Gestores'],multiSelect:false}]);
  const argv:string[]=JSON.parse(await fs.readFile(path.join(dir,'argv.json'),'utf8')),arg=(k:string)=>argv[argv.indexOf(k)+1];
  for(const tool of ['Bash','Write','Edit','WebSearch','WebFetch','Task'])assert.ok(arg('--tools').split(',').includes(tool),tool);
  assert.ok(argv.includes('--restricted')&&!argv.includes('--safe-mode')&&!argv.includes('--dangerously-skip-permissions'));
  assert.equal(arg('--permission-prompts'),'none');assert.match(arg('--allowedTools'),/mcp__edukors/);
  assert.equal(JSON.parse(arg('--mcp-config')).mcpServers.edukors.headers.authorization,'Bearer t');
  const settings=JSON.parse(arg('--settings')),fsRules=settings.sandbox.filesystem;
  assert.equal(settings.sandbox.enabled,true);assert.equal(settings.sandbox.allowUnsandboxedCommands,false);assert.equal(settings.sandbox.failIfUnavailable,true);
  assert.ok(fsRules.denyRead.includes('~'));assert.deepEqual(fsRules.allowRead,[dir]);assert.deepEqual(fsRules.allowWrite,[dir]);
  for(const p of ownedPaths)assert.ok(fsRules.denyWrite.includes(path.join(dir,p))&&settings.permissions.deny.includes(`Write(/${path.join(dir,p)}/**)`),p);
  assert.ok(ownedPaths.includes('manifest.json'));assert.deepEqual(agentSettings(dir,[],'darwin').sandbox!.filesystem.denyWrite.includes(dir),false,'never denies the whole folder');
  assert.ok(agentTools.split(',').every(t=>instruction('en').includes(t)));assert.match(instruction('en'),/only on this presentation/);
});
test('on Windows the agent has no shell or subagents, and its file rules use POSIX paths',()=>{
  const tools=toolsFor('win32').split(','),root='C:\\Users\\Ana\\AppData\\Roaming\\ws\\files',settings:any=agentSettings(root,[],'win32'),text=instruction('en','win32');
  for(const t of ['Bash','Task'])assert.ok(!tools.includes(t)&&!settings.permissions.allow.includes(t)&&!text.includes(t+','),t);
  for(const t of ['Read','Write','Edit','WebSearch','WebFetch'])assert.ok(tools.includes(t)&&text.includes(t),t);
  assert.equal(settings.sandbox,undefined,'no sandbox to require where none exists');assert.match(text,/no shell \(Bash\)/);assert.doesNotMatch(text,/subagents \(Task\)/);
  assert.ok(settings.permissions.deny.includes('Write(//c/Users/Ana/AppData/Roaming/ws/files/manifest.json/**)'),settings.permissions.deny[0]);
  assert.ok(agentSettings('/Users/ana/ws',[],'darwin').permissions.deny.includes('Write(//Users/ana/ws/slides/**)'));assert.ok(toolsFor('darwin').includes('Bash'));
});
test('CLI activity is reported and each conversation resumes its own session',noWindowsAI,async()=>{
  const dir=await fixture(),mock=path.join(dir,'activity-cli.cjs');
  await fs.writeFile(mock,`#!/usr/bin/env node
let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const c=JSON.parse(input),w=o=>process.stdout.write(JSON.stringify({session_id:'s-'+process.argv.length,...o})+'\\n');
w({type:'system',subtype:'init',model:'test-model'});w({type:'stream_event',event:{type:'content_block_start',content_block:{type:'thinking'}}});
w({type:'assistant',message:{content:[{type:'tool_use',id:'t1',name:'Read',input:{file_path:${JSON.stringify(dir)}+'/notes/a.md'}}]}});
w({type:'assistant',message:{content:[{type:'tool_use',id:'t1',name:'Read',input:{file_path:'x'}}]}});
w({type:'stream_event',event:{type:'content_block_start',content_block:{type:'tool_use',name:'StructuredOutput'}}});
w({type:'stream_event',event:{type:'content_block_delta',delta:{type:'input_json_delta',partial_json:'{"slides":'}}});
w({type:'result',structured_output:{message:'ok',slideUpdates:c.project.slides}});});`);
  await fs.chmod(mock,0o755);
  const d=newDeck('AI');const events:any[]=[];const provider=new ClaudeProvider(e=>events.push(e));
  await provider.send(d,{id:'a',name:'A',executable:mock,configDir:dir},'x',dir,[],{conversation:'c-1'});
  const kinds=events.filter(e=>e.type==='activity').map(e=>e.kind);
  assert.deepEqual(kinds,['start','thinking','tool','writing'],'duplicate tool events are dropped');
  assert.equal(events.find(e=>e.kind==='tool').detail,path.join('notes','a.md'),'paths inside the folder are shown relative');
  assert.equal(events.find(e=>e.type==='progress').bytes,10);
  assert.ok(provider.sessions.has(d.id+':c-1:a'));
});
test('cancelled request never yields changes, even when the CLI answers after the signal',noWindowsAI,async()=>{
  const dir=await fixture(),mock=path.join(dir,'late-cli.cjs');
  await fs.writeFile(mock,`#!/usr/bin/env node
process.on('SIGINT',()=>{});let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const c=JSON.parse(input);setTimeout(()=>{process.stdout.write(JSON.stringify({type:'result',structured_output:{message:'late',slideUpdates:c.project.slides}})+'\\n');process.exit(0);},400);});`);
  await fs.chmod(mock,0o755);
  const d=newDeck('Cancel'),provider=new ClaudeProvider(()=>{});
  const pending=provider.send(d,{id:'a',name:'A',executable:mock,configDir:dir},'test',dir,[]);
  setTimeout(()=>provider.cancel(d.id),100);
  await assert.rejects(pending,CancelledError);assert.equal(provider.busy(d.id),false);
});
test('missing CLI executable rejects without leaving the project busy',async()=>{
  const d=newDeck('Missing'),provider=new ClaudeProvider(()=>{});
  await assert.rejects(provider.send(d,{id:'a',name:'A',executable:'/nonexistent/claude',configDir:'/tmp'},'x',process.cwd(),[]));
  assert.equal(provider.busy(d.id),false);
});
test('resources must be embedded while links may stay external',()=>{
  const d=themed('Refs'),s=d.slides[0];
  for(const html of ['<section class="slide"><img src="https://example.com/a.png"></section>','<section class="slide"><img src="images/a.png"></section>','<section class="slide" style="background:url(\'//cdn/x.jpg\')"></section>','<section class="slide"><svg><image href="pic.png"/></svg></section>']){
    s.html=html;assert.throws(()=>validateDeck(d),/not embedded/,html);
  }
  for(const html of ['<section class="slide"><a href="https://example.com">site</a></section>','<section class="slide"><svg><use href="#shape"/><rect fill="url(#g)"/></svg></section>','<section class="slide"><img src="data:image/png;base64,aGVsbG8="></section>']){
    s.html=html;validateDeck(d);
  }
});
test('exported player stores each asset once and resolves it per slide',()=>{
  const d=themed('Catalog'),data=Buffer.alloc(3000,7).toString('base64');
  d.assets.push({id:'asset-big',name:'big.png',mime:'image/png',data},{id:'asset-unused',name:'u.png',mime:'image/png',data:'aGVsbG8='});
  d.slides=[1,2,3].map(()=>({...newSlide(d.layouts[0]),html:'<section class="slide"><img src="asset:asset-big"></section>'}));
  const html=playerDocument(d);
  assert.equal(html.split(data).length-1,1);assert.ok(!html.includes('aGVsbG8='),'unused assets are not exported');
  assert.ok(slideDocument(d,d.slides[0],true).includes('data:image/png;base64,'+data),'editor previews still inline');
});
test('rate limit events map to the 5-hour session window',()=>{
  assert.deepEqual({...sessionLimits({status:'allowed',unifiedWindows:{five_hour:{utilization:.42,resetsAt:1800000000}}}),updated:0},{utilization:.42,resetsAt:1800000000,status:'allowed',updated:0});
  assert.equal(sessionLimits({status:'allowed',rateLimitType:'five_hour',utilization:.9,resetsAt:1800000000})!.utilization,.9);
  assert.equal(sessionLimits({status:'allowed',rateLimitType:'seven_day',utilization:.9}),null);
  assert.equal(sessionLimits(null),null);
});
// Minimal JSON Schema check (only the keywords esf.schema.json uses) so the schema cannot drift from serialize().
function conform(schema:any,v:any,at='$'):string[]{
  const e:string[]=[];
  if('const' in schema&&v!==schema.const)e.push(`${at}: const`);
  if(schema.enum&&!schema.enum.includes(v))e.push(`${at}: enum`);
  if(schema.type==='string'){if(typeof v!=='string')return[`${at}: string`];if(schema.pattern&&!new RegExp(schema.pattern,'u').test(v))e.push(`${at}: pattern`);if(v.length<(schema.minLength??0)||v.length>(schema.maxLength??Infinity))e.push(`${at}: length`);}
  if(schema.type==='integer'&&(!Number.isInteger(v)||v<(schema.minimum??-Infinity)))e.push(`${at}: integer`);
  if(schema.type==='array'){if(!Array.isArray(v))return[`${at}: array`];if(v.length<(schema.minItems??0)||v.length>(schema.maxItems??Infinity))e.push(`${at}: items`);v.forEach((x,i)=>e.push(...conform(schema.items,x,`${at}[${i}]`)));}
  if(schema.type==='object'){if(!v||typeof v!=='object'||Array.isArray(v))return[`${at}: object`];for(const k of schema.required||[])if(!(k in v))e.push(`${at}.${k}: required`);for(const[k,x]of Object.entries(v))if(schema.properties?.[k])e.push(...conform(schema.properties[k],x,`${at}.${k}`));else if(schema.additionalProperties===false)e.push(`${at}.${k}: not allowed`);}
  return e;
}
test('saved manifest follows esf.schema.json; agent instructions avoid duplicating it',async()=>{
  const store=newStore(),p=await store.create(await esfIn(await fixture()),themed('Schema'));
  p.deck.slides.push(sample('cards'));p.deck.assets.push({id:'asset-image',name:'tiny.png',mime:'image/png',data:'aGVsbG8='},{id:'asset-font',name:'f.woff2',mime:'font/woff2',data:'aGVsbG8='});p.deck.systemPrompt='Público: professores.';
  const saved=(await store.save(p.deck)).project,pkg=await openPackage(saved.path);
  try{assert.deepEqual(conform(esfSchema,JSON.parse((await pkg.read('manifest.json')).toString())),[]);}finally{await pkg.close();}
  assert.ok(!instruction('en').includes(JSON.stringify(esfSchema)));
  assert.match(instruction('en'),/slideUpdates/);
});

test('fonts installed only on this computer are embedded in the export; system and generic ones are not',async()=>{
  // Minimal sfnt with just a name table (family "Fonte Teste").
  const name=Buffer.from('Fonte Teste','utf16le').swap16(),table=Buffer.alloc(18+name.length);
  table.writeUInt16BE(1,2);table.writeUInt16BE(18,4);table.writeUInt16BE(3,6);table.writeUInt16BE(1,8);table.writeUInt16BE(0x409,10);table.writeUInt16BE(1,12);table.writeUInt16BE(name.length,14);name.copy(table,18);
  const head=Buffer.alloc(28);head.writeUInt32BE(0x00010000,0);head.writeUInt16BE(1,4);head.write('name',12,'latin1');head.writeUInt32BE(28,20);head.writeUInt32BE(table.length,24);
  const dir=path.join(root,'fonts');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'FonteTeste.ttf'),Buffer.concat([head,table]));
  process.env.ESF_FONT_DIRS=dir;
  const d=themed('Fontes');d.slides[0].css='h1{font-family:"Fonte Teste",Georgia,serif}p{font-family:Ausente,Arial,sans-serif}';
  const r=await embedFonts(d);validateDeck(r.deck);
  assert.deepEqual(r.embedded,['Fonte Teste']);assert.deepEqual(r.missing,['Ausente']);
  assert.match(r.deck.masters[0].css,/@font-face\{font-family:"Fonte Teste";src:url\("asset:asset-[0-9a-f]{64}"\)/);
  const html=playerDocument(r.deck);assert.ok(!/@font-face[^}]*url\("asset:/.test(html),'asset URLs resolved to embedded data');assert.ok(html.includes(r.deck.assets.at(-1)!.data.slice(0,40)));
  assert.equal(d.masters[0].css.includes('@font-face'),false,'the saved deck is not changed');
});

test('alignment uses nearest edges/centers, preserves axis locks and supports bypass',async()=>{
  const {alignMovement:align}=await import('../src/shared/geometry');
  const box={left:10,top:20,width:100,height:80},target={left:200,top:300,width:100,height:80};
  const snapped=align(box,[target],88,198);
  assert.equal(snapped.dx,90);assert.equal(snapped.dy,200);
  assert.deepEqual(snapped.guides,[{axis:0,position:200,from:220,to:380},{axis:1,position:300,from:100,to:300}]);
  assert.deepEqual(align(box,[target],88,198,null,true),{dx:88,dy:198,guides:[]});
  const locked=align(box,[target],88,198,'y');assert.equal(locked.dx,90);assert.equal(locked.dy,0);assert.equal(locked.guides.length,1);
  const closest=align(box,[target,{...target,left:199}],88,0);assert.equal(closest.dx,89);
  assert.equal(align(box,[target],84,0).dx,84,'outside five screen pixels does not snap');
  assert.equal(align(box,[],88,198).guides.length,0);
  // At different zooms the attraction zone remains five screen pixels, not five slide units.
  for(const zoom of [.25,.5,1,2]){const a={left:10*zoom,top:0,width:100*zoom,height:80*zoom},b={left:200*zoom,top:0,width:100*zoom,height:80*zoom};
    assert.equal(align(a,[b],90*zoom-3,0).dx,90*zoom);}
  const serialized=Function(`return (${align.toString()})`)();assert.deepEqual(serialized(box,[target],88,198),snapped,'frame function has no external dependencies');
});

test('image resize preserves aspect ratio and opposite corner, clamps sizes, and permits free resize',async()=>{
  const {resizeImage}=await import('../src/shared/geometry');
  for(const corner of ['nw','ne','sw','se']){
    const west=corner.includes('w'),north=corner.includes('n'),r=resizeImage(400,200,west?-80:80,north?-40:40,corner);
    assert.deepEqual(r,{width:480,height:240,x:west?-80:0,y:north?-40:0});
  }
  assert.deepEqual(resizeImage(400,200,80,0,'se',true),{width:480,height:200,x:0,y:0});
  const small=resizeImage(400,200,-10000,-10000,'se');assert.equal(small.height,8);assert.equal(small.width/small.height,2);
  const large=resizeImage(400,200,100000,100000,'se');assert.equal(large.width,16000);assert.equal(large.width/large.height,2);
  const serialized=Function(`return (${resizeImage.toString()})`)();assert.deepEqual(serialized(400,200,80,40,'se'),resizeImage(400,200,80,40,'se'));
});
test('text boxes resize from sides and keep growing with their text',async()=>{
  const {resizeImage,boxStyle}=await import('../src/shared/geometry');
  assert.deepEqual(resizeImage(400,200,-60,90,'e',true),{width:340,height:200,x:0,y:0},'east side ignores vertical movement');
  assert.deepEqual(resizeImage(400,200,30,-50,'n',true),{width:400,height:250,x:0,y:-50},'north side keeps the bottom fixed');
  assert.deepEqual(resizeImage(400,200,40,0,'w',true),{width:360,height:200,x:40,y:0});
  assert.deepEqual(boxStyle(300,80,4,-2,true),{boxSizing:'border-box',width:'300px',height:'auto',minWidth:'0px',minHeight:'80px',maxWidth:'none',maxHeight:'none',flex:'0 0 auto',translate:'4px -2px'});
  assert.equal(boxStyle(300,80,0,0).height,'80px');
  const serialized=Function(`return (${boxStyle.toString()})`)();assert.deepEqual(serialized(300,80,4,-2,true),boxStyle(300,80,4,-2,true));
  const {unresolvedReference}=await import('../src/shared/model');
  assert.equal(unresolvedReference('<div style="background-image: url(&quot;data:image/png;base64,AA==&quot;)"></div>'),null,'DOM-serialized style URLs');
  assert.equal(unresolvedReference('<div style="background: url(&quot;https://x.test/a.png&quot;)"></div>'),'https://x.test/a.png');
  const {cleanOp}=await import('../src/shared/edit');
  assert.equal((cleanOp({type:'resize',index:1,width:300,height:80,x:0,y:0,fit:true}) as any)?.fit,true);
  assert.ok(!('fit' in cleanOp({type:'resize',index:1,width:300,height:80,x:0,y:0,fit:'yes'})!));
});
test('resize operations reject malformed dimensions and preserve subpixel positioning',async()=>{
  const {cleanOp}=await import('../src/shared/edit');
  const op={type:'resize',index:2,width:240.125,height:120.125,x:-20.125,y:0};
  assert.deepEqual(cleanOp(op),{...op,width:240.13,height:120.13,x:-20.12});
  for(const change of [{width:NaN},{height:Infinity},{width:0},{height:-1},{width:16001},{x:Infinity},{index:-1},{width:'40'}])assert.equal(cleanOp({...op,...change}),null);
});

test('canvas coordinates compose zoom, rotation and non-uniform ancestors and invert screen deltas',async()=>{
  const {canvasGeometry}=await import('../src/shared/geometry'),g=canvasGeometry();
  const parent=g.multiply({a:.5,b:0,c:0,d:.5},{a:0,b:2,c:-3,d:0});
  assert.deepEqual(g.vector(parent,20,40),{x:-60,y:20});
  assert.deepEqual(g.inverse(parent,-60,20),{x:20,y:40});
  assert.equal(g.inverse({a:0,b:0,c:0,d:1},1,1),null,'singular transforms cannot produce invalid positions');
  assert.deepEqual(g.translation('-50% 25%',320,180),[-160,45]);
  assert.deepEqual(g.translation('none',320,180),[0,0]);
  assert.deepEqual(g.translation('12.25px',320,180),[12.25,0]);
  const serialized=Function(`return (${canvasGeometry.toString()})()`)();
  assert.deepEqual(serialized.inverse(parent,-60,20),{x:20,y:40});
});

test('cropped, rotated and reflected resize anchors stay fixed at every corner',async()=>{
  const {canvasGeometry,resizeImage}=await import('../src/shared/geometry'),g=canvasGeometry();
  for(const m of [{a:.5,b:0,c:0,d:.5},{a:0,b:.5,c:-.5,d:0},{a:-.8,b:.2,c:.3,d:1.2}]){
    const origin={x:300,y:200},w=400,h=200,[t,r,b,l]=[.1,.2,.3,.15];
    const bounds=(width:number,height:number)=>({left:origin.x+Math.min(0,m.a*width)+Math.min(0,m.c*height),top:origin.y+Math.min(0,m.b*width)+Math.min(0,m.d*height),width:Math.abs(m.a*width)+Math.abs(m.c*height),height:Math.abs(m.b*width)+Math.abs(m.d*height)});
    for(const c of ['nw','ne','sw','se']){
      const fx=c.includes('w')?1-r:l,fy=c.includes('n')?1-b:t;
      const anchor=g.anchor(bounds(w,h),w,h,m,fx,fy),next=resizeImage(w,h,c.includes('w')?-60:60,c.includes('n')?-30:30,c);
      const after=g.anchor(bounds(next.width,next.height),next.width,next.height,m,fx,fy),delta=g.inverse(m,anchor.x-after.x,anchor.y-after.y)!;
      const screen=g.vector(m,delta.x,delta.y);
      assert.ok(Math.abs(after.x+screen.x-anchor.x)<1e-9);assert.ok(Math.abs(after.y+screen.y-anchor.y)<1e-9);
      assert.equal(next.width/next.height,2);
    }
  }
});

test('moves preserve fractional coordinates and reject out-of-range or untrusted optional values',async()=>{
  const {cleanOp}=await import('../src/shared/edit');
  assert.deepEqual(cleanOp({type:'move',index:3,x:0,y:-25.125,inline:true}),{type:'move',index:3,x:0,y:-25.12,inline:true});
  assert.deepEqual(cleanOp({type:'move',index:3,x:4100.12,y:0,inline:'yes'}),{type:'move',index:3,x:4100.12,y:0});
  for(const x of [16001,-16001,Infinity,NaN,'12'])assert.equal(cleanOp({type:'move',index:3,x,y:0}),null);
});

test('legacy selection metadata and object styling only accept supported properties',async()=>{
  const {cleanSelection,cleanOp}=await import('../src/shared/edit');
  assert.deepEqual(cleanSelection({index:2,kind:'text',crop:false,style:{fontFamily:'Platypi',fontSize:'112px',color:'rgb(230, 234, 235)',unknown:'ignored'},fonts:['Manrope','Platypi',42]},2),{index:2,kind:'text',crop:false,style:{fontFamily:'Platypi',fontSize:'112px',color:'rgb(230, 234, 235)'},fonts:['Manrope','Platypi']});
  assert.equal(cleanSelection({index:2,kind:'text'},3),undefined);
  assert.equal(cleanSelection({index:2,kind:'script'},2),undefined);
  const op={type:'style',index:2,style:{'background-color':'transparent','box-shadow':'none'}};
  assert.deepEqual(cleanOp(op),op);
  for(const style of [{position:'fixed'},{color:'red'},{'border-width':4},{'background-color':'url(https://example.com)'},{'box-shadow':'none;display:none'}])assert.equal(cleanOp({...op,style}),null);
  // Context menu: stacking order and text alignment, with fixed values only.
  for(const style of [{'z-index':'-2',position:'relative'},{isolation:'isolate'},{'text-align':'right'},{'align-content':'center'},{'justify-content':'flex-end'},{'align-items':'flex-start'}])assert.deepEqual(cleanOp({...op,style}),{...op,style});
  for(const style of [{position:'absolute'},{'z-index':'auto'},{'z-index':'1 !important'},{'text-align':'justify'},{'align-content':'space-between'},{isolation:'auto'}])assert.equal(cleanOp({...op,style}),null);
});

test('presentation system prompt lives in ai/system-prompt.md, reaches the CLI and changes only through the answer',noWindowsAI,async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await esfIn(dir),themed('Prompt'));
  const s=store.location(p.deck.id);await fs.mkdir(path.join(s.workspace,'ai'),{recursive:true});await fs.writeFile(path.join(s.workspace,'ai','notas.md'),'aux');
  p.deck.systemPrompt='# Palestra\nPúblico: professores.';
  const saved=(await store.save(p.deck)).project,names=await entries(saved.path);
  assert.ok(names.includes('ai/system-prompt.md')&&!names.includes('ai/notas.md'),'prompt managed, the rest of ai/ left out');
  await store.close(p.deck.id);const reopened=await newStore().open(saved.path);assert.equal(reopened.deck.systemPrompt,'# Palestra\nPúblico: professores.');
  const again=newStore(),q=await again.open(saved.path);delete q.deck.systemPrompt;const cleared=(await again.save(q.deck)).project;
  assert.ok(!(await entries(cleared.path)).includes('ai/system-prompt.md'),'an empty prompt leaves no file');
  assert.equal(applySlideChanges(reopened.deck,{systemPrompt:'Novo'})!.systemPrompt,'Novo');
  assert.equal('systemPrompt' in applySlideChanges(reopened.deck,{systemPrompt:' '})!,false);
  assert.equal(applySlideChanges(reopened.deck,{message:'ok'}),undefined,'omitted prompt changes nothing');
  assert.throws(()=>validateDeck({...reopened.deck,systemPrompt:'x'.repeat(20001)}),/system prompt/);
  assert.ok(ownedPaths.includes('ai/system-prompt.md'));
  assert.ok(!JSON.stringify(agentContext(reopened.deck,[])).includes('Palestra'),'sent once, in the system prompt');
  const mock=path.join(dir,'mock-args.cjs'),argsFile=path.join(dir,'args.json');
  await fs.writeFile(mock,`#!/usr/bin/env node
require('fs').writeFileSync(${JSON.stringify(argsFile)},JSON.stringify(process.argv));process.stdin.on('data',()=>{});process.stdin.on('end',()=>process.stdout.write(JSON.stringify({type:'result',session_id:'s',structured_output:{message:'ok'}})+'\\n'));`);
  await fs.chmod(mock,0o755);
  await new ClaudeProvider(()=>{}).send(reopened.deck,{id:'a',name:'A',executable:mock,configDir:dir},'x',dir,[],{systemPrompt:'Global rule'});
  const args:string[]=JSON.parse(await fs.readFile(argsFile,'utf8')),system=args[args.indexOf('--system-prompt')+1];
  assert.ok(system.indexOf('Global rule')>0&&system.indexOf('Público: professores.')>system.indexOf('Global rule'),'global first, then the presentation');
});

test('incremental slide edits preserve untouched code and support insertion and reordering and flag deletions',()=>{
  const deck=themed('Edits');deck.slides.push(sample('cards'));
  const before=structuredClone(deck),changed={...deck.slides[0],title:'Updated'},added=sample('quote');
  const next=applySlideChanges(deck,{slideUpdates:[changed,added]})!;
  assert.deepEqual(next.slides,[changed,deck.slides[1],added]);assert.deepEqual(deck,before);
  assert.deepEqual(applySlideChanges(deck,{slideUpdates:[added],slideOrder:[added.id,deck.slides[1].id,deck.slides[0].id]})!.slides,[added,deck.slides[1],deck.slides[0]]);
  assert.deepEqual(removedSlides(deck,next),[]);
  assert.deepEqual(removedSlides(deck,applySlideChanges(deck,{slideUpdates:[added],slideOrder:[added.id,deck.slides[1].id]})!).map(s=>s.id),[deck.slides[0].id]);
  assert.equal(applySlideChanges(deck,{message:'Answer only'}),undefined);
  assert.throws(()=>applySlideChanges(deck,{slideUpdates:[changed,changed]}),/duplicate/);
  for(const ids of [[],['missing'],[changed.id,changed.id]])assert.throws(()=>applySlideChanges(deck,{slideOrder:ids}),/order/);
  assert.throws(()=>applySlideChanges(deck,{slideUpdates:[added],slideOrder:[changed.id]}),/order/);
});

test('slide masters: objects render inside the slide, behind it; only the active master applies; the agent changes masters and layouts',()=>{
  assert.equal(withMaster('<section class="slide cover"><h1>A</h1></section>',''),'<section class="slide cover"><h1>A</h1></section>');
  assert.equal(withMaster('<section class="slide cover"><h1>A</h1></section>','<img src="x">'),'<section class="slide cover"><div class="esf-master"><img src="x"></div><h1>A</h1></section>');
  assert.equal(withMaster('<p>loose</p>','<i>m</i>'),'<div class="esf-master"><i>m</i></div><p>loose</p>');
  const deck=themed('Master');deck.masters[0].html='<div class="logo" style="position:absolute;right:40px;bottom:30px">Logo</div>';
  const doc=slideDocument(deck,deck.slides[0],true);
  assert.ok(doc.indexOf('class="esf-master"')>doc.indexOf('<section class="slide'),'the layer is inside the slide');assert.match(doc,/\.esf-master\{[^}]*z-index:-1/);
  // Masters are alternatives: only the active one applies, to every slide; layouts are shared.
  const second={id:'m-two',name:'Two',css:'.slide{background:navy}',html:'<i>two</i>'};deck.masters.push(second);validateDeck(deck);
  assert.ok(!slideDocument(deck,deck.slides[0],true).includes('<i>two</i>'),'an inactive master does not apply');
  deck.activeMaster='m-two';const other=slideDocument(deck,deck.slides[0],true);assert.ok(other.includes('background:navy')&&other.includes('<i>two</i>')&&!other.includes('Logo'));
  deck.activeMaster=deck.masters[0].id;
  const before=structuredClone(deck),next=applySlideChanges(deck,{masterUpdates:[{id:deck.masters[0].id,css:'body{color:red}'},{id:'m-new',name:'New',css:''}],activeMaster:'m-new',layoutUpdates:[{id:'cover',html:'<section class="slide">Nova capa</section>'},{id:'extra',name:'Extra',html:'<section class="slide"></section>'}]})!;
  assert.equal(next.masters[0].css,'body{color:red}');assert.equal(next.masters[0].html,deck.masters[0].html,'html kept when omitted');assert.equal(next.activeMaster,'m-new');assert.equal(next.masters.length,3);
  assert.equal(next.layouts.find(l=>l.id==='cover')!.html,'<section class="slide">Nova capa</section>');assert.equal(next.layouts.at(-1)!.id,'extra');
  validateDeck(next);assert.deepEqual(next.slides,deck.slides);assert.deepEqual(deck,before);
  assert.equal(applySlideChanges(deck,{slideUpdates:[{...deck.slides[0],layoutId:'nope'}]})!.slides[0].layoutId,deck.slides[0].layoutId,'an unknown layout keeps the previous one');
  assert.throws(()=>applySlideChanges(deck,{layoutUpdates:[{id:'../x',html:''}]}),/layout/);assert.throws(()=>applySlideChanges(deck,{masterUpdates:[{id:'x',css:1}]}),/master/);
  assert.throws(()=>applySlideChanges(deck,{activeMaster:'missing'}),/active master/);
  next.layouts[0].html='<section class="slide"><script>x</script></section>';assert.throws(()=>validateDeck(next),/layout/);
  assert.throws(()=>validateDeck({...deck,layouts:[]}),/layouts/);assert.throws(()=>validateDeck({...deck,activeMaster:'gone'}),/active master/);
  const orphan=structuredClone(deck);orphan.slides[0].layoutId='gone';assert.throws(()=>validateDeck(orphan),/layout that does not exist/);
  assert.match(instruction('Português'),/layoutUpdates/);assert.match(instruction('Português'),/activeMaster/);
});

test('incremental context includes selected and unsaved edits with full authoritative order',()=>{
  const deck=themed('Context');deck.slides.push(sample('cards'),sample('quote'));
  const previous=sentKeys(deck);
  assert.deepEqual(agentContext(deck,[deck.slides[2].id]).project.slides,[deck.slides[2]],'only the selection goes inline; the rest is read from files');
  assert.ok(agentContext(deck,[]).project.masters.every((m:any)=>m.css!==undefined),'masters go in full the first time');
  deck.slides[1].notes='Unsaved edit';
  const ctx=agentContext(deck,[deck.slides[0].id],previous);
  assert.equal(ctx.contextMode,'delta');assert.deepEqual(ctx.project.slides,deck.slides.slice(0,2));
  assert.equal(ctx.slideIndex.length,3);assert.ok(ctx.project.masters.every((m:any)=>m.unchanged&&m.css===undefined)&&ctx.project.layouts.every((l:any)=>l.unchanged),'unchanged masters/layouts are not repeated');
  deck.masters[0].css+='h1{color:red}';assert.equal((agentContext(deck,[],previous).project.masters[0] as any).css,deck.masters[0].css);
  deck.slides.pop();assert.equal(agentContext(deck,[],previous).slideIndex.length,2);
});

test('provider uses incremental responses and context, but resends full state after an error',noWindowsAI,async()=>{
  const dir=await fixture(),mock=path.join(dir,'incremental-cli.cjs');
  await fs.writeFile(mock,`#!/usr/bin/env node
const fs=require('node:fs');let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const c=JSON.parse(input);fs.appendFileSync('contexts.jsonl',input+'\\n');const answer=c.request==='fail'?{is_error:true,result:'failed'}:{structured_output:{message:'Done',slideUpdates:[{...c.project.slides[0],title:'Changed'}]}};console.log(JSON.stringify({type:'result',session_id:'delta-session',...answer}));});`);
  await fs.chmod(mock,0o755);
  const deck=themed('Incremental');deck.slides.push(sample('cards'));
  const provider=new ClaudeProvider(()=>{}),profile={id:'a',name:'A',executable:mock,configDir:dir},selected=[deck.slides[0].id];
  const first=await provider.send(deck,profile,'edit',dir,selected);
  assert.equal(first.deck!.slides[0].title,'Changed');assert.deepEqual(first.deck!.slides[1],deck.slides[1]);
  await provider.send(first.deck!,profile,'edit',dir,selected);
  await assert.rejects(provider.send(first.deck!,profile,'fail',dir,selected),/failed/);
  await provider.send(first.deck!,profile,'edit',dir,selected);
  const contexts=(await fs.readFile(path.join(dir,'contexts.jsonl'),'utf8')).trim().split('\n').map(s=>JSON.parse(s));
  assert.deepEqual(contexts.map(c=>c.contextMode),['full','delta','delta','full']);
  assert.deepEqual(contexts.map(c=>c.project.slides.length),[1,1,1,1]);
  const file=JSON.parse(await fs.readFile(path.join(dir,contextDir,deck.slides[1].id+'.json'),'utf8'));assert.deepEqual(file,first.deck!.slides[1],'every slide is available to the agent as a file');
  const restarted=new ClaudeProvider(()=>{},Object.fromEntries(provider.sessions));
  await restarted.send(first.deck!,profile,'edit',dir,selected);
  const last=JSON.parse((await fs.readFile(path.join(dir,'contexts.jsonl'),'utf8')).trim().split('\n').at(-1)!);
  assert.equal(last.contextMode,'full','a restored session without a local snapshot gets full current content');
});

test('imported layouts persist their master binding and CSS; invalid bindings/resources are rejected',async()=>{
  const d=themed('Imported layout'),master={id:'m-imported',name:'Imported',html:'<div>Imported logo</div>',css:'body{color:navy}'};
  d.masters.push(master);d.layouts[1].masterId=master.id;d.layouts[1].css='h1{letter-spacing:4px}';
  const dir=await fixture(),file=await esfIn(dir);await writeDeck(file,d);assert.deepEqual(await readDeck(file),d);
  const html=slideDocument(d,d.slides[0],true);assert.match(html,/Imported logo/);assert.match(html,/letter-spacing:4px/);
  const changed=applySlideChanges(d,{layoutUpdates:[{id:d.layouts[1].id,css:'h1{color:green}'}]})!;
  assert.equal(changed.layouts[1].masterId,master.id);assert.equal(changed.layouts[1].css,'h1{color:green}');assert.deepEqual(changed.masters,d.masters);
  const active=applySlideChanges(d,{activeMaster:d.activeMaster})!;assert.equal(active.layouts[1].masterId,undefined,'explicit activation applies the chosen master to all layouts');
  const bad=structuredClone(d);bad.layouts[1].masterId='missing';assert.throws(()=>validateDeck(bad),/layout/);
  bad.layouts[1].masterId=master.id;bad.layouts[1].css='div{background:url(asset:asset-missing)}';assert.throws(()=>validateDeck(bad),/Missing resource/);
});
