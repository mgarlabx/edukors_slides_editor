import './pptx-import.test';
import './openxml.test';
import './poll.test';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {newDeck,newSlide,validateDeck,duplicateSlides} from '../src/shared/model';
import {ProjectStore,ConflictError,inside,readDeck,writeDeck,serialize} from '../src/main/projects';
import {openPackage,packageLimits} from '../src/main/package';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {slideDocument,withMaster} from '../src/shared/render';
import {playerDocument} from '../src/shared/player';
import {minifyJs} from '../src/main/minify';
import {applySlideChanges,agentContext,removedSlides,sentKeys} from '../src/shared/assistant';
import esfSchema from '../src/shared/esf.schema.json';
import {embedFonts} from '../src/main/fonts';
const root=path.resolve('test-results/core');
await fs.mkdir(root,{recursive:true});
const fixture=async()=>fs.mkdtemp(path.join(root,'case-'));
const workspaces=path.join(root,'workspaces'),newStore=()=>new ProjectStore(workspaces);
const eslxIn=async(dir:string,name='Apresentação.eslx')=>path.join(dir,name.replace(/\.(?:esf|eslx)$/i,'.eslx'));
const writeLegacyFixture=async(file:string,deck:ReturnType<typeof newDeck>)=>{const {files,manifest}=serialize(deck);await fs.writeFile(file,zipSync(Object.fromEntries(Object.entries({'manifest.json':JSON.stringify(manifest),...files}).map(([name,data])=>[name,typeof data==='string'?strToU8(data):new Uint8Array(data)]))));};
// New decks start blank; these layouts stand in for the content layouts people build.
const sampleLayouts=[{id:'cover',name:'Capa',html:'<section class="slide cover"><h1 data-field="title">Título da apresentação</h1><p data-field="subtitle">Uma ideia</p></section>'},
  {id:'cards',name:'Cartões',html:'<section class="slide"><h2 data-field="title">Título</h2><div class="cards">'+[0,1,2].map(i=>`<div class="card" data-step><h3 data-field="card${i}">Ideia</h3><p data-field="body${i}">Texto</p></div>`).join('')+'</div></section>'},
  {id:'quote',name:'Citação',html:'<section class="slide"><blockquote data-field="quote">Frase</blockquote><cite data-field="author">Nome</cite></section>'}];
