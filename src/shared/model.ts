import {PollConfig,validPoll} from './poll';
export type Language = 'pt' | 'en' | 'es';
export interface Asset { id: string; name: string; mime: string; data: string }
export interface Slide {
  id: string; title: string; layoutId: string; html: string; css: string;
  script: string; staticHtml: string; notes: string;
  poll?: PollConfig;
}
// Ordinary layouts follow the active master. Imported layouts may bind to a copied source master to preserve appearance.
// Master HTML/CSS and layout HTML/CSS are independent from slides; only inheritance flows down to slide instances.
export interface Layout { id: string; name: string; html: string; css?: string; masterId?: string }
export interface Master { id: string; name: string; html: string; css: string }
export interface Deck {
  format: 'edukors-slides'; schemaVersion: 3; runtimeVersion: 1;
  id: string; revision: number; title: string;
  canvas: { width: number; height: number };
  masters: Master[]; activeMaster: string; layouts: Layout[]; slides: Slide[]; assets: Asset[];
  // Context of this talk for the assistant (ai/system-prompt.md in the package); the agent changes it only when asked.
  systemPrompt?: string;
}
// path: the .ESF the user sees (never the app's private working folder). pending: the save left out files the
// assistant was still writing, so the presentation stays modified.
export interface Project { path: string; deck: Deck; recovered?: boolean; pending?: boolean }
export interface Preferences {
  language: Language; recent: string[];
  // The AI library's account the assistant uses (accounts live in the shared EDUKORS registry, not here).
  aiAccount?: string;
  // Model and effort chosen in the assistant, per account; empty uses the provider's default.
  aiOptions?: Record<string, {model?: string; effort?: string}>;
  // The user's MCP servers, as the JSON text typed in Settings ({"mcpServers":{...}} or the bare object).
  aiMcp?: string;
  // Last folder used to attach or insert files (kept by the main process).
  attachDir?: string;
  // Extra instructions appended to the agent's built-in system prompt in every presentation.
  systemPrompt?: string;
  // Base URL of the interactive questions service (self-hostable); empty means none (no default).
  pollServer?: string;
  // Version of the terms of use the person accepted (absent until they do; kept by the main process).
  terms?: string;
}
// Bump it when the terms of use (src/ui/help/terms-of-use*.md) change: everyone is asked to accept them again.
export const TERMS_VERSION = '2026-10-30';
export interface Template { id: string; title: string }
export interface AIEvent {
  projectId: string; type: 'text' | 'done' | 'error' | 'usage' | 'status' | 'limits' | 'activity' | 'progress' | 'thought' | 'question' | 'login';
  // activity: what the CLI is doing (start, thinking, tool, writing, retry, validating, fixing), body is what its row expands to;
  // thought: reasoning text appended to the last activity; progress: bytes and output tokens of the answer so far.
  kind?: string; tool?: string; detail?: string; body?: string; bytes?: number; tokens?: number;
  accountId?: string; limits?: SessionLimits;
  // question: one question the agent (or a call to the user's MCP server) puts to the user, answered by aiAnswer.
  questionId?: string; options?: string[];
  // login: the address a sign-in offers; acceptsCode when the page ends with a code to paste back.
  url?: string; acceptsCode?: boolean;
  text?: string; deck?: Deck; input?: number; output?: number; cache?: number;
  cost?: number; sessionId?: string;
  // usage: tokens in the session's context after the last main-thread call, and the model's context window.
  context?: number; window?: number;
}
// Subscription session window (5 h) as the provider reports it.
export interface SessionLimits { utilization: number; resetsAt?: number; status: string; updated: number }
export const uid = (prefix = 's') => `${prefix}-${crypto.randomUUID()}`;
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!));
export const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,80) || 'presentation';
// Theme of a new master: white slides.
export const baseCss=`:root{--paper:#ffffff;--ink:#172033;--accent:#5265e8;--muted:#657085;--surface:#ffffff}
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:var(--paper)}
.slide{position:relative;width:1600px;height:900px;padding:85px 100px;overflow:hidden;background:var(--paper)}
h1,h2,h3,p{margin:0}h1{font-size:88px;line-height:1.13;letter-spacing:-3px;max-width:1300px}h2{font-size:64px;line-height:1.15;letter-spacing:-2px;margin-bottom:32px}h3{font-size:36px;line-height:1.2}
p,li{font-size:32px;line-height:1.5;color:var(--muted)}p{margin-top:24px}ul{padding-left:36px}li{margin:22px 0}img{max-width:100%;object-fit:contain}
[data-step]{transition:opacity .25s,transform .25s}[data-step].pending{opacity:0;transform:translateY(12px)}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
export const blankHtml='<section class="slide"></section>';
// Default names follow the interface language.
export const defaultNames:Record<Language,{master:string;layout:string}>={pt:{master:'Base',layout:'Em branco'},en:{master:'Base',layout:'Blank'},es:{master:'Base',layout:'En blanco'}};
export function newMaster(name=defaultNames.en.master):Master{return{id:uid('m'),name,html:'',css:baseCss};}
// The active master (the first one if the ID is missing) and a slide's layout (the first one if missing).
export const activeMaster=(deck:Deck)=>deck.masters.find(m=>m.id===deck.activeMaster)||deck.masters[0];
export const layoutOf=(deck:Deck,layoutId:string)=>deck.layouts.find(l=>l.id===layoutId)||deck.layouts[0];
// Imported layouts retain an independent copy of their source master. Ordinary layouts follow the active master.
export const masterOf=(deck:Deck,slide:Pick<Slide,'layoutId'>)=>deck.masters.find(m=>m.id===deck.layouts.find(l=>l.id===slide.layoutId)?.masterId)||activeMaster(deck);
export function newSlide(layout:Layout):Slide{return{id:uid(),title:'',layoutId:layout.id,html:layout.html,css:'',script:'',staticHtml:'',notes:''};}
export function newDeck(title:string,names=defaultNames.en):Deck {
  const master=newMaster(names.master),layout={id:uid('l'),name:names.layout,html:blankHtml};
  return {format:'edukors-slides',schemaVersion:3,runtimeVersion:1,id:uid('deck'),revision:0,title,canvas:{width:1600,height:900},masters:[master],activeMaster:master.id,layouts:[layout],slides:[newSlide(layout)],assets:[]};
}
export function duplicateSlides(slides:Slide[]):Slide[] {
  return slides.map(s=>({...structuredClone(s),id:uid()}));
}
// Resources must be embedded (asset:ID or data:); links (<a href>) may stay external.
export function unresolvedReference(text:string):string|null{
  for(const m of text.matchAll(/\s(?:src|srcset|poster|background|xlink:href)\s*=\s*(["']?)([^"'\s>]+)/gi)){
    const value=m[2].trim();if(!/^(?:asset:|data:|blob:|#)/i.test(value))return value;
  }
  for(const m of text.matchAll(/<(?:image|use|feImage)\b[^>]*\shref\s*=\s*["']?([^"'\s>]+)/gi))if(!/^(?:asset:|data:|#)/i.test(m[1]))return m[1];
  // Inline styles serialized by the DOM quote URLs as &quot; inside the attribute.
  for(const m of text.replace(/&quot;|&#0*34;/gi,'"').replace(/&apos;|&#0*39;/gi,"'").matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi))if(!/^(?:asset:|data:|#)/i.test(m[2].trim()))return m[2].trim();
  return null;
}
// Images and fonts that no slide, master or layout references any more (deleted or replaced) are left out of the saved file.
export function usedAssets(d:Deck){
  const refs=new Set([...[...d.slides.flatMap(s=>[s.html,s.css,s.script,s.staticHtml]),...d.masters.flatMap(m=>[m.html,m.css]),...d.layouts.flatMap(l=>[l.html,l.css||''])].join('\n').matchAll(/asset:([\w-]+)/g)].map(m=>m[1]));
  return d.assets.filter(a=>refs.has(a.id));
}
export function validateDeck(value:unknown):asserts value is Deck {
  const d=value as Deck;
  if(!d||d.format!=='edukors-slides'||d.schemaVersion!==3||d.runtimeVersion!==1) throw Error('Unsupported ESF version.');
  if(typeof d.id!=='string'||!/^deck-[\w-]+$/.test(d.id))throw Error('Invalid project ID.');
  if(typeof d.title!=='string'||!d.title.trim()||d.title.length>500)throw Error('Invalid title.');
  if(!Number.isSafeInteger(d.revision)||d.revision<0)throw Error('Invalid metadata.');
  if(d.canvas?.width!==1600||d.canvas?.height!==900)throw Error('Unsupported canvas (1600 × 900 required).');
  if(!Array.isArray(d.slides)||d.slides.length<1||d.slides.length>300)throw Error('A presentation needs 1–300 slides.');
  const ids=new Set<string>();
  for(const s of d.slides){
    if(s.poll!==undefined&&!validPoll(s.poll))throw Error('Invalid interactive question.');
    if(!s||!/^s-[\w-]+$/.test(s.id)||ids.has(s.id))throw Error('Invalid or duplicate slide ID.');
    ids.add(s.id);
    for(const key of ['title','layoutId','html','css','script','staticHtml','notes'] as const){
      if(typeof s[key]!=='string'||s[key].length>2_000_000)throw Error(`Invalid slide ${key}.`);
    }
    for(const html of [s.html,s.staticHtml]){
      if(/<(?:script|iframe|object|embed|base|form|link|meta)\b/i.test(html)||/\son[a-z]+\s*=/i.test(html)||/(?:javascript|file):/i.test(html))throw Error('Unsupported HTML. Put JavaScript in behavior.js.');
    }
    if(/@import\b|url\(\s*['"]?(?:https?:|file:|\/\/)/i.test(s.css))throw Error('External styles are not supported.');
    const ref=unresolvedReference(s.html+'\n'+s.staticHtml+'\n'+s.css);
    if(ref)throw Error(`Slide "${s.title}" references a resource that is not embedded: ${ref.slice(0,200)}. Import it as an image so it works offline.`);
  }
  const badHtml=(v:unknown)=>typeof v!=='string'||v.length>2_000_000||/<(?:script|iframe|object|embed|base|form|link|meta)\b/i.test(v)||/\son[a-z]+\s*=/i.test(v);
  const named=(x:any)=>x&&typeof x.id==='string'&&/^[\w-]+$/.test(x.id)&&x.id.length<=100&&typeof x.name==='string'&&x.name.trim()&&x.name.length<=200;
  if(d.systemPrompt!==undefined&&(typeof d.systemPrompt!=='string'||d.systemPrompt.length>20000))throw Error('Invalid presentation system prompt.');
  if(!Array.isArray(d.masters)||d.masters.length<1||d.masters.length>50)throw Error('A presentation needs 1–50 slide masters.');
  const masterIds=new Set<string>(),layoutIds=new Set<string>();
  for(const m of d.masters){
    if(!named(m)||masterIds.has(m.id)||badHtml(m.html)||typeof m.css!=='string'||m.css.length>2_000_000)throw Error('Invalid master.');
    masterIds.add(m.id);
    if(/@import\b|url\(\s*['"]?(?:https?:|file:|\/\/)/i.test(m.css))throw Error('External styles are not supported.');
  }
  if(!masterIds.has(d.activeMaster))throw Error('The active master does not exist.');
  if(!Array.isArray(d.layouts)||d.layouts.length<1||d.layouts.length>100)throw Error('A presentation needs 1–100 layouts.');
  for(const l of d.layouts){if(!named(l)||layoutIds.has(l.id)||badHtml(l.html)||l.css!==undefined&&(typeof l.css!=='string'||l.css.length>2_000_000||/@import\b|url\(\s*['"]?(?:https?:|file:|\/\/)/i.test(l.css))||l.masterId!==undefined&&!masterIds.has(l.masterId))throw Error('Invalid layout.');layoutIds.add(l.id);}
  const missing=d.slides.find(s=>!layoutIds.has(s.layoutId));if(missing)throw Error(`Slide ${missing.id} uses a layout that does not exist: ${missing.layoutId}`);
  if(!Array.isArray(d.assets)||d.assets.length>2000)throw Error('Invalid assets.');
  const assetIds=new Set<string>();
  for(const a of d.assets){
    if(!a||!/^asset-[\w-]+$/.test(a.id)||assetIds.has(a.id))throw Error('Invalid asset ID.');
    assetIds.add(a.id);
    if(typeof a.name!=='string'||!/^image\/(?:png|jpeg|webp|gif|svg\+xml|avif)$|^font\/(?:woff2?|ttf|otf)$/.test(a.mime)||typeof a.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)||a.data.length>80_000_000)throw Error('Invalid asset.');
  }
  for(const s of [...d.slides,...d.masters.map(m=>({html:m.html,css:m.css,script:'',staticHtml:''})),{html:d.layouts.map(l=>l.html).join('\n'),css:d.layouts.map(l=>l.css||'').join('\n'),script:'',staticHtml:''}]){
    const external=unresolvedReference(s.html+'\n'+s.css+'\n'+s.staticHtml);if(external)throw Error(`Presentation references a resource that is not embedded: ${external.slice(0,200)}`);
    const refs=[s.html,s.css,s.script,s.staticHtml].join('\n').matchAll(/asset:([\w-]+)/g);
    for(const m of refs)if(!assetIds.has(m[1]))throw Error(`Missing resource: ${m[1]}`);
  }
  if(JSON.stringify(d).length>200_000_000)throw Error('Project exceeds 200 MB.');
}
