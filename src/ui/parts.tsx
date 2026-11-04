// Pieces of the Slides editor shared by its views: Common-style dialogs and tool buttons, slide previews (isolated
// esf-frame: documents) and the copy of canvas objects with their motion.
import './import-report.css';
import {importReportElement} from './import-report';
import {masterSlide} from '../shared/masters';
import React,{useState,useEffect,useRef,useMemo,useLayoutEffect} from 'react';
import {Deck,Slide,Template,Language,masterOf,activeMaster} from '../shared/model';
import {slideDocument} from '../shared/render';
import {annotate,applyEdits,cleanOp,cleanSelection,EditOp,SelectionDetails} from '../shared/edit';
import {shapePaths} from '../shared/manual';
import {translator,T} from './i18n';
import {api} from './bridge';

export const zoomSteps=[60,80,100,125,150];

// Copied objects keep their motion: the rules of the source CSS (master + slide) that animate them (animation and
// transition, and the hidden state of a data-step reveal, which must beat the copied inline look) are rewritten for a
// class put on each copied element, with @media/@supports kept and the keyframes they use renamed, so they also play
// on a slide or presentation without the source CSS. Rules that target a copied element only in another state (a class
// that the slide's script or the player adds, such as .on or .active) go as they are, with !important to beat the copied
// inline look. pairs: source element → its copy.
export function motionCss(css:string,pairs:[Element,HTMLElement][]){
  const sheet=new CSSStyleSheet();try{sheet.replaceSync(css);}catch{return'';}
  const tail=Math.random().toString(36).slice(2,8),copies=new Map(pairs),classes=new Map<Element,string>(),frames=new Map<string,CSSKeyframesRule>(),used=new Map<string,string>();
  const scan=(rules:CSSRuleList)=>{for(const r of [...rules]){if(r instanceof CSSKeyframesRule)frames.set(r.name,r);else if(r instanceof CSSGroupingRule)scan(r.cssRules);}};scan(sheet.cssRules);
  const tag=(el:Element)=>{let c=classes.get(el);if(!c){c='esf-m-'+tail+'-'+classes.size;classes.set(el,c);copies.get(el)!.classList.add(c);}return'.'+c;};
  const matches=(el:Element,sel:string)=>{try{return el.matches(sel);}catch{return false;}};
  const rename=(v:string)=>v.replace(/[\w-]+/g,n=>{if(!frames.has(n))return n;if(!used.has(n))used.set(n,`${n}-${tail}`);return used.get(n)!;});
  const block=(s:CSSStyleDeclaration,all:boolean,important:boolean)=>{const seen=new Set<string>();return Array.from({length:s.length},(_,i)=>s.item(i)).filter(p=>all||/^(animation|transition)/.test(p)).map(p=>{
    const short=p.split('-')[0],k=s.getPropertyValue(short)?short:p,v=s.getPropertyValue(k);if(!v||seen.has(k))return'';seen.add(k);
    return`${k}:${/^animation/.test(k)?rename(v):v}${important||s.getPropertyPriority(p)?'!important':''}`;}).filter(Boolean).join(';');};
  const walk=(rules:CSSRuleList):string=>[...rules].map(r=>{
    if(r instanceof CSSMediaRule||r instanceof CSSSupportsRule){const inner=walk(r.cssRules);return inner?`@${r instanceof CSSMediaRule?'media':'supports'} ${r.conditionText}{${inner}}`:'';}
    if(!(r instanceof CSSStyleRule))return'';
    const motion=block(r.style,false,false),base:string[]=[],hidden:string[]=[],state:string[]=[];
    for(const part of r.selectorText.split(/,(?![^(]*\))/)){
      const pseudo=part.match(/::?(before|after)\s*$/i)?.[0]||'',sel=part.slice(0,part.length-pseudo.length).trim();if(!sel)continue;
      const runtime=/\.pending\b/.test(sel)?sel:sel.replace(/\.([\w-]+)/g,(all,c)=>pairs[0][0].ownerDocument.querySelector('.'+CSS.escape(c))?all:'').replace(/(^|[\s>+~(,])(?=$|[\s>+~),])/g,'$1*');
      for(const [el] of pairs){
        if(matches(el,sel)){if(motion)base.push(tag(el)+pseudo.trim());continue;}
        if(runtime!==sel&&matches(el,runtime)){if(!state.includes(part.trim()))state.push(part.trim());continue;}
        const step=el.closest('[data-step]');if(!step||!copies.has(step))continue;
        step.classList.add('pending');const hit=matches(el,sel);step.classList.remove('pending');
        if(hit)hidden.push(tag(step)+'.pending'+(step===el?'':' '+tag(el))+pseudo.trim());
      }
    }
    return(base.length?`${base.join(',')}{${motion}}`:'')+(hidden.length?`${hidden.join(',')}{${block(r.style,true,true)}}`:'')+(state.length?`${state.join(',')}{${block(r.style,true,true)}}`:'');
  }).join('');
  const out=walk(sheet.cssRules);
  return out+[...used].map(([n,to])=>`@keyframes ${to}{${[...frames.get(n)!.cssRules].map(k=>k.cssText).join('')}}`).join('');
}
// Shortcuts are written the macOS way (⇧⌘S); elsewhere ⌘ becomes Ctrl. Tooltips show name and shortcut.
export const mac=/Mac/.test(navigator.platform),windows=/Win/.test(navigator.platform);
export const keyLabel=(k:string)=>mac?k:[k.includes('⌘')&&'Ctrl',k.includes('⇧')&&'Shift',k.includes('⌥')&&'Alt',k.replace(/[⌘⇧⌥]/g,'')].filter(Boolean).join('+');
export const ariaKeys=(k:string)=>[k.includes('⌥')&&'Alt',k.includes('⇧')&&'Shift',k.includes('⌘')&&(mac?'Meta':'Control'),({'↩':'Enter','⌫':'Backspace','+':'Plus','−':'Minus'} as Record<string,string>)[k.replace(/[⌘⇧⌥]/g,'')]||k.replace(/[⌘⇧⌥]/g,'')].filter(Boolean).join('+');

