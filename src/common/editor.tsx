// The Slides editor inside the shell of Edukors Common. Common owns the window: title bar, toolbar (file, edit, insert,
// settings, help, panels), document tabs, Save/Open/Recent, the AI assistant, Settings, Help, terms and updates.
// Slides owns what is inside: the slide list (left panel), the canvas and its format bar, the slide master, layouts,
// interactive questions, templates, Present and the exports. Documents are .eslx; .esf and .pptx open as imports.
import './slides.css';
import React,{useState,useEffect,useRef,useMemo,useReducer} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {masterPrefix,layoutPrefix,masterItems,itemName,masterDeck,masterSlide,findSlide,putSlide} from '../shared/masters';
import {Deck,Slide,Template,Language,Asset,newDeck,newSlide,newMaster,defaultNames,duplicateSlides,uid,layoutOf,activeMaster,masterOf,blankHtml,usedAssets} from '../shared/model';
import {copySlides,pasteSlides,copyMasterItem,pasteMasterItems,importResources,independentObjects,joinBehavior} from '../shared/clipboard';
import {relayout} from '../shared/layout';
import {applyEdits,editIndex,EditOp,SelectionDetails,ObjectStyle} from '../shared/edit';
import {insertManual,editableAt,safeUrl,setLinkUrl,setLinkCaption,setLinkQr,linkHasQr,ManualKind,shapeTypes,shapeLook,setShape,setLinkStyle,linkLook,LinkStyle,setImageShadow,wrapShadow} from '../shared/manual';
import {PollConfig,pollWords} from '../shared/poll';
import {encodeEslx,decodeEslx} from '../shared/eslx';
import {setAssetUrl} from '../shared/render';
import {importPptx} from '../shared/pptx-import';
import {loadLegacyDeck} from '../shared/legacy';
import {PollEditor,PollServerSettings} from '../ui/PollEditor';
import {translator,T} from '../ui/i18n';
import {api,desktop} from '../ui/bridge';
import {Modal,LayoutPicker,Preview,LazyPreview,TemplatePreview,TemplateRow,ImportNotice,CanvasEdit,ToolButton,ask,commonIcon,motionCss,errorText,typingField,zoomSteps,templatePreviews} from '../ui/parts';
import {Store,Tab} from './store';
import {createSlidesTools,assistantContext} from './assistant-tools';

interface CommonDoc {id:number;name?:string;saved?:boolean;modified?:boolean;path?:string;folder?:string;file?:string;origin?:string}
const common:any=globalThis;
const store=new Store();
const language=():Language=>{const l=document.documentElement.lang;return(['pt','en','es','zh','hi'] as const).find(x=>x===l)||'en';};
const docs=():CommonDoc[]=>common.EdukorsDocuments.list();
const activeDoc=():CommonDoc|undefined=>common.EdukorsDocuments.active();
const docOf=(id:number)=>docs().find(d=>d.id===id);
const toast=(message:string)=>common.EdukorsFileDialogs.toast({t:(k:string)=>common.EdukorsLanguages[document.documentElement.lang]?.messages[k]||common.EdukorsLanguages.en.messages[k]||k,message});
const svg=(name:string)=>({__html:common.EdukorsIcons.svg(name)});
// Common's own interface texts (format controls, shapes) in the interface language.
const commonT=(key:string)=>common.EdukorsLanguages[document.documentElement.lang]?.messages[key]||common.EdukorsLanguages.en.messages[key]||key;
// Images and fonts from files: Common's picker (it starts in the last folder used, else next to the document). Each
// enters the presentation under the hash of its bytes.
const hex=(buffer:ArrayBuffer)=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
const base64=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
async function pickAssets(kinds=['image','font']):Promise<Asset[]>{
  const files:{file:string;mime:string;bytes:Uint8Array}[]=await common.EdukorsFiles.pickFiles({kinds,multiple:kinds.length>1});
  return Promise.all(files.map(async f=>({id:'asset-'+hex(await crypto.subtle.digest('SHA-256',f.bytes as BufferSource)),name:f.file,mime:f.mime,data:base64(f.bytes)})));
}
const shellButton=(command:string)=>document.querySelector<HTMLButtonElement>(`.toolbar [data-command="${command}"]`);

// ---------- Documents ----------
// Common keeps what is shared by every app: unsaved changes of the AI conversations, the "Saving…" status, the check
// for changes made on disk, drafts and their recovery. The editor reports its own changes (doc.modified, and each change
// with edukors:document-changed, which keeps the draft current).
const conversationsOf=(doc:CommonDoc)=>common.EdukorsAiConversations.toPackage('slides',common.EdukorsAiAssistant.conversationsOf(doc)).parts.map((part:any)=>part.content);
function syncModified(id:number){
  const doc=docOf(id);if(!doc)return;
  const modified=store.modified(id);
  if(doc.modified===modified)return;
  doc.modified=modified;document.dispatchEvent(new CustomEvent('edukors:document-modified',{detail:{id}}));
}
store.subscribe(syncModified);
store.subscribe(id=>document.dispatchEvent(new CustomEvent('edukors:document-changed',{detail:{id}})));
interface Content {deck:Deck;history?:Uint8Array;conversations?:unknown[];imported?:boolean}
// The file's name is the presentation's title; resources no slide refers to are left out of the file.
async function encode(doc:CommonDoc,name?:string){
  const tab=store.get(doc.id);if(!tab)throw Error('The presentation is not open.');
  const deck={...tab.deck,title:name||tab.deck.title};
  return{bytes:await encodeEslx({...deck,assets:usedAssets(deck)},tab.history,conversationsOf(doc)),committed:{version:tab.version}};
}
common.EdukorsAppDocument={
  toBytes:(doc:CommonDoc,{name}:{name?:string}={})=>encode(doc,name),
  // Drafts are packed by the main process, so typing and dragging never wait for the compression of large images.
  async draftBytes(doc:CommonDoc){
    const tab=store.get(doc.id);if(!tab)throw Error('The presentation is not open.');
    const deck={...tab.deck,assets:usedAssets(tab.deck)};
    if(!desktop())return encodeEslx(deck,tab.history,conversationsOf(doc));
    // Each resource crosses to the main process once (the frames' registry); drafts then carry only their IDs.
    await registerAssets(deck,deck.assets);
    return new Uint8Array(await api.invoke('draftPack',{deck:{...deck,assets:deck.assets.map(a=>({...a,data:''}))},history:tab.history,conversations:conversationsOf(doc)}));
  },
  async fromBytes(bytes:Uint8Array):Promise<Content>{const r=await decodeEslx(bytes);return{deck:r.deck,history:r.history,conversations:r.conversations};},

  // .esf (earlier versions of the app) and .pptx become presentations without a file; the originals are never written.
  async importFile({format,bytes,name}:{format:string;bytes:Uint8Array;name?:string}):Promise<Content>{
    if(format==='pptx')return{deck:(await importPptx(bytes,name)).deck,imported:true};
    if(format!=='esf')throw Error('Unsupported presentation format.');
    const entries=await common.EdukorsPackage.unzip(bytes,{maxEntries:20000,maxTotalBytes:2*2**30});
    const files=new Map<string,Uint8Array>(entries.map((entry:any)=>[entry.name,entry.bytes]));
    const read=async(part:string)=>{const data=files.get(part);if(!data)throw Error('Missing ESF part: '+part);return data;};
    const decoder=new TextDecoder('utf-8',{fatal:true}),manifest=JSON.parse(decoder.decode(await read('manifest.json')));
    if(manifest.format!=='edukors-slides'||manifest.packageVersion!==1||manifest.schemaVersion!==3)throw Error('Unsupported ESF version. Original preserved.');
    const native=files.get('.edukors/ai/common-conversations.json');
    return{deck:await loadLegacyDeck(manifest,read),history:files.get('.edukors/ai/conversations.json'),conversations:native?JSON.parse(decoder.decode(native)):[],imported:true};
  },
  adopt(doc:CommonDoc,content:Content){
    store.add(doc.id,content.deck,{history:content.history,saved:!content.imported});
    common.EdukorsAiAssistant.restoreConversations(doc,content.conversations||[]);
    syncModified(doc.id);
  },
  selectAll:()=>command('selectAll')
};
let command:(name:string)=>void=()=>{};
document.addEventListener('edukors:document-saved',((event:CustomEvent)=>{
  const {doc,committed}=event.detail;if(!store.has(doc.id))return;
  const tab=store.get(doc.id)!;
  if(doc.name&&tab.deck.title!==doc.name)store.update(doc.id,x=>({...x,deck:{...x.deck,title:doc.name}}));
  store.markSaved(doc.id,committed?.version??tab.version);syncModified(doc.id);
}) as EventListener);
// A document Common creates by itself (its own New, without the gallery) starts as a blank presentation.
function ensureTabs(){
  const ids=new Set(docs().map(d=>d.id));
  for(const tab of store.list())if(!ids.has(tab.doc))store.remove(tab.doc);
  for(const doc of docs())if(!store.has(doc.id))store.add(doc.id,newDeck(doc.name||translator(language())('untitled'),defaultNames[language()]),{saved:true});
}
common.EdukorsAiAssistant.configure({
  instructions:'You are the assistant of Edukors Slides Editor, a presentation editor whose slides are small HTML/CSS/JS documents (16:9, 1920×1080 design size) that inherit a base (master) and a layout. Work only on the presentation of this conversation, only through its tools: read_document returns the slides, bases and layouts with the revision; apply_changes changes them (pass that revision as expectedRevision; send only what changes; never delete slides; never add interactive questions). Images you need come in with import_image and are referenced as asset:ID; no other external resource (https URLs, CDN fonts or scripts) works in the exported file. Each request carries the selected slides, the index of all slides and what the person is looking at; follow documentInstructions when present. Respond briefly, in the language of the request.',
  documentId:(doc:CommonDoc)=>`slides-${doc.id}`,
  // No documentPath: the agent works in Common's private folder for this document, never in the folder of the file.
  context:(doc:CommonDoc)=>assistantContext(store,doc.id),
  tools:createSlidesTools(store,desktop()?{downloadImage:url=>api.invoke('downloadImage',url)}:{})
});

