import {spawn,execFile,ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Deck,Slide,Profile,AIEvent,SessionLimits,validateDeck,aiEfforts} from '../shared/model';
export const expandHome=(p:string)=>p==='~'?os.homedir():p.startsWith('~/')?path.join(os.homedir(),p.slice(2)):p;
export function childEnv(profile:Profile){
  const env={...process.env};
  for(const key of Object.keys(env))if(/^(ANTHROPIC_|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CONFIG_DIR|CLAUDECODE|ELECTRON_RUN_AS_NODE|CLAUDE_CODE_USE_|OPENAI_|CODEX_|KIMI_|KIRO_|OPENCODE_|AGY_|ANTIGRAVITY_|GEMINI_|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS)/.test(key))delete env[key];
  env.CLAUDE_CONFIG_DIR=expandHome(profile.configDir);
  // Auto-memory would write outside the presentation folder.
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY='1';
  return env;
}
export function probe(profile:Profile,auth=false):Promise<{version?:string;authenticated?:boolean;detail:string}>{
  return new Promise((resolve,reject)=>{
    const child=spawn(expandHome(profile.executable),auth?['auth','status']:['--version'],{env:childEnv(profile),shell:false,stdio:['ignore','pipe','pipe']});
    let out='',err='';const timeout=setTimeout(()=>{child.kill();reject(Error('CLI timeout.'));},10000);
    child.stdout?.on('data',b=>out+=b.toString());child.stderr?.on('data',b=>err+=b.toString());
    child.on('error',e=>{clearTimeout(timeout);reject(e);});
    child.on('close',code=>{clearTimeout(timeout);if(auth){try{const d=JSON.parse(out);resolve({authenticated:code===0,detail:String(d.authMethod||d.error||'')});}catch{resolve({authenticated:false,detail:err||out});}}else if(code===0)resolve({version:out.trim(),detail:out.trim()});else reject(Error(err||out||'CLI unavailable.'));});
  });
}
const string={type:'string'};
const slideSchema={type:'object',additionalProperties:false,properties:Object.fromEntries(['id','title','layoutId','html','css','script','staticHtml','notes'].map(k=>[k,string])),required:['id','title','layoutId','html','css','script','staticHtml','notes']};
// Slide changes are omitted when the turn only answers or asks; assets imports files the agent saved in the folder.
export const outputSchema={type:'object',additionalProperties:false,properties:{message:string,systemPrompt:{type:'string',maxLength:20000},
  slideUpdates:{type:'array',maxItems:300,items:slideSchema},
  slideOrder:{type:'array',minItems:1,maxItems:300,items:string},
  masterUpdates:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^[\\w-]+$'},name:string,css:string,html:string},required:['id']}},
  activeMaster:string,
  layoutUpdates:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^[\\w-]+$'},name:string,html:string,css:string},required:['id']}},
  assets:{type:'array',maxItems:200,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^asset-[\\w-]+$'},path:string,name:string},required:['id','path']}},
  questions:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,properties:{question:string,options:{type:'array',maxItems:6,items:string},multiSelect:{type:'boolean'}},required:['question','options']}}},required:['message']};
