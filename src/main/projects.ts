import {importPptx} from '../shared/pptx-import';
import {loadLegacyDeck as loadDeck} from '../shared/legacy';
import {readEslx,writeEslx} from './eslx';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Deck,Project,validateDeck,usedAssets,uid} from '../shared/model';
import {openPackage,readManifest,extractPackage,fileHash,managedPaths,promptPath,conversationsPath,commonConversationsPath,packageVersion,PackEntry,PackageError} from './package';

export async function exists(p:string){try{await fs.access(p);return true;}catch{return false;}}
export async function atomic(p:string, text:string|Buffer){
  await fs.mkdir(path.dirname(p),{recursive:true});
  const temp=p+'.tmp-'+randomUUID();
  try {await fs.writeFile(temp,text);await fs.rename(temp,p);} finally {await fs.rm(temp,{force:true});}
}
export async function inside(root:string,relative:string,write=false):Promise<string>{
  if(typeof relative!=='string'||!relative||relative.includes('\\')||path.isAbsolute(relative)||relative.split('/').some(x=>x==='..'||x==='.'||!x))throw Error('Invalid project path.');
  const base=await fs.realpath(root);const target=path.resolve(base,relative);
  if(!target.startsWith(base+path.sep))throw Error('Path outside project.');
  let cursor=base;
  for(const part of relative.split('/')){
    cursor=path.join(cursor,part);
    try {const stat=await fs.lstat(cursor);if(stat.isSymbolicLink())throw Error('Symbolic links are not allowed inside a project.');}
    catch(e:any){if(e.code==='ENOENT'&&write)continue;throw e;}
  }
  return target;
}
export function serialize(deck:Deck){
  validateDeck(deck);
  const files:Record<string,string|Buffer>={};
  const masters=deck.masters.map(m=>{const base=`masters/${m.id}`;files[`${base}/master.html`]=m.html;files[`${base}/theme.css`]=m.css;return{id:m.id,name:m.name,html:`${base}/master.html`,css:`${base}/theme.css`};});
  const layouts=deck.layouts.map(l=>{const file=`layouts/${l.id}.html`;files[file]=l.html;const css=`layouts/${l.id}.css`;if(l.css!==undefined)files[css]=l.css;return{id:l.id,name:l.name,html:file,...l.css!==undefined?{css}:{},...l.masterId?{masterId:l.masterId}:{}};});
  const slides=deck.slides.map(s=>{
    const base=`slides/${s.id}`;
    const entry={id:s.id,title:s.title,layoutId:s.layoutId,notes:s.notes,...s.poll?{poll:s.poll}:{},html:`${base}/content.html`,css:`${base}/style.css`,script:`${base}/behavior.js`,staticHtml:`${base}/static.html`,staticState:'final'};
    files[entry.html]=s.html;files[entry.css]=s.css;files[entry.script]=s.script;files[entry.staticHtml]=s.staticHtml;return entry;
  });
  const assets=deck.assets.map(a=>{
    const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','image/avif':'avif','font/woff2':'woff2','font/woff':'woff','font/ttf':'ttf','font/otf':'otf'} as Record<string,string>)[a.mime];
    const p=`${a.mime.startsWith('font/')?'fonts':'images'}/${a.id}.${ext}`;files[p]=Buffer.from(a.data,'base64');
    return{id:a.id,name:a.name,mime:a.mime,path:p};
  });
  const prompt=deck.systemPrompt?.trim()?promptPath:undefined;if(prompt)files[prompt]=deck.systemPrompt!;
  const manifest={format:deck.format,packageVersion,schemaVersion:3,runtimeVersion:1,id:deck.id,revision:deck.revision,title:deck.title,canvas:deck.canvas,...deck.importReport?{importReport:deck.importReport}:{},...prompt?{systemPrompt:prompt}:{},masters,activeMaster:deck.activeMaster,layouts,slides,assets};
  return {files,manifest};
}
// The managed part of a package: manifest.json plus the files it references, all rebuilt from the deck.
function managedEntries(deck:Deck):PackEntry[]{const {files,manifest}=serialize(deck);return[{name:'manifest.json',data:JSON.stringify(manifest,null,2)+'\n'},...Object.entries(files).map(([name,data])=>({name,data}))];}
// A package without a session, such as a custom template: only the deck, no auxiliary files.
export async function readDeck(file:string){if(path.extname(file).toLowerCase()==='.pptx')return (await importPptx(await fs.readFile(file),path.basename(file,path.extname(file)))).deck;if(path.extname(file).toLowerCase()==='.eslx')return (await readEslx(file)).deck;const pkg=await openPackage(file);try{return await loadDeck(await readManifest(pkg),p=>pkg.read(p));}finally{await pkg.close();}}
export async function writeDeck(file:string,deck:Deck){
  requireNativeTarget(file);
  await fs.mkdir(path.dirname(file),{recursive:true});
  return writeEslx(file,{...deck,assets:usedAssets(deck)});
}
function requireNativeTarget(file:string){
  if(path.extname(file).toLowerCase()!=='.eslx')throw Error('Presentations can only be saved as .eslx.');
}