function themed(title:string){const d=newDeck(title);d.layouts.push(...structuredClone(sampleLayouts));d.slides=[newSlide(d.layouts[1])];return d;}
const sample=(id:string)=>newSlide(sampleLayouts.find(l=>l.id===id)!);
const entries=async(file:string)=>{const pkg=await openPackage(file);try{return[...pkg.entries.keys()].sort();}finally{await pkg.close();}};
test('ESLX is a single OPC package that survives copy, move and reopen',async()=>{
  const dir=await fixture(),store=newStore();
  const a=await store.create(await eslxIn(dir,'Apresentação com acentos.ESF'),themed('Apresentação com acentos'));
  a.deck.slides.push(sample('cards'));a.deck.slides[1].html=a.deck.slides[1].html.replace('</section>','<img src="asset:asset-image" alt=""></section>');
  a.deck.assets.push({id:'asset-image',name:'tiny.png',mime:'image/png',data:'aGVsbG8='},{id:'asset-old',name:'old.png',mime:'image/png',data:'b2xk'});
  const s=store.location(a.deck.id);await fs.mkdir(path.join(s.workspace,'research'),{recursive:true});await fs.writeFile(path.join(s.workspace,'research','notas.md'),'fonte');
  await fs.mkdir(path.join(s.workspace,'.edukors/ai'),{recursive:true});await fs.writeFile(path.join(s.workspace,'.edukors/ai/conversations.json'),'{"sessions":[]}');await fs.writeFile(path.join(s.workspace,'.edukors/lock'),'x');
  const saved=(await store.save(a.deck)).project;
  assert.deepEqual(await fs.readdir(dir),['Apresentação com acentos.eslx'],'one visible file, nothing next to it');
  assert.equal((await fs.readFile(saved.path)).subarray(0,4).toString('latin1'),'PK\x03\x04');
  const names=await entries(saved.path);
  for(const n of ['[Content_Types].xml','_rels/.rels','slides/presentation.json','slides/media/asset1.bin','slides/ai/legacy-conversations.json'])assert.ok(names.includes(n),n);
  for(const n of ['.edukors/lock','research/notas.md','images/asset-old.png'])assert.ok(!names.includes(n),n+' stays out: internal state, auxiliary files and unused images');
  assert.deepEqual(saved.deck.assets.map(x=>x.id),['asset-image'],'the saved deck drops the unused image');
  const other=await fixture(),copy=path.join(other,'Cópia movida.eslx');await fs.copyFile(saved.path,copy);await store.close(a.deck.id);await fs.rm(saved.path);
  const reopened=await newStore().open(copy);
  assert.equal(reopened.deck.slides.length,2);assert.equal(reopened.deck.assets[0].data,'aGVsbG8=');assert.equal(reopened.path,await fs.realpath(copy));assert.equal(reopened.deck.revision,saved.deck.revision);
  assert.ok(!('root' in reopened),'the working folder is not exposed');
});
test('a new presentation has no file until its first save, which keeps its ID, files and conversations',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.untitled({...themed(''),title:'Sem título'});
  assert.equal(p.path,'');assert.deepEqual(await fs.readdir(dir),[]);const blank=newDeck('');assert.deepEqual([blank.masters.length,blank.layouts.length,blank.masters[0].html,blank.slides[0].html],[1,1,'','<section class="slide"></section>'],'Blank: one white master with one white layout');
  await assert.rejects(()=>store.save(p.deck),/Save As/);await store.draft(p.deck);
  const s=store.location(p.deck.id),old=s.dir;await fs.mkdir(path.join(s.workspace,'research'),{recursive:true});await fs.writeFile(path.join(s.workspace,'research','notas.md'),'fonte');
  const saved=await store.attach(p.deck.id,path.join(dir,'Nova.eslx'),{...p.deck,title:'Nova'});
  assert.equal(saved.deck.id,p.deck.id);assert.equal(saved.deck.title,'Nova');assert.deepEqual(await fs.readdir(dir),['Nova.eslx']);assert.ok(!(await entries(saved.path)).includes('research/notas.md'));
  await assert.rejects(fs.access(old),'the untitled working folder moved');await assert.rejects(()=>store.attach(p.deck.id,path.join(dir,'Outra.eslx'),p.deck),/already has a file/);
  await store.untitled(newDeck('X'));const left=(await fs.readdir(workspaces)).filter(n=>n.startsWith('untitled-'));await newStore().cleanup();
  for(const n of left)await assert.rejects(fs.access(path.join(workspaces,n)),'cleanup removes untitled leftovers');
});
test('several presentations share a folder; copies with one ID never share a session',async()=>{
  const dir=await fixture(),store=newStore();
  const a=await store.create(await eslxIn(dir,'A.ESF'),newDeck('A'));const b=await store.create(await eslxIn(dir,'B.ESF'),newDeck('B'));
  assert.notEqual(store.location(a.deck.id).workspace,store.location(b.deck.id).workspace);
  await fs.copyFile(a.path,path.join(dir,'A cópia.eslx'));
  const c=await store.open(path.join(dir,'A cópia.eslx'));assert.notEqual(c.deck.id,a.deck.id,'the second copy gets its own ID');
  assert.equal((await store.open(a.path)).deck.id,a.deck.id,'opening the same file again reuses its session');
  await assert.rejects(()=>store.create(a.path,newDeck('Outra')),/open in another tab/);
  const ws=store.location(a.deck.id).dir;await store.close(a.deck.id);await assert.rejects(fs.access(ws),'closing removes the working folder');
});
test('external changes and missing files are never overwritten',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await eslxIn(dir),newDeck('Conflicts'));
  await fs.writeFile(p.path,'external');
  await assert.rejects(()=>store.save(p.deck),(e:any)=>e instanceof ConflictError&&e.reason==='changed');assert.equal(await fs.readFile(p.path,'utf8'),'external');
  await fs.rm(p.path);await assert.rejects(()=>store.save(p.deck),(e:any)=>e instanceof ConflictError&&e.reason==='missing');
});
test('a failed save keeps the previous package and leaves no temporary file',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await eslxIn(dir),themed('Atomic'));
  const before=await fs.readFile(p.path),s=store.location(p.deck.id);
  const corrupt=path.join(s.workspace,'.edukors','ai','common-conversations.json');
  await fs.mkdir(path.dirname(corrupt),{recursive:true});await fs.writeFile(corrupt,'{invalid');
  await assert.rejects(()=>store.save(p.deck),/JSON|Unexpected|property name/i);
  assert.deepEqual(await fs.readFile(p.path),before);assert.deepEqual(await fs.readdir(dir),['Apresentação.eslx']);
  await fs.rm(corrupt);assert.ok((await store.save(p.deck)).project.deck.revision>p.deck.revision,'the session keeps working');
});
test('draft recovery is tied to the file and its version, with its working folder',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await eslxIn(dir),newDeck('Draft'));
  const draft=structuredClone(p.deck);draft.title='Recovered';await store.draft(draft);await fs.writeFile(path.join(store.location(p.deck.id).workspace,'media.txt'),'unsaved');
  // A crash: the session is gone but its working folder and draft remain.
  const crashed=newStore();await crashed.cleanup();
  const restored=await crashed.open(p.path);assert.equal(restored.recovered,true);assert.equal(restored.deck.title,'Recovered');
  assert.equal(await fs.readFile(path.join(crashed.location(restored.deck.id).workspace,'media.txt'),'utf8'),'unsaved');
  const next=(await crashed.save(draft)).project;const afterUndo=(await crashed.save(p.deck)).project;assert.ok(afterUndo.deck.revision>next.deck.revision);
  assert.ok(!(await entries(p.path)).includes('media.txt'),'auxiliary files are not packed');
  const copy=path.join(dir,'Copia.eslx');await fs.copyFile(p.path,copy);await crashed.draft({...afterUndo.deck,title:'Só no original'});
  const third=newStore(),other=await third.open(copy);assert.ok(!other.recovered,'a copy never takes the draft of another file');
  await writeDeck(p.path,{...afterUndo.deck,title:'Externa'});const changed=await newStore().open(p.path);assert.notEqual(changed.deck.title,'Só no original','a draft of another version is ignored');
});
test('conversations the assistant is still writing are not packed half written',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await eslxIn(dir),newDeck('IA'));const s=store.location(p.deck.id),c=path.join(s.workspace,'.edukors/ai/conversations.json');
  await fs.mkdir(path.dirname(c),{recursive:true});await fs.writeFile(c,'v1');await store.save(p.deck);
  await fs.utimes(c,new Date(Date.now()-5000),new Date(Date.now()-5000));
  store.aiStart(p.deck.id);await fs.writeFile(c,'v2 parcial');
  const r=await store.save(p.deck);assert.equal(r.pending,true);assert.equal(r.project.pending,true);
  const read=async()=>{const {readEslx}=await import('../src/main/eslx');return(await readEslx(p.path)).history?.toString();};
  assert.equal(await read(),'v1');store.aiEnd(p.deck.id);assert.equal((await store.save(p.deck)).pending,false);assert.equal(await read(),'v2 parcial');
});
test('invalid, unsafe and oversized packages are rejected',async()=>{
  const dir=await fixture(),store=newStore(),file=path.join(dir,'x.ESF');
  const manifest=serialize(newDeck('OK')).manifest;
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
  const dir=await fixture(),p=await newStore().create(await eslxIn(dir),themed('Padrão'));
  const files=unzipSync(new Uint8Array(await fs.readFile(p.path)));assert.ok(files['[Content_Types].xml']);
  assert.equal(JSON.parse(strFromU8(files['slides/presentation.json'])).version,1);
  const tpl=path.join(dir,'t.eslx');await writeDeck(tpl,p.deck);assert.equal((await readDeck(tpl)).title,'Padrão');assert.ok(!(await entries(tpl)).some(n=>n.startsWith('.edukors')));
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
test('private workspace follows legacy schema while the saved document uses native ESLX',async()=>{
  const store=newStore(),p=await store.create(await eslxIn(await fixture()),themed('Schema'));
  p.deck.slides.push(sample('cards'));p.deck.assets.push({id:'asset-image',name:'tiny.png',mime:'image/png',data:'aGVsbG8='},{id:'asset-font',name:'f.woff2',mime:'font/woff2',data:'aGVsbG8='});p.deck.systemPrompt='Público: professores.';
  const saved=(await store.save(p.deck)).project,pkg=await openPackage(saved.path);
  try{assert.deepEqual(conform(esfSchema,JSON.parse(await fs.readFile(path.join(store.location(saved.deck.id).workspace,'manifest.json'),'utf8'))),[]);assert.ok(pkg.entries.has('[Content_Types].xml'));assert.ok(pkg.entries.has('slides/presentation.json'));}finally{await pkg.close();}
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
  for(const style of [{'z-index':'-2',position:'relative'},{isolation:'isolate'},{'text-align':'right'},{'text-align':'justify'},{'align-content':'center'},{'justify-content':'flex-end'},{'align-items':'flex-start'}])assert.deepEqual(cleanOp({...op,style}),{...op,style});
  for(const style of [{position:'absolute'},{'z-index':'auto'},{'z-index':'1 !important'},{'text-align':'unsupported'},{'align-content':'space-between'},{isolation:'auto'}])assert.equal(cleanOp({...op,style}),null);
});

test('presentation system prompt lives in ai/system-prompt.md and changes only through apply_changes',async()=>{
  const dir=await fixture(),store=newStore(),p=await store.create(await eslxIn(dir),themed('Prompt'));
  const s=store.location(p.deck.id);await fs.mkdir(path.join(s.workspace,'ai'),{recursive:true});await fs.writeFile(path.join(s.workspace,'ai','notas.md'),'aux');
  p.deck.systemPrompt='# Palestra\nPúblico: professores.';
  const saved=(await store.save(p.deck)).project,names=await entries(saved.path);
  assert.ok(names.includes('slides/presentation.json')&&!names.includes('ai/notas.md'),'native content saved, auxiliary files left out');assert.equal(await fs.readFile(path.join(s.workspace,'ai/system-prompt.md'),'utf8'),p.deck.systemPrompt);
  await store.close(p.deck.id);const reopened=await newStore().open(saved.path);assert.equal(reopened.deck.systemPrompt,'# Palestra\nPúblico: professores.');
  const again=newStore(),q=await again.open(saved.path);delete q.deck.systemPrompt;const cleared=(await again.save(q.deck)).project;
  assert.equal((await readDeck(cleared.path)).systemPrompt,undefined,'an empty prompt leaves no native field');await assert.rejects(fs.access(path.join(again.location(q.deck.id).workspace,'ai/system-prompt.md')));
  assert.equal(applySlideChanges(reopened.deck,{systemPrompt:'Novo'})!.systemPrompt,'Novo');
  assert.equal('systemPrompt' in applySlideChanges(reopened.deck,{systemPrompt:' '})!,false);
  assert.equal(applySlideChanges(reopened.deck,{message:'ok'}),undefined,'omitted prompt changes nothing');
  assert.throws(()=>validateDeck({...reopened.deck,systemPrompt:'x'.repeat(20001)}),/system prompt/);
  assert.ok(!JSON.stringify(agentContext(reopened.deck,[])).includes('Palestra'),'sent once, in the system prompt');
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

test('imported layouts persist their master binding and CSS; invalid bindings/resources are rejected',async()=>{
  const d=themed('Imported layout'),master={id:'m-imported',name:'Imported',html:'<div>Imported logo</div>',css:'body{color:navy}'};
  d.masters.push(master);d.layouts[1].masterId=master.id;d.layouts[1].css='h1{letter-spacing:4px}';
  const dir=await fixture(),file=await eslxIn(dir);await writeDeck(file,d);assert.deepEqual(await readDeck(file),d);
  const html=slideDocument(d,d.slides[0],true);assert.match(html,/Imported logo/);assert.match(html,/letter-spacing:4px/);
  const changed=applySlideChanges(d,{layoutUpdates:[{id:d.layouts[1].id,css:'h1{color:green}'}]})!;
  assert.equal(changed.layouts[1].masterId,master.id);assert.equal(changed.layouts[1].css,'h1{color:green}');assert.deepEqual(changed.masters,d.masters);
  const active=applySlideChanges(d,{activeMaster:d.activeMaster})!;assert.equal(active.layouts[1].masterId,undefined,'explicit activation applies the chosen master to all layouts');
  const bad=structuredClone(d);bad.layouts[1].masterId='missing';assert.throws(()=>validateDeck(bad),/layout/);
  bad.layouts[1].masterId=master.id;bad.layouts[1].css='div{background:url(asset:asset-missing)}';assert.throws(()=>validateDeck(bad),/Missing resource/);
});

test('ESLX uses Common OPC and preserves rich slides, binary assets and legacy histories',async()=>{
  const {encodeEslx,decodeEslx}=await import('../src/main/eslx');
  const deck=newDeck('ESLX preservation');
  deck.slides[0].html='<section class="slide"><p>Editable <b>text</b></p></section>';
  deck.slides[0].script='console.log("preserved")';
  const history=Buffer.from('{"messages":["legacy conversation"]}');
  const bytes=await encodeEslx(deck,history),entries=unzipSync(bytes);
  assert.ok(entries['[Content_Types].xml']);assert.ok(entries['_rels/.rels']);
  const restored=await decodeEslx(bytes);assert.deepEqual(restored.deck,deck);assert.deepEqual(restored.history,history);
  const dir=await fixture(),store=new ProjectStore(path.join(dir,'workspaces')),file=path.join(dir,'copy.eslx');
  const project=await store.create(file,deck);await store.close(project.deck.id);
  const reopened=await store.open(file);assert.equal(reopened.deck.slides[0].script,deck.slides[0].script);
  reopened.deck.title='Edited ESLX';await store.save(reopened.deck);await store.close(reopened.deck.id);
  assert.equal((await readDeck(file)).title,'Edited ESLX');
});

test('ESLX rejects unknown schemas and missing resource relationships without changing the source',async()=>{
  const {encodeEslx,decodeEslx}=await import('../src/main/eslx');
  const deck=newDeck('Resources');
  deck.assets=[{id:'asset-image-one',name:'pixel.png',mime:'image/png',data:Buffer.from([137,80,78,71]).toString('base64')}];
  const bytes=await encodeEslx(deck),restored=await decodeEslx(bytes);
  assert.deepEqual(restored.deck.assets,deck.assets);
  const entries=unzipSync(bytes),main='slides/presentation.json',content=JSON.parse(strFromU8(entries[main]));
  content.version=999;entries[main]=strToU8(JSON.stringify(content));
  await assert.rejects(()=>decodeEslx(zipSync(entries)),/Unsupported ESLX/);
  content.version=1;content.deck.assets[0].relationship='missing';entries[main]=strToU8(JSON.stringify(content));
  await assert.rejects(()=>decodeEslx(zipSync(entries)),/resource relationship/);
  assert.deepEqual((await decodeEslx(bytes)).deck.assets,deck.assets);
});

test('ESLX sessions preserve legacy conversations and detect external file changes',async()=>{
 const {readEslx}=await import('../src/main/eslx');
 const dir=await fixture(),store=new ProjectStore(path.join(dir,'workspaces')),file=path.join(dir,'history.eslx');
 const project=await store.create(file,newDeck('History')),session=store.location(project.deck.id);
 const history=Buffer.from('{"messages":["preserve all legacy messages"]}');
 await fs.mkdir(path.join(session.workspace,'.edukors','ai'),{recursive:true});
 await fs.writeFile(path.join(session.workspace,'.edukors','ai','conversations.json'),history);
 await store.save(project.deck);assert.deepEqual((await readEslx(file)).history,history);
 await store.close(project.deck.id);const reopened=await store.open(file);
 assert.deepEqual(await fs.readFile(path.join(store.location(reopened.deck.id).workspace,'.edukors','ai','conversations.json')),history);
 await fs.appendFile(file,'external change');
 await assert.rejects(()=>store.save(reopened.deck),ConflictError);
 assert.ok((await fs.readFile(file)).subarray(-15).toString().includes('external change'));
 await store.close(reopened.deck.id);
});

test('ESF inputs remain read-only and every save target must be ESLX',async()=>{
 const dir=await fixture(),store=new ProjectStore(path.join(dir,'workspaces')),esf=path.join(dir,'legacy.ESF'),eslx=path.join(dir,'converted.eslx');
 const deck=newDeck('Legacy migration');deck.systemPrompt='Keep all slides and notes.';
 deck.slides[0].notes='Presenter notes';deck.slides[0].script='window.__legacy = true;';
 await writeLegacyFixture(esf,deck);const original=await fs.readFile(esf),opened=await store.open(esf);
 assert.equal(opened.path,'');assert.equal(opened.sourcePath,await fs.realpath(esf));
 await assert.rejects(()=>store.save(opened.deck),/Save As/);
 await assert.rejects(()=>store.attach(opened.deck.id,esf,opened.deck),/only.*eslx/);
 await assert.rejects(()=>store.create(esf,opened.deck),/only.*eslx/);
 await assert.rejects(()=>writeDeck(esf,opened.deck),/only.*eslx/);
 const {writeEslx}=await import('../src/main/eslx');await assert.rejects(()=>writeEslx(esf,opened.deck),/only.*eslx/);
 const converted=await store.attach(opened.deck.id,eslx,opened.deck);
 assert.deepEqual(await fs.readFile(esf),original);
 await store.close(converted.deck.id);const reopened=await store.open(eslx);
 assert.equal(reopened.deck.slides[0].notes,deck.slides[0].notes);
 assert.equal(reopened.deck.slides[0].script,deck.slides[0].script);assert.equal(reopened.deck.systemPrompt,deck.systemPrompt);
 reopened.deck.title='Edited native copy';await store.save(reopened.deck);
 assert.deepEqual(await fs.readFile(esf),original);await store.close(reopened.deck.id);
});

test('Common conversations survive ESLX saves through the legacy adapter without serializing live credentials',async()=>{
  const {writeEslx,readEslx}=await import('../src/main/eslx');
  const dir=await fixture(),file=path.join(dir,'native-history.eslx');
  const conversation={id:'conversation-native',updated:'2026-11-02T12:00:00Z',accountId:'account-test',resumeId:'resume-test',accessToken:'never-save-secret',running:true,items:[{kind:'user',text:'Keep this conversation'},{kind:'assistant',text:'Preserved'}]};
  const legacy=Buffer.from(JSON.stringify({messages:Array.from({length:500},(_,index)=>({text:'Legacy message '+index}))}));
  await writeEslx(file,newDeck('Native conversation'),legacy,[conversation]);
  const initial=await readEslx(file);
  assert.equal(initial.conversations[0].id,conversation.id);
  assert.equal(initial.conversations[0].accessToken,undefined);
  assert.equal(initial.conversations[0].running,undefined);
  assert.deepEqual(initial.history,legacy);
  const store=new ProjectStore(path.join(dir,'workspaces')),opened=await store.open(file);
  opened.deck.title='Edited with existing adapter';await store.save(opened.deck);
  const saved=await readEslx(file);
  assert.equal(saved.conversations[0].items[0].text,'Keep this conversation');
  assert.deepEqual(saved.history,legacy);
  const copyFile=path.join(dir,'native-copy.eslx');
  const copy=await store.create(copyFile,{...structuredClone(opened.deck),id:'deck-native-copy'},opened.deck.id);
  assert.equal((await readEslx(copyFile)).conversations[0].id,conversation.id);
  await store.close(copy.deck.id);await store.close(opened.deck.id);
});

test('PPTX is imported read-only and saves only as an ESLX document',async()=>{
 const {createRasterPptx}=await import('../src/shared/pptx-raster');
 const dir=await fixture(),source=path.join(dir,'Source.PPTX'),target=path.join(dir,'Converted.eslx');
 const original=createRasterPptx([Buffer.from('test-image')],'Input');await fs.writeFile(source,original);
 const store=new ProjectStore(path.join(dir,'workspaces')),opened=await store.open(source);
 assert.equal(opened.path,'');assert.equal(opened.sourcePath,await fs.realpath(source));
 assert.equal(opened.deck.importReport?.format,'pptx');
 assert.equal((await store.open(source)).deck.id,opened.deck.id,'reopening the input reuses the imported session');
 await assert.rejects(()=>store.save(opened.deck),/Save As/);
 await assert.rejects(()=>store.attach(opened.deck.id,source,opened.deck),/only.*eslx/);
 await assert.rejects(()=>store.create(source,opened.deck),/only.*eslx/);
 await assert.rejects(()=>writeDeck(source,opened.deck),/only.*eslx/);
 opened.deck.slides[0].notes='Edited native notes';
 const saved=await store.attach(opened.deck.id,target,opened.deck);
 assert.equal(saved.path,await fs.realpath(target));
 assert.deepEqual(await fs.readFile(source),Buffer.from(original));
 assert.equal((await readDeck(target)).slides[0].notes,'Edited native notes');
 assert.equal((await readDeck(target)).importReport?.format,'pptx');
 await store.close(saved.deck.id);
});

test('exports cannot overwrite an imported source, the native document or their aliases',async()=>{
 const {assertExportTarget}=await import('../src/main/file-policy');
 const dir=await fixture(),source=path.join(dir,'source.pptx'),native=path.join(dir,'converted.eslx');
 await fs.writeFile(source,'original');await fs.writeFile(native,'native');
 await assert.rejects(()=>assertExportTarget(source,[native,source]),/another export name/);
 await assert.rejects(()=>assertExportTarget(native,[native,source]),/another export name/);
 const alias=path.join(dir,'alias.pptx');await fs.link(source,alias);
 await assert.rejects(()=>assertExportTarget(alias,[source]),/another export name/);
 await assertExportTarget(path.join(dir,'copy.pptx'),[source,native]);
 assert.equal(await fs.readFile(source,'utf8'),'original');
});