// Paths the app owns in the working folder; the agent changes them only through its structured answer (the app validates and saves).
export const ownedPaths=['manifest.json','masters','layouts','slides','images','fonts','.edukors','ai/system-prompt.md'];
// Every built-in tool that works with -p (AskUserQuestion and TodoWrite do not exist there: questions go in the answer).
// Native Windows has no CLI sandbox to confine Bash, so there the agent has no shell and no subagents.
export const shellless=(platform=process.platform)=>platform==='win32';
export const toolsFor=(platform=process.platform)=>shellless(platform)?'Read,Write,Edit,Glob,Grep,NotebookEdit,WebFetch,WebSearch':'Bash,Read,Write,Edit,Glob,Grep,NotebookEdit,WebFetch,WebSearch,Task';
export const agentTools=toolsFor();
// Permission rules take absolute paths as //path, and Windows paths in POSIX form (C:\x → //c/x).
const rulePath=(p:string)=>p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
// File tools are confined by --restricted; Bash runs in the CLI's sandbox, which can read only the
// presentation's working folder (and attachment copies) inside the home folder and write only there, minus the app's files.
export function agentSettings(root:string,readDirs:string[]=[],platform=process.platform){
  const owned=ownedPaths.map(p=>path.join(root,p)),tools=toolsFor(platform).split(',');
  const permissions={allow:[...tools,'mcp__edukors'],deny:owned.map(rulePath).flatMap(p=>[`Edit(/${p})`,`Edit(/${p}/**)`,`Write(/${p})`,`Write(/${p}/**)`,`NotebookEdit(/${p}/**)`]),blockReadsOutsideWorkingDirectories:true};
  if(shellless(platform))return{permissions};
  return{sandbox:{enabled:true,failIfUnavailable:true,autoAllowBashIfSandboxed:true,allowUnsandboxedCommands:false,
    filesystem:{denyRead:['~','/Volumes'],allowRead:[root,...readDirs],allowWrite:[root],denyWrite:owned}},permissions};
}
export const instruction=(language:string,platform=process.platform)=>`You are the assistant of a presentation editor. Respond in the language of the user's request (the app's interface is in ${language}).

Scope: you work only on this presentation. Every action (reading, research, web searches, page captures, downloads, scripts, files) must serve creating or improving it: its content, design, data, images, sources, speaker notes or rehearsal. Politely decline anything else, even if it seems harmless. You have the Claude Code tools: ${shellless(platform)?'Read, Write, Edit, Glob, Grep, NotebookEdit, WebSearch and WebFetch':'Bash, Read, Write, Edit, Glob, Grep, NotebookEdit, WebSearch, WebFetch and Task (subagents)'}, plus the edukors MCP tools screenshot (captures a web page as PNG) and download (saves a file from the web). Files can be read and written only in the presentation's working folder (your current directory) and its subfolders; never try to reach other folders, credentials or system settings. ${shellless(platform)?'There is no shell (Bash) and there are no subagents on this computer: write files with Write and Edit, and use WebSearch, WebFetch, screenshot and download for the web.':'Shell commands run in a sandbox without network access: use WebSearch, WebFetch, screenshot and download for the web.'} Save files you create (captures, downloads, charts, notes, research, scripts) in a folder of your own such as media/ or research/. They last only while the presentation is open: the saved .ESF keeps only the slides, masters, layouts, the images and fonts they use, the presentation's system prompt and the conversations, so import as assets the images and fonts the slides need and put sources in the notes. Never write to ${ownedPaths.join(', ')} (the app owns them).

Answer: return ONLY the specified structured output. message is what the user reads. Ask only when missing information prevents a useful answer; otherwise follow the existing presentation style and make reasonable choices. If clarification is essential: put up to 4 questions in questions, each with short options (the user may also answer freely), and omit slides. When you change the presentation, return slideUpdates with ONLY new or modified slides (all fields for each). Existing IDs replace slides in place; new IDs append. To insert or reorder slides, also return slideOrder listing ALL resulting IDs in order. NEVER delete slides: every existing slide ID must remain in slideOrder. Only the user deletes slides, manually in the slide list; if asked to delete or merge slides, do not remove any and tell the user which slides to delete themselves. Omit slideOrder when order is unchanged. Preserve untouched slides, IDs and notes. Do not repeat unchanged slides. Omit all slide change fields when nothing changes. To use an image or font file you saved in the folder, list it in assets as {id:"asset-<unique>", path:"<relative path>", name} and reference it as asset:ID; the app imports it (png, jpg, webp, gif, svg, avif, woff, woff2, ttf, otf; up to 50 MB). Cite sources of researched facts in the notes. Never invent factual data or logos. The presentation's system prompt (ai/system-prompt.md, shown at the end of these instructions when it exists) describes the context of this talk: audience, goals, tone, sources, decisions. Change it only when the user asks (for example to record or update the talk's context): return systemPrompt with its complete new Markdown text (up to 20000 characters); otherwise omit it.

Slide masters: project.masters lists the slide masters {id,name,css,html}; ordinary layouts follow project.activeMaster; imported layouts may have masterId referencing their independent source master. For each slide, resolve its layout.masterId or project.activeMaster: its css is the theme CSS of all slides and its html holds objects drawn on them, behind their content, in slide coordinates (use position:absolute). project.layouts [{id,name,html,css?,masterId?}] are shared by all masters: the HTML a new slide starts from. Like the master's objects, a layout's elements belong to the layout: in the slides they carry data-from-layout and the app rebuilds them from the layout, keeping only the content of their [data-field] placeholders and the image in their [data-image-slot]. So change them only through layoutUpdates (the change reaches every slide that uses the layout; do not repeat it in the slides), never in slideUpdates; a slide's own content goes in those placeholders or in its own elements without data-from-layout. Text a slide must be able to change in a layout is a [data-field] element. Each slide's layoutId must be the ID of an existing layout. Change masters and layouts only when the request is about them, the theme or the look of the whole presentation (for example from the slide master view): return masterUpdates [{id,name?,css?,html?}] and layoutUpdates [{id,name?,html?,css?}] with only new or changed items (omitted fields stay; a new master needs name and css; a new layout needs name and html), and activeMaster only to switch the master in use when asked. Never delete masters or layouts; the user does.

Slides: a slide is one section.slide at 1600x900 that uses the classes and variables of its master CSS (new masters define --paper, --ink, --accent, --muted and --surface). Use data-field identifiers for editable text and data-step for progressive reveals. An inline style translate on an element is a position the user set by dragging it on the slide; keep it unless asked. JavaScript goes only in script, assigning window.slideBehavior={mount(root){},enter(root){},step(n){},leave(){},dispose(){},renderStatic(root){}}. The exported HTML works offline: never use script/iframe/form tags, external imports, external images or network requests inside slides; embed images as assets. Every custom animation needs staticHtml or renderStatic. New IDs must be s- followed by a unique UUID or identifier. Files the user attached are listed in attachments with their paths; text attachments come with their content inlined (do not Read those again); read the others when relevant; copies of files from outside the folder are removed after this request; image attachments are also deck assets, usable as asset:ID. Do not mention implementation unless asked.

Efficiency (the user's usage limit is shared and every tool turn re-reads the whole context): for a simple slide creation or edit, produce the structured answer directly, in a single turn, from the provided context. Use tools and research only when the request needs information or resources not already available${shellless(platform)?'':'; use subagents (Task) only when the user asks for them'}. Do not inspect the project folder or conversation logs just to rediscover supplied content. Never re-read an attachment whose content is already in the request or earlier in this conversation. Reuse the existing theme and layouts. Avoid duplicating html in staticHtml when there is no custom animation; use empty strings for unused css, script, staticHtml and notes. The app validates and renders changes.

The request's project contains the current presentation and asset metadata (no binary data). project.slides holds only the selected slides and, with contextMode=delta, the slides changed since the preceding request. The full current code of EVERY slide is in ${contextDir}/<slide id>.json (written by the app just before this request, unsaved edits included): Read only the ones you need (to change them or to copy something specific), several at once; for a new slide the selection, master and layouts are enough. Masters and layouts marked unchanged:true are the same as in an earlier request of this conversation. slideIndex always lists ALL current IDs, titles and layouts in order: omitted slides are unchanged, not deleted. This current state overrides older conversation content, including your earlier proposals. Never reconstruct untouched slides from memory. manifest.json in the working folder stores relative file paths instead of code; those files reflect the last save and can be older than the current request.`;
// Merge edits locally so the model never has to copy untouched slide code.
export function applySlideChanges(deck:Deck,out:any):Deck|undefined{
  const updates=out.slideUpdates!==undefined,order=out.slideOrder!==undefined,masters=out.masterUpdates!==undefined,layouts=out.layoutUpdates!==undefined,active=out.activeMaster!==undefined,prompt=out.systemPrompt!==undefined;
  if(!updates&&!order&&!masters&&!layouts&&!active&&!prompt)return undefined;
  const next=structuredClone(deck);
  if(prompt){if(typeof out.systemPrompt!=='string'||out.systemPrompt.length>20000)throw Error('Invalid system prompt.');if(out.systemPrompt.trim())next.systemPrompt=out.systemPrompt;else delete next.systemPrompt;}
  if(updates||order){
    if(updates&&!Array.isArray(out.slideUpdates)||order&&!Array.isArray(out.slideOrder))throw Error('Invalid slide changes.');
    const byId=new Map(next.slides.map(s=>[s.id,s])),seen=new Set<string>();
    for(const slide of (out.slideUpdates||[]) as Slide[]){
      if(!slide||typeof slide.id!=='string'||seen.has(slide.id))throw Error('Invalid or duplicate slide update.');
      seen.add(slide.id);const existing=byId.get(slide.id);byId.set(slide.id,{...slide,...existing?.poll?{poll:existing.poll}:{}});
    }
    const ids:string[]=out.slideOrder||[...byId.keys()];
    if(!ids.length||ids.length>300||new Set(ids).size!==ids.length||ids.some(id=>!byId.has(id))||[...seen].some(id=>!ids.includes(id)))throw Error('Invalid slide order.');
    next.slides=ids.map(id=>byId.get(id)!);
  }
  // Masters and layouts: given fields replace the current ones; new IDs add one.
  const text=(v:unknown)=>v===undefined||typeof v==='string';
  if(masters){
    if(!Array.isArray(out.masterUpdates))throw Error('Invalid master update.');
    for(const m of out.masterUpdates){
      if(!m||typeof m.id!=='string'||!/^[\w-]+$/.test(m.id)||!['name','css','html'].every(k=>text(m[k])))throw Error('Invalid master update.');
      const old=next.masters.find(x=>x.id===m.id);
      if(old){for(const k of ['name','css','html'] as const)if(m[k]!==undefined)old[k]=m[k];}
      else next.masters.push({id:m.id,name:m.name||m.id,css:m.css??'',html:m.html??''});
    }
  }
  if(active){if(typeof out.activeMaster!=='string'||!next.masters.some(m=>m.id===out.activeMaster))throw Error(`Unknown active master ${String(out.activeMaster)}.`);next.activeMaster=out.activeMaster;next.layouts.forEach(l=>delete l.masterId);}
  if(layouts){
    if(!Array.isArray(out.layoutUpdates))throw Error('Invalid layout update.');
    for(const l of out.layoutUpdates){
      if(!l||typeof l.id!=='string'||!/^[\w-]+$/.test(l.id)||!['name','html','css'].every(k=>text(l[k])))throw Error('Invalid layout update.');
      const old=next.layouts.find(x=>x.id===l.id);
      if(old){if(l.name!==undefined)old.name=l.name;if(l.html!==undefined)old.html=l.html;if(l.css!==undefined)old.css=l.css;}
      else next.layouts.push({id:l.id,name:l.name||l.id,html:l.html??'<section class="slide"></section>',...l.css!==undefined?{css:l.css}:{}});
    }
  }
  // A slide whose layout does not exist keeps its previous layout (or takes the first one).
  const ids=new Set(next.layouts.map(l=>l.id));
  for(const s of next.slides)if(s&&!ids.has(s.layoutId))s.layoutId=deck.slides.find(x=>x.id===s.id&&ids.has(x.layoutId))?.layoutId||next.layouts[0]?.id||s.layoutId;
  return next;
}
// Only the user deletes slides; answers that drop any existing slide are rejected.
export const removedSlides=(base:Deck,next:Deck)=>{const ids=new Set(next.slides.map(s=>s.id));return base.slides.filter(s=>!ids.has(s.id));};
// Token economy: the request carries only the selected slides (and, in a resumed session, the ones changed since the
// previous request); every other slide is a file in contextDir the agent reads when it needs it. Masters and layouts
// go in full the first time and then only when changed (unchanged ones keep id and name).
export const contextDir='.edukors/ai/context';
export const sentKeys=(deck:Deck)=>new Map<string,string>([...deck.slides.map(s=>[s.id,JSON.stringify(s)] as [string,string]),...deck.masters.map(m=>['m:'+m.id,JSON.stringify(m)] as [string,string]),...deck.layouts.map(l=>['l:'+l.id,JSON.stringify(l)] as [string,string])]);
export function agentContext(deck:Deck,selected:string[],previous?:Map<string,string>){
  const same=(key:string,item:object)=>!!previous&&previous.get(key)===JSON.stringify(item);
  return {contextMode:previous?'delta':'full',slideIndex:deck.slides.map(({id,title,layoutId})=>({id,title,layoutId})),
    project:{...deck,systemPrompt:undefined,slides:deck.slides.filter(s=>selected.includes(s.id)||previous&&!same(s.id,s)),
      masters:deck.masters.map(m=>same('m:'+m.id,m)?{id:m.id,name:m.name,unchanged:true}:m),layouts:deck.layouts.map(l=>same('l:'+l.id,l)?{id:l.id,name:l.name,unchanged:true}:l),
      assets:deck.assets.map(({id,name,mime})=>({id,name,mime}))}};
}
// One file per slide with its current (unsaved included) code; outside the package, rewritten before each request.
export async function writeContext(cwd:string,deck:Deck){
  const dir=path.join(cwd,contextDir);await fs.rm(dir,{recursive:true,force:true});await fs.mkdir(dir,{recursive:true});
  await Promise.all(deck.slides.map(s=>fs.writeFile(path.join(dir,s.id+'.json'),JSON.stringify(s,null,1))));
}
// Prefers the 5-hour window; values are fractions (0–1) and reset times are epoch seconds.
export function sessionLimits(info:any):SessionLimits|null{
  if(!info||typeof info!=='object')return null;
  const w=info.unifiedWindows?.five_hour;
  const utilization=typeof w?.utilization==='number'?w.utilization:info.rateLimitType==='five_hour'&&typeof info.utilization==='number'?info.utilization:null;
  if(utilization===null||!Number.isFinite(utilization))return null;
  const resetsAt=Number.isInteger(w?.resetsAt)?w.resetsAt:Number.isInteger(info.resetsAt)?info.resetsAt:undefined;
  return{utilization:Math.max(0,utilization),resetsAt,status:String(info.status||''),updated:Date.now()};
}
// Live 5-hour usage, as Claude Code's /usage reads it: the account's OAuth token is read (never stored) from the
// macOS Keychain item the CLI keeps per config dir, then GET /api/oauth/usage. The user authorized this on 20/10/2026.
// ESF_SECURITY / ESF_USAGE_URL exist only so tests can stand in for the Keychain and the endpoint.
export async function liveUsage(profile:Profile):Promise<SessionLimits|null>{
  if(process.platform!=='darwin'&&!process.env.ESF_SECURITY)return null;
  const dir=path.resolve(expandHome(profile.configDir)),services=['Claude Code-credentials-'+createHash('sha256').update(dir).digest('hex').slice(0,8)];
  if(dir===path.join(os.homedir(),'.claude'))services.push('Claude Code-credentials');
  for(const service of services){
    const secret=await new Promise<string>(resolve=>execFile(process.env.ESF_SECURITY||'/usr/bin/security',['find-generic-password','-a',os.userInfo().username,'-w','-s',service],{timeout:5000},(e,out)=>resolve(e?'':String(out).trim())));
    if(!secret)continue;
    let token:string|undefined;try{const o=JSON.parse(secret).claudeAiOauth;if(!o?.expiresAt||o.expiresAt>Date.now())token=o?.accessToken;}catch{}
    if(typeof token!=='string'||!token)return null;
    const r=await fetch(process.env.ESF_USAGE_URL||'https://api.anthropic.com/api/oauth/usage',{headers:{authorization:'Bearer '+token,'anthropic-beta':'oauth-2025-04-20','content-type':'application/json'},signal:AbortSignal.timeout(10000)});
    if(!r.ok)return null;
    const w=(await r.json())?.five_hour,resetsAt=Date.parse(w?.resets_at);
    return typeof w?.utilization==='number'?{utilization:Math.max(0,w.utilization/100),resetsAt:Number.isFinite(resetsAt)?Math.floor(resetsAt/1000):undefined,status:'allowed',updated:Date.now()}:null;
  }
  return null;
}
export class CancelledError extends Error {constructor(){super('Request cancelled.');}}
type Run={child:ChildProcess;stopped:boolean};
export interface Question {question:string;options:string[];multiSelect?:boolean}
export interface Outcome {deck?:Deck;message:string;sessionId?:string;assets?:{id:string;path:string;name?:string}[];questions?:Question[]}
export interface SendOptions {language?:string;conversation?:string;systemPrompt?:string;attachments?:{name:string;path:string;assetId?:string;content?:string}[];addDirs?:string[];model?:string;effort?:string;scope?:string;mcp?:{url:string;token:string}}
export class ClaudeProvider {
  running=new Map<string,Run>();
  sessions:Map<string,string>;
  private sentSlides=new Map<string,Map<string,string>>();
  constructor(private emit:(e:AIEvent)=>void,sessions:Record<string,string>={},private onSessions:(s:Record<string,string>)=>void=()=>{}){this.sessions=new Map(Object.entries(sessions));}
  busy(id:string){return this.running.has(id);}
  // A stopped run never resolves with changes, even if its result arrives after the signal.
  cancel(id:string){const run=this.running.get(id);if(run){run.stopped=true;run.child.kill('SIGINT');setTimeout(()=>{if(this.running.get(id)===run)run.child.kill('SIGTERM');},2500);}}
  forgetProfile(profileId:string){for(const key of [...this.sessions.keys()])if(key.endsWith(':'+profileId)){this.sessions.delete(key);this.sentSlides.delete(key);}this.onSessions(Object.fromEntries(this.sessions));}
  send(deck:Deck,profile:Profile,prompt:string,cwd:string,selected:string[],options:SendOptions={}):Promise<Outcome>{
    if(this.running.has(deck.id))return Promise.reject(Error('A request is already running.'));
    if(prompt.length>40000)return Promise.reject(Error('Prompt is too long.'));
    validateDeck(deck);
    // Each conversation of a presentation resumes its own CLI session. The CLI
    // keeps sessions per working folder, so scope (the .ESF's workspace) also keeps copies of one package apart.
    const key=(options.scope?options.scope+':':'')+deck.id+':'+(options.conversation?options.conversation+':':'')+profile.id;const session=this.sessions.get(key);
    // --restricted confines the file tools to the working directory (the project folder, subfolders included)
    // plus any --add-dir, such as the copy of attachments from elsewhere; it also keeps user and project settings out.
    // Not --safe-mode: it drops the app's MCP server. Prompts are never shown (-p), so anything not allowed is denied.
    const mcp=options.mcp?{mcpServers:{edukors:{type:'http',url:options.mcp.url,headers:{authorization:'Bearer '+options.mcp.token}}}}:{mcpServers:{}};
    const args=['-p','--output-format','stream-json','--verbose','--include-partial-messages','--tools',agentTools,'--allowedTools',agentTools+(options.mcp?',mcp__edukors':''),'--restricted','--disable-slash-commands','--permission-mode','acceptEdits','--permission-prompts','none','--setting-sources','','--settings',JSON.stringify(agentSettings(cwd,options.addDirs)),'--strict-mcp-config','--mcp-config',JSON.stringify(mcp),'--json-schema',JSON.stringify(outputSchema),'--max-turns','200'];
    for(const dir of options.addDirs||[])args.push('--add-dir',dir);
    if(session)args.push('--resume',session);
    const model=options.model?.trim();if(model)args.push('--model',model);
    if(options.effort&&(aiEfforts as readonly string[]).includes(options.effort))args.push('--effort',options.effort);
    // Global instructions (Settings) and this presentation's own (ai/system-prompt.md), current at every run.
    const extra=options.systemPrompt?.trim(),own=deck.systemPrompt?.trim();
    args.push('--system-prompt',instruction(options.language||'pt')+(extra?'\n\nAdditional instructions from the user:\n'+extra:'')+(own?'\n\nPresentation system prompt (ai/system-prompt.md):\n'+own:''));
    const context={request:prompt,selected,attachments:options.attachments||[],...agentContext(deck,selected,session?this.sentSlides.get(key):undefined)};
    const emit=(e:Omit<AIEvent,'projectId'>)=>this.emit({projectId:deck.id,...e});
    return writeContext(cwd,deck).catch(()=>{}).then(()=>new Promise<Outcome>((resolve,reject)=>{
      let child:ChildProcess;
      try{child=spawn(expandHome(profile.executable),args,{cwd,env:childEnv(profile),shell:false,stdio:['pipe','pipe','pipe']});}catch(e){reject(e);return;}
      const run:Run={child,stopped:false};this.running.set(deck.id,run);
      let pending='',stderr='',size=0,settled=false,lastText='';
      // Progress shown to the user so a long run never looks stuck.
      const seenTools=new Set<string>();let contextIn:number|undefined,contextOut=0,initModel='',answerBytes=0,lastProgress=0,lastKind='',thought='',thoughtTimer:NodeJS.Timeout|undefined,doneTokens=0,messageTokens=0;
      // Reasoning text is batched so a long thought does not flood the IPC channel.
      const flushThought=()=>{clearTimeout(thoughtTimer);thoughtTimer=undefined;if(thought&&!run.stopped)emit({type:'thought',text:thought});thought='';};
      const activity=(kind:string,extra:Partial<AIEvent>={})=>{if(run.stopped||(kind===lastKind&&kind!=='tool'))return;flushThought();lastKind=kind;emit({type:'activity',kind,...extra});};
      const progress=(extra:Partial<AIEvent>)=>{const now=Date.now();if(now-lastProgress>400){lastProgress=now;emit({type:'progress',tokens:doneTokens+messageTokens,...extra});}};
      const shortPath=(p:unknown)=>typeof p==='string'?(path.isAbsolute(p)&&!path.relative(cwd,p).startsWith('..')?path.relative(cwd,p)||'.':p).slice(0,200):undefined;
      const finish=(error:Error|null,outcome?:Outcome)=>{if(settled)return;settled=true;clearTimeout(thoughtTimer);if(this.running.get(deck.id)===run)this.running.delete(deck.id);if(error){this.sentSlides.delete(key);reject(error);}else{this.sentSlides.set(key,sentKeys(deck));resolve(outcome!);}};
      child.stdout!.on('data',b=>{
        size+=b.length;if(size>20_000_000){child.kill('SIGTERM');finish(Error('CLI output exceeded limit.'));return;}
        pending+=b.toString();let at:number;
        while((at=pending.indexOf('\n'))>=0){
          const line=pending.slice(0,at);pending=pending.slice(at+1);
          if(!line.trim())continue;
          try{
            const e=JSON.parse(line);
            if(e.session_id&&this.sessions.get(key)!==e.session_id){this.sessions.set(key,e.session_id);this.onSessions(Object.fromEntries(this.sessions));}
            if(e.type==='rate_limit_event'){const limits=sessionLimits(e.rate_limit_info);if(limits)emit({type:'limits',profileId:profile.id,limits});}
            if(e.type==='system'&&e.subtype==='init'){initModel=String(e.model||'');}
            // A resumed conversation keeps its CLI session; only the process is new.
            if(e.type==='system'&&e.subtype==='init')activity(session&&e.session_id===session?'resume':'start',{detail:typeof e.model==='string'?e.model:undefined,body:[['model',e.model],['session',e.session_id],['effort',options.effort],['cwd',e.cwd],['tools',Array.isArray(e.tools)?e.tools.join(', '):undefined],['claude code',e.claude_code_version]].filter(([,v])=>v).map(([k,v])=>k+': '+v).join('\n')});
            if(e.type==='system'&&e.subtype==='api_retry')activity('retry',{detail:[e.attempt,e.max_retries].filter(x=>x!==undefined).join('/')});
            const block=e.type==='stream_event'&&e.event?.type==='content_block_start'?e.event.content_block:null;
            if(block?.type==='thinking')activity('thinking');
            const ev=e.type==='stream_event'?e.event:null;
            if(ev?.type==='content_block_delta'&&typeof ev.delta?.thinking==='string'&&lastKind==='thinking'){thought+=ev.delta.thinking;thoughtTimer??=setTimeout(flushThought,250);}
            if(ev?.type==='message_start'){doneTokens+=messageTokens;messageTokens=0;const u=ev.message?.usage;if(u&&!e.parent_tool_use_id){contextIn=(u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0);contextOut=0;}}
            if(ev?.type==='message_delta'&&!e.parent_tool_use_id&&typeof ev.usage?.output_tokens==='number')contextOut=ev.usage.output_tokens;
            if(typeof ev?.usage?.output_tokens==='number'){messageTokens=ev.usage.output_tokens;progress({});}
            if(block?.type==='tool_use'&&block.name==='StructuredOutput'){answerBytes=0;activity('writing');}
            const json=e.event?.delta?.partial_json;
            if(typeof json==='string'&&lastKind==='writing'){answerBytes+=json.length;progress({bytes:answerBytes});}
            if(e.type==='assistant'&&Array.isArray(e.message?.content))for(const c of e.message.content){
              if(c?.type!=='tool_use'||c.name==='StructuredOutput'||seenTools.has(c.id))continue;seenTools.add(c.id);
              const i=c.input||{},first=[i.command,i.query,i.url,i.pattern,i.description].find(v=>typeof v==='string');
              activity('tool',{tool:String(c.name),detail:shortPath(i.file_path||i.notebook_path||i.path)||(first?first.split('\n')[0].slice(0,200):undefined),body:JSON.stringify(i,null,2).slice(0,4000)});
            }
            const delta=e.event?.delta?.text;
            if(typeof delta==='string'&&!run.stopped){lastText+=delta;emit({type:'text',text:delta});}
            if(e.type==='result'){
              flushThought();const usage=e.usage||{},models=Object.entries(e.modelUsage||{}) as [string,any][];
              const window=(models.find(([m])=>m===initModel)?.[1]||models.sort((a,b)=>(b[1]?.contextWindow||0)-(a[1]?.contextWindow||0))[0]?.[1])?.contextWindow;
              emit({type:'usage',input:usage.input_tokens,output:usage.output_tokens,cache:usage.cache_read_input_tokens===undefined&&usage.cache_creation_input_tokens===undefined?undefined:(usage.cache_read_input_tokens||0)+(usage.cache_creation_input_tokens||0),cost:typeof e.total_cost_usd==='number'?e.total_cost_usd:undefined,context:contextIn===undefined?undefined:contextIn+contextOut,window:typeof window==='number'&&window>0?window:undefined});
              if(run.stopped){finish(new CancelledError());continue;}
              if(e.is_error){finish(Error(String(e.result||e.errors?.join('\n')||'Provider error.')));continue;}
              const out=e.structured_output || (e.result?.trim().startsWith('{')?JSON.parse(e.result):null);
              if(!out||typeof out!=='object')throw Error('Claude returned no valid answer.');
              const questions=Array.isArray(out.questions)?out.questions.filter((q:any)=>typeof q?.question==='string').map((q:any)=>({question:q.question,options:Array.isArray(q.options)?q.options.filter((o:any)=>typeof o==='string').slice(0,6):[],multiSelect:!!q.multiSelect})).slice(0,4):undefined;
              finish(null,{deck:applySlideChanges(deck,out),assets:Array.isArray(out.assets)?out.assets:undefined,questions:questions?.length?questions:undefined,message:String(out.message||lastText),sessionId:e.session_id});
            }
          }catch(e:any){finish(e);child.kill('SIGTERM');}
        }
      });
      child.stderr!.on('data',b=>stderr=(stderr+b.toString()).slice(-6000));
      child.on('error',e=>{if(this.running.get(deck.id)===run)this.running.delete(deck.id);finish(e);});
      child.on('close',code=>{
        if(this.running.get(deck.id)===run)this.running.delete(deck.id);
        finish(run.stopped?new CancelledError():Error(code===0?'No structured result returned.':stderr.trim()||'CLI exited with code '+code+'.'));
      });
      child.stdin!.on('error',()=>{});
      child.stdin!.end(JSON.stringify(context));
    }));
  }
  dispose(){for(const run of this.running.values()){run.stopped=true;run.child.kill('SIGTERM');}}
}