// Main-process errors reach the UI in English behind an IPC prefix; show known ones translated
// and keep the technical detail for the rest.
export const knownErrors:[RegExp,string][]=[[/^Files changed outside/,'eChanged'],[/^Project is busy/,'eBusy'],[/^Unsupported ESF version/,'eVersion'],[/^A request is already running/,'eAIRunning'],[/^An export is already running/,'eExportRunning'],[/^Symbolic links/,'eSymlink'],[/^Path outside project/,'eOutside'],[/^Unsupported HTML/,'eHtml'],[/^External styles/,'eExternalCss'],[/^A presentation needs/,'eSlides'],[/^Resource exceeds/,'eResourceSize'],[/^Unsupported resource/,'eResourceType'],[/^Choose an \.ESF/,'eChooseEsf'],[/^This file is not a valid ESF package/,'eInvalidPackage'],[/^The \.ESF file was moved/,'eMissing'],[/^This file is open in another tab/,'eFileOpen'],[/ENOENT|spawn .* ENOENT/,'eCliMissing']];
export function errorText(t:T,e:any){
  const message=String(e?.message||e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
  if(/references a resource that is not embedded/.test(message))return t('eNotEmbedded')+'\n\n'+message;
  if(/^(The package (has more|exceeds)|A file in the package exceeds|The presentation exceeds|A file exceeds)/.test(message))return t('ePackageLimit')+'\n\n'+message;
  if(/in (a )?package|^(Encrypted|Multi-part|Unsupported compression)/.test(message))return t('eInvalidPackage')+'\n\n'+message;
  const known=knownErrors.find(([re])=>re.test(message));return known?t(known[1] as any):message;
}

// A custom template's name, renamed in place (Enter saves, Esc cancels), and its delete button.
export function TemplateRow({t,template,onChange,run}:{t:T;template:Template;onChange:(list:Template[])=>void;run:(fn:()=>Promise<unknown>)=>unknown}){
  const [editing,setEditing]=useState(false),[name,setName]=useState(template.title);
  const save=()=>{setEditing(false);if(name.trim()&&name.trim()!==template.title)void run(async()=>onChange(await api.invoke('renameTemplate',template.id,name)));else setName(template.title);};
  return<div className="template-row">{editing?<input autoFocus aria-label={t('renameTemplate')} value={name} onChange={e=>setName(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape'){e.stopPropagation();setName(template.title);setEditing(false);}}}/>:<strong title={template.title}>{template.title}</strong>}
    {!editing&&<ToolButton icon="graph-Edit" label={t('renameTemplate')} onClick={()=>{setName(template.title);setEditing(true);}}/>}<ToolButton icon="graph-Trash" label={t('deleteTemplate')} onClick={async()=>{if(await ask(t('deleteTemplateConfirm'),t('deleteTemplate'),t('cancel')))void run(async()=>{const list=await api.invoke('deleteTemplate',template.id);templatePreviews.delete(template.id);onChange(list);});}}/></div>;
}

export let previewGeneration=0;
// Slide frames load the isolated shell of the esf-frame: scheme; headless browser tests serve it from another origin.
export const frameSrc:string=(globalThis as any).__esfFrameUrl||'esf-frame://preview/';
// Fields where keys type text; toolbar checkboxes or buttons do not keep Delete and the canvas focus from working.
export const typingField='textarea,select,[contenteditable],[contenteditable] *,input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=button])';
// Rail thumbnails mount their frame only once scrolled near the viewport (large decks).
export function LazyPreview(props:{deck:Deck;slide:Slide}){
  const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{if(visible||!ref.current)return;const o=new IntersectionObserver(e=>{if(e.some(x=>x.isIntersecting)){setVisible(true);o.disconnect();}},{rootMargin:'600px 0px'});o.observe(ref.current);return()=>o.disconnect();},[visible]);
  return visible?<Preview {...props}/>:<div ref={ref} className="preview"/>;
}
// A custom template's card shows its first slide (loaded once per template and kept while the app runs).
export const templatePreviews=new Map<string,Promise<Deck>>();
export function TemplatePreview({id}:{id:string}){
  const [deck,setDeck]=useState<Deck|null>(null);
  useEffect(()=>{let live=true;let p=templatePreviews.get(id);if(!p){p=api.invoke('templatePreview',id) as Promise<Deck>;templatePreviews.set(id,p);p.catch(()=>templatePreviews.delete(id));}
    p.then(d=>{if(live)setDeck(d);},()=>{});return()=>{live=false;};},[id]);
  return deck?.slides[0]?<LazyPreview deck={deck} slide={deck.slides[0]}/>:<div className="preview"/>;
}
// The editor canvas renders in edit mode: the frame selects, edits and drags elements (editRuntime) and reports operations.
export type CharRange={start:number;end:number};
export type CanvasEdit={select:()=>{indices:number[];editing:boolean;range?:CharRange|null};onState:(indices:number[],editing:boolean,details?:SelectionDetails)=>void;onRange:(start:number,end:number)=>void;onOps:(ops:EditOp[],indices:number[],editing:boolean,range?:CharRange|null)=>void;onCrop:(active:boolean)=>void;onContext:(x:number,y:number,text:boolean,count:number)=>void;onPress:()=>void};
export const previewKey=(deck:Deck,slide:Slide,editing:boolean)=>{const master=slide.layoutId?masterOf(deck,slide):activeMaster(deck);return[deck.id,slide.id,slide.layoutId,slide.html,slide.css,slide.script,slide.staticHtml,JSON.stringify(slide.poll),master.css,master.html,deck.layouts.find(l=>l.id===slide.layoutId)?.css||'',deck.assets.length,document.documentElement.lang,editing].join('\u0000');};
export function Preview({deck,slide,className='',edit,frameRef}:{deck:Deck;slide:Slide;className?:string;edit?:CanvasEdit;frameRef?:React.RefObject<HTMLIFrameElement|null>}){
  // Assets are content-addressed, so their count is enough to detect changes in the key.
  const key=previewKey(deck,slide,!!edit);
  const editRef=useRef(edit),frame=useRef<HTMLIFrameElement|null>(null);editRef.current=edit;
  const source=useRef({deck,slide});source.current={deck,slide};
  // Geometry and style commits (move, resize, crop, stacking order, borders, fill, opacity) already exist in the live DOM. Preserve that document and its pointer capture;
  // only text/structure edits, undo/redo and external changes need a new frame. Consume expected keys
  // in order so an undo to an earlier geometry state can never be mistaken for a local acknowledgement.
  const local=useRef<{slide:Slide;keys:string[];doc:string}|null>(null),documentRef=useRef(''),reload=useRef(0);
  const doc=useMemo(()=>{
    const at=local.current?.keys.indexOf(key)??-1;
    if(at>=0&&local.current){local.current.keys.splice(0,at+1);return local.current.doc;}
    local.current=null;reload.current++;
    try{return edit?slideDocument(deck,{...slide,html:annotate(slide.html),staticHtml:''},true,'',0,true,{select:edit.select().indices,editing:edit.select().editing,range:edit.select().range},document.documentElement.lang as Language):slideDocument(deck,slide,true,'',0,true,undefined,document.documentElement.lang as Language);}catch{return'';}
  },[key]);
  documentRef.current=doc;
  const generation=useMemo(()=>++previewGeneration,[doc,reload.current]);
  useEffect(()=>{if(!edit)return;const listen=(e:MessageEvent)=>{const m=e.data,x=editRef.current;if(!x||e.source!==frame.current?.contentWindow||m?.app!=='esf-edit')return;
    const indices=Array.isArray(m.indices)?m.indices.filter(Number.isInteger).slice(0,1000):[],editing=!!m.editing;
    if(m.type==='state')x.onState(indices,editing,cleanSelection(m.details,indices[0]));
    if(m.type==='crop')x.onCrop(!!m.active);
    if(m.type==='press')x.onPress();
    if(m.type==='context'&&Number.isFinite(m.x)&&Number.isFinite(m.y))x.onContext(m.x,m.y,!!m.text,Number.isInteger(m.count)?m.count:1);
    if(m.type==='range'&&Number.isInteger(m.start)&&Number.isInteger(m.end))x.onRange(m.start,m.end);
    if(m.type==='ops'&&Array.isArray(m.ops)){
      const ops:EditOp[]=m.ops.slice(0,1000).map(cleanOp).filter((op:EditOp|null):op is EditOp=>!!op);
      if(ops.length&&ops.length===m.ops.length&&ops.every(op=>op.type==='move'||op.type==='resize'||op.type==='crop'||op.type==='style')){
        const before=local.current?.slide||source.current.slide,next=applyEdits(before,ops),expected=previewKey(source.current.deck,next,true);
        if(expected!==previewKey(source.current.deck,before,true))local.current={slide:next,keys:[...(local.current?.keys||[]),expected],doc:documentRef.current};
      }else local.current=null;
      x.onOps(ops,indices,editing,Number.isInteger(m.range?.start)&&Number.isInteger(m.range?.end)?{start:m.range.start,end:m.range.end}:null);
    }};
    addEventListener('message',listen);return()=>removeEventListener('message',listen);},[!!edit]);
  // A new document loads behind the one on screen and takes its place once drawn (the frame's ready message), so an
  // edit or a new slide never shows a blank frame. Meanwhile the old one takes no clicks (its element numbers no
  // longer match the slide); commands and messages go to the newest.
  const [layers,setLayers]=useState(()=>[{gen:generation,doc,ready:false}]);
  const frames=useRef(new Map<number,HTMLIFrameElement>());
  useEffect(()=>{
    setLayers(old=>old.some(l=>l.gen===generation)?old:[...old.filter(l=>l.ready).slice(-1),{gen:generation,doc,ready:false}]);
    const timer=setTimeout(()=>shown(generation),3000);return()=>clearTimeout(timer);
  },[generation]);
  const shown=(gen:number)=>setLayers(old=>{const i=old.findIndex(l=>l.gen===gen);return i<0?old:old.slice(i).map(l=>l.gen===gen?{...l,ready:true}:l);});
  useEffect(()=>{const listen=(e:MessageEvent)=>{if(e.data?.app!=='esf-slide'||e.data.type!=='ready')return;for(const [gen,f] of frames.current)if(f.contentWindow===e.source){shown(gen);return;}};
    addEventListener('message',listen);return()=>removeEventListener('message',listen);},[]);
  const newest=layers[layers.length-1],visible=[...layers].reverse().find(l=>l.ready)||layers[0];
  return <div className="preview-stack">{layers.map(l=><iframe key={l.gen} ref={node=>{if(node)frames.current.set(l.gen,node);else frames.current.delete(l.gen);if(l===newest){frame.current=node;if(frameRef)frameRef.current=node;}}}
    className={'preview '+className+(edit?' editable':'')+(l===visible?'':' preview-behind')+(l!==newest?' preview-stale':'')} title={slide.title} sandbox="allow-scripts" src={frameSrc} tabIndex={-1}
    // A frame moved in the DOM (reordering) reloads its shell, so the document is posted on every load;
    // after the shell writes it, the shell's listener is gone and later posts are ignored.
    // After a canvas edit the frame reloads; it takes the keyboard back so Delete never reaches the slide list.
    onLoad={e=>{e.currentTarget.contentWindow?.postMessage({app:'esf-shell',html:l.doc},'*');if(l===newest&&edit?.select().indices.length&&!(document.activeElement as Element|null)?.matches(typingField+',.hidden-color')&&!(document.activeElement as Element|null)?.closest('.shape-picker,.context-menu,dialog')&&!document.querySelector('.shape-picker,.context-menu'))e.currentTarget.focus();}}/>)}</div>;
}

// Dialogs have the structure and look of Common's (file-dialogs.js): a native modal dialog, header with title and close,
// body, and a footer of small buttons. Escape closes (except a fixed dialog).
export function Modal({title,onClose,children,wide=false,sheet=false,small=false,fixed=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean;sheet?:boolean;small?:boolean;fixed?:boolean}){
  const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const d=ref.current,previous=document.activeElement as HTMLElement|null;if(d&&!d.open)d.showModal();return()=>{if(d?.open)d.close();if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  const label=commonText('close');
  return <dialog ref={ref} className={'file-dialog slides-dialog'+(wide||sheet?' wide':'')+(sheet?' sheet':'')+(small?' small':'')} aria-label={title} onCancel={e=>{e.preventDefault();if(!fixed)close.current();}}>
    <header className="settings-header"><h2>{title}</h2>{!fixed&&<ToolButton icon="graph-Close" label={label} onClick={()=>close.current()}/>}</header>
    <div className="file-body">{children}</div>
  </dialog>;
}
// Common's interface texts and icons (loaded by its shell before the editor).
export const commonText=(key:string)=>{const l=(globalThis as any).EdukorsLanguages;return l?.[document.documentElement.lang]?.messages[key]||l?.en?.messages[key]||key;};
export const commonIcon=(name:string,size=18)=>{try{return(globalThis as any).EdukorsIcons.svg(name,size);}catch{return'';}};
// A toolbar button as in Common: its icon and a tooltip with the name (and the shortcut).
export function ToolButton({icon,label,keys,className='',...props}:{icon:string;label:string;keys?:string}&React.ButtonHTMLAttributes<HTMLButtonElement>){
  return <button type="button" className={'tool '+className} aria-label={label} aria-keyshortcuts={keys&&ariaKeys(keys)} {...props}><span className="slides-contents" dangerouslySetInnerHTML={{__html:commonIcon(icon)}}/><span className="tooltip" aria-hidden="true">{keys?`${label} (${keyLabel(keys)})`:label}</span></button>;
}
// A question in Common's dialog style (never the system's confirm, which leaves the window).
export function ask(message:string,ok:string,cancel:string):Promise<boolean>{
  return new Promise(resolve=>{
    const d=document.createElement('dialog');d.className='file-dialog slides-ask';
    const body=document.createElement('div');body.className='file-body';const p=document.createElement('p');p.textContent=message;body.append(p);
    const foot=document.createElement('div');foot.className='file-footer';
    const no=Object.assign(document.createElement('button'),{type:'button',className:'small-button',textContent:cancel}),yes=Object.assign(document.createElement('button'),{type:'button',className:'small-button primary',textContent:ok});
    foot.append(no,yes);d.append(body,foot);
    const done=(v:boolean)=>{if(d.open)d.close();d.remove();resolve(v);};
    no.onclick=()=>done(false);yes.onclick=()=>done(true);d.addEventListener('cancel',e=>{e.preventDefault();done(false);});
    document.body.append(d);d.showModal();no.focus();
  });
}
// New slide or change of layout: thumbnails of every layout; double click (or Enter) or the button picks.
export function LayoutPicker({t,deck,mode,initial,onPick,onClose}:{t:T;deck:Deck;mode:'insert'|'change';initial:string;onPick:(layoutId:string)=>void;onClose:()=>void}){
  const [picked,setPicked]=useState(initial);
  return <Modal sheet title={t(mode==='insert'?'newSlide':'changeLayout')} onClose={onClose}><div className="layout-pick">
    <div className="template-grid">{deck.layouts.map(l=><button key={l.id} className={'template-card '+(picked===l.id?'selected':'')} onClick={()=>setPicked(l.id)} onDoubleClick={()=>onPick(l.id)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onPick(l.id);}}}><div className="template-art"><LazyPreview deck={deck} slide={masterSlide(deck,'l:'+l.id)}/>{picked===l.id&&<span className="template-check" dangerouslySetInnerHTML={{__html:commonIcon('graph-Check',14)}}/>}</div><strong title={l.name}>{l.name}</strong></button>)}</div>
  </div><div className="file-footer"><button type="button" className="small-button" onClick={onClose}>{t('cancel')}</button><button type="button" className="small-button primary" disabled={!picked} onClick={()=>onPick(picked)}>{t(mode==='insert'?'insert':'apply')}</button></div></Modal>;
}

export function ImportNotice({deck,t,onDismiss}:{deck:Deck;t:T;onDismiss?:()=>void}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const open=host.current?.querySelector('details')?.open;
    const report=importReportElement(deck,t,onDismiss);
    if(open&&report?.querySelector('details'))report.querySelector('details')!.open=true;
    host.current?.replaceChildren(...report?[report]:[]);
  },[deck.importReport,t]);
  return <div ref={host}/>;
}