// In the desktop app the slide frames load images and fonts from the frame scheme (registered once per presentation
// with the main process), so a large presentation does not carry them as base64 into every canvas and thumbnail.
// Resources registered in one task go together in one call per presentation.
const registered=new Map<string,Promise<unknown>>();let batch:Map<string,{list:any[];done:Promise<unknown>}>|null=null;
function registerAssets(deck:Deck,assets:Asset[]){
  return Promise.all(assets.map(asset=>{
    const key=deck.id+'/'+asset.id,known=registered.get(key);if(known)return known;
    const open=batch||(batch=new Map());if(open.size===0)queueMicrotask(()=>{batch=null;});
    let entry=open.get(deck.id);
    if(!entry){const list:any[]=[];entry={list,done:Promise.resolve().then(()=>api.invoke('registerAssets',deck.id,list))};open.set(deck.id,entry);}
    entry.list.push({id:asset.id,mime:asset.mime,data:asset.data});registered.set(key,entry.done);
    entry.done.catch(()=>registered.delete(key));
    return entry.done;
  }));
}
if(desktop())setAssetUrl((deck,asset)=>{void registerAssets(deck,[asset]).catch(()=>{});return`esf-frame://preview/asset/${deck.id}/${asset.id}`;});
// ---------- Shell slots ----------
// Places in Common's shell where the editor renders (React portals); created once.
function slot(tag:string,className:string,place:(el:HTMLElement)=>void){const el=document.createElement(tag);el.className=className;place(el);return el;}
const fileExtra=slot('span','slides-contents document-action',el=>shellButton('reveal')!.before(el));
const viewGroup=slot('div','toolbar-group document-action slides-view-actions',el=>{const sep=document.createElement('span');sep.className='separator document-action';sep.setAttribute('aria-hidden','true');document.getElementById('file-actions')!.after(sep,el);});
const insertExtra=slot('span','slides-contents',el=>document.getElementById('insert-actions')!.append(el));
const statusSlot=slot('span','slides-status',el=>document.getElementById('document-status')!.after(el));
const sidebarSlot=slot('div','slides-sidebar',el=>document.querySelector('#sidebar-panel .panel-inner')!.append(el));
document.getElementById('sidebar-placeholder')?.setAttribute('hidden','');
const settingsSections=(()=>{
  const nav=document.querySelector('.settings-nav')!,body=document.querySelector('.settings-body')!;
  return(['poll','deck'] as const).map(key=>{
    const button=document.createElement('button');button.type='button';button.className='settings-nav-item';button.dataset.section='slides-'+key;button.setAttribute('aria-controls','slides-'+key+'-panel');
    button.innerHTML=common.EdukorsIcons.svg(key==='poll'?'slides-poll':'slides-file');const label=document.createElement('span');button.append(label);nav.append(button);
    const section=document.createElement('section');section.className='slides-settings-panel';section.id='slides-'+key+'-panel';section.hidden=true;body.append(section);
    button.addEventListener('click',()=>{for(const item of document.querySelectorAll<HTMLElement>('[data-section]')){const on=item===button;if(on)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');document.getElementById(item.getAttribute('aria-controls')!)!.hidden=!on;}});
    return{key,label,section};
  });
})();
// Edit and Insert buttons of the toolbar keep the keyboard in the canvas frame, so a text being edited keeps its selection.
for(const button of document.querySelectorAll<HTMLElement>('#edit-actions .tool,#insert-actions .tool'))button.addEventListener('mousedown',e=>e.preventDefault());
for(const key of ['undo','redo','cut','copy','paste','duplicate','delete','insertText','insertShape','insertImage'])shellButton(key)?.addEventListener('click',e=>command(key==='insertShape'?'insertShapeMenu:'+JSON.stringify((e.currentTarget as HTMLElement).getBoundingClientRect()):key));
// The gallery replaces Common's direct New.
for(const button of [shellButton('new'),document.getElementById('document-new-tab')])button?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();command('new');},true);
// The earlier interface's language seeds the shared one, once.
void api.invoke('preferences').then((p:any)=>{
  if(!p?.language||localStorage.getItem('edukors.common.preferences'))return;
  const select=document.getElementById('language') as HTMLSelectElement|null;if(!select)return;select.value=p.language;select.dispatchEvent(new Event('change',{bubbles:true}));
}).catch(()=>{});
// The shared keys the canvas frame passes on (it has the keyboard while objects are selected or a text is edited).
addEventListener('message',e=>{
  const m=e.data;if(m?.app!=='esf-edit'||m.type!=='key'||!(e.source as Window|null)||![...document.querySelectorAll('iframe')].some(f=>f.contentWindow===e.source))return;
  document.dispatchEvent(new KeyboardEvent('keydown',{key:String(m.key),code:String(m.code||''),metaKey:!!m.meta,ctrlKey:!!m.ctrl,shiftKey:!!m.shift,altKey:!!m.alt,bubbles:true,cancelable:true}));
});

function ShellTool({command,icon,label,keys,pressed,className='',onClick,disabled}:{command:string;icon:string;label:string;keys?:string;pressed?:boolean;className?:string;onClick:()=>void;disabled?:boolean}){
  const mac=common.EdukorsPlatform?.mac,tip=keys?`${label} (${mac?keys:keys.replace('⌘','Ctrl+').replace('⇧','Shift+').replace('⌥','Alt+')})`:label;
  return <button type="button" className={'tool '+className} data-command={command} aria-label={label} aria-pressed={pressed} aria-disabled={disabled||undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(!disabled)onClick();}}><span className="slides-contents" dangerouslySetInnerHTML={svg(icon)}/><span className="tooltip" aria-hidden="true">{tip}</span></button>;
}