export class ConflictError extends Error {constructor(public reason:'changed'|'missing'){super(reason==='missing'?'The .eslx file was moved or deleted. Use Save As to keep this version.':'Files changed outside the app. Reopen or Save As to preserve both versions.');}}
// One native presentation (or read-only import): the file the user sees and the private working folder the editor, the assistant and MCP use.
export interface Session {file:string;sourcePath?:string;dir:string;workspace:string;fingerprint:string;revision:number;deck:Deck;queue:Promise<unknown>;aiSince?:number}
export class ProjectStore {
  projects=new Map<string,Session>();
  // workspaces holds one folder per native/source path: files/ (the extracted package) and draft.json (unsaved changes).
  constructor(private workspaces:string){}
  private dirFor(file:string){return path.join(this.workspaces,createHash('sha256').update(file.normalize('NFC')).digest('hex').slice(0,24));}
  private byFile(file:string){return [...this.projects.values()].find(s=>s.file===file||s.sourcePath===file);}
  // Copies of one package share the deck ID; the second one open gets its own.
  private register(file:string,dir:string,deck:Deck,fingerprint:string,revision:number){
    if(this.projects.has(deck.id))deck.id=uid('deck');
    const s:Session={file,dir,workspace:path.join(dir,'files'),fingerprint,revision,deck,queue:Promise.resolve()};this.projects.set(deck.id,s);return s;
  }
  // Workspaces closed normally are already gone; the ones left by a crash are kept while they hold a draft (30 days).
  async cleanup(){
    let names:string[]=[];try{names=await fs.readdir(this.workspaces);}catch{return;}
    for(const name of names){
      const dir=path.join(this.workspaces,name);if([...this.projects.values()].some(s=>s.dir===dir))continue;
      // Drafts of never-saved presentations cannot be reopened.
      if(name.startsWith('untitled-')){await fs.rm(dir,{recursive:true,force:true});continue;}
      const draft=await fs.stat(path.join(dir,'draft.json')).catch(()=>null);
      if(!draft||Date.now()-draft.mtimeMs>30*864e5)await fs.rm(dir,{recursive:true,force:true});
    }
  }
  async open(file:string):Promise<Project>{
    file=await fs.realpath(file);
    const extension=path.extname(file).toLowerCase();
    if(!['.esf','.eslx','.pptx'].includes(extension))throw Error('Choose an ESF, ESLX or PPTX file.');
    const open=this.byFile(file);if(open)return{path:open.file,sourcePath:open.sourcePath,deck:open.deck};
    const fingerprint=await fileHash(file),dir=this.dirFor(file),workspace=path.join(dir,'files');
    // A draft is used only for the same file in the same version it started from; it also keeps the unsaved conversations.
    let draft:Deck|undefined;
    try{const r=JSON.parse(await fs.readFile(path.join(dir,'draft.json'),'utf8'));if(r.file===file&&r.base===fingerprint&&await exists(path.join(workspace,'manifest.json'))){const d=r.deck;validateDeck(d);draft=d;}}catch{}
    let m:any,deck:Deck;
    try{
      if(!draft){
        await fs.rm(dir,{recursive:true,force:true});
        if(extension==='.esf')await extractPackage(file,workspace);
        else{
          const content=extension==='.eslx'?await readEslx(file):{deck:(await importPptx(await fs.readFile(file),path.basename(file,path.extname(file)))).deck,history:undefined,conversations:[]};
          await fs.mkdir(workspace,{recursive:true});
          const {files,manifest}=serialize(content.deck);
          await atomic(path.join(workspace,'manifest.json'),JSON.stringify(manifest));
          for(const [name,data] of Object.entries(files))await atomic(path.join(workspace,name),data);
          if(content.history)await atomic(path.join(workspace,conversationsPath),content.history);
          if(content.conversations.length)await atomic(path.join(workspace,commonConversationsPath),JSON.stringify(content.conversations));
        }
      }
      m=JSON.parse(await fs.readFile(path.join(workspace,'manifest.json'),'utf8'));
      deck=await loadDeck(m,async p=>{try{return await fs.readFile(await inside(workspace,p));}catch(e:any){if(e.code==='ENOENT')throw new PackageError(`Missing file in package: ${p}`);throw e;}});
    }catch(e){if(!draft)await fs.rm(dir,{recursive:true,force:true});throw e;}
    const s=this.register(extension==='.eslx'?file:'',dir,draft||deck,fingerprint,m.revision);
    if(extension!=='.eslx')s.sourcePath=file;
    return{path:s.file,sourcePath:s.sourcePath,deck:s.deck,recovered:!!draft};
  }
  // A new presentation has no file until its first save (file ''); its working folder is not tied to a path yet.
  async untitled(deck:Deck):Promise<Project>{
    const dir=path.join(this.workspaces,'untitled-'+randomUUID());await fs.mkdir(path.join(dir,'files'),{recursive:true});
    const s=this.register('',dir,deck,'',deck.revision);return{path:'',deck:s.deck};
  }
  // First save of a new presentation: the working folder moves to the one of its file, then the package is written.
  async attach(id:string,file:string,deck:Deck){
    const session=this.location(id);
    if(session.file)throw Error('Presentation already has a file.');
    requireNativeTarget(file);
    file=path.join(await fs.realpath(path.dirname(file)),path.basename(file));
    if(this.byFile(file))throw Error('This file is open in another tab.');
    await session.queue;
    const dir=this.dirFor(file),workspace=path.join(dir,'files');
    await fs.rm(dir,{recursive:true,force:true});
    await fs.cp(session.workspace,workspace,{recursive:true,filter:async source=>!(await fs.lstat(source)).isSymbolicLink()});
    const staged:Session={...session,file,dir,workspace,fingerprint:'',queue:Promise.resolve()};
    try{
      const result=await this.write(staged,deck),previous=session.dir;
      Object.assign(session,staged);
      await fs.rm(previous,{recursive:true,force:true}).catch(()=>{});
      return result.project;
    }catch(error){await fs.rm(dir,{recursive:true,force:true});throw error;}
  }
  // from: an open presentation whose conversations go into the new file (Save As).
  async create(file:string,deck:Deck,from?:string):Promise<Project>{
    requireNativeTarget(file);
    file=path.join(await fs.realpath(path.dirname(file)),path.basename(file));
    requireNativeTarget(file);
    if(this.byFile(file))throw Error('This file is open in another tab.');
    const source=from?this.location(from):undefined,dir=this.dirFor(file);
    await fs.rm(dir,{recursive:true,force:true});await fs.mkdir(path.join(dir,'files'),{recursive:true});
    if(source)await fs.cp(source.workspace,path.join(dir,'files'),{recursive:true,filter:async src=>!(await fs.lstat(src)).isSymbolicLink()});
    const s=this.register(file,dir,deck,'',deck.revision);
    try{return (await this.save(s.deck)).project;}catch(e){this.projects.delete(s.deck.id);await fs.rm(dir,{recursive:true,force:true});throw e;}
  }
  location(id:string){const p=this.projects.get(id);if(!p)throw Error('Project is not open.');return p;}
  // Saves run one at a time per presentation.
  save(deck:Deck){const s=this.location(deck.id),run=s.queue.then(()=>this.write(s,deck));s.queue=run.catch(()=>{});return run;}
  private async write(s:Session,deck:Deck):Promise<{project:Project;pending:boolean}>{
    validateDeck(deck);if(!s.file)throw Error('Use Save As to create an .eslx presentation.');
    requireNativeTarget(s.file);
    const current=await fileHash(s.file).catch((e:any)=>{if(e.code==='ENOENT')return null;throw e;});
    if(s.fingerprint&&current!==s.fingerprint)throw new ConflictError(current===null?'missing':'changed');
    const next=structuredClone(deck);next.revision=Math.max(next.revision,s.revision)+1;next.assets=usedAssets(next);
    const managed=managedEntries(next),{aux,pending}=await this.conversations(s);
    const legacy=aux.find(entry=>entry.name===conversationsPath);
    const native=aux.find(entry=>entry.name===commonConversationsPath);
    const conversations=native?JSON.parse(native.file?await fs.readFile(native.file,'utf8'):String(native.data)):[];
    await writeEslx(s.file,next,legacy?(legacy.file?await fs.readFile(legacy.file):Buffer.from(legacy.data!)):undefined,conversations);

    s.fingerprint=await fileHash(s.file);s.revision=next.revision;s.deck=next;
    // The workspace mirrors the saved managed files, which the assistant may read.
    try{
      for(const top of managedPaths)await fs.rm(path.join(s.workspace,top),{recursive:true,force:true});
      for(const e of managed){const target=path.join(s.workspace,...e.name.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,e.data!);}
    }catch{}
    if(pending)await this.draft(next);else await fs.rm(path.join(s.dir,'draft.json'),{force:true});
    return{project:{path:s.file,sourcePath:s.sourcePath,deck:next,pending},pending};
  }
  // Besides the presentation, the package keeps only the assistant's conversations: files the assistant or the user left
  // in the working folder (downloads, captures, research, scripts, exports) stay there until the tab closes, so the file
  // stays as small as possible. While the assistant runs, the conversations may be half written: the previous saved
  // version is kept and the save stays pending.
  private async conversations(s:Session){
    const aux:PackEntry[]=[],full=path.join(s.workspace,conversationsPath);let pending=false;
    try{const common=await inside(s.workspace,commonConversationsPath);if((await fs.stat(common)).isFile())aux.push({name:commonConversationsPath,file:common});}catch(error:any){if(error.code!=='ENOENT')throw error;}
    if(!(await fs.lstat(full).catch(()=>null))?.isFile()||(await fs.lstat(path.join(s.workspace,'.edukors')).catch(()=>null))?.isSymbolicLink())return{aux,pending};
    if(s.aiSince!==undefined&&(await fs.stat(full)).mtimeMs>=s.aiSince){
      pending=true;if(path.extname(s.file).toLowerCase()==='.eslx'){const old=s.fingerprint?await readEslx(s.file):undefined;if(old?.history)aux.push({name:conversationsPath,data:old.history});return{aux,pending};}const old=s.fingerprint?await openPackage(s.file).catch(()=>null):null;
      try{const e=old?.entries.get(conversationsPath);if(e&&!e.dir)aux.push({name:conversationsPath,data:await old!.read(conversationsPath)});}finally{await old?.close();}
    }else aux.push({name:conversationsPath,file:full});
    return{aux,pending};
  }
  async draft(deck:Deck){
    validateDeck(deck);const s=this.location(deck.id);if(!s.file&&!s.sourcePath)return;
    await atomic(path.join(s.dir,'draft.json'),JSON.stringify({file:s.file||s.sourcePath,base:s.fingerprint,deck}));
  }
  async discard(id:string){await fs.rm(path.join(this.location(id).dir,'draft.json'),{force:true});}
  async close(id:string){const s=this.projects.get(id);if(!s)return;this.projects.delete(id);await s.queue;await fs.rm(s.dir,{recursive:true,force:true});}
  // Marks the start and end of an assistant run (see conversations).
  aiStart(id:string){const s=this.projects.get(id);if(s)s.aiSince=Date.now()-1000;}
  aiEnd(id:string){const s=this.projects.get(id);if(s)s.aiSince=undefined;}
}