// ---------- Editor ----------
function Editor(){
  const [,render]=useReducer((n:number)=>n+1,0);
  const [lang,setLang]=useState<Language>(language),[active,setActive]=useState<number|null>(null);
  useEffect(()=>store.subscribe(()=>render()),[]);
  useEffect(()=>{
    const changed=()=>{ensureTabs();const doc=activeDoc();setActive(doc?doc.id:null);
      // The format bar stays open while a presentation is open, so selecting an object never moves the canvas.
      const slotEl=document.getElementById('context-slot')!,open=!!doc;slotEl.classList.toggle('is-open',open);slotEl.classList.toggle('is-settled',open);slotEl.inert=!open;document.body.classList.toggle('slides-open',open);
      render();};
    const prefs=()=>{setLang(language());render();};
    document.addEventListener('edukors:documents-changed',changed);document.addEventListener('edukors:preferences-changed',prefs);changed();
    return()=>{document.removeEventListener('edukors:documents-changed',changed);document.removeEventListener('edukors:preferences-changed',prefs);};
  },[]);
  const t=translator(lang);
  const tab=active!==null?store.get(active):undefined,deck=tab?.deck,slide=deck?.slides.find(s=>s.id===tab?.selected[0])||deck?.slides[0];
  const [templates,setTemplates]=useState<Template[]>([]),[gallery,setGallery]=useState(false),[selectedTemplate,setSelectedTemplate]=useState('blank'),[search,setSearch]=useState(''),[loading,setLoading]=useState(false);
  const [error,setError]=useState(''),[pollServer,setPollServer]=useState('');
  const lastFormat=useRef('html');
  const [pollTarget,setPollTarget]=useState<{doc:number;slide:string;poll?:PollConfig}|null>(null);
  const [layoutPick,setLayoutPick]=useState<'insert'|'change'|null>(null),[renaming,setRenaming]=useState<string|null>(null),[templateName,setTemplateName]=useState<string|null>(null),[zoom,setZoom]=useState(100);
  const editorFrame=useRef<HTMLIFrameElement|null>(null),[manualSelection,setManualSelection]=useState<{slide:string;index:number;details?:SelectionDetails}|null>(null);
  const canvasRange=useRef<{start:number;end:number}|null>(null),[imageSel,setImageSel]=useState(false),[cropOn,setCropOn]=useState(false);
  // Selection mode: the last area clicked (slide list or canvas) owns Delete, copy/cut and ⌘D, whatever has the keyboard focus.
  const [selMode,setSelModeState]=useState<'slides'|'canvas'>('canvas'),selModeRef=useRef(selMode);
  const setSelMode=(mode:'slides'|'canvas')=>{selModeRef.current=mode;setSelModeState(mode);};
  useEffect(()=>{void api.invoke('preferences').then((p:any)=>setPollServer(p?.pollServer||'')).catch(()=>{});},[]);
  const masterView=tab?.masterView??null;
  const setMasterView=(value:string|null|((v:string|null)=>string|null))=>{if(active!==null)store.update(active,x=>({...x,masterView:typeof value==='function'?value(x.masterView):value}));};
  // The canvas edits the selected slide or, in the slide master view, a base or a layout.
  const masterItem=deck&&masterView?(masterItems(deck).includes(masterView)?masterView:'m:'+deck.masters[0].id):null;
  const masterTab=masterItem?.startsWith('m:')?'bases':'layouts',visibleMasterItems=deck?masterItems(deck).filter(item=>item.startsWith(masterTab==='bases'?'m:':'l:')):[];
  const editSlide=deck&&masterItem?masterSlide(deck,masterItem):slide,canvasDeck=deck&&masterItem?masterDeck(deck,masterItem):deck;
  const run=async(fn:()=>Promise<any>)=>{try{return await fn();}catch(e:any){setError(errorText(t,e));return null;}};
  const updateTab=(id:number,fn:(x:Tab)=>Tab)=>store.update(id,fn);
  // fn may return the selection to apply, for changes whose new slide IDs are only known inside it.
  const mutate=(fn:(d:Deck)=>string[]|void,selection?:string[],merge=false)=>{if(active===null)return;try{store.mutate(active,fn,selection,merge);}catch(e:any){setError(errorText(t,e));}};
  const notice=(text:string)=>toast(text);
  const railRef=useRef<HTMLDivElement>(null),canvasSel=useRef({slide:'',indices:[] as number[],editing:false}),railScroll=useRef<number|null>(null);
  useEffect(()=>{const rail=railRef.current;if(!rail)return;const item=rail.querySelector('.slide-item.selected');
    if(railScroll.current!==null){rail.scrollTop=railScroll.current;railScroll.current=null;const focus=document.activeElement;if(!focus||focus===document.body||rail.contains(focus))item?.querySelector('button')?.focus({preventScroll:true});return;}
    item?.scrollIntoView({block:'nearest'});},[tab?.selected[0],deck?.slides.indexOf(slide!),active,masterItem]);
  // Files dragged from the Finder must reach the workbench drop, not the editable canvas frame.
  useEffect(()=>{const on=(e:DragEvent)=>{if(e.dataTransfer?.types.includes('Files'))document.body.classList.add('file-drag');},off=(e:DragEvent)=>{if(e.type==='drop'||!e.relatedTarget)document.body.classList.remove('file-drag');};
    addEventListener('dragenter',on);addEventListener('dragleave',off);addEventListener('drop',off,true);return()=>{removeEventListener('dragenter',on);removeEventListener('dragleave',off);removeEventListener('drop',off,true);};},[]);
  useEffect(()=>{setLayoutPick(null);setRenaming(null);setManualSelection(null);setImageSel(false);setCropOn(false);canvasSel.current={slide:'',indices:[],editing:false};},[active]);
  // Undo and Redo of the toolbar follow the active presentation.
  useEffect(()=>{for(const [key,on] of [['undo',!!tab?.past.length],['redo',!!tab?.future.length],['cut',!!tab],['copy',!!tab],['paste',!!tab],['duplicate',!!tab],['delete',!!tab],['insertText',!!tab],['insertShape',!!tab],['insertImage',!!tab]] as const){const b=shellButton(key);if(!b)continue;if(on)b.removeAttribute('aria-disabled');else b.setAttribute('aria-disabled','true');}});
  // Typing in the presentation's instructions is one undo step until something else changes the deck.
  const setDeckPrompt=(text:string)=>{if(active===null||!deck)return;const merge=promptStep.current===active+':'+tab!.version;mutate(d=>{if(text)d.systemPrompt=text;else delete d.systemPrompt;},undefined,merge);promptStep.current=active+':'+store.get(active)!.version;};
  const promptStep=useRef('');
  function addSlide(layoutId:string){if(!deck||!slide)return;const s=newSlide(layoutOf(deck,layoutId));mutate(d=>{d.slides.splice(d.slides.findIndex(x=>x.id===slide.id)+1,0,s);},[s.id]);setLayoutPick(null);}
  function changeLayout(layoutId:string){if(!deck||!tab)return;const layout=layoutOf(deck,layoutId);setLayoutPick(null);if(deck.slides.some(s=>tab.selected.includes(s.id)&&s.layoutId!==layoutId))mutate(d=>{d.slides=d.slides.map(s=>tab.selected.includes(s.id)&&s.layoutId!==layoutId?relayout(s,layout):s);});}
  // Slide master view: bases and layouts are added, renamed and deleted there; at least one of each remains. A new base
  // is only a new main slide (the layouts are shared); the person chooses which base is active.
  function addMasterItem(){if(!deck)return;const m=newMaster(`${t('masterName')} ${deck.masters.length+1}`);mutate(d=>{d.masters.push(m);});setMasterView('m:'+m.id);}
  function activateMaster(id:string){if(!deck||id===deck.activeMaster&&!deck.layouts.some(l=>l.masterId))return;mutate(d=>{d.activeMaster=id;d.layouts.forEach(l=>delete l.masterId);});}
  function addLayoutItem(){if(!deck)return;const l={id:uid('l'),name:`${t('layoutName')} ${deck.layouts.length+1}`,html:blankHtml};
    mutate(d=>{const at=d.layouts.findIndex(x=>'l:'+x.id===masterItem);d.layouts.splice(at<0?d.layouts.length:at+1,0,l);});setMasterView('l:'+l.id);}
  function renameItem(item:string,value:string){setRenaming(null);const name=value.trim().slice(0,200);if(!deck||!name||name===itemName(deck,item))return;
    mutate(d=>{d.masters=d.masters.map(m=>item==='m:'+m.id?{...m,name}:m);d.layouts=d.layouts.map(l=>item==='l:'+l.id?{...l,name}:l);});}
  async function deleteMasterItem(){
    if(!deck||!masterItem)return;const id=masterItem.slice(2);
    if(masterItem.startsWith('m:')){
      if(deck.masters.length<2){notice(t('lastMaster'));return;}if(!await ask(t('deleteMasterConfirm'),t('deleteMaster'),t('cancel')))return;
      const rest=deck.masters.filter(m=>m.id!==id);mutate(d=>{d.masters=d.masters.filter(m=>m.id!==id);if(d.activeMaster===id)d.activeMaster=rest[0].id;d.layouts.forEach(l=>{if(l.masterId===id)delete l.masterId;});});setMasterView('m:'+(id===deck.activeMaster?rest[0].id:deck.activeMaster));return;
    }
    if(deck.layouts.length<2){notice(t('lastLayout'));return;}
    // Slides of a deleted layout keep their content and move to the layout before it.
    const used=deck.slides.filter(s=>s.layoutId===id).length;if(!await ask(t('deleteLayoutConfirm')+(used?' '+t('slidesMoved').replace('{n}',String(used)):''),t('deleteLayout'),t('cancel')))return;
    const i=deck.layouts.findIndex(l=>l.id===id),to=deck.layouts.filter(l=>l.id!==id)[Math.max(0,i-1)].id;
    mutate(d=>{d.layouts=d.layouts.filter(l=>l.id!==id);d.slides=d.slides.map(s=>s.layoutId===id?relayout(s,layoutOf(d,to)):s);});setMasterView('l:'+to);
  }
  function moveMasterItem(direction:number){if(!masterItem)return;const id=masterItem.slice(2),bases=masterItem.startsWith('m:');mutate(d=>{const list:{id:string}[]=bases?d.masters:d.layouts,i=list.findIndex(x=>x.id===id),to=i+direction;if(i<0||to<0||to>=list.length)return;const [x]=list.splice(i,1);list.splice(to,0,x);});}
  function duplicateMasterItem(){if(masterItem)mutate(d=>{setMasterView(pasteMasterItems(d,copyMasterItem(d,masterItem))[0]);});}
  function deleteSlides(){if(!deck||!tab)return;if(deck.slides.length===tab.selected.length){notice(t('deleteLast'));return;}const last=Math.max(...tab.selected.map(id=>deck.slides.findIndex(s=>s.id===id))),next=deck.slides.filter(s=>!tab.selected.includes(s.id));railScroll.current=railRef.current?.scrollTop??null;mutate(d=>{d.slides=next;},[(deck.slides[last+1]||next.at(-1)!).id]);}
  function toggleMaster(){setMasterView(v=>v?null:deck&&slide?'l:'+layoutOf(deck,slide.layoutId).id:null);setLayoutPick(null);setRenaming(null);}
  function selectMasterTab(value:'bases'|'layouts'){if(!deck||value===masterTab)return;setRenaming(null);setMasterView(value==='bases'?'m:'+deck.activeMaster:'l:'+layoutOf(deck,slide?.layoutId||'').id);}
  function duplicate(){if(!tab||!deck)return;const list=duplicateSlides(deck.slides.filter(s=>tab.selected.includes(s.id)));mutate(d=>{d.slides.splice(Math.max(...tab.selected.map(id=>d.slides.findIndex(s=>s.id===id)))+1,0,...list);},list.map(s=>s.id));}
  async function copy(cut=false){if(!deck||!tab)return;
    if(masterItem){await api.invoke('clipboardWrite',copyMasterItem(deck,masterItem));if(cut)deleteMasterItem();return;}
    const payload=copySlides(deck,tab.selected);await api.invoke('clipboardWrite',payload);
    if(cut){const ids=new Set(payload.slides.map(s=>s.id));mutate(d=>{if(d.slides.every(s=>ids.has(s.id)))return;d.slides=d.slides.filter(s=>!ids.has(s.id));return[d.slides[0].id];});}}
  // Objects selected on the canvas (text boxes, images…) are copied as their HTML with the assets they use.
  function selectedObjects(){
    const sel=canvasSel.current;if(!deck||!editSlide||sel.slide!==editSlide.id||sel.editing||!sel.indices.length)return null;
    const doc=new DOMParser().parseFromString(editSlide.html,'text/html'),all=[...doc.body.querySelectorAll('*')],els=sel.indices.map(i=>all[i]).filter(Boolean),top=els.filter(el=>!els.some(o=>o!==el&&o.contains(el)));
    return top.length?{all,top}:null;
  }
  // ⌘D on the canvas duplicates the selected objects in place (shifted), like copy and paste.
  function duplicateObjects(){const o=selectedObjects();if(!o||!editSlide)return false;const id=editSlide.id;void portable(o).then(c=>pasteObjects({...c,slideId:id,assets:[]})).catch(e=>setError(errorText(t,e)));return true;}
  // The copy carries each object's computed look (from the canvas frame) as inline styles on the saved HTML, and its place
  // as an absolute position on the slide: pasted on another slide, without this slide's CSS or containers, it looks the same.
  async function portable({all,top}:{all:Element[];top:Element[]}){
    const frame=editorFrame.current?.contentWindow,id=uid('copy');
    const sourceCss=deck&&editSlide?(masterItem?.startsWith('m:')?deck.masters.find(m=>'m:'+m.id===masterItem)||activeMaster(deck):masterOf(deck,editSlide)).css+'\n'+(deck.layouts.find(l=>l.id===editSlide.layoutId)?.css||'')+'\n'+editSlide.css:'';
    const vars=[...new Set([...sourceCss.matchAll(/var\(\s*(--[\w-]+)/g)].map(m=>m[1]))];
    const reply=await new Promise<any[]|null>(resolve=>{if(!frame){resolve(null);return;}
      const done=(v:any[]|null)=>{clearTimeout(timer);removeEventListener('message',listen);resolve(v);},timer=setTimeout(()=>done(null),5000);
      const listen=(e:MessageEvent)=>{if(e.source===frame&&e.data?.app==='esf-edit'&&e.data.type==='copied'&&e.data.id===id)done(Array.isArray(e.data.objects)?e.data.objects:null);};
      addEventListener('message',listen);frame.postMessage({app:'esf-editor-command',type:'copy',id,vars},'*');});
    if(!reply)throw Error(t('copyUnavailable'));
    const clones=top.map(source=>source.cloneNode(true) as HTMLElement);
    const pairs=top.flatMap((source,i)=>{const a=[source,...source.querySelectorAll('*')],b=[clones[i],...clones[i].querySelectorAll<HTMLElement>('*')];return a.map((x,j)=>[x,b[j]] as [Element,HTMLElement]);});
    const css=sourceCss?motionCss(sourceCss,pairs):'';
    const faces=new CSSStyleSheet(),fontNames=new Map<string,string>(),wantedFonts=new Set<string>();let fontCss='';
    for(const object of reply)for(const value of object.styles||[])if(typeof value==='string'){const el=document.createElement('span');el.setAttribute('style',value);for(const family of el.style.fontFamily.split(','))wantedFonts.add(family.trim().replace(/^["']|["']$/g,'').toLowerCase());}
    try{faces.replaceSync(sourceCss);
      const collect=(rules:CSSRuleList)=>{for(const rule of rules){if(rule instanceof CSSFontFaceRule){const name=rule.style.fontFamily.replace(/^["']|["']$/g,'');const key=name.toLowerCase();if(!wantedFonts.has(key))continue;if(!fontNames.has(key))fontNames.set(key,name+'-'+uid('font'));rule.style.fontFamily='"'+fontNames.get(key)+'"';fontCss+=rule.cssText+'\n';}else if(rule instanceof CSSGroupingRule)collect(rule.cssRules);}};collect(faces.cssRules);
    }catch{}
    const html=top.map((source,i)=>{
      const o=reply?.find(x=>x?.index===all.indexOf(source)),el=clones[i];
      if(!o||!Array.isArray(o.styles)||![o.left,o.top,o.width,o.height].every(Number.isFinite))throw Error(t('copyUnavailable'));
      const list=[el,...el.querySelectorAll<HTMLElement>('*')],styles=o.styles.length===list.length?o.styles:[o.styles[0]];
      styles.forEach((css:unknown,i:number)=>{const x=list[i];if(typeof css!=='string'||!css||!('style' in x))return;const own=x.getAttribute('style')||'';x.setAttribute('style',css+';'+own);const computed=document.createElement('span');computed.setAttribute('style',css);for(const prop of [...x.style])if(x.style.getPropertyValue(prop).includes('var(')&&computed.style.getPropertyValue(prop))x.style.setProperty(prop,computed.style.getPropertyValue(prop),x.style.getPropertyPriority(prop));});
      for(const k of ['translate','position','inset','left','top','right','bottom','margin','height','min-height'])el.style.removeProperty(k);
      el.style.setProperty('position','absolute');el.style.setProperty('left',o.left+'px');el.style.setProperty('top',o.top+'px');el.style.setProperty('margin','0');
      for(const [k,v] of Object.entries(o.vars||{}))if(typeof v==='string'&&!/url\(/i.test(v)&&!el.style.getPropertyValue(k))el.style.setProperty(k,v);
      el.style.setProperty('box-sizing','border-box');el.style.setProperty('width',o.width+'px');el.style.setProperty(o.text?'min-height':'height',o.height+'px');
      for(const x of list)if('style' in x&&x.style.fontFamily)x.style.fontFamily=x.style.fontFamily.split(',').map(f=>{const name=f.trim().replace(/^["']|["']$/g,'');return fontNames.has(name.toLowerCase())?'"'+fontNames.get(name.toLowerCase())+'"':f;}).join(',');
      return el.outerHTML;
    });
    // A slide's script animation goes with its objects when it refers to them (an ID, class or data attribute).
    const own=editSlide&&!editSlide.id.startsWith(masterPrefix)&&!editSlide.id.startsWith(layoutPrefix)?editSlide.script:'';
    const tokens=new Set(pairs.flatMap(([x])=>[x.id,...x.classList,...[...x.attributes].filter(a=>a.name.startsWith('data-')&&!a.name.startsWith('data-esf')).flatMap(a=>[a.name,a.value])]).filter(v=>v&&v.length>1));
    const script=own.trim()&&[...tokens].some(v=>new RegExp('(^|[^\\w-])'+v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^\\w-])').test(own))?own:'';
    return{html,css:fontCss+css,script};
  }
  async function copyObjects(cut=false){
    const o=selectedObjects();if(!o||!deck||!editSlide)return false;const {all,top}=o,{html,css,script}=await portable(o);
    await api.invoke('clipboardWrite',{format:'esf-objects',slideId:editSlide.id,html,css,script,assets:deck.assets.filter(a=>[...html,css,script].some(h=>h.includes('asset:'+a.id)))});
    if(cut){const current=active!==null&&findSlide(store.get(active)!.deck,editSlide.id);if(current&&current.html===editSlide.html)canvasEdit?.onOps(top.map(el=>({type:'delete',index:all.indexOf(el)})),[],false);else notice(t('copyUnavailable'));}
    return true;
  }
  // Pasted objects go on top of the current slide, shifted when they land on the slide they came from, and stay selected.
  function pasteObjects(p:any){
    const targetId=editSlide?.id;if(!deck||!targetId||!Array.isArray(p.html))return;
    mutate(d=>{
      const slide=findSlide(d,targetId);if(!slide)return;
      const replace=importResources(d,Array.isArray(p.assets)?p.assets:[]),prepared=independentObjects(p.html.slice(0,200).map(String),typeof p.css==='string'?p.css:'',replace,typeof p.script==='string'&&p.slideId!==slide.id&&!targetId.startsWith(masterPrefix)&&!targetId.startsWith(layoutPrefix)?p.script:'');
      const doc=new DOMParser().parseFromString(slide.html,'text/html'),root=doc.querySelector('.slide')||doc.body,added:HTMLElement[]=[];
      for(const h of prepared.html){const tpl=doc.createElement('template');tpl.innerHTML=h;const el=tpl.content.firstElementChild as HTMLElement|null;if(!el)continue;
        if(p.slideId===slide.id){const [x=0,y=0]=(el.style.translate||'').split(/\s+/).map(v=>parseFloat(v)||0);el.style.translate=`${x+24}px ${y+24}px`;}
        root.append(el);added.push(el);
        const shadow=/^(IMG|SVG|VIDEO|CANVAS)$/i.test(el.tagName)&&el.style.position==='absolute'&&/drop-shadow/.test(el.style.filter)?el.style.filter:'';if(shadow){el.style.removeProperty('filter');wrapShadow(doc,el,shadow);}}
      const all=added.flatMap(el=>[el,...el.querySelectorAll<HTMLElement>('*')]),ids=new Map<string,string>();
      for(const el of all)if(el.dataset.linkId){const old=el.dataset.linkId;if(!ids.has(old))ids.set(old,uid('link'));el.dataset.linkId=ids.get(old)!;}
      for(const el of all)if(el.dataset.linkQr&&ids.has(el.dataset.linkQr))el.dataset.linkQr=ids.get(el.dataset.linkQr);
      if(!added.length)return;
      const css=prepared.css,previous=targetId.startsWith(masterPrefix)?d.masters.find(m=>masterPrefix+m.id===targetId)?.css||'':targetId.startsWith(layoutPrefix)?d.layouts.find(l=>layoutPrefix+l.id===targetId)?.css||'':slide.css;
      putSlide(d,{...slide,html:doc.body.innerHTML,css:previous+(css&&!previous.includes(css)?'\n'+css:''),script:joinBehavior(slide.script,prepared.script),staticHtml:''});
      canvasSel.current={slide:slide.id,indices:added.map(el=>editIndex(doc,el)),editing:false};
    });
    editorFrame.current?.focus();
  }
  async function paste(payload?:any){
    if(!deck||!slide)return;const p=payload||await api.invoke('clipboardRead');if(!p)return;
    if(p.format==='esf-objects'){pasteObjects(p);return;}if(masterItem){mutate(d=>{const items=pasteMasterItems(d,p);if(items[0])setMasterView(items[0]);});return;}
    mutate(d=>pasteSlides(d,p,slide.id).map(s=>s.id));
  }
  // The slide list toolbar pastes slides, bases or layouts, never canvas objects.
  async function pasteItems(){const p=await api.invoke('clipboardRead');if(p&&p.format!=='esf-objects')await paste(p);}
  function move(direction:number){if(!tab||!slide)return;mutate(d=>{const index=d.slides.findIndex(s=>s.id===slide.id),to=index+direction;if(to<0||to>=d.slides.length)return;const [s]=d.slides.splice(index,1);d.slides.splice(to,0,s);});}
  function selectSlide(id:string,e?:React.MouseEvent){if(!tab||!deck||active===null)return;let selected=[id];if(e?.metaKey||e?.ctrlKey)selected=tab.selected.includes(id)?tab.selected.filter(x=>x!==id):[id,...tab.selected];else if(e?.shiftKey){const a=deck.slides.findIndex(s=>s.id===tab.selected[0]),b=deck.slides.findIndex(s=>s.id===id);selected=deck.slides.slice(Math.min(a,b),Math.max(a,b)+1).map(s=>s.id);}updateTab(active,x=>({...x,selected:selected.length?selected:[id]}));}
  async function importAssets(assets?:Asset[]){
    const target0=editSlide;if(!deck||!target0||active===null)return;
    assets=assets||await pickAssets();if(!assets?.length)return;
    mutate(d=>{
      for(const a of assets!){
        if(!d.assets.some(x=>x.id===a.id))d.assets.push(a);
        if(a.mime.startsWith('font/')){const family=a.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9 _-]/g,'');const target=findSlide(d,target0.id);if(!target)continue;const css=target0.id.startsWith(masterPrefix)?d.masters.find(m=>masterPrefix+m.id===target0.id)!.css:target0.id.startsWith(layoutPrefix)?d.layouts.find(l=>layoutPrefix+l.id===target0.id)!.css||'':target.css;putSlide(d,{...target,css:css+`\n@font-face{font-family:"${family}";src:url("asset:${a.id}")}body{font-family:"${family}",Arial,sans-serif}`});continue;}
        // Without a layout slot the image goes free on the current slide, centered, ready to be dragged.
        const target=findSlide(d,target0.id)!,doc=new DOMParser().parseFromString(target.html,'text/html'),slot=doc.querySelector<HTMLElement>('[data-image-slot]:not(:has(img))');
        const img=doc.createElement('img');img.src='asset:'+a.id;img.alt=a.name;
        if(slot){slot.replaceChildren(img);slot.style.border='0';}else{img.setAttribute('data-slide-owned','');img.setAttribute('style','position:absolute;inset:0;margin:auto;max-width:60%;max-height:60%');(doc.querySelector('.slide')||doc.body).append(img);}
        canvasSel.current={slide:target0.id,indices:[editIndex(doc,img)],editing:false};putSlide(d,{...target,html:doc.body.innerHTML});
      }
    });
  }
  function addManual(kind:ManualKind,payload='',asset?:Asset){
    const target=editSlide;if(!deck||!target)return;
    const result=insertManual(target,kind,payload);
    canvasSel.current={slide:target.id,indices:[result.index],editing:kind==='text'};
    setManualSelection({slide:target.id,index:result.index});
    mutate(d=>{if(asset&&!d.assets.some(a=>a.id===asset.id))d.assets.push(asset);putSlide(d,result.slide);});
  }
  async function insertImage(){if(!deck||!slide)return;const asset=await api.invoke('clipboardImage') as Asset|null;if(asset)addManual('image','asset:'+asset.id,asset);else await importAssets();}
  async function insertLink(){const text=String(await api.invoke('clipboardText')||'').trim();addManual('link',safeUrl(text)||'https://example.com/');}
  const selectedManual=useMemo(()=>editSlide&&manualSelection?.slide===editSlide.id?editableAt(editSlide,manualSelection.index,manualSelection.details):null,[editSlide?.id,editSlide?.html,manualSelection?.slide,manualSelection?.index,manualSelection?.details?.kind]);
  const changeShadow=(on:boolean)=>{if(!editSlide||!selectedManual)return;const id=editSlide.id,index=selectedManual.index;mutate(d=>{const s=findSlide(d,id);if(!s)return;const r=setImageShadow(s,index,on);putSlide(d,r.slide);canvasSel.current={slide:id,indices:[r.index],editing:false};});};
  const changeManual=(fn:(s:Slide,index:number)=>Slide)=>{if(!editSlide||!selectedManual)return;const next=fn(editSlide,selectedManual.index);if(next.html!==editSlide.html)mutate(d=>putSlide(d,next));};
  const frameCommand=(message:object)=>editorFrame.current?.contentWindow?.postMessage({app:'esf-editor-command',...message},'*');
  const changeObjectStyle=(style:ObjectStyle)=>frameCommand({type:'style',style});
  const toCanvas=()=>setSelMode('canvas');
  const toSlides=()=>{if(selModeRef.current==='slides')return;setSelMode('slides');if(canvasSel.current.indices.length){frameCommand({type:'deselect'});canvasSel.current={...canvasSel.current,indices:[],editing:false};setManualSelection(null);}};
  const formatText=(cmd:string,value?:string)=>frameCommand({type:'format',command:cmd,value,range:canvasRange.current});
  // A right click that stops at the canvas iframe element (instead of reaching its document) is passed to the frame.
  useEffect(()=>{const down=(e:PointerEvent)=>{const f=editorFrame.current;if(e.target!==f||!f)return;toCanvas();if(e.button!==2)return;e.preventDefault();const r=f.getBoundingClientRect();frameCommand({type:'contextAt',x:e.clientX-r.left,y:e.clientY-r.top});},menu=(e:MouseEvent)=>{if(e.target===editorFrame.current)e.preventDefault();};
    document.addEventListener('pointerdown',down,true);document.addEventListener('contextmenu',menu,true);return()=>{document.removeEventListener('pointerdown',down,true);document.removeEventListener('contextmenu',menu,true);};},[]);
  // A press anywhere else in the window ends a text edit the format bar kept open (see editRuntime).
  useEffect(()=>{const down=(e:PointerEvent)=>{if(!(e as any).edukorsRelayed&&!(e.target as Element)?.closest?.('#context-toolbar,#edit-actions,#insert-actions'))frameCommand({type:'release'});};document.addEventListener('pointerdown',down,true);return()=>document.removeEventListener('pointerdown',down,true);},[]);
  const manualEl=selectedManual?.element,manualKind=selectedManual?.kind;
  const objectStyle=manualSelection?.slide===editSlide?.id&&manualSelection?.details?manualSelection.details.style:manualEl?.style;
  const controlColor=(value:string,fallback:string)=>{if(/^#[\da-f]{6}$/i.test(value))return value;const rgb=value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);return rgb?'#'+rgb.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):fallback;};
  const linkStyle=(key:LinkStyle,value:string)=>changeManual((s,i)=>setLinkStyle(s,i,key,value));
  const setLink=(value:string)=>{const url=safeUrl(value);if(!url){notice(t('invalidUrl'));return;}changeManual((s,i)=>setLinkUrl(s,i,url));};
  async function dropFiles(e:React.DragEvent){
    e.preventDefault();if(!deck)return;const assets:Asset[]=[];
    for(const file of Array.from(e.dataTransfer.files)){
      if(!/^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/.test(file.type))continue;
      if(file.size>50_000_000)throw Error('Resource exceeds 50 MB.');
      const buffer=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
      const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});
      assets.push({id:'asset-'+hash,name:file.name,mime:file.type,data});
    }await importAssets(assets);
  }
  // ---------- New (gallery), templates, export, present ----------
  const refreshTemplates=async()=>setTemplates(await api.invoke('templates'));
  useEffect(()=>{if(gallery)void refreshTemplates().catch(()=>{});},[gallery]);
  async function create(template:string){
    if(loading)return;setSelectedTemplate(template);setLoading(true);
    try{
      const deck=template==='blank'?newDeck(t('untitled'),defaultNames[lang]):template.startsWith('custom:')?{...await api.invoke('templateDeck',template.slice(7)) as Deck,title:t('untitled')}:null;if(!deck)throw Error('Unknown template.');
      const doc=common.EdukorsDocuments.add({});common.EdukorsAppDocument.adopt(doc,{deck});common.EdukorsDocuments.activate(doc.id);setGallery(false);
    }finally{setLoading(false);}
  }
  // Exporting a presentation without a file saves it first (the export goes next to the file, with its name).
  const saveFirst=(doc:CommonDoc):Promise<boolean>=>common.EdukorsFiles.saveFirst(doc);
  // Export: Common's export screen (formats, progress, errors; the file goes next to the presentation, with its name).
  // HTML has the player and fonts; PDF, a page per slide; PPTX, editable objects over each slide's picture background.
  async function exportDeck(){
    const doc=active!==null?docOf(active):undefined;if(!doc||!deck)return;
    if(!await saveFirst(doc))return;
    const formats=['html','pdf','pptx'].map(id=>({id,label:id.toUpperCase()+(id==='html'?' · '+t('recommended'):''),description:t((id+'Desc') as any),extension:'.'+id}));
    let output:{path:string;fonts?:{missing?:string[]}}|null=null;
    const result=await common.EdukorsFileDialogs.exportAs({t:commonT,name:doc.name,folder:doc.folder,formats,format:lastFormat.current,commit:async({name,folder,format,replace,progress}:{name:string;folder:string;format:string;replace?:boolean;progress:(n:number)=>void})=>{
      progress(10);const current=store.get(doc.id)!.deck;
      if(format==='html'&&current.slides.some(s=>s.poll)&&!pollServer)return{error:t('pollNoServerExport')};
      try{
        const r=await api.invoke('export',{...current,title:doc.name||current.title},format,{folder,name,direct:true,replace:!!replace,protect:[doc.path,doc.origin].filter(Boolean)});
        if(r?.exists)return{exists:true};if(r?.noPollServer)return{error:t('pollNoServerExport')};
        progress(100);output=r;lastFormat.current=format;return{};
      }catch(e:any){return{error:errorText(t,e)};}
    }});
    if(!result||!output)return;
    const out=output as {path:string;fonts?:{missing?:string[]}};(doc as any).lastExport=out.path;
    common.EdukorsFileDialogs.toast({t:commonT,message:out.fonts?.missing?.length?t('fontsMissing')+' '+out.fonts.missing.join(', '):commonT('exportedToast').replace('{name}',String(out.path).split(/[\\/]/).at(-1)),action:{label:commonT('reveal'),onClick:()=>void api.invoke('revealOutput',out.path)}});
  }
  const present=()=>{if(deck&&slide)void run(()=>api.invoke('present',deck,Math.max(0,deck.slides.indexOf(slide)),lang));};
  const canvasEditing=()=>canvasSel.current.editing&&canvasSel.current.slide===editSlide?.id;
  const deleteSelection=()=>{if(canvasEditing())return;if(selModeRef.current==='slides'){if(masterItem)deleteMasterItem();else deleteSlides();return;}const sel=canvasSel.current;if(sel.slide===editSlide?.id&&sel.indices.length)canvasEdit?.onOps(sel.indices.map(index=>({type:'delete',index})),[],false);};
  function shapeMenu(box:DOMRect){common.EdukorsShapes.pick({x:box.left,y:box.bottom+4,t:commonT,onPick:(type:string)=>addManual('shape',type),restoreFocus:shellButton('insertShape')});}
  command=(name:string)=>{
    if(name==='new'){setSearch('');setGallery(true);return;}
    if(name.startsWith('insertShapeMenu:')){if(tab)shapeMenu(JSON.parse(name.slice(16)));return;}
    if(!tab||!deck||!slide||active===null)return;
    const typing=!!(document.activeElement as Element|null)?.closest('input,textarea,select,[contenteditable]');
    if(name==='undo'||name==='redo'){if(canvasEditing()){void api.invoke('nativeEdit',name);return;}if(typing){document.execCommand(name);return;}store.undo(active,name==='redo');return;}
    // ⌘A: text fields and text being edited keep the native select all; otherwise the slide list or the canvas objects.
    if(name==='selectAll'){if(typing||canvasEditing()){void api.invoke('nativeEdit','selectAll');return;}if(selModeRef.current==='slides'&&!masterItem){updateTab(active,x=>({...x,selected:[slide.id,...deck.slides.map(s=>s.id).filter(id=>id!==slide.id)]}));return;}frameCommand({type:'selectAll'});return;}
    // Copy, cut and paste follow the selection mode: slides (or the master item) from the list, objects from the canvas.
    if(name==='copy'||name==='cut'||name==='paste'){
      if(typing||canvasEditing()){void api.invoke('nativeEdit',name);return;}
      if(name==='paste'){void run(async()=>{const p=await api.invoke('clipboardRead');if(p)await paste(p);else if(selModeRef.current==='canvas'){const asset=await api.invoke('clipboardImage') as Asset|null;if(asset)addManual('image','asset:'+asset.id,asset);}});return;}
      if(selModeRef.current==='slides'){void run(()=>copy(name==='cut'));return;}
      void run(async()=>{await copyObjects(name==='cut');});return;
    }
    if(name==='delete'){deleteSelection();return;}
    if(name==='duplicate'){if(canvasEditing())return;if(masterItem){if(selModeRef.current==='slides')duplicateMasterItem();else duplicateObjects();return;}if(selModeRef.current==='canvas'&&duplicateObjects())return;duplicate();return;}
    if(name==='insertText'){addManual('text');return;}if(name==='insertImage'){void run(insertImage);return;}if(name==='insertLink'){void run(insertLink);return;}
    if(name==='insertPoll'){if(!masterItem)setPollTarget({doc:active,slide:slide.id,poll:slide.poll});return;}
  };
  // Shortcuts of the old menu bar, now handled here (Common's macOS menu has only the app menu, Edit and Window).
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const mod=common.EdukorsPlatform?.isModifier?common.EdukorsPlatform.isModifier(e):e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
      if(document.querySelector('dialog[open]'))return;
      const field=(e.target as Element)?.closest?.(typingField);
      if(mod&&!e.altKey&&k==='n'){e.preventDefault();if(e.shiftKey){if(tab&&!masterItem)setLayoutPick('insert');}else command('new');return;}
      if(mod&&!e.altKey&&!e.shiftKey&&k==='o'){e.preventDefault();shellButton('open')?.click();return;}
      if(mod&&e.altKey&&(k==='0'||e.code==='Digit0')){e.preventDefault();shellButton('sidebar')?.click();return;}
      if(mod&&e.shiftKey&&!e.altKey&&k==='a'){e.preventDefault();shellButton('assistant')?.click();return;}
      if(mod&&!e.altKey&&!e.shiftKey&&/^[1-9]$/.test(e.key)){const doc=docs()[Number(e.key)-1];if(doc){e.preventDefault();common.EdukorsDocuments.activate(doc.id);}return;}
      if(!tab||!deck||!slide||layoutPick||templateName!==null||gallery||pollTarget)return;
      if(mod&&!e.altKey&&k==='enter'){e.preventDefault();present();return;}
      if(mod&&!e.altKey&&!e.shiftKey&&k==='e'){e.preventDefault();void run(exportDeck);return;}
      if(mod&&!e.altKey&&!e.shiftKey&&(k==='='||k==='+'||k==='-'||k==='0')){e.preventDefault();setZoom(z=>k==='0'?100:k==='-'?[...zoomSteps].reverse().find(v=>v<z)??z:zoomSteps.find(v=>v>z)??z);return;}
      if(field)return;
      if(mod&&!e.altKey&&k==='z'){e.preventDefault();command(e.shiftKey?'redo':'undo');return;}
      if(mod&&!e.altKey&&!e.shiftKey&&['c','x','v','d','a'].includes(k)){e.preventDefault();command(({c:'copy',x:'cut',v:'paste',d:'duplicate',a:'selectAll'} as Record<string,string>)[k]);return;}
      // The crop box confirms (Enter) or cancels (Esc) even when the keyboard is not in the canvas frame.
      if(cropOn&&(e.key==='Enter'||e.key==='Escape')){e.preventDefault();frameCommand({type:e.key==='Enter'?'crop':'cropCancel'});return;}
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(!e.repeat||selModeRef.current==='canvas')deleteSelection();return;}
      // With canvas objects selected, arrows move them and ⌘+arrows resize them, even with the keyboard outside the frame.
      if(e.key.startsWith('Arrow')&&selModeRef.current==='canvas'){const sel=canvasSel.current;if(sel.slide===editSlide?.id&&!sel.editing&&sel.indices.length){e.preventDefault();frameCommand({type:'arrow',key:e.key,shift:e.shiftKey,meta:e.metaKey||e.ctrlKey});return;}}
      if((e.target as Element)?.closest?.('.toolbar,.document-tabs,#assistant-panel-side'))return;
      if(masterItem&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=visibleMasterItems,i=items.indexOf(masterItem),to=e.key==='Home'?0:e.key==='End'?items.length-1:i+(e.key==='ArrowDown'?1:-1);if(items[to])setMasterView(items[to]);return;}
      if((e.key==='ArrowDown'||e.key==='ArrowUp')&&mod){e.preventDefault();move(e.key==='ArrowDown'?1:-1);return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const i=deck.slides.indexOf(slide)+(e.key==='ArrowDown'?1:-1);if(deck.slides[i])selectSlide(deck.slides[i].id);}
      if(e.key==='Home'||e.key==='End'){e.preventDefault();selectSlide(deck.slides[e.key==='Home'?0:deck.slides.length-1].id);}
    },up=(e:KeyboardEvent)=>{if(e.key.startsWith('Arrow')&&selModeRef.current==='canvas')frameCommand({type:'arrowUp'});};
    document.addEventListener('keydown',key);document.addEventListener('keyup',up);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('keyup',up);};
  });
  const blankDeck=useMemo(()=>newDeck(t('untitled'),defaultNames[lang]),[lang]);
  // A press inside the canvas never reaches this page: Common closes its open menus and pickers as on a click outside.
  const relayPress=()=>common.EdukorsMenus.pressIn(editorFrame.current);
  const canvasEdit:CanvasEdit|undefined=editSlide&&active!==null?(target=>({
    select:()=>canvasSel.current.slide===target.id?{...canvasSel.current,range:canvasSel.current.editing?canvasRange.current:null}:{indices:[],editing:false},
    onCrop:setCropOn,
    // A press inside the canvas never reaches this page: it is relayed as a pointerdown on the frame, so the open menus
    // and pickers (context menu, shapes, format bar, assistant) close as on any click outside them.
    onPress:()=>{toCanvas();relayPress();},
    // Right click: Common's object menu (as in its canvas): clipboard, duplicate, delete, stacking order; with several
    // objects, align and distribute; a text can be edited; on an empty spot, paste and the insert commands.
    onContext:(x,y,text,count)=>{toCanvas();relayPress();const r=editorFrame.current?.getBoundingClientRect();if(!r)return;
      const mac=common.EdukorsPlatform?.mac,key=(k:string,shift=false)=>mac?`${shift?'⇧':''}⌘${k}`:`Ctrl+${shift?'Shift+':''}${k}`;
      const run=(name:string,keys?:string,disabled=false)=>({label:commonT(name),shortcut:keys,disabled,action:()=>command(name)});
      const frame=(name:string,c:object,disabled=false)=>({label:commonT(name),disabled,action:()=>frameCommand(c)});
      const sep={separator:true},px=r.left+x,py=r.top+y;
      const items=count?[run('cut',key('X')),run('copy',key('C')),run('paste',key('V')),run('duplicate',key('D')),run('delete',mac?'⌫':'Del'),sep,
          frame('bringToFront',{type:'order',value:'front'}),frame('sendToBack',{type:'order',value:'back'}),
          ...count>1?[sep,...(['top','middle','bottom'] as const).map(v=>frame('align'+v[0].toUpperCase()+v.slice(1),{type:'arrange',value:v})),sep,
            ...(['left','center','right'] as const).map(v=>frame('align'+v[0].toUpperCase()+v.slice(1),{type:'arrange',value:v})),sep,
            frame('distributeH',{type:'arrange',value:'distributeH'},count<3),frame('distributeV',{type:'arrange',value:'distributeV'},count<3)]:[],
          ...count===1&&text?[sep,{label:commonT('editText'),shortcut:mac?'↩':'Enter',action:()=>frameCommand({type:'edit'})}]:[]]
        :[run('paste',key('V')),sep,run('insertText'),{label:commonT('insertShape'),action:()=>common.EdukorsShapes.pick({x:px,y:py,t:commonT,onPick:(type:string)=>addManual('shape',type)})},run('insertImage')];
      common.EdukorsContextMenu.open({x:px,y:py,label:commonT('objectActions'),items,restoreFocus:editorFrame.current});},
    onRange:(start,end)=>{canvasRange.current=end>start?{start,end}:null;},
    onState:(indices,editing,details)=>{if(indices.length)setSelMode('canvas');if(canvasSel.current.slide!==target.id||canvasSel.current.indices[0]!==indices[0])canvasRange.current=null;canvasSel.current={slide:target.id,indices,editing};setManualSelection(indices.length===1?{slide:target.id,index:indices[0],details}:null);setImageSel(!!details?.crop);},
    // All operations of one gesture (a text commit followed by a drag) become a single undo step.
    onOps:(ops,indices,editing,range)=>{canvasSel.current={slide:target.id,indices,editing};if(range!==undefined)canvasRange.current=range&&range.end>range.start?range:null;setManualSelection(previous=>indices.length===1?{slide:target.id,index:indices[0],details:previous?.slide===target.id&&previous.index===indices[0]?previous.details:undefined}:null);
      mutate(d=>{const current=findSlide(d,target.id);if(!current)return;const edited=applyEdits(current,ops);if(edited.html===current.html&&edited.staticHtml===current.staticHtml&&edited.title===current.title)return;putSlide(d,edited);});}
  }))(editSlide):undefined;

  // ---------- Format bar: Common's shared controls (EdukorsFormat), applied through the canvas frame ----------
  // The groups follow the selected object: text, link, shape, image or box. Buttons keep the keyboard in the frame, so
  // a text being edited keeps its selected characters.
  const details=manualSelection?.slide===editSlide?.id?manualSelection?.details:undefined;
  useEffect(()=>{
    const bar=document.getElementById('context-toolbar');if(!bar)return;
    bar.onpointerdown=e=>{if((e.target as Element).closest('.pick-button,.color-chip,input'))frameCommand({type:'hold'});};
    if(!tab||!editSlide||(!details&&!imageSel)){bar.replaceChildren();return;}
    const kind=details?.kind||(imageSel?'image':'box'),st=details?.style||{},px=(v?:string)=>parseFloat(v||'')||0;
    const hex=(v?:string,fallback='#172033')=>controlColor(v||'',fallback);
    const transparent=(v?:string)=>!v||/(?:transparent|rgba\([^)]*,\s*0\))$/.test(v);
    const look=kind==='shape'&&manualEl?shapeLook(manualEl):null;
    const opacity=Math.round((parseFloat(st.opacity||'1')||1)*100);
    const state:any={
      bold:parseInt(st.fontWeight||'400')>=600,italic:st.fontStyle==='italic',underline:/underline/.test(st.textDecorationLine||''),strike:/line-through/.test(st.textDecorationLine||''),
      script:st.verticalAlign==='sub'?'sub':st.verticalAlign==='super'?'super':'none',fontSize:px(st.fontSize)||48,fontFamily:(st.fontFamily||'Arial').split(',')[0].replace(/["']/g,''),color:hex(st.color),
      align:({start:'left',left:'left',center:'center',right:'right',end:'right',justify:'justify'} as Record<string,string>)[st.textAlign||'']||'left',valign:({center:'middle',end:'bottom'} as Record<string,string>)[st.alignContent||'']||'top',
      lineWidth:look?look.width:px(st.borderWidth),lineStyle:['dashed','dotted'].includes(st.borderStyle||'')?st.borderStyle:'solid',lineColor:look?hex(look.stroke,'#2f4fd0'):hex(st.borderColor),
      fill:look?(look.fill==='none'?'transparent':hex(look.fill,'#4a6cf7')):transparent(st.backgroundColor)?'transparent':hex(st.backgroundColor,'#ffffff'),
      shadow:look?look.shadow:!!st.boxShadow&&st.boxShadow!=='none'||/drop-shadow/.test(st.filter||''),opacity,imageOpacity:opacity,crop:cropOn,keepRatio:kind==='image',link:manualEl?.dataset.url||''
    };
    const groups=kind==='text'?['text','align','valign','shape','arrange']:kind==='link'?['text','align','link','arrange']:kind==='image'?['image','arrange']:['shape','arrange'];
    const border=(property:string,value:any)=>{
      const none=!state.lineWidth||st.borderStyle==='none';
      if(property==='lineWidth')changeObjectStyle({'border-width':value+'px','border-style':value?state.lineStyle:'none'});
      if(property==='lineStyle')changeObjectStyle({'border-style':value,...none?{'border-width':'2px'}:{}});
      if(property==='lineColor')changeObjectStyle({'border-color':value,...none?{'border-width':'2px','border-style':'solid'}:{}});
    };
    const onChange=(property:string,value:any)=>{
      if(property==='bringToFront'||property==='sendToBack'){frameCommand({type:'order',value:property==='bringToFront'?'front':'back'});return;}
      if(property==='align'){if(value==='justify')formatText('justifyFull');else frameCommand({type:'align',axis:'x',value:({left:'start',center:'center',right:'end'} as Record<string,string>)[value]});return;}
      if(property==='valign'){frameCommand({type:'align',axis:'y',value:({top:'start',middle:'center',bottom:'end'} as Record<string,string>)[value]});return;}
      if(kind==='link'){
        const link:Record<string,()=>void>={bold:()=>linkStyle('fontWeight',value?'700':'400'),italic:()=>linkStyle('fontStyle',value?'italic':'normal'),underline:()=>linkStyle('textDecoration',value?'underline':'none'),
          fontSize:()=>linkStyle('fontSize',value+'px'),fontFamily:()=>linkStyle('fontFamily',value),color:()=>linkStyle('color',value),link:()=>{if(value)setLink(value);},createQr:()=>changeManual((s,i)=>setLinkQr(s,i,true))};
        link[property]?.();return;
      }
      const text:Record<string,()=>void>={bold:()=>formatText('bold'),italic:()=>formatText('italic'),underline:()=>formatText('underline'),strike:()=>formatText('strikeThrough'),
        script:()=>formatText(value==='sub'||value==='none'&&st.verticalAlign==='sub'?'subscript':'superscript'),fontSize:()=>formatText('fontSize',value+'px'),fontFamily:()=>formatText('fontFamily',value),color:()=>formatText('color',value)};
      if(text[property]){text[property]();return;}
      if(property==='opacity'||property==='imageOpacity'){changeObjectStyle({opacity:String(Math.max(0,Math.min(100,Number(value)||0))/100)});return;}
      if(kind==='shape'){
        if(property==='lineWidth')changeManual((s,i)=>setShape(s,i,{width:Number(value)}));
        if(property==='lineColor')changeManual((s,i)=>setShape(s,i,{stroke:value,...state.lineWidth?{}:{width:2}}));
        if(property==='fill')changeManual((s,i)=>setShape(s,i,{fill:value==='transparent'?'none':value}));
        if(property==='shadow')changeManual((s,i)=>setShape(s,i,{shadow:!!value}));
        return;
      }
      if(kind==='image'){
        if(property==='crop'){frameCommand({type:'crop'});return;}
        if(property==='shadow'){changeShadow(!!value);return;}
        if(property==='replaceImage'){void run(replaceImage);return;}
      }
      if(property.startsWith('line')){border(property,value);return;}
      if(property==='fill')changeObjectStyle({'background-color':value});
      if(property==='shadow')changeObjectStyle({'box-shadow':value?'0 12px 30px #17203355':'none'});
    };
    common.EdukorsFormat.render(bar,{groups,state,t:commonT,onChange,options:{fontFamilies:[...new Set([state.fontFamily,...(details?.fonts||[]),...common.EdukorsFormat.defaults.fontFamilies])]}});
    // Shapes also change their type, with Common's shape picker.
    if(kind==='shape'&&look){
      const group=document.createElement('div');group.className='format-group';group.dataset.group='shapeType';group.setAttribute('role','group');
      const button=document.createElement('button');button.type='button';button.className='format-button icon';button.dataset.control='shapeType';button.setAttribute('aria-label',commonT('shapeType'));
      button.innerHTML=common.EdukorsShapes.icon(look.type,18)+`<span class="tooltip" aria-hidden="true">${commonT('shapeType')}</span>`;
      button.addEventListener('mousedown',e=>e.preventDefault());
      button.addEventListener('click',()=>{const r=button.getBoundingClientRect();common.EdukorsShapes.pick({x:r.left,y:r.bottom+4,t:commonT,restoreFocus:button,onPick:(type:string)=>changeManual((s,i)=>setShape(s,i,{type:type as any}))});});
      const sep=document.createElement('span');sep.className='separator';sep.setAttribute('aria-hidden','true');
      group.append(button);bar.prepend(group,sep);
    }
  },[tab?.version,active,editSlide?.id,details,manualSelection?.index,imageSel,cropOn,lang,!!tab]);
  // Replaces the selected image with another one (a file, or the image on the clipboard first).
  async function replaceImage(){
    if(!editSlide||!selectedManual)return;const index=selectedManual.index,id=editSlide.id;
    const asset=(await api.invoke('clipboardImage') as Asset|null)||(await pickAssets(['image']))[0];if(!asset)return;
    mutate(d=>{const target=findSlide(d,id);if(!target)return;if(!d.assets.some(a=>a.id===asset.id))d.assets.push(asset);
      const doc=new DOMParser().parseFromString(target.html,'text/html'),el=doc.body.querySelectorAll('*')[index];
      const img=el?.matches('img')?el as HTMLImageElement:el?.querySelector('img');if(!img)return;img.setAttribute('src','asset:'+asset.id);img.setAttribute('alt',asset.name);putSlide(d,{...target,html:doc.body.innerHTML});});
  }

  // ---------- Views ----------
  const railTools=tab&&deck&&slide&&(()=>{const bases=masterTab==='bases',list=masterItem?visibleMasterItems:deck.slides.map(s=>s.id),at=list.indexOf(masterItem||slide.id);
    const last=masterItem?(bases?deck.masters.length<2:deck.layouts.length<2):deck.slides.length===tab.selected.length;
    return <div className="rail-tools" role="toolbar" aria-label={masterItem?t(bases?'basesCaption':'layoutsCaption'):t('slides')}>
      <ToolButton icon="slides-newSlide" label={t(masterItem?bases?'addMaster':'addLayout':'newSlide')} keys={masterItem?undefined:'⇧⌘N'} aria-haspopup={masterItem?undefined:'dialog'} onClick={masterItem?bases?addMasterItem:addLayoutItem:()=>setLayoutPick('insert')}/>
      <ToolButton icon="slides-arrowUp" label={t('up')} disabled={at<=0} onClick={()=>masterItem?moveMasterItem(-1):move(-1)}/><ToolButton icon="slides-arrowDown" label={t('down')} disabled={at<0||at>=list.length-1} onClick={()=>masterItem?moveMasterItem(1):move(1)}/>
      <ToolButton icon="slides-duplicate" label={t('duplicate')} keys="⌘D" onClick={masterItem?duplicateMasterItem:duplicate}/>
      <ToolButton icon="graph-Copy" label={t('copy')} keys="⌘C" onClick={()=>void run(()=>copy())}/><ToolButton icon="graph-Cut" label={t('cut')} keys="⌘X" disabled={last} onClick={()=>void run(()=>copy(true))}/><ToolButton icon="graph-Paste" label={t('paste')} keys="⌘V" onClick={()=>void run(pasteItems)}/>
      <ToolButton icon="graph-Trash" label={masterItem?t(bases?'deleteMaster':'deleteLayout'):t('remove')} keys="⌫" className="tool-delete" disabled={last} onClick={masterItem?deleteMasterItem:deleteSlides}/>
    </div>;})();
  const rail=tab&&deck&&slide&&(masterItem?<div className="slide-rail master-rail" onPointerDown={toSlides} onFocus={toSlides} aria-label={t('editMaster')}>{railTools}<div className="rail-caption"><span>{t('editMaster')}</span><ToolButton icon="graph-Close" label={t('closeMaster')} onClick={toggleMaster}/></div>
      <div className="master-tabs" role="tablist" aria-label={t('editMaster')}>{(['bases','layouts'] as const).map(value=><button key={value} id={'master-tab-'+value} type="button" role="tab" aria-selected={masterTab===value} aria-controls="master-items" tabIndex={masterTab===value?0:-1} onClick={()=>selectMasterTab(value)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const next=e.key==='Home'?'bases':e.key==='End'?'layouts':value==='bases'?'layouts':'bases';selectMasterTab(next);document.getElementById('master-tab-'+next)?.focus();}}}>{t(value==='bases'?'basesCaption':'layoutsCaption')}</button>)}</div>
      <div className="slide-list" id="master-items" role="tabpanel" aria-labelledby={'master-tab-'+masterTab} ref={railRef}>{visibleMasterItems.map(item=>{const label=itemName(deck,item),isMaster=item.startsWith('m:'),isActive=item==='m:'+deck.activeMaster;return <div key={item} className={'slide-item '+(isMaster?'master-item':'layout-item')+(item===masterItem?' selected':'')+(isActive?' active-master':'')}><button className="master-preview" onClick={()=>setMasterView(item)} onDoubleClick={()=>setRenaming(item)} aria-label={label+(isActive?` (${t('activeMasterBadge')})`:'')} title={label}><LazyPreview deck={masterDeck(deck,item)} slide={masterSlide(deck,item)}/></button>
        <div className="master-item-caption">{renaming===item?<input className="item-name" autoFocus defaultValue={label} maxLength={200} aria-label={t('renameItem')} onBlur={e=>renameItem(item,e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.stopPropagation();e.currentTarget.value=label;e.currentTarget.blur();}}}/>:<span className="item-name" title={label} onDoubleClick={()=>setRenaming(item)}>{label}</span>}{isMaster&&<button type="button" className="master-activate" aria-label={`${t('activateMaster')}: ${label}`} title={`${t('activateMaster')}: ${label}`} aria-pressed={isActive} onClick={()=>activateMaster(item.slice(2))}><span className="slides-contents" dangerouslySetInnerHTML={{__html:commonIcon('graph-Check',16)}}/></button>}</div></div>;})}</div></div>
    :<div className={'slide-rail'+(selMode==='canvas'?' inactive':'')} aria-label={t('slidePanel')} onPointerDown={toSlides} onFocus={toSlides}>{railTools}<div className="rail-caption"><span>{t('slides')}</span><span>{deck.slides.length}</span></div><div className="slide-list" ref={railRef}>{deck.slides.map((s,index)=><div key={s.id} data-id={s.id} draggable onDragStart={e=>e.dataTransfer.setData('text/esf-slide',s.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/esf-slide');if(!id||id===s.id)return;mutate(d=>{const from=d.slides.findIndex(x=>x.id===id);if(from<0)return;const [moved]=d.slides.splice(from,1);d.slides.splice(d.slides.findIndex(x=>x.id===s.id)+(from<index?1:0),0,moved);});}} className={'slide-item '+(tab.selected.includes(s.id)?'selected':'')}><span className="slide-number">{index+1}</span><button aria-label={`${t('slide')} ${index+1}: ${s.title}`} aria-current={s.id===slide.id?'true':undefined} onClick={e=>selectSlide(s.id,e)}><LazyPreview deck={deck} slide={s}/></button></div>)}</div></div>);
  const workbench=tab&&deck&&slide&&<div className="esf-workbench" onDragOver={e=>e.preventDefault()} onDrop={e=>void run(()=>dropFiles(e))}>
    {deck.importReport&&<ImportNotice deck={deck} t={t} onDismiss={()=>mutate(d=>{delete d.importReport;})}/>}
    <div className="canvas-scroll"><div className="slide-canvas" style={{width:`calc(min(100cqw, 100cqh * 16 / 9) * ${zoom/100})`}}><Preview deck={canvasDeck!} slide={editSlide!} edit={canvasEdit} frameRef={editorFrame}/></div></div>
    {!masterItem&&<div className="notes-bar"><label><textarea aria-label={t('notes')} rows={2} value={slide.notes} placeholder={t('notes')} onChange={e=>{const id=slide.id;mutate(d=>{d.slides.find(s=>s.id===id)!.notes=e.target.value;},undefined,promptStep.current==='notes:'+id+':'+tab.version);promptStep.current='notes:'+id+':'+store.get(active!)!.version;}}/></label></div>}
  </div>;
  const placeholder=document.getElementById('document-placeholder');
  return <>
    {tab&&placeholder&&createPortal(workbench,placeholder)}
    {tab&&createPortal(rail,sidebarSlot)}
    {createPortal(tab&&<ShellTool command="slidesExport" icon="slides-export" label={t('export')} keys="⌘E" onClick={()=>void run(exportDeck)}/>,fileExtra)}
    {createPortal(tab&&<>
      <ShellTool command="present" icon="slides-play" className="tool-present" label={t('present')} keys="⌘↩" onClick={present}/>
      <div className="segmented-view" role="tablist" aria-label={t('editMaster')}>{([['slides-slides','viewSlides',false],['slides-master','editMaster',true]] as const).map(([icon,label,on])=><button key={icon} type="button" role="tab" className="tool" aria-selected={!!masterItem===on} aria-label={t(label)} onClick={()=>{if(!!masterItem!==on)toggleMaster();}}><span className="slides-contents" dangerouslySetInnerHTML={svg(icon)}/><span className="tooltip" aria-hidden="true">{t(label)}</span></button>)}</div>
    </>,viewGroup)}
    {createPortal(tab&&<><ShellTool command="insertLink" icon="slides-link" label={t('manualLink')} onClick={()=>void run(insertLink)}/>{!masterItem&&<ShellTool command="insertPoll" icon="slides-poll" label={pollWords[lang].title} pressed={!!slide?.poll} onClick={()=>command('insertPoll')}/>}</>,insertExtra)}
    {createPortal(tab&&deck&&slide?<>{masterItem?`${t('editMaster')} · ${itemName(deck,masterItem)}`:<>{t('slide')} {deck.slides.indexOf(slide)+1} {t('of')} {deck.slides.length} · <button type="button" className="layout-name" title={t('changeLayout')} onClick={()=>setLayoutPick('change')}>{layoutOf(deck,slide.layoutId).name}</button></>}{zoom!==100&&` · ${zoom}%`}</>:null,statusSlot)}
    {settingsSections.map(({key,label,section})=><React.Fragment key={key}>{createPortal(t(key==='poll'?'pollSettings':'promptDeck'),label)}{createPortal(key==='poll'
      ?<PollServerSettings key={pollServer} prefs={{language:lang,recent:[],pollServer}} t={t} onChange={p=>{const v=p.pollServer||'';void api.invoke('setPollServer',v).then((s:string)=>setPollServer(s||'')).catch(()=>{});}}/>
      :<div className="slides-settings"><h2>{t('promptDeck')}</h2>{deck?<><p>{t('promptDeckHelp')}</p><textarea className="code system-prompt" aria-label={t('promptDeck')} rows={14} maxLength={20000} value={deck.systemPrompt||''} onChange={e=>setDeckPrompt(e.target.value)}/></>:<p>{t('promptNoDeck')}</p>}</div>,section)}</React.Fragment>)}
    {gallery&&<Modal sheet title={t('new')} onClose={()=>setGallery(false)}><div className="home-layout"><main className="gallery">
      <div className="gallery-controls"><input aria-label={t('searchTemplates')} placeholder={t('searchTemplates')} value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="template-grid">{t('blank').toLowerCase().includes(search.toLowerCase())&&<button className={'template-card '+(selectedTemplate==='blank'?'selected':'')} onClick={()=>setSelectedTemplate('blank')} onDoubleClick={()=>void run(()=>create('blank'))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void run(()=>create('blank'));}}}><div className="template-art"><Preview deck={blankDeck} slide={blankDeck.slides[0]}/>{selectedTemplate==='blank'&&<span className="template-check" dangerouslySetInnerHTML={{__html:commonIcon('graph-Check',14)}}/>}</div><strong>{t('blank')}</strong></button>}
        {templates.filter(x=>x.title.toLowerCase().includes(search.toLowerCase())).map(x=>{const id='custom:'+x.id;return <div className="custom-card" key={x.id}><button className={'template-card '+(selectedTemplate===id?'selected':'')} onClick={()=>setSelectedTemplate(id)} onDoubleClick={()=>void run(()=>create(id))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void run(()=>create(id));}}}><div className="template-art"><TemplatePreview id={x.id}/>{selectedTemplate===id&&<span className="template-check" dangerouslySetInnerHTML={{__html:commonIcon('graph-Check',14)}}/>}</div></button><TemplateRow t={t} template={x} onChange={list=>{setTemplates(list);if(!list.some(v=>'custom:'+v.id===selectedTemplate))setSelectedTemplate('blank');}} run={run}/></div>;})}</div>
      {loading&&<p className="empty">{t('processing')}</p>}
    </main></div><div className="file-footer">{deck&&desktop()&&<button type="button" className="small-button" onClick={()=>setTemplateName(docOf(active!)?.name||deck.title)}>{t('saveTemplate')}</button>}<span className="spacer"/><button type="button" className="small-button" onClick={()=>setGallery(false)}>{t('cancel')}</button><button type="button" className="small-button primary" disabled={loading} onClick={()=>void run(()=>create(selectedTemplate))}>{t('createButton')}</button></div></Modal>}
    {layoutPick&&tab&&deck&&slide&&<LayoutPicker t={t} deck={deck} mode={layoutPick} initial={slide.layoutId} onPick={id=>layoutPick==='insert'?addSlide(id):changeLayout(id)} onClose={()=>setLayoutPick(null)}/>}
    {templateName!==null&&deck&&<Modal small title={t('saveTemplate')} onClose={()=>setTemplateName(null)}><form onSubmit={e=>{e.preventDefault();const title=templateName.trim();if(!title)return;setTemplateName(null);void run(async()=>{await api.invoke('saveTemplate',{...deck,title});templatePreviews.clear();await refreshTemplates();toast(t('templateSaved'));});}}><label className="field">{t('templateName')}<input autoFocus value={templateName} maxLength={200} onChange={e=>setTemplateName(e.target.value)}/></label><div className="file-footer"><button type="button" className="small-button" onClick={()=>setTemplateName(null)}>{t('cancel')}</button><button className="small-button primary" type="submit" disabled={!templateName.trim()}>{t('save')}</button></div></form></Modal>}
    {error&&<Modal small title={t('error')} onClose={()=>setError('')}><p className="error-message">{error}</p><div className="file-footer"><button type="button" className="small-button primary" onClick={()=>setError('')}>{t('ok')}</button></div></Modal>}
    {pollTarget&&pollTarget.doc===active&&<Modal title={pollWords[lang].title} onClose={()=>setPollTarget(null)}><PollEditor key={pollTarget.slide} initial={pollTarget.poll} lang={lang} server={pollServer} onCancel={()=>setPollTarget(null)} onSave={poll=>{mutate(d=>{const target=d.slides.find(s=>s.id===pollTarget.slide);if(target){if(poll){target.poll=poll;target.title=poll.prompt.slice(0,200);}else delete target.poll;}});setManualSelection(null);canvasRange.current=null;setImageSel(false);setCropOn(false);setPollTarget(null);}}/></Modal>}
  </>;
}
const root=document.createElement('div');root.id='slides-root';document.body.append(root);
createRoot(root).render(<Editor/>);
