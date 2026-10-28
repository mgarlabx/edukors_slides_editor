import React,{useState,useEffect,useRef,useMemo,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Deck,Slide,Project,Preferences,Template,Language,Asset,AIEvent,SessionLimits,Layout,newDeck,newSlide,newMaster,defaultNames,duplicateSlides,uid,layoutOf,activeMaster,masterOf,blankHtml,validateDeck} from '../shared/model';
import {slideDocument} from '../shared/render';
import {copySlides,pasteSlides,copyMasterItem,pasteMasterItems,importResources,independentObjects,joinBehavior} from '../shared/clipboard';
import {syncLayouts,cleanLayout,relayout} from '../shared/layout';
import {annotate,applyEdits,cleanOp,cleanSelection,editIndex,EditOp,SelectionDetails,ObjectStyle} from '../shared/edit';
import {insertManual,editableAt,manualElement,safeUrl,setLinkUrl,setLinkCaption,setLinkQr,linkHasQr,ManualKind,shapeTypes,shapePaths,shapeLook,setShape,setLinkStyle,linkLook,LinkStyle,setImageShadow,wrapShadow} from '../shared/manual';
import {qrSvg} from '../shared/qr';
import {PollConfig,pollWords} from '../shared/poll';
import {PollEditor,PollServerSettings} from './PollEditor';
import {translator,T} from './i18n';
import {providerOf,modelsFor,effortsFor,ProviderStatus} from '../shared/providers';
import {ProviderAccounts,AccountOptions} from './ProviderAccounts';
import './edukors-tokens.css';
import './style.css';
import logo from './edukors-logo.svg';
declare global {interface Window {api:{invoke:(method:string,...args:any[])=>Promise<any>;subscribe:(channel:string,callback:(data:any)=>void)=>()=>void}}}
const api=window.api;
type Question={question:string;options:string[];multiSelect?:boolean};
type Chat={role:'user'|'assistant'|'activity';text:string;kind?:string;tool?:string;detail?:string;body?:string;at?:string;questions?:Question[];answered?:boolean;agent?:string};
// A conversation with the agent; each one resumes its own CLI session.
type Total=Usage&{turns:number;updated:string;context?:number;window?:number};
type Conversation={id:string;title:string;updated:string;chat:Chat[];total?:Total;profile:string};
type Tab={project:Project;dirty:boolean;selected:string[];past:Deck[];future:Deck[];chat:Chat[];prompt:string;attachments:{path:string;name:string}[];busy:boolean;version:number;aiVersion:number;proposal?:Deck;usage?:Usage;total?:Total;profile:string;conversation:string;history:Conversation[];started?:number;progress?:number;tokens?:number};
type Usage={input?:number;output?:number;cache?:number};
const chatTitle=(chat:Chat[])=>(chat.find(m=>m.role==='user')?.text||'').split('\n')[0].slice(0,70);
// The tab's current conversation merged into its history (newest first); empty ones are not kept.
function snapshot(x:{conversation:string;chat:Chat[];total?:Conversation['total'];profile:string;history:Conversation[]}):Conversation[]{
  const rest=x.history.filter(c=>c.id!==x.conversation);if(!x.chat.some(m=>m.role==='user'))return rest;
  const old=x.history.find(c=>c.id===x.conversation),last=[...x.chat].reverse().find(m=>m.at)?.at;
  return[{id:x.conversation,title:chatTitle(x.chat),updated:last||old?.updated||new Date(0).toISOString(),chat:x.chat.length>200?x.chat.slice(-200):x.chat,total:x.total,profile:x.profile},...rest].sort((a,b)=>b.updated.localeCompare(a.updated)).slice(0,40);
}
const cleanChat=(chat:any[])=>Array.isArray(chat)?chat.filter((m:any)=>m&&typeof m.text==='string'&&['user','assistant','activity'].includes(m.role)).slice(-200):[];
const addUsage=(a:number|undefined,b:number|undefined)=>a===undefined&&b===undefined?undefined:(a||0)+(b||0);
// Same drawing as the Edukors Graph Editor: 24×24 grid, 1.75 stroke, round caps and joins, rounded corners, currentColor.
const icons:Record<string,React.ReactNode>={
 poll:<><path d="M4 20h16M6 16v-5M12 16V4M18 16V8"/><circle cx="6" cy="7" r="1"/></>,
 settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
 spark:<><path d="M10 3.5c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/><path d="M18.5 2.5c.25 1.7.95 2.4 2.5 2.6-1.55.2-2.25.9-2.5 2.6-.25-1.7-.95-2.4-2.5-2.6 1.55-.2 2.25-.9 2.5-2.6z"/><path d="M18 15.5c.2 1.3.75 1.85 2 2-1.25.15-1.8.7-2 2-.2-1.3-.75-1.85-2-2 1.25-.15 1.8-.7 2-2z"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,panel:<><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 4.5v15"/></>,more:<><circle cx="5.5" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="18.5" cy="12" r=".9"/></>,slides:<><rect x="3.5" y="5" width="13" height="9" rx="1.5"/><path d="M7.5 18h10a2 2 0 0 0 2-2V9"/></>,close:<path d="M6 6l12 12M18 6 6 18"/>,
 play:<path d="M7.5 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L9 3.94a1 1 0 0 0-1.5.86z"/>,
 export:<><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5"/></>,
 undo:<><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></>,redo:<><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></>,
 folder:<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1"/><path d="M3 7v10a2 2 0 0 0 2 2h12.4a2 2 0 0 0 1.9-1.4l1.6-5A1.5 1.5 0 0 0 19.5 10.6H7.6a2 2 0 0 0-1.9 1.4L3 19"/></>,
 file:<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></>,
 clock:<><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7.5V12l3 2"/></>,
 image:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-4.6-4.6a1.5 1.5 0 0 0-2.1 0L6 20"/></>,
 link:<><path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4"/></>,
 text:<path d="M5 7V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V7M12 4v16M9 20h6"/>,
 shape:<><circle cx="8.5" cy="8.5" r="5"/><path d="M14 11h5.5a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H13a1.5 1.5 0 0 1-1.5-1.5v-5.2"/></>,
 crop:<><path d="M6 2.5V16a2 2 0 0 0 2 2h13.5"/><path d="M18 21.5V8a2 2 0 0 0-2-2H2.5"/></>,
 copy:<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
 trash:<><path d="M4 7h16M10 11v6M14 11v6"/><path d="M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/></>,
 send:<path d="M12 19V5M6 11l6-6 6 6"/>,check:<path d="m5 12.5 4.5 4.5L19 7.5"/>,
 back:<path d="M19 12H5M11 18l-6-6 6-6"/>,chevron:<path d="m9 6 6 6-6 6"/>,
 globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
 account:<><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></>,
 grid:<><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
 info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/></>,
 save:<><path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/></>,
 arrowUp:<path d="M12 19V5M6 11l6-6 6 6"/>,arrowDown:<path d="M12 5v14M18 13l-6 6-6-6"/>,
 cut:<><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.1 15.9 19 4M15.9 15.9 5 4"/></>,
 paste:<><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/></>,
 clip:<path d="m20.5 11.5-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>,
 duplicate:<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3M14.5 12v5M12 14.5h5"/></>,
 newFile:<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/></>,
 master:<><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="14" width="7.5" height="7" rx="1.5"/><rect x="13.5" y="14" width="7.5" height="7" rx="1.5"/></>,
 newSlide:<><rect x="2.5" y="4" width="14" height="10" rx="2"/><path d="M19 13.5v7M15.5 17h7"/></>,
 reveal:<><path d="M11 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1.5"/><circle cx="16.5" cy="16.5" r="3"/><path d="m21 21-2.4-2.4"/></>,dot:<circle cx="12" cy="12" r="2.5"/>,
 alignLeft:<path d="M4 6h16M4 12h10M4 18h13"/>,alignCenter:<path d="M4 6h16M7 12h10M5.5 18h13"/>,alignRight:<path d="M4 6h16M10 12h10M7 18h13"/>
};
const zoomSteps=[60,80,100,125,150];
const fileTitle=(file:string)=>file.split(/[\\/]/).at(-1)!.replace(/\.esf$/i,'');
// A new presentation has no file (path '') until its first save.
const tabTitle=(file:string,t:T)=>file?fileTitle(file):t('untitled');
// Slide master view: each master and each layout is edited on the canvas as a pseudo slide, written back by putSlide.
// Items are 'm:<master ID>' and 'l:<layout ID>', in rail order: the masters (alternatives, one active), then the shared layouts.
// Virtual IDs cannot collide with persisted slide IDs (which always start with s-).
const masterPrefix='@master:',layoutPrefix='@layout:';
const masterItems=(deck:Deck)=>[...deck.masters.map(m=>'m:'+m.id),...deck.layouts.map(l=>'l:'+l.id)];
const itemName=(deck:Deck,item:string)=>(item.startsWith('m:')?deck.masters.find(m=>'m:'+m.id===item):deck.layouts.find(l=>'l:'+l.id===item))?.name||'';
function masterSlide(deck:Deck,item:string):Slide{
  if(item.startsWith('m:')){const master=deck.masters.find(m=>'m:'+m.id===item)||activeMaster(deck);return{id:masterPrefix+master.id,title:master.name,layoutId:'',html:`<section class="slide">${master.html}</section>`,css:'',script:'',staticHtml:'',notes:''};}
  const layout=deck.layouts.find(l=>'l:'+l.id===item)||deck.layouts[0];
  return{id:layoutPrefix+layout.id,title:layout.name,layoutId:layout.id,html:layout.html,css:'',script:'',staticHtml:'',notes:''};
}
// A master item shows its objects as its own content, with its own CSS (active or not); layouts show the active master behind.
const masterDeck=(deck:Deck,item:string)=>item.startsWith('m:')?{...deck,activeMaster:item.slice(2),masters:deck.masters.map(m=>'m:'+m.id===item?{...m,html:''}:m)}:deck;
const findSlide=(deck:Deck,id:string)=>deck.slides.find(s=>s.id===id)||(id.startsWith(masterPrefix)&&deck.masters.some(m=>masterPrefix+m.id===id)?masterSlide(deck,'m:'+id.slice(masterPrefix.length)):id.startsWith(layoutPrefix)&&deck.layouts.some(l=>layoutPrefix+l.id===id)?masterSlide(deck,'l:'+id.slice(layoutPrefix.length)):undefined);
function putSlide(deck:Deck,s:Slide){
  if(deck.slides.some(x=>x.id===s.id)){deck.slides=deck.slides.map(x=>x.id===s.id?s:x);return;}
  if(s.id.startsWith(masterPrefix)){const id=s.id.slice(masterPrefix.length),html=new DOMParser().parseFromString(s.html,'text/html').querySelector('.slide')?.innerHTML??'';deck.masters=deck.masters.map(m=>m.id===id?{...m,html,css:s.css||m.css}:m);}
  else if(s.id.startsWith(layoutPrefix)){const id=s.id.slice(layoutPrefix.length),base={...deck};deck.layouts=deck.layouts.map(l=>l.id===id?{...l,html:cleanLayout(s.html),...s.css?{css:s.css}:{}}:l);deck.slides=syncLayouts(base,deck).slides;}
  else deck.slides=deck.slides.map(x=>x.id===s.id?s:x);
}
// Copied objects keep their motion: the rules of the source CSS (master + slide) that animate them (animation and
// transition, and the hidden state of a data-step reveal, which must beat the copied inline look) are rewritten for a
// class put on each copied element, with @media/@supports kept and the keyframes they use renamed, so they also play
// on a slide or presentation without the source CSS. Rules that target a copied element only in another state (a class
// that the slide's script or the player adds, such as .on or .active) go as they are, with !important to beat the copied
// inline look. pairs: source element → its copy.
function motionCss(css:string,pairs:[Element,HTMLElement][]){
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
function Icon({name}:{name:string}){return <svg className="ui-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[name]||icons.file}</svg>;}
function Button({icon,children,...props}:{icon?:string;children?:React.ReactNode}&React.ButtonHTMLAttributes<HTMLButtonElement>){return <button {...props}>{icon&&<Icon name={icon}/>}{children!==undefined&&<span>{children}</span>}</button>;}
// Shortcuts are written the macOS way (⇧⌘S); elsewhere ⌘ becomes Ctrl. Tooltips show name and shortcut.
const mac=/Mac/.test(navigator.platform),windows=/Win/.test(navigator.platform);
const keyLabel=(k:string)=>mac?k:[k.includes('⌘')&&'Ctrl',k.includes('⇧')&&'Shift',k.includes('⌥')&&'Alt',k.replace(/[⌘⇧⌥]/g,'')].filter(Boolean).join('+');
const ariaKeys=(k:string)=>[k.includes('⌥')&&'Alt',k.includes('⇧')&&'Shift',k.includes('⌘')&&(mac?'Meta':'Control'),({'↩':'Enter','⌫':'Backspace','+':'Plus','−':'Minus'} as Record<string,string>)[k.replace(/[⌘⇧⌥]/g,'')]||k.replace(/[⌘⇧⌥]/g,'')].filter(Boolean).join('+');
function IconButton({icon,label,keys,...props}:{icon:string;label:string;keys?:string}&React.ButtonHTMLAttributes<HTMLButtonElement>){return <Button icon={icon} data-tip={keys?`${label} (${keyLabel(keys)})`:label} aria-label={label} aria-keyshortcuts={keys&&ariaKeys(keys)} {...props}/>;}
// Tooltips of the toolbar icons ([data-tip]), drawn by the app: the native title is slow and never shows on disabled buttons.
function Tips(){
  const [tip,setTip]=useState<{text:string;x:number;y:number;above:boolean}|null>(null),ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{let timer=0,current:Element|null=null;
    const hide=()=>{clearTimeout(timer);current=null;setTip(null);},
      over=(e:PointerEvent)=>{const el=(e.target as Element|null)?.closest?.('[data-tip]')||null;if(el===current)return;hide();if(!el)return;current=el;
        timer=setTimeout(()=>{if(!el.isConnected)return;const r=el.getBoundingClientRect(),above=r.bottom+40>innerHeight;setTip({text:el.getAttribute('data-tip')||'',x:r.left+r.width/2,y:above?r.top-6:r.bottom+6,above});},350) as any;},
      out=(e:PointerEvent)=>{if(current&&!(e.relatedTarget instanceof Node&&current.contains(e.relatedTarget)))hide();};
    document.addEventListener('pointerover',over);document.addEventListener('pointerout',out);document.addEventListener('pointerdown',hide,true);document.addEventListener('keydown',hide,true);document.addEventListener('scroll',hide,true);addEventListener('blur',hide);
    return()=>{hide();document.removeEventListener('pointerover',over);document.removeEventListener('pointerout',out);document.removeEventListener('pointerdown',hide,true);document.removeEventListener('keydown',hide,true);document.removeEventListener('scroll',hide,true);removeEventListener('blur',hide);};},[]);
  useLayoutEffect(()=>{const el=ref.current;if(el&&tip)el.style.left=Math.max(8,Math.min(innerWidth-el.offsetWidth-8,tip.x-el.offsetWidth/2))+'px';},[tip]);
  return tip&&<div ref={ref} className={'tip'+(tip.above?' above':'')} role="tooltip" style={{top:tip.y}}>{tip.text}</div>;
}
// Main-process errors reach the UI in English behind an IPC prefix; show known ones translated
// and keep the technical detail for the rest.
const knownErrors:[RegExp,string][]=[[/^Files changed outside/,'eChanged'],[/^Project is busy/,'eBusy'],[/^Unsupported ESF version/,'eVersion'],[/^A request is already running/,'eAIRunning'],[/^An export is already running/,'eExportRunning'],[/^Symbolic links/,'eSymlink'],[/^Path outside project/,'eOutside'],[/^Unsupported HTML/,'eHtml'],[/^External styles/,'eExternalCss'],[/^A presentation needs/,'eSlides'],[/^Resource exceeds/,'eResourceSize'],[/^Unsupported resource/,'eResourceType'],[/^Choose an \.ESF/,'eChooseEsf'],[/^This file is not a valid ESF package/,'eInvalidPackage'],[/^The \.ESF file was moved/,'eMissing'],[/^This file is open in another tab/,'eFileOpen'],[/ENOENT|spawn .* ENOENT/,'eCliMissing']];
function errorText(t:T,e:any){
  const message=String(e?.message||e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
  if(/references a resource that is not embedded/.test(message))return t('eNotEmbedded')+'\n\n'+message;
  if(/^(The package (has more|exceeds)|A file in the package exceeds|The presentation exceeds|A file exceeds)/.test(message))return t('ePackageLimit')+'\n\n'+message;
  if(/in (a )?package|^(Encrypted|Multi-part|Unsupported compression)/.test(message))return t('eInvalidPackage')+'\n\n'+message;
  const known=knownErrors.find(([re])=>re.test(message));return known?t(known[1] as any):message;
}
const toolLabels:Record<string,any>={Read:'actRead',Glob:'actGlob',Grep:'actGrep',Bash:'actBash',Write:'actWrite',Edit:'actEdit',NotebookEdit:'actNotebook',WebSearch:'actWebSearch',WebFetch:'actWebFetch',Task:'actTask',Agent:'actTask',mcp__edukors__screenshot:'actScreenshot',mcp__edukors__download:'actDownload'};
function activityText(t:T,m:Chat){
  const d=m.detail?': '+m.detail:'';
  switch(m.kind){
    case'launch':return t('actLaunch');case'continue':return t('actContinue');case'start':case'resume':return t(m.kind==='start'?'actStart':'actResume')+(m.detail?' · '+m.detail:'');case'thinking':return t('actThinking');
    case'tool':{const key=toolLabels[m.tool||''];return(key?t(key):m.tool||'')+d;}
    case'writing':return t('actWriting');case'retry':return t('actRetry')+(m.detail?' ('+m.detail+')':'');
    case'validating':return t('actValidating');case'fixing':return t('actFixing');default:return m.kind||'';
  }
}
const compact=(n:number|undefined,language:Language)=>n===undefined?'–':new Intl.NumberFormat(language,{notation:'compact',maximumFractionDigits:1}).format(n);
const effortLabel=(t:T,e?:string)=>t((e?'effort_'+e:'effortDefault') as any);
// How full the session's context is, from the last request (kept with the conversation).
function ContextRing({t,total,language}:{t:T;total?:Total;language:Language}){
  const known=!!total?.context&&!!total?.window,p=known?Math.min(100,Math.round(total!.context!/total!.window!*100)):0,r=7,c=2*Math.PI*r;
  const label=known?t('contextHelp').replace('{p}',String(p)).replace('{u}',compact(total!.context,language)).replace('{w}',compact(total!.window,language)):t('contextUnknown');
  return<span className={'context-ring'+(p>=80?' high':'')} role="img" aria-label={t('context')+': '+label} title={label}><svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r={r} className="track"/>{known&&<circle cx="9" cy="9" r={r} className="fill" strokeDasharray={`${c*p/100} ${c}`} transform="rotate(-90 9 9)"/>}</svg></span>;
}
// Questions the agent asks: options toggle (one per question unless multiSelect); the composer still takes a free answer.
function Questions({t,questions,answered,onAnswer}:{t:T;questions:Question[];answered:boolean;onAnswer:(text:string)=>void}){
  const [picked,setPicked]=useState<string[][]>(()=>questions.map(()=>[]));
  const toggle=(qi:number,o:string)=>setPicked(p=>p.map((v,i)=>i!==qi?v:questions[qi].multiSelect?(v.includes(o)?v.filter(x=>x!==o):[...v,o]):(v[0]===o?[]:[o])));
  return<div className="questions">{questions.map((q,qi)=><fieldset key={qi} disabled={answered}><legend>{q.question}</legend><div className="question-options">{q.options.map(o=><button key={o} type="button" className={picked[qi]?.includes(o)?'selected':''} aria-pressed={picked[qi]?.includes(o)} onClick={()=>toggle(qi,o)}>{o}</button>)}</div></fieldset>)}
    {answered?<small className="answered">{t('answered')}</small>:<Button className="primary" disabled={!picked.some(p=>p.length)} onClick={()=>onAnswer(questions.map((q,i)=>picked[i].length?`${q.question}\n→ ${picked[i].join('; ')}`:'').filter(Boolean).join('\n\n'))}>{t('sendAnswers')}</Button>}</div>;
}
// A custom template's name, renamed in place (Enter saves, Esc cancels), and its delete button.
function TemplateRow({t,template,onChange,run}:{t:T;template:Template;onChange:(list:Template[])=>void;run:(fn:()=>Promise<unknown>)=>unknown}){
  const [editing,setEditing]=useState(false),[name,setName]=useState(template.title);
  const save=()=>{setEditing(false);if(name.trim()&&name.trim()!==template.title)void run(async()=>onChange(await api.invoke('renameTemplate',template.id,name)));else setName(template.title);};
  return<div className="template-row">{editing?<input autoFocus aria-label={t('renameTemplate')} value={name} onChange={e=>setName(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape'){e.stopPropagation();setName(template.title);setEditing(false);}}}/>:<strong title={template.title}>{template.title}</strong>}
    {!editing&&<IconButton icon="text" label={t('renameTemplate')} onClick={()=>{setName(template.title);setEditing(true);}}/>}<IconButton icon="trash" label={t('deleteTemplate')} onClick={()=>{if(confirm(t('deleteTemplateConfirm')))void run(async()=>{const list=await api.invoke('deleteTemplate',template.id);templatePreviews.delete(template.id);onChange(list);});}}/></div>;
}
function SessionBar({t,agent,limits,language,usage,live}:{t:T;agent?:string;limits?:SessionLimits;language:Language;usage?:Usage;live?:number}){
  const time=(ms:number)=>new Date(ms).toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit'});
  const expired=limits?.resetsAt!==undefined&&limits.resetsAt*1000<Date.now();
  const used=limits&&!expired?Math.max(0,Math.min(1,limits.utilization)):undefined,pct=used===undefined?undefined:Math.round(used*100);
  return <footer className="usage" title={t('limitsHelp')}>
    <div className="usage-head"><span>{agent||t('selectAccount')}</span><b>{pct===undefined?t('unavailable'):pct+'%'}</b></div>
    <div className="usage-bar" role="meter" aria-label={t('sessionUsed')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{width:(pct??0)+'%'}}/></div>
    <small>{expired?t('windowReset'):<>{t('nextWindow')}: <span><b>{limits?.resetsAt?time(limits.resetsAt*1000):t('unavailable')}</b>{limits&&<> · {t('limitsUpdated')} {time(limits.updated)}</>}</span></>}</small>
    {usage&&live===undefined&&<small className="usage-tokens" title={t('tokensHelp')}>{t('lastRequest')}: <b>↑{compact(usage.input,language)} ↓{compact(usage.output,language)}</b></small>}
  </footer>;
}
let previewGeneration=0;
// Fields where keys type text; toolbar checkboxes or buttons do not keep Delete and the canvas focus from working.
const typingField='textarea,select,[contenteditable],[contenteditable] *,input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=button])';
// Rail thumbnails mount their frame only once scrolled near the viewport (large decks).
function LazyPreview(props:{deck:Deck;slide:Slide}){
  const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{if(visible||!ref.current)return;const o=new IntersectionObserver(e=>{if(e.some(x=>x.isIntersecting)){setVisible(true);o.disconnect();}},{rootMargin:'600px 0px'});o.observe(ref.current);return()=>o.disconnect();},[visible]);
  return visible?<Preview {...props}/>:<div ref={ref} className="preview"/>;
}
// A custom template's card shows its first slide (loaded once per template and kept while the app runs).
const templatePreviews=new Map<string,Promise<Deck>>();
function TemplatePreview({id}:{id:string}){
  const [deck,setDeck]=useState<Deck|null>(null);
  useEffect(()=>{let live=true;let p=templatePreviews.get(id);if(!p){p=api.invoke('templatePreview',id) as Promise<Deck>;templatePreviews.set(id,p);p.catch(()=>templatePreviews.delete(id));}
    p.then(d=>{if(live)setDeck(d);},()=>{});return()=>{live=false;};},[id]);
  return deck?.slides[0]?<LazyPreview deck={deck} slide={deck.slides[0]}/>:<div className="preview"/>;
}
// The editor canvas renders in edit mode: the frame selects, edits and drags elements (editRuntime) and reports operations.
type CharRange={start:number;end:number};
type CanvasEdit={select:()=>{indices:number[];editing:boolean;range?:CharRange|null};onState:(indices:number[],editing:boolean,details?:SelectionDetails)=>void;onRange:(start:number,end:number)=>void;onOps:(ops:EditOp[],indices:number[],editing:boolean,range?:CharRange|null)=>void;onCrop:(active:boolean)=>void;onContext:(x:number,y:number,text:boolean)=>void;onPress:()=>void};
const previewKey=(deck:Deck,slide:Slide,editing:boolean)=>{const master=slide.layoutId?masterOf(deck,slide):activeMaster(deck);return[deck.id,slide.id,slide.layoutId,slide.html,slide.css,slide.script,slide.staticHtml,JSON.stringify(slide.poll),master.css,master.html,deck.layouts.find(l=>l.id===slide.layoutId)?.css||'',deck.assets.length,document.documentElement.lang,editing].join('\u0000');};
function Preview({deck,slide,className='',edit,frameRef}:{deck:Deck;slide:Slide;className?:string;edit?:CanvasEdit;frameRef?:React.RefObject<HTMLIFrameElement|null>}){
  // Assets are content-addressed, so their count is enough to detect changes in the key.
  const key=previewKey(deck,slide,!!edit);
  const editRef=useRef(edit),frame=useRef<HTMLIFrameElement|null>(null);editRef.current=edit;
  const source=useRef({deck,slide});source.current={deck,slide};
  // Geometry commits already exist in the live DOM. Preserve that document and its pointer capture;
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
    if(m.type==='context'&&Number.isFinite(m.x)&&Number.isFinite(m.y))x.onContext(m.x,m.y,!!m.text);
    if(m.type==='range'&&Number.isInteger(m.start)&&Number.isInteger(m.end))x.onRange(m.start,m.end);
    if(m.type==='ops'&&Array.isArray(m.ops)){
      const ops:EditOp[]=m.ops.slice(0,1000).map(cleanOp).filter((op:EditOp|null):op is EditOp=>!!op);
      if(ops.length&&ops.length===m.ops.length&&ops.every(op=>op.type==='move'||op.type==='resize'||op.type==='crop')){
        const before=local.current?.slide||source.current.slide,next=applyEdits(before,ops),expected=previewKey(source.current.deck,next,true);
        if(expected!==previewKey(source.current.deck,before,true))local.current={slide:next,keys:[...(local.current?.keys||[]),expected],doc:documentRef.current};
      }else local.current=null;
      x.onOps(ops,indices,editing,Number.isInteger(m.range?.start)&&Number.isInteger(m.range?.end)?{start:m.range.start,end:m.range.end}:null);
    }};
    addEventListener('message',listen);return()=>removeEventListener('message',listen);},[!!edit]);
  return <iframe key={generation} ref={node=>{frame.current=node;if(frameRef)frameRef.current=node;}} className={'preview '+className+(edit?' editable':'')} title={slide.title} sandbox="allow-scripts" src="esf-frame://preview/" tabIndex={-1}
    // A frame moved in the DOM (reordering) reloads its shell, so the document is posted on every load;
    // after the shell writes it, the shell's listener is gone and later posts are ignored.
    // After a canvas edit the frame reloads; it takes the keyboard back so Delete never reaches the slide list.
    onLoad={e=>{e.currentTarget.contentWindow?.postMessage({app:'esf-shell',html:doc},'*');if(edit?.select().indices.length&&!(document.activeElement as Element|null)?.matches(typingField+',.hidden-color'))e.currentTarget.focus();}}/>;
}
// The window toolbar never wraps: groups that do not fit, from the right, move into the "More" (…) menu.
type ToolGroup={id:string;label:string;width:number;fixed?:boolean;node:React.ReactNode};
function Toolbar({t,groups,tail}:{t:T;groups:ToolGroup[];tail:React.ReactNode}){
  const ref=useRef<HTMLDivElement>(null),more=useRef<HTMLDivElement>(null),[space,setSpace]=useState(Infinity),[open,setOpen]=useState(false);
  useLayoutEffect(()=>{const el=ref.current;if(!el)return;const o=new ResizeObserver(()=>setSpace(el.clientWidth));o.observe(el);setSpace(el.clientWidth);return()=>o.disconnect();},[]);
  useEffect(()=>{if(!open)return;const down=(e:PointerEvent)=>{if(!more.current?.contains(e.target as Node))setOpen(false);},key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',down);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('keydown',key);};},[open]);
  const sep=13,need=(list:ToolGroup[])=>list.reduce((a,g)=>a+g.width+sep,32),hidden=new Set<string>();
  if(need(groups)>space)for(const g of [...groups].reverse()){if(g.fixed)continue;hidden.add(g.id);if(need(groups.filter(x=>!hidden.has(x.id)))+32+sep<=space)break;}
  if(!hidden.size&&open)setOpen(false);
  const group=(g:ToolGroup)=><div className="tool-group" role="group" aria-label={g.label}>{g.node}</div>;
  return <div className="toolbar" role="toolbar" aria-label={t('presentation')} ref={ref}>
    {groups.filter(g=>!hidden.has(g.id)).map(g=><React.Fragment key={g.id}>{group(g)}<span className="separator"/></React.Fragment>)}
    {hidden.size>0&&<><div className="tool-more" ref={more}><IconButton icon="more" label={t('moreTools')} aria-haspopup="true" aria-expanded={open} className={open?'active':undefined} onClick={()=>setOpen(x=>!x)}/>
      {open&&<div className="more-pop">{groups.filter(g=>hidden.has(g.id)).map(g=><React.Fragment key={g.id}>{group(g)}</React.Fragment>)}</div>}</div><span className="separator"/></>}
    <div className="tool-group">{tail}</div>
  </div>;
}
function Modal({title,onClose,children,wide=false,sheet=false,small=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean;sheet?:boolean;small?:boolean}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const old=document.activeElement as HTMLElement;ref.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const all=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,[tabindex="0"]');if(!all?.length)return;const first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);old?.focus();};},[]);
  return <div className="modal-shade"><div ref={ref} className={'modal'+(wide?' wide':'')+(sheet?' sheet':'')+(small?' small':'')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><header><h2>{title}</h2><IconButton icon="close" label={sheet?translator(document.documentElement.lang as Language)('close'):'×'} onClick={onClose}/></header>{children}</div></div>;
}
// Dropdown of the format bar made of buttons that never take the focus (a native select or color input would end the
// text edit in the canvas frame and hide its selection).
type PickOption={value:string;label:React.ReactNode;title?:string;tip?:string;style?:React.CSSProperties};
// With an icon, the trigger is a toolbar icon button (no value, no chevron).
function Pick({label,value,options,onPick,wide=false,grid=false,extra,icon}:{label:string;value?:React.ReactNode;options:PickOption[];onPick:(value:string)=>void;wide?:boolean;grid?:boolean;extra?:(close:()=>void)=>React.ReactNode;icon?:string}){
  const [open,setOpen]=useState(false),ref=useRef<HTMLDivElement>(null),close=()=>setOpen(false);
  useEffect(()=>{if(!open)return;const down=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))close();},key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
    document.addEventListener('pointerdown',down);document.addEventListener('keydown',key);addEventListener('blur',close);return()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('keydown',key);removeEventListener('blur',close);};},[open]);
  const keep=(e:React.MouseEvent)=>e.preventDefault();
  return <div className="pick" ref={ref}><button type="button" className={icon?(open?'icon active':'icon'):'pick-button'+(wide?' wide':'')} data-tip={label} aria-label={label} aria-haspopup="listbox" aria-expanded={open} onMouseDown={keep} onClick={()=>setOpen(x=>!x)}>{icon?<Icon name={icon}/>:<><span>{value}</span><Icon name="chevron"/></>}</button>
    {open&&<div className={'pick-menu'+(grid?' grid':'')} role="listbox" aria-label={label}>{options.map(o=><button type="button" role="option" aria-selected={false} key={o.value} aria-label={o.title} data-tip={o.tip||o.title} style={o.style} onMouseDown={keep} onClick={()=>{onPick(o.value);close();}}>{o.label}</button>)}{extra?.(close)}</div>}</div>;
}
// Preview of a shape type (shape picker and format bar).
function ShapeIcon({type}:{type:string}){return <svg className="ui-icon" width="18" height="18" viewBox="-6 -6 112 112" fill="none" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" aria-hidden="true">{type==='ellipse'?<ellipse cx="50" cy="50" rx="50" ry="50"/>:shapePaths[type]?<path d={shapePaths[type]}/>:<rect y="15" width="100" height="70" rx={type==='rounded'?18:0}/>}</svg>;}
// Palette plus the system color panel ("More colors…"), whose intermediate colors are ignored until it rests.
// The color code can also be typed (#rgb or #rrggbb, Enter applies); for text colors, onMore keeps the edit in the frame meanwhile.
function ColorPick({t,label,value,onPick,more,onMore,none}:{t:T;label:string;value:string;onPick:(value:string)=>void;more:string;onMore?:()=>void;none?:string}){
  const input=useRef<HTMLInputElement>(null),timer=useRef(0),[typed,setTyped]=useState<string|null>(null),chip=(c:string)=><span className={'color-chip'+(c==='transparent'?' none':'')} style={c==='transparent'?undefined:{background:c}}/>;
  const current=/^#[\da-f]{6}$/i.test(value)?value.toUpperCase():'',code=typed??current,valid=hexColor(code);
  return <><Pick label={label} grid value={chip(value)} options={[...(none?[['transparent',none] as const]:[]),...textColors.map(([c,k])=>[c,t(k)] as const)].map(([c,name])=>({value:c,label:chip(c),title:name,tip:c==='transparent'?name:`${name} (${c.toUpperCase()})`}))} onPick={v=>{setTyped(null);onPick(v);}}
    extra={close=><><form className="pick-hex" onSubmit={e=>{e.preventDefault();if(valid){setTyped(null);onPick(valid);close();}}}>{chip(valid||'transparent')}<input type="text" aria-label={t('hexColor')} data-tip={t('hexColor')} placeholder="#RRGGBB" maxLength={7} spellCheck={false} autoComplete="off" value={code} aria-invalid={!!code&&!valid} onFocus={onMore} onChange={e=>setTyped(e.target.value)}/><IconButton icon="check" label={t('applyColor')} type="submit" disabled={!valid} onMouseDown={e=>e.preventDefault()}/></form><button type="button" className="pick-more" onMouseDown={e=>e.preventDefault()} onClick={()=>{close();onMore?.();const i=input.current;if(i){i.value=/^#[\da-f]{6}$/i.test(value)?value:'#172033';try{i.showPicker();}catch{i.click();}}}}>{more}</button></>}/>
    <input ref={input} className="hidden-color" type="color" tabIndex={-1} aria-hidden="true" onChange={e=>{clearTimeout(timer.current);const v=e.target.value;timer.current=setTimeout(()=>onPick(v),250) as any;}}/></>;
}
// Right click on canvas objects: stacking order, and for text the horizontal and vertical alignment. Its buttons keep the
// focus in the frame, like the format bar.
function CanvasMenu({x,y,text,t,onClose,onCommand}:{x:number;y:number;text:boolean;t:(key:any)=>string;onClose:()=>void;onCommand:(c:object)=>void}){
  const ref=useRef<HTMLDivElement>(null),[at,setAt]=useState({left:x,top:y});
  useLayoutEffect(()=>{const r=ref.current?.getBoundingClientRect();if(r)setAt({left:Math.max(4,Math.min(x,innerWidth-r.width-4)),top:Math.max(4,Math.min(y,innerHeight-r.height-4))});},[x,y,text]);
  useEffect(()=>{const down=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))onClose();},key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
    document.addEventListener('pointerdown',down,true);document.addEventListener('keydown',key);addEventListener('resize',onClose);
    return()=>{document.removeEventListener('pointerdown',down,true);document.removeEventListener('keydown',key);removeEventListener('resize',onClose);};},[]);
  const item=(label:string,c:object)=><button type="button" role="menuitem" onMouseDown={e=>e.preventDefault()} onClick={()=>onCommand(c)}>{t(label)}</button>;
  return <div ref={ref} className="canvas-menu" role="menu" style={at}>
    {item('bringFront',{type:'order',value:'front'})}{item('sendBack',{type:'order',value:'back'})}
    {text&&<><hr/>{item('alignRight',{type:'align',axis:'x',value:'end'})}{item('alignCenter',{type:'align',axis:'x',value:'center'})}{item('alignLeft',{type:'align',axis:'x',value:'start'})}
      <hr/>{item('alignTop',{type:'align',axis:'y',value:'start'})}{item('alignMiddle',{type:'align',axis:'y',value:'center'})}{item('alignBottom',{type:'align',axis:'y',value:'end'})}</>}
  </div>;
}
// New slide or change of layout: thumbnails of every layout; double click (or Enter) or the button picks.
function LayoutPicker({t,deck,mode,initial,onPick,onClose}:{t:T;deck:Deck;mode:'insert'|'change';initial:string;onPick:(layoutId:string)=>void;onClose:()=>void}){
  const [picked,setPicked]=useState(initial);
  return <Modal sheet title={t(mode==='insert'?'newSlide':'changeLayout')} onClose={onClose}><div className="layout-pick">
    <div className="template-grid">{deck.layouts.map(l=><button key={l.id} className={'template-card '+(picked===l.id?'selected':'')} onClick={()=>setPicked(l.id)} onDoubleClick={()=>onPick(l.id)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onPick(l.id);}}}><div className="template-art"><LazyPreview deck={deck} slide={masterSlide(deck,'l:'+l.id)}/>{picked===l.id&&<span className="template-check"><Icon name="check"/></span>}</div><strong title={l.name}>{l.name}</strong></button>)}</div>
  </div><footer className="modal-actions"><Button onClick={onClose}>{t('cancel')}</Button><Button className="primary" disabled={!picked} onClick={()=>onPick(picked)}>{t(mode==='insert'?'insert':'apply')}</Button></footer></Modal>;
}
// Basic colors of the palettes, with their names in the tooltips.
const textColors=[['#ffffff','colorWhite'],['#000000','colorBlack'],['#808080','colorGray'],['#d9d9d9','colorLightGray'],['#172033','colorNavy'],['#ff0000','colorRed'],['#ffa500','colorOrange'],['#ffff00','colorYellow'],['#00b050','colorGreen'],['#0070c0','colorBlue'],['#00b0f0','colorLightBlue'],['#7030a0','colorPurple'],['#ff4fa3','colorPink'],['#8b4513','colorBrown'],['#00838f','colorTeal']] as const;
const hexColor=(v:string)=>{const m=v.trim().replace(/^#/,'').match(/^([\da-f]{3}|[\da-f]{6})$/i);return m?'#'+(m[1].length===3?[...m[1]].map(c=>c+c).join(''):m[1]).toLowerCase():null;};
function App(){
  const [prefs,setPrefs]=useState<Preferences>({language:'pt',profiles:[],recent:[],activeProfile:''});
  const [tabs,setTabs]=useState<Tab[]>([]),[active,setActive]=useState(''),[screen,setScreen]=useState<'editor'|'empty'|'new'|'recent'|'settings'>('empty');
  const [settingsTab,setSettingsTab]=useState('general'),[promptTab,setPromptTab]=useState<'global'|'deck'>('global'),[aiOpen,setAiOpen]=useState(true),[templates,setTemplates]=useState<Template[]>([]);
  const [selectedTemplate,setSelectedTemplate]=useState('blank'),[name,setName]=useState(''),[search,setSearch]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[update,setUpdate]=useState(''),[loading,setLoading]=useState(false),[booted,setBooted]=useState(false);
  const [exportOpen,setExportOpen]=useState(false),[format,setFormat]=useState('html'),[exportResult,setExportResult]=useState(''),[exporting,setExporting]=useState(false);
  const [pollTarget,setPollTarget]=useState<{deck:string;slide:string;poll?:PollConfig}|null>(null);
  const [layoutPick,setLayoutPick]=useState<'insert'|'change'|null>(null),[renaming,setRenaming]=useState<string|null>(null),[templateName,setTemplateName]=useState<string|null>(null),[masterView,setMasterView]=useState<string|null>(null),[closeRequest,setCloseRequest]=useState<{ids:string[];quit:boolean}|null>(null),[zoom,setZoom]=useState(100);
  const editorFrame=useRef<HTMLIFrameElement|null>(null),[manualSelection,setManualSelection]=useState<{slide:string;index:number;details?:SelectionDetails}|null>(null);
  const canvasRange=useRef<{start:number;end:number}|null>(null),[imageSel,setImageSel]=useState(false),[cropOn,setCropOn]=useState(false),[contextMenu,setContextMenu]=useState<{x:number;y:number;text:boolean}|null>(null);
  // Selection mode: the last area clicked (slide list or canvas) owns Delete, copy/cut and ⌘D, whatever has the keyboard focus.
  const [selMode,setSelModeState]=useState<'slides'|'canvas'>('canvas'),selModeRef=useRef(selMode);
  const setSelMode=(mode:'slides'|'canvas')=>{selModeRef.current=mode;setSelModeState(mode);};
  const [providerStatus,setProviderStatus]=useState<Record<string,ProviderStatus>>({}),[limits,setLimits]=useState<Record<string,SessionLimits>>({});
  const chatRef=useRef<HTMLDivElement>(null),chatStick=useRef(true),[sessionsOpen,setSessionsOpen]=useState(false),[sessionQuery,setSessionQuery]=useState(''),[modelOpen,setModelOpen]=useState(false),modelRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!modelOpen)return;const down=(e:PointerEvent)=>{if(!modelRef.current?.contains(e.target as Node))setModelOpen(false);},key=(e:KeyboardEvent)=>{if(e.key==='Escape')setModelOpen(false);};document.addEventListener('pointerdown',down);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('keydown',key);};},[modelOpen]);
  // Ticks the elapsed time while a request runs.
  const [,setTick]=useState(0),anyBusy=tabs.some(x=>x.busy);
  // Usage is re-read every 30 s; this also re-renders the bar so an elapsed window shows as renewed.
  useEffect(()=>{const timer=setInterval(()=>void api.invoke('limits').then(l=>setLimits({...l})).catch(()=>{}),30000);void api.invoke('limits').then(l=>setLimits({...l})).catch(()=>{});return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!anyBusy)return;const timer=setInterval(()=>setTick(n=>n+1),1000);return()=>clearInterval(timer);},[anyBusy]);
  // Sidebar width is a per-viewer convenience; storage may be unavailable.
  // The old default width (314) was stored on every start, so it counts as never chosen.
  const stored=(key:string,min:number,max:number,fallback:number,old?:number)=>{try{const v=Number(localStorage.getItem(key));return v>=min&&v<=max&&v!==old?v:fallback;}catch{return fallback;}};
  const [aiWidth,setAiWidth]=useState(()=>stored('esf-ai-width',300,900,360,314)),[railWidth,setRailWidth]=useState(()=>stored('esf-rail-width',236,360,236));
  const [railOpen,setRailOpen]=useState(()=>{try{return localStorage.getItem('esf-rail-open')!=='0';}catch{return true;}});
  useEffect(()=>{try{localStorage.setItem('esf-ai-width',String(aiWidth));localStorage.setItem('esf-rail-width',String(railWidth));localStorage.setItem('esf-rail-open',railOpen?'1':'0');}catch{}},[aiWidth,railWidth,railOpen]);
  // Below 1200 px the slide list shows only small thumbnails.
  // Side panels resize from their inner edge; the assistant never takes the canvas below 560 px.
  function resizePanel(e:React.PointerEvent,side:'ai'|'rail'){
    e.preventDefault();const startX=e.clientX,start=side==='ai'?aiWidth:railWidth,el=e.currentTarget,set=side==='ai'?setAiWidth:setRailWidth;el.setPointerCapture(e.pointerId);
    const [min,max]=side==='ai'?[300,()=>Math.max(300,Math.min(900,innerWidth-560))]:[236,()=>360];
    const moveAt=(ev:PointerEvent)=>set(Math.round(Math.max(min,Math.min(max(),start+(side==='ai'?startX-ev.clientX:ev.clientX-startX)))));
    const up=()=>{el.removeEventListener('pointermove',moveAt as any);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);};
    el.addEventListener('pointermove',moveAt as any);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  }
  const t=translator(prefs.language), tab=tabs.find(x=>x.project.deck.id===active),deck=tab?.project.deck,slide=deck?.slides.find(s=>s.id===tab?.selected[0])||deck?.slides[0];
  // The canvas edits the selected slide or, in the slide master view, the master or a layout.
  const masterItem=deck&&masterView?(masterItems(deck).includes(masterView)?masterView:'m:'+deck.masters[0].id):null;
  const masterTab=masterItem?.startsWith('m:')?'bases':'layouts',visibleMasterItems=deck?masterItems(deck).filter(item=>item.startsWith(masterTab==='bases'?'m:':'l:')):[];
  const editSlide=deck&&masterItem?masterSlide(deck,masterItem):slide,canvasDeck=deck&&masterItem?masterDeck(deck,masterItem):deck;
  // Settings, and the home screens while a presentation is open, are modals over the editor.
  // Without a presentation the workspace is empty; New/Recent always open as a modal (File menu).
  const homeScreen=screen==='new'||screen==='recent',inEditor=!!tab;
  const closeOverlay=()=>setScreen(tabsRef.current.length?'editor':'empty');
  const tabsRef=useRef(tabs),activeRef=useRef(active),prefsRef=useRef(prefs);tabsRef.current=tabs;activeRef.current=active;prefsRef.current=prefs;
  const commandRef=useRef<(command:string)=>void>(()=>{}),savedChats=useRef(new Map<string,string>());
  const addProject=(p:Project)=>{
    p={...p,deck:syncLayouts(null,p.deck)};
    setTabs(old=>p.path&&old.some(x=>x.project.path===p.path)?old: [...old,{project:p,dirty:!!p.recovered,selected:[p.deck.slides[0].id],past:[],future:[],chat:[],prompt:'',attachments:[],busy:false,version:0,aiVersion:0,profile:prefsRef.current.activeProfile,conversation:uid('c'),history:[]}]);
    const existing=p.path?tabsRef.current.find(x=>x.project.path===p.path):undefined;setActive(existing?.project.deck.id||p.deck.id);setScreen('editor');if(p.recovered)setNotice(t('recovered'));
    if(!existing)void api.invoke('conversationLoad',p.deck.id).then(c=>{
      if(!c)return;savedChats.current.set(p.deck.id,JSON.stringify(c));
      const list:Conversation[]=(Array.isArray(c.sessions)?c.sessions:[])
        .filter((v:any)=>v&&typeof v.id==='string').map((v:any)=>({id:v.id,title:String(v.title||''),updated:String(v.updated||''),chat:cleanChat(v.chat),total:v.total,profile:String(v.profile||'')}));
      const current=list.find(v=>v.id===c.active)||list[0];
      setTabs(old=>old.map(x=>{if(x.project.deck.id!==p.deck.id||x.chat.length)return x;const next={...x,history:list,...(current?{conversation:current.id,chat:current.chat,total:current.total}:{})};savedChats.current.set(p.deck.id,JSON.stringify({active:next.conversation,sessions:snapshot(next)}));return next;}));
    }).catch(()=>{});
  };
  const run=async(fn:()=>Promise<any>)=>{try{return await fn();}catch(e:any){setError(errorText(t,e));return null;}};
  const refreshTemplates=async()=>setTemplates(await api.invoke('templates'));
  useEffect(()=>{if(screen==='new')refreshTemplates().catch(()=>{});},[screen]);
  useEffect(()=>{
    void run(async()=>{const data=await api.invoke('bootstrap');setPrefs(data.preferences);prefsRef.current=data.preferences;setTemplates(data.templates);setLimits(data.limits||{});data.projects.forEach(addProject);setBooted(true);});
    const a=api.subscribe('open-project',addProject),b=api.subscribe('command',c=>commandRef.current(c)),c=api.subscribe('ai-event',(e:AIEvent)=>{
      if(e.type==='limits'){if(e.profileId&&e.limits)setLimits(l=>({...l,[e.profileId!]:e.limits!}));return;}
      setTabs(old=>old.map(x=>{
        if(x.project.deck.id!==e.projectId)return x;
        if(e.type==='text'){const chat=[...x.chat];if(chat.at(-1)?.role==='assistant')chat[chat.length-1]={role:'assistant',agent:prefsRef.current.profiles.find(p=>p.id===x.profile)?.name||translator(prefsRef.current.language)('assistant'),text:chat.at(-1)!.text+(e.text||'')};else chat.push({role:'assistant',agent:prefsRef.current.profiles.find(p=>p.id===x.profile)?.name||translator(prefsRef.current.language)('assistant'),text:e.text||''});return{...x,chat};}
        if(e.type==='status')return{...x,busy:e.text==='running',progress:undefined,tokens:undefined,started:e.text==='running'?x.started||Date.now():undefined};
        if(e.type==='activity')return{...x,progress:undefined,chat:[...x.chat,{role:'activity',text:'',kind:e.kind,tool:e.tool,detail:e.detail,body:e.body}]};
        if(e.type==='thought'){const chat=[...x.chat],i=chat.map(m=>m.role).lastIndexOf('activity');if(i<0||chat[i].kind!=='thinking')return x;chat[i]={...chat[i],body:((chat[i].body||'')+(e.text||'')).slice(0,20000)};return{...x,chat};}
        if(e.type==='progress')return{...x,progress:e.bytes??x.progress,tokens:e.tokens??x.tokens};
        if(e.type==='error')return{...x,busy:false,chat:[...x.chat,{role:'assistant',agent:prefsRef.current.profiles.find(p=>p.id===x.profile)?.name||translator(prefsRef.current.language)('assistant'),text:'⚠ '+errorText(translator(prefsRef.current.language),e.text)}]};
        if(e.type==='usage'){const t=x.total;return{...x,usage:{input:e.input,output:e.output,cache:e.cache},total:{input:addUsage(t?.input,e.input),output:addUsage(t?.output,e.output),cache:addUsage(t?.cache,e.cache),turns:(t?.turns||0)+1,updated:new Date().toISOString(),context:e.context??t?.context,window:e.window??t?.window}};}
        if(e.type==='done'){
          // The streamed text of this turn is replaced by the final message.
          const chat=[...x.chat],lastUser=chat.map(m=>m.role).lastIndexOf('user'),streamed=chat.map(m=>m.role).lastIndexOf('assistant');if(streamed>lastUser)chat.splice(streamed,1);chat.push({role:'assistant',agent:prefsRef.current.profiles.find(p=>p.id===x.profile)?.name||translator(prefsRef.current.language)('assistant'),text:e.text||(e.deck?translator(prefsRef.current.language)('changed'):''),questions:e.questions?.length?e.questions:undefined});
          if(!e.deck)return{...x,busy:false,chat};
          // Layouts the agent changed reach the slides that use them.
          const deck=syncLayouts(x.project.deck,e.deck);
          if(x.version!==x.aiVersion)return{...x,busy:false,proposal:deck,chat:[...chat,{role:'assistant',agent:prefsRef.current.profiles.find(p=>p.id===x.profile)?.name||translator(prefsRef.current.language)('assistant'),text:translator(prefsRef.current.language)('conflict')}]};
          return{...x,project:{...x.project,deck},dirty:true,version:x.version+1,past:[...x.past,x.project.deck].slice(-50),future:[],chat,busy:false,selected:[deck.slides.find(s=>s.id===x.selected[0])?.id||deck.slides[0].id]};
        }return x;
      }));
    });
    const d=api.subscribe('update',(v:string)=>setUpdate(v));
    return()=>{a();b();c();d();};
  },[]);
  // Keeps the selected slide visible in the rail when it changes (arrow keys, new or moved slides).
  const railRef=useRef<HTMLDivElement>(null);
  // Files dragged from the Finder must reach the workbench drop, not the editable canvas frame.
  useEffect(()=>{const on=(e:DragEvent)=>{if(e.dataTransfer?.types.includes('Files'))document.body.classList.add('file-drag');},off=(e:DragEvent)=>{if(e.type==='drop'||!e.relatedTarget)document.body.classList.remove('file-drag');};
    addEventListener('dragenter',on);addEventListener('dragleave',off);addEventListener('drop',off,true);return()=>{removeEventListener('dragenter',on);removeEventListener('dragleave',off);removeEventListener('drop',off,true);};},[]);
  // Canvas selection, kept across the frame reloads caused by each edit; editing = a text has the caret.
  const canvasSel=useRef({slide:'',indices:[] as number[],editing:false});
  // Deleting slides keeps the rail scroll where it was; the focus moves to the new selection so Delete can repeat.
  const railScroll=useRef<number|null>(null);
  useEffect(()=>{const rail=railRef.current;if(!rail)return;const item=rail.querySelector('.slide-item.selected');
    if(railScroll.current!==null){rail.scrollTop=railScroll.current;railScroll.current=null;const focus=document.activeElement;if(!focus||focus===document.body||rail.contains(focus))item?.querySelector('button')?.focus({preventScroll:true});return;}
    item?.scrollIntoView({block:'nearest'});},[tab?.selected[0],deck?.slides.indexOf(slide!),active,screen,masterItem]);
  // Follows the streaming answer unless the user scrolled up to read.
  useEffect(()=>{const el=chatRef.current;if(el&&chatStick.current)el.scrollTop=el.scrollHeight;},[tab?.chat,tab?.busy,aiOpen,active]);
  useEffect(()=>{document.documentElement.lang=prefs.language;},[prefs.language]);
  useEffect(()=>{void api.invoke('menuState',!!tab).catch(()=>{});},[!!tab]);
  useEffect(()=>setMasterView(null),[active]);
  useEffect(()=>{if(!booted)return;const timer=setTimeout(()=>{for(const x of tabs)if(x.dirty)void api.invoke('draft',x.project.deck).catch((e:Error)=>setNotice(e.message));},1200);return()=>clearTimeout(timer);},[tabs,booted]);
  // Conversations are saved in the presentation's working folder and go into the .ESF, so a changed one marks it modified.
  useEffect(()=>{if(!booted)return;const timer=setTimeout(()=>{for(const x of tabs){if(x.busy)continue;const data=JSON.stringify({active:x.conversation,sessions:snapshot(x)});if(savedChats.current.get(x.project.deck.id)===data||(!x.chat.length&&!x.history.length&&!savedChats.current.has(x.project.deck.id)))continue;savedChats.current.set(x.project.deck.id,data);updateTab(x.project.deck.id,t=>t.dirty?t:{...t,dirty:true});void api.invoke('conversationSave',x.project.deck.id,JSON.parse(data)).catch(()=>{});}},800);return()=>clearTimeout(timer);},[tabs,booted]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  const updateTab=(id:string,fn:(x:Tab)=>Tab)=>setTabs(old=>old.map(x=>x.project.deck.id===id?fn(x):x));
  // fn may return the selection to apply, for changes whose new slide IDs are only known inside it.
  const mutate=(fn:(d:Deck)=>string[]|void,selection?:string[])=>{
    if(!deck)return;
    updateTab(deck.id,x=>{let next=structuredClone(x.project.deck),selected=selection;
      try{selected=fn(next)||selected;next=syncLayouts(x.project.deck,next);validateDeck(next);}catch(e:any){setError(e.message);return x;}
      return{...x,project:{...x.project,deck:next},dirty:true,version:x.version+1,past:[...x.past,x.project.deck].slice(-50),future:[],selected:selected||x.selected.filter(id=>next.slides.some(s=>s.id===id))};});
  };
  // Typing in the presentation's system prompt is one undo step until something else changes the deck.
  const promptStep=useRef('');
  const setDeckPrompt=(text:string)=>{if(!deck)return;updateTab(deck.id,x=>{const step=x.project.deck.id+':'+x.version,next={...x.project.deck,systemPrompt:text||undefined};if(!text)delete next.systemPrompt;
    const past=promptStep.current===step?x.past:[...x.past,x.project.deck].slice(-50);promptStep.current=next.id+':'+(x.version+1);return{...x,project:{...x.project,deck:next},dirty:true,version:x.version+1,past,future:[]};});};
  async function saveTab(id=active,saveAs=false){
    const x=tabsRef.current.find(x=>x.project.deck.id===id);if(!x)return null;
    const p=await api.invoke(saveAs?'saveAs':'save',x.project.deck);if(!p)return null;
    setTabs(old=>old.map(item=>item.project.deck.id===id?{...item,project:item.version===x.version?p:{...p,deck:{...item.project.deck,id:p.deck.id,revision:p.deck.revision}},dirty:item.version!==x.version||!!p.pending}:item));
    if(id===activeRef.current)setActive(p.deck.id);return p;
  }
  function undo(redo=false){if(!tab)return;const list=redo?tab.future:tab.past;if(!list.length)return;const next=list.at(-1)!;updateTab(active,x=>({...x,project:{...x.project,deck:next},dirty:true,version:x.version+1,past:redo?[...x.past,x.project.deck]:x.past.slice(0,-1),future:redo?x.future.slice(0,-1):[...x.future,x.project.deck],selected:[next.slides.find(s=>!x.project.deck.slides.some(o=>o.id===s.id))?.id||next.slides.find(s=>s.id===x.selected[0])?.id||next.slides[0].id]}));}
  function addSlide(layoutId:string){if(!deck||!slide)return;const s=newSlide(layoutOf(deck,layoutId));mutate(d=>{d.slides.splice(d.slides.findIndex(x=>x.id===slide.id)+1,0,s);},[s.id]);setLayoutPick(null);}
  function changeLayout(layoutId:string){if(!deck||!tab)return;const layout=layoutOf(deck,layoutId);setLayoutPick(null);if(deck.slides.some(s=>tab.selected.includes(s.id)&&s.layoutId!==layoutId))mutate(d=>{d.slides=d.slides.map(s=>tab.selected.includes(s.id)&&s.layoutId!==layoutId?relayout(s,layout):s);});}
  // Slide master view: masters and layouts are added, renamed and deleted there; at least one of each remains. A new master
  // is only a new main slide (the layouts are shared); the user chooses which master is active.
  function addMasterItem(){if(!deck)return;const m=newMaster(`${t('masterName')} ${deck.masters.length+1}`);mutate(d=>{d.masters.push(m);});setMasterView('m:'+m.id);}
  function activateMaster(id:string){if(!deck||id===deck.activeMaster&&!deck.layouts.some(l=>l.masterId))return;mutate(d=>{d.activeMaster=id;d.layouts.forEach(l=>delete l.masterId);});}
  function addLayoutItem(){if(!deck)return;const l={id:uid('l'),name:`${t('layoutName')} ${deck.layouts.length+1}`,html:blankHtml};
    mutate(d=>{const at=d.layouts.findIndex(x=>'l:'+x.id===masterItem);d.layouts.splice(at<0?d.layouts.length:at+1,0,l);});setMasterView('l:'+l.id);}
  function renameItem(item:string,value:string){setRenaming(null);const name=value.trim().slice(0,200);if(!deck||!name||name===itemName(deck,item))return;
    mutate(d=>{d.masters=d.masters.map(m=>item==='m:'+m.id?{...m,name}:m);d.layouts=d.layouts.map(l=>item==='l:'+l.id?{...l,name}:l);});}
  function deleteMasterItem(){
    if(!deck||!masterItem)return;const id=masterItem.slice(2);
    if(masterItem.startsWith('m:')){
      if(deck.masters.length<2){setNotice(t('lastMaster'));return;}if(!confirm(t('deleteMasterConfirm')))return;
      const rest=deck.masters.filter(m=>m.id!==id);mutate(d=>{d.masters=d.masters.filter(m=>m.id!==id);if(d.activeMaster===id)d.activeMaster=rest[0].id;d.layouts.forEach(l=>{if(l.masterId===id)delete l.masterId;});});setMasterView('m:'+(id===deck.activeMaster?rest[0].id:deck.activeMaster));return;
    }
    if(deck.layouts.length<2){setNotice(t('lastLayout'));return;}
    // Slides of a deleted layout keep their content and move to the layout before it.
    const used=deck.slides.filter(s=>s.layoutId===id).length;if(!confirm(t('deleteLayoutConfirm')+(used?'\n\n'+t('slidesMoved').replace('{n}',String(used)):'')))return;
    const i=deck.layouts.findIndex(l=>l.id===id),to=deck.layouts.filter(l=>l.id!==id)[Math.max(0,i-1)].id;
    mutate(d=>{d.layouts=d.layouts.filter(l=>l.id!==id);d.slides=d.slides.map(s=>s.layoutId===id?relayout(s,layoutOf(d,to)):s);});setMasterView('l:'+to);
  }
  function moveMasterItem(direction:number){if(!masterItem)return;const id=masterItem.slice(2),bases=masterItem.startsWith('m:');mutate(d=>{const list:{id:string}[]=bases?d.masters:d.layouts,i=list.findIndex(x=>x.id===id),to=i+direction;if(i<0||to<0||to>=list.length)return;const [x]=list.splice(i,1);list.splice(to,0,x);});}
  function duplicateMasterItem(){if(masterItem)mutate(d=>{setMasterView(pasteMasterItems(d,copyMasterItem(d,masterItem))[0]);});}
  function deleteSlides(){if(!deck||!tab)return;if(deck.slides.length===tab.selected.length){setNotice(t('deleteLast'));return;}const last=Math.max(...tab.selected.map(id=>deck.slides.findIndex(s=>s.id===id))),next=deck.slides.filter(s=>!tab.selected.includes(s.id));railScroll.current=railRef.current?.scrollTop??null;mutate(d=>{d.slides=next;},[(deck.slides[last+1]||next.at(-1)!).id]);}
  function toggleMaster(){setMasterView(v=>v?null:deck&&slide?'l:'+layoutOf(deck,slide.layoutId).id:'m:');setContextMenu(null);setLayoutPick(null);setRenaming(null);}
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
  // A lost/replaced frame must not silently produce an unformatted clipboard fragment.
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
      // The element's own inline style still applies on top (asset backgrounds, !important values).
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
    if(cut){const latest=tabsRef.current.find(x=>x.project.deck.id===deck.id),current=latest&&findSlide(latest.project.deck,editSlide.id);if(current?.html===editSlide.html)canvasEdit?.onOps(top.map(el=>({type:'delete',index:all.indexOf(el)})),[],false);else setNotice(t('copyUnavailable'));}
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
        // A pasted image with a shadow takes it on its own wrapper again (the shadow must survive its crop).
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
  // The main toolbar's clipboard acts only on the canvas: the text being edited, or the selected objects.
  function canvasClipboard(command:'copy'|'cut'|'paste'|'duplicate'|'delete'){
    if(command==='duplicate'){if(!canvasEditing())duplicateObjects();return;}
    if(canvasEditing()){void api.invoke('nativeEdit',command);return;}
    if(command==='delete'){const sel=canvasSel.current;if(sel.slide===editSlide?.id&&sel.indices.length)canvasEdit?.onOps(sel.indices.map(index=>({type:'delete',index})),[],false);return;}
    void run(async()=>{if(command!=='paste'){await copyObjects(command==='cut');return;}const p=await api.invoke('clipboardRead');if(p?.format==='esf-objects'){pasteObjects(p);return;}const asset=await api.invoke('clipboardImage') as Asset|null;if(asset)addManual('image','asset:'+asset.id,asset);});
  }
  function move(direction:number){if(!tab||!slide)return;mutate(d=>{const index=d.slides.findIndex(s=>s.id===slide.id),to=index+direction;if(to<0||to>=d.slides.length)return;const [s]=d.slides.splice(index,1);d.slides.splice(to,0,s);});}
  function selectSlide(id:string,e?:React.MouseEvent){if(!tab||!deck)return;let selected=[id];if(e?.metaKey||e?.ctrlKey)selected=tab.selected.includes(id)?tab.selected.filter(x=>x!==id):[id,...tab.selected];else if(e?.shiftKey){const a=deck.slides.findIndex(s=>s.id===tab.selected[0]),b=deck.slides.findIndex(s=>s.id===id);selected=deck.slides.slice(Math.min(a,b),Math.max(a,b)+1).map(s=>s.id);}updateTab(active,x=>({...x,selected:selected.length?selected:[id]}));}
  async function importAssets(assets?:Asset[]){
    const slide=editSlide;if(!deck||!slide)return;
    assets=assets||await api.invoke('importAsset',deck.id);if(!assets?.length)return;
    mutate(d=>{
      for(const a of assets!){
        if(!d.assets.some(x=>x.id===a.id))d.assets.push(a);
        if(a.mime.startsWith('font/')){const family=a.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9 _-]/g,'');const target=findSlide(d,slide.id);if(!target)continue;const css=slide.id.startsWith(masterPrefix)?d.masters.find(m=>masterPrefix+m.id===slide.id)!.css:slide.id.startsWith(layoutPrefix)?d.layouts.find(l=>layoutPrefix+l.id===slide.id)!.css||'':target.css;putSlide(d,{...target,css:css+`\n@font-face{font-family:"${family}";src:url("asset:${a.id}")}body{font-family:"${family}",Arial,sans-serif}`});continue;}
        // Without a layout slot the image goes free on the current slide, centered, ready to be dragged.
        const target=findSlide(d,slide.id)!,doc=new DOMParser().parseFromString(target.html,'text/html'),slot=doc.querySelector<HTMLElement>('[data-image-slot]:not(:has(img))');
        const img=doc.createElement('img');img.src='asset:'+a.id;img.alt=a.name;
        if(slot){slot.replaceChildren(img);slot.style.border='0';}else{img.setAttribute('data-slide-owned','');img.setAttribute('style','position:absolute;inset:0;margin:auto;max-width:60%;max-height:60%');(doc.querySelector('.slide')||doc.body).append(img);}
        canvasSel.current={slide:slide.id,indices:[editIndex(doc,img)],editing:false};putSlide(d,{...target,html:doc.body.innerHTML});
      }
    });
  }
  function addManual(kind:ManualKind,payload='',asset?:Asset){
    const slide=editSlide;if(!deck||!slide)return;
    const result=insertManual(slide,kind,payload);
    canvasSel.current={slide:slide.id,indices:[result.index],editing:kind==='text'};
    setManualSelection({slide:slide.id,index:result.index});
    mutate(d=>{if(asset&&!d.assets.some(a=>a.id===asset.id))d.assets.push(asset);putSlide(d,result.slide);});
  }
  async function insertClipboardImage(){
    if(!deck||!slide)return;
    const asset=await api.invoke('clipboardImage') as Asset|null;
    if(asset)addManual('image','asset:'+asset.id,asset);
    else await importAssets();
  }
  async function insertClipboardLink(){
    const text=String(await api.invoke('clipboardText')||'').trim();addManual('link',safeUrl(text)||'https://example.com/');
  }
  const selectedManual=useMemo(()=>editSlide&&manualSelection?.slide===editSlide.id?editableAt(editSlide,manualSelection.index,manualSelection.details):null,[editSlide?.id,editSlide?.html,manualSelection?.slide,manualSelection?.index,manualSelection?.details?.kind]);
  const changeShadow=(on:boolean)=>{if(!editSlide||!selectedManual)return;const id=editSlide.id,index=selectedManual.index;mutate(d=>{const s=findSlide(d,id);if(!s)return;const r=setImageShadow(s,index,on);putSlide(d,r.slide);canvasSel.current={slide:id,indices:[r.index],editing:false};});};
  const changeManual=(fn:(s:Slide,index:number)=>Slide)=>{if(!editSlide||!selectedManual)return;const next=fn(editSlide,selectedManual.index);if(next.html!==editSlide.html)mutate(d=>putSlide(d,next));};
  const changeObjectStyle=(style:ObjectStyle)=>frameCommand({type:'style',style});
  const frameCommand=(message:object)=>editorFrame.current?.contentWindow?.postMessage({app:'esf-editor-command',...message},'*');
  // Focusing the iframe here would interrupt the frame's own press handling (entering a text edit), so only the mode changes;
  // keys that stay with the slide list follow the mode (see the Delete handler).
  const toCanvas=()=>setSelMode('canvas');
  const toSlides=()=>{if(selModeRef.current==='slides')return;setSelMode('slides');if(canvasSel.current.indices.length){frameCommand({type:'deselect'});canvasSel.current={...canvasSel.current,indices:[],editing:false};setManualSelection(null);}};
  const formatText=(command:string,value?:string)=>frameCommand({type:'format',command,value,range:canvasRange.current});
  // A press anywhere else in the editor ends a text edit the format bar kept open (see editRuntime).
  // A right click that stops at the canvas iframe element (instead of reaching its document) is passed to the frame.
  useEffect(()=>{const down=(e:PointerEvent)=>{const f=editorFrame.current;if(e.target!==f||!f)return;toCanvas();if(e.button!==2)return;e.preventDefault();const r=f.getBoundingClientRect();frameCommand({type:'contextAt',x:e.clientX-r.left,y:e.clientY-r.top});},menu=(e:MouseEvent)=>{if(e.target===editorFrame.current)e.preventDefault();};
    document.addEventListener('pointerdown',down,true);document.addEventListener('contextmenu',menu,true);return()=>{document.removeEventListener('pointerdown',down,true);document.removeEventListener('contextmenu',menu,true);};},[]);
  useEffect(()=>{const down=(e:PointerEvent)=>{if(!(e.target as Element)?.closest?.('.manual-toolbar'))frameCommand({type:'release'});};document.addEventListener('pointerdown',down,true);return()=>document.removeEventListener('pointerdown',down,true);},[]);
  const manualEl=selectedManual?.element,manualKind=selectedManual?.kind;
  const objectStyle=manualSelection?.slide===editSlide?.id&&manualSelection?.details?manualSelection.details.style:manualEl?.style;
  const controlColor=(value:string,fallback:string)=>{if(/^#[\da-f]{6}$/i.test(value))return value;const rgb=value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);return rgb?'#'+rgb.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):fallback;};
  const linkStyle=(key:LinkStyle,value:string)=>changeManual((s,i)=>setLinkStyle(s,i,key,value));
  // Size, font and color of a text (the frame formats the selected characters) or of a link (its whole text).
  const fontControls=(apply:(command:string,value:string)=>void,onMore?:()=>void)=>objectStyle&&<>
    <Pick label={t('fontSize')} value={parseInt((objectStyle.fontSize||''))||48} options={[16,20,24,28,32,40,48,56,64,72,88,104].map(n=>({value:n+'px',label:String(n)}))} onPick={v=>apply('fontSize',v)}/>
    <Pick label={t('fontFamily')} value={(objectStyle.fontFamily||'').split(',')[0].replace(/["']/g,'')||'Arial'} wide options={[...new Set([...(manualSelection?.details?.fonts||[]),(objectStyle.fontFamily||'Arial').split(',')[0].replace(/["']/g,''),'Arial','Georgia','Times New Roman','Verdana','Trebuchet MS','Courier New'])].map(f=>({value:f,label:f,style:{fontFamily:f}}))} onPick={v=>apply('fontFamily',v)}/>
    <ColorPick t={t} label={t('textColor')} value={controlColor((objectStyle.color||''),'#172033')} more={t('customColor')} onMore={onMore} onPick={v=>apply('color',v)}/>
  </>;
  const setLink=(value:string)=>{const url=safeUrl(value);if(!url){setNotice(t('invalidUrl'));return;}changeManual((s,i)=>setLinkUrl(s,i,url));};
  const setCaption=(value:string)=>changeManual((s,i)=>setLinkCaption(s,i,value));
  const setQr=(enabled:boolean)=>changeManual((s,i)=>setLinkQr(s,i,enabled));
  async function dropFiles(e:React.DragEvent){
    e.preventDefault();if(!deck)return;
    const assets:Asset[]=[];
    for(const file of Array.from(e.dataTransfer.files)){
      if(!/^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/.test(file.type))continue;
      if(file.size>50_000_000)throw Error('50 MB maximum.');
      const buffer=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
      const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});
      assets.push({id:'asset-'+hash,name:file.name,mime:file.type,data});
    }await importAssets(assets);
  }
  function requestClose(ids:string[],quit=false){if(tabsRef.current.some(x=>ids.includes(x.project.deck.id)&&x.dirty)){setCloseRequest({ids,quit});return;}void finishClose(ids,quit,false);}
  async function finishClose(ids:string[],quit:boolean,save:boolean){
    for(const id of ids){const x=tabsRef.current.find(x=>x.project.deck.id===id);if(x?.dirty){if(save){if(!await saveTab(id))return;}else await api.invoke('discard',id);}if(x)await api.invoke('close',id);}
    setCloseRequest(null);
    if(quit){await api.invoke('quit');return;}
    const remaining=tabsRef.current.filter(x=>!ids.includes(x.project.deck.id));setTabs(remaining);if(ids.includes(active)){setActive(remaining.at(-1)?.project.deck.id||'');if(!remaining.length)setScreen('empty');}
  }
  const updatePrefs=(patch:Partial<Preferences>)=>{const next={...prefsRef.current,...patch};setPrefs(next);prefsRef.current=next;void run(()=>api.invoke('preferences',next));};
  const activeAccount=prefs.profiles.find(p=>p.id===prefs.activeProfile),accountModels=[...modelsFor(activeAccount),...(providerStatus[prefs.activeProfile]?.models||[]).filter(m=>!modelsFor(activeAccount).some(x=>x.id===m.id))],accountEfforts=effortsFor(activeAccount);
  const updateAccount=(patch:{model?:string;effort?:string})=>updatePrefs({profiles:prefsRef.current.profiles.map(p=>p.id===prefsRef.current.activeProfile?{...p,...patch}:p)});
  async function open(file?:string){const p=await api.invoke('open',file);if(p)addProject(p);}
  // The name is asked on the first save.
  async function create(template:string){if(loading)return;setSelectedTemplate(template);setLoading(true);try{const p=await api.invoke('create',t('untitled'),template);if(p)addProject(p);}finally{setLoading(false);}}
  async function send(answer?:string){
    const prompt=answer??tab?.prompt??'';
    if(!tab||!deck||!prompt.trim()||tab.busy)return;
    const files=tab.attachments;chatStick.current=true;
    const text=files.length?prompt+'\n\n📎 '+files.map(f=>f.name).join(', '):prompt;
    updateTab(active,x=>({...x,chat:[...x.chat.map(m=>m.questions&&!m.answered?{...m,answered:true}:m),{role:'user',text,at:new Date().toISOString()},{role:'activity',text:'',kind:x.chat.some(m=>m.role==='user')?'continue':'launch'}],prompt:answer===undefined?'':x.prompt,attachments:[],busy:true,started:Date.now(),aiVersion:x.version,...(x.profile!==prefs.activeProfile?{usage:undefined,total:undefined}:{}),profile:prefs.activeProfile}));
    // In the slide master view the agent learns what the user is looking at (not shown in the chat).
    const scope=masterItem?`[Slide master view: ${masterItem.startsWith('m:')?'master':'layout'} "${itemName(deck,masterItem)}" (${masterItem.slice(2)}) is selected; the active master is ${deck.activeMaster}]\n\n`:'';
    try{await api.invoke('aiSend',deck,prefs.activeProfile,scope+prompt,tab.selected,files.map(f=>f.path),tab.conversation);}catch(e){updateTab(active,x=>({...x,busy:false,attachments:files}));throw e;}
  }
  function newConversation(){updateTab(active,x=>x.busy?x:({...x,history:snapshot(x),conversation:uid('c'),chat:[],usage:undefined,total:undefined}));setSessionsOpen(false);}
  function openConversation(id:string){updateTab(active,x=>{if(x.busy)return x;const history=snapshot(x),c=history.find(v=>v.id===id);return c?{...x,history,conversation:c.id,chat:c.chat,total:c.total,usage:undefined}:x;});setSessionsOpen(false);chatStick.current=true;}
  function deleteConversation(id:string){updateTab(active,x=>{const history=snapshot(x).filter(v=>v.id!==id);return id===x.conversation?{...x,history,conversation:uid('c'),chat:[],usage:undefined,total:undefined}:{...x,history};});}
  async function attach(){
    const id=active,list:{path:string;name:string}[]=await api.invoke('aiAttach',id);if(!list?.length)return;
    updateTab(id,x=>({...x,attachments:[...x.attachments,...list.filter(f=>!x.attachments.some(a=>a.path===f.path))]}));
  }
  function beginExport(){if(!deck)return;setExportResult('');setExportOpen(true);}
  async function exportDeck(){
    if(!deck)return;setExporting(true);
    try{const r=await api.invoke('export',deck,format);if(r){if(r.project){const p=r.project;updateTab(active,x=>({...x,project:p,dirty:!!p.pending}));setActive(p.deck.id);}setExportOpen(false);setNotice(r.noPollServer?t('pollNoServerExport'):r.fonts?.missing?.length?t('fontsMissing')+' '+r.fonts.missing.join(', '):t('exported')+': '+r.path.split(/[\\/]/).at(-1));}}finally{setExporting(false);}
  }
  commandRef.current=command=>{
    if(command==='settings'){setScreen('settings');return;}if(command==='ai'){setAiOpen(x=>!x);return;}if(command==='slidePanel'){setRailOpen(x=>!x);return;}if(command==='website'){void run(()=>api.invoke('website'));return;}
    if(/^tab[1-9]$/.test(command)){const x=tabs[Number(command.slice(3))-1];if(x){setActive(x.project.deck.id);setScreen('editor');}return;}
    if(command==='new'){setScreen('new');return;}if(command==='saveTemplate'&&tab){setTemplateName(tab.project.path?tabTitle(tab.project.path,t):tab.project.deck.title);return;}if(command==='recent'){setScreen('recent');return;}if(command==='open'){void run(()=>open());return;}
    if(command==='quit'){requestClose(tabs.map(x=>x.project.deck.id),true);return;}
    if(!tab)return;
    if(command==='save')void run(()=>saveTab());if(command==='saveAs')void run(()=>saveTab(active,true));
    if(command==='close')requestClose([active]);
    if(command==='undo'||command==='redo'){if(canvasEditing()){void api.invoke('nativeEdit',command);return;}if((document.activeElement as Element|null)?.closest('input,textarea,[contenteditable]')){document.execCommand(command);return;}undo(command==='redo');}
    // ⌘A: text fields and text being edited keep the native select all; otherwise the slide list or the canvas objects, never the whole window.
    if(command==='selectAll'){
      if((document.activeElement as Element|null)?.closest('input,textarea,[contenteditable]')||canvasEditing()||screen!=='editor'||exportOpen||layoutPick||templateName!==null){void api.invoke('nativeEdit',command);return;}
      if(selModeRef.current==='slides'&&!masterItem&&deck&&slide){updateTab(active,x=>({...x,selected:[slide.id,...deck.slides.map(s=>s.id).filter(id=>id!==slide.id)]}));return;}
      frameCommand({type:'selectAll'});return;
    }
    // Clipboard shortcuts arrive only through the native menu; text fields keep native behavior.
    if(['copy','cut','paste'].includes(command)){
      // Selected text is copied as text; slides only when the slide list has the focus.
      const focus=document.activeElement as Element|null,editing=!!focus?.closest('input,textarea,[contenteditable]')||canvasEditing();
      const slidesFocused=selModeRef.current==='slides'&&!window.getSelection()?.toString();
      if(editing||screen!=='editor'||exportOpen||layoutPick||templateName!==null){void api.invoke('nativeEdit',command);return;}
      if(command==='paste'){void run(async()=>{const p=await api.invoke('clipboardRead');if(p)await paste(p);else if(selModeRef.current==='canvas'){const asset=await api.invoke('clipboardImage') as Asset|null;if(asset)addManual('image','asset:'+asset.id,asset);}});return;}
      if(slidesFocused){void run(()=>copy(command==='cut'));return;}
      void run(async()=>{if(!await copyObjects(command==='cut'))await api.invoke('nativeEdit',command);});return;
    }
    if(screen!=='editor'||exportOpen||layoutPick||templateName!==null)return;
    if(command==='master'){toggleMaster();return;}
    if(command==='zoomIn'||command==='zoomOut'||command==='zoomReset'){setZoom(z=>command==='zoomReset'?100:command==='zoomIn'?zoomSteps.find(v=>v>z)??z:[...zoomSteps].reverse().find(v=>v<z)??z);return;}
    if(command==='reveal'){if(tab.project.path)void run(()=>api.invoke('reveal',tab.project.path));return;}
    if(command==='insertPoll'){if(!masterItem&&deck&&slide)setPollTarget({deck:deck.id,slide:slide.id,poll:slide.poll});return;}
    if(command==='insertText'){addManual('text');return;}if(command==='insertShape'){addManual('shape',shapeTypes[0]);return;}
    if(command==='insertImage'){void run(insertClipboardImage);return;}if(command==='insertLink'){void run(insertClipboardLink);return;}
    // Edit → Delete follows the selection mode, like the Delete key: slides (or the master item) from the list, objects from the canvas.
    if(command==='delete'){if(canvasEditing())return;if(selModeRef.current==='slides'){if(masterItem)deleteMasterItem();else deleteSlides();return;}const sel=canvasSel.current;if(sel.slide===editSlide?.id&&sel.indices.length)canvasEdit?.onOps(sel.indices.map(index=>({type:'delete',index})),[],false);return;}
    // In the slide master view the slide commands do not apply; ⌘D still duplicates canvas objects.
    if(masterItem){if(command==='duplicate'&&!canvasEditing()){if(selModeRef.current==='slides')duplicateMasterItem();else duplicateObjects();}}
    else{if(command==='newSlide')setLayoutPick('insert');if(command==='changeLayout')setLayoutPick('change');if(command==='duplicate'){if(canvasEditing())return;if(selModeRef.current==='canvas'&&duplicateObjects())return;duplicate();}}
    if(command==='present'&&deck)void run(()=>api.invoke('present',deck,Math.max(0,deck.slides.indexOf(slide!))));if(command==='export')beginExport();
  };
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const editing=(e.target as Element)?.closest?.(typingField);
      if(editing||screen!=='editor'||exportOpen||layoutPick||templateName!==null)return;
      // The crop box confirms (Enter) or cancels (Esc) even when the keyboard is not in the canvas frame.
      if(cropOn&&(e.key==='Enter'||e.key==='Escape')){e.preventDefault();frameCommand({type:e.key==='Enter'?'crop':'cropCancel'});return;}
      if(e.key==='Delete'||e.key==='Backspace'){
        e.preventDefault();const sel=canvasSel.current;
        // The selection mode decides: slides after a click on the slide list, canvas objects after a click on the canvas.
        if(selModeRef.current==='slides'){if(!e.repeat){if(masterItem)deleteMasterItem();else deleteSlides();}return;}
        if(sel.slide===editSlide?.id&&!sel.editing&&sel.indices.length)canvasEdit?.onOps(sel.indices.map(index=>({type:'delete',index})),[],false);
        return;
      }
      // With canvas objects selected, arrows move them and ⌘+arrows resize them, even with the keyboard outside the frame.
      if(e.key.startsWith('Arrow')&&selModeRef.current==='canvas'){const sel=canvasSel.current;if(sel.slide===editSlide?.id&&!sel.editing&&sel.indices.length){e.preventDefault();frameCommand({type:'arrow',key:e.key,shift:e.shiftKey,meta:e.metaKey||e.ctrlKey});return;}}
      if(masterItem&&deck&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=visibleMasterItems,i=items.indexOf(masterItem),to=e.key==='Home'?0:e.key==='End'?items.length-1:i+(e.key==='ArrowDown'?1:-1);if(items[to])setMasterView(items[to]);return;}
      if((e.key==='ArrowDown'||e.key==='ArrowUp')&&deck&&slide&&(e.metaKey||e.ctrlKey)){e.preventDefault();move(e.key==='ArrowDown'?1:-1);return;}
      if((e.key==='ArrowDown'||e.key==='ArrowUp')&&deck&&slide){e.preventDefault();const i=deck.slides.indexOf(slide)+(e.key==='ArrowDown'?1:-1);if(deck.slides[i])selectSlide(deck.slides[i].id);}
      if((e.key==='Home'||e.key==='End')&&deck){e.preventDefault();selectSlide(deck.slides[e.key==='Home'?0:deck.slides.length-1].id);}
    },up=(e:KeyboardEvent)=>{if(e.key.startsWith('Arrow')&&selModeRef.current==='canvas')frameCommand({type:'arrowUp'});};
    document.addEventListener('keydown',key);document.addEventListener('keyup',up);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('keyup',up);};
  });
  const masterLabel=(item:string)=>deck?itemName(deck,item):'';
  const blankDeck=useMemo(()=>newDeck(t('untitled'),defaultNames[prefs.language]),[prefs.language]);
  // The canvas frame keeps the focus while a text is edited there, so native undo and clipboard must go to it.
  const canvasEditing=()=>canvasSel.current.editing&&canvasSel.current.slide===editSlide?.id;
  const canvasEdit:CanvasEdit|undefined=editSlide&&(slide=>({
    select:()=>canvasSel.current.slide===slide.id?{...canvasSel.current,range:canvasSel.current.editing?canvasRange.current:null}:{indices:[],editing:false},
    onCrop:setCropOn,
    onPress:()=>{setContextMenu(null);toCanvas();},
    onContext:(x,y,text)=>{toCanvas();const r=editorFrame.current?.getBoundingClientRect();if(r)setContextMenu({x:r.left+x,y:r.top+y,text});},
    onRange:(start,end)=>{canvasRange.current=end>start?{start,end}:null;},
    onState:(indices,editing,details)=>{if(indices.length)setSelMode('canvas');if(canvasSel.current.slide!==slide.id||indices.join()!==canvasSel.current.indices.join())setContextMenu(null);if(canvasSel.current.slide!==slide.id||canvasSel.current.indices[0]!==indices[0])canvasRange.current=null;canvasSel.current={slide:slide.id,indices,editing};setManualSelection(indices.length===1?{slide:slide.id,index:indices[0],details}:null);setImageSel(!!details?.crop);},
    // All operations of one gesture (a text commit followed by a drag) become a single undo step.
    onOps:(ops,indices,editing,range)=>{canvasSel.current={slide:slide.id,indices,editing};if(range!==undefined)canvasRange.current=range&&range.end>range.start?range:null;setManualSelection(previous=>indices.length===1?{slide:slide.id,index:indices[0],details:previous?.slide===slide.id&&previous.index===indices[0]?previous.details:undefined}:null);
      updateTab(deck!.id,x=>{const current=findSlide(x.project.deck,slide.id);if(!current)return x;const edited=applyEdits(current,ops);if(edited.html===current.html&&edited.staticHtml===current.staticHtml&&edited.title===current.title)return x;
        let next={...x.project.deck};putSlide(next,edited);next=syncLayouts(x.project.deck,next);try{validateDeck(next);}catch(e:any){setError(e.message);return x;}
        return{...x,project:{...x.project,deck:next},dirty:true,version:x.version+1,past:[...x.past,x.project.deck].slice(-50),future:[]};});}
  }))(editSlide);
  // Toolbar groups in the order of the EDUKORS style manual; groups that are not fixed go to "More" when the window is narrow.
  const width=(n:number)=>n*32+(n-1)*2,toolGroups:ToolGroup[]=[{id:'file',label:t('file'),fixed:true,width:width(tab&&deck?6:3),node:<>
    <IconButton icon="newFile" label={t('new')} keys="⌘N" onClick={()=>setScreen('new')}/><IconButton icon="folder" label={t('open')} keys="⌘O" onClick={()=>void run(()=>open())}/><IconButton icon="clock" label={t('recent')} onClick={()=>setScreen('recent')}/>
    {tab&&deck&&<><IconButton icon="save" label={t('save')} keys="⌘S" disabled={!tab.dirty&&!!tab.project.path} onClick={()=>void run(()=>saveTab())}/><IconButton icon="export" label={t('export')} keys="⌘E" onClick={beginExport}/><IconButton icon="reveal" label={t(mac?'revealFinder':'revealFolder')} disabled={!tab.project.path} onClick={()=>void run(()=>api.invoke('reveal',tab.project.path))}/></>}</>}];
  if(inEditor&&tab&&deck&&slide)toolGroups.push(
    {id:'show',label:t('secShow'),fixed:true,width:56,node:<IconButton icon="play" className="tool-present" label={t('present')} keys="⌘↩" onClick={()=>void run(()=>api.invoke('present',deck,Math.max(0,deck.slides.indexOf(slide!))))}/>},
    // Alternative views as a segmented control: the slides or the slide master.
    {id:'view',label:t('editMaster'),fixed:true,width:64,node:<div className="segmented-view" role="tablist" aria-label={t('editMaster')}>{([['slides','viewSlides',false],['master','editMaster',true]] as const).map(([icon,label,on])=><button key={icon} type="button" role="tab" aria-selected={!!masterItem===on} aria-label={t(label)} data-tip={t(label)} onClick={()=>{if(!!masterItem!==on)toggleMaster();}}><Icon name={icon}/></button>)}</div>},
    {id:'history',label:t('secEdit'),fixed:true,width:width(2),node:<><IconButton icon="undo" label={t('undo')} keys="⌘Z" disabled={!tab.past.length} onClick={()=>undo()}/><IconButton icon="redo" label={t('redo')} keys="⇧⌘Z" disabled={!tab.future.length} onClick={()=>undo(true)}/></>},
    // Buttons keep the focus in the canvas frame, so the text being edited keeps its selection.
    {id:'edit',label:t('edit'),fixed:true,width:width(5),node:<>{([['copy','copy','⌘C'],['cut','cut','⌘X'],['paste','paste','⌘V'],['duplicate','duplicate','⌘D'],['delete','trash','⌫']] as const).map(([command,icon,keys])=><IconButton key={command} icon={icon} label={t(command==='delete'?'remove':command)} keys={keys} className={command==='delete'?'tool-delete':undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>canvasClipboard(command)}/>)}</>},
    {id:'insert',label:t('secInsert'),width:width(masterItem?4:5),node:<><IconButton icon="text" label={t('manualText')} onClick={()=>addManual('text')}/><Pick icon="shape" label={t('manualShape')} grid options={shapeTypes.map(x=>({value:x,label:<ShapeIcon type={x}/>,title:t(('shape_'+x) as any)}))} onPick={v=>addManual('shape',v)}/><IconButton icon="image" label={t('manualImage')} onClick={()=>void run(insertClipboardImage)}/><IconButton icon="link" label={t('manualLink')} onClick={()=>void run(insertClipboardLink)}/>
      {!masterItem&&<IconButton icon="poll" label={pollWords[prefs.language].title} aria-haspopup="dialog" className={slide.poll?'active':undefined} onClick={()=>setPollTarget({deck:deck.id,slide:slide.id,poll:slide.poll})}/>}</>});
  // Activity dot: accent and pulsing while it runs, ok when done, warning on retries and fixes, gray for reasoning.
  const lastActivity=tab?tab.chat.map(m=>m.role).lastIndexOf('activity'):-1;
  const dotState=(i:number,m:Chat)=>tab?.busy&&i===lastActivity?' running':m.kind==='retry'||m.kind==='fixing'?' warn':m.kind==='thinking'?'':' done';
  const railHandle=<div className="rail-resize" role="separator" aria-orientation="vertical" aria-label={t('resizeRail')} title={t('resizeRail')} tabIndex={0} onPointerDown={e=>{e.stopPropagation();resizePanel(e,'rail');}} onDoubleClick={()=>setRailWidth(236)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();setRailWidth(w=>Math.max(236,Math.min(360,w+(e.key==='ArrowRight'?20:-20))));}}}/>;
  // Slide list toolbar, the same at the top of the slides, Bases and Layouts lists; it acts on the selected slides or item.
  const railTools=tab&&deck&&slide&&(()=>{const bases=masterTab==='bases',list=masterItem?visibleMasterItems:deck.slides.map(s=>s.id),at=list.indexOf(masterItem||slide.id);
    const last=masterItem?(bases?deck.masters.length<2:deck.layouts.length<2):deck.slides.length===tab.selected.length;
    return <div className="rail-tools" role="toolbar" aria-label={masterItem?t(bases?'basesCaption':'layoutsCaption'):t('slides')}>
      <IconButton icon="newSlide" label={t(masterItem?bases?'addMaster':'addLayout':'newSlide')} keys={masterItem?undefined:'⇧⌘N'} aria-haspopup={masterItem?undefined:'dialog'} onClick={masterItem?bases?addMasterItem:addLayoutItem:()=>setLayoutPick('insert')}/>
      <IconButton icon="arrowUp" label={t('up')} disabled={at<=0} onClick={()=>masterItem?moveMasterItem(-1):move(-1)}/><IconButton icon="arrowDown" label={t('down')} disabled={at<0||at>=list.length-1} onClick={()=>masterItem?moveMasterItem(1):move(1)}/>
      <IconButton icon="duplicate" label={t('duplicate')} keys="⌘D" onClick={masterItem?duplicateMasterItem:duplicate}/>
      <IconButton icon="copy" label={t('copy')} keys="⌘C" onClick={()=>void run(()=>copy())}/><IconButton icon="cut" label={t('cut')} keys="⌘X" disabled={last} onClick={()=>void run(()=>copy(true))}/><IconButton icon="paste" label={t('paste')} keys="⌘V" onClick={()=>void run(pasteItems)}/>
      <IconButton icon="trash" label={masterItem?t(bases?'deleteMaster':'deleteLayout'):t('remove')} keys="⌫" className="tool-delete" disabled={last} onClick={masterItem?deleteMasterItem:deleteSlides}/>
    </div>;})();
  if(!booted)return <div className="boot"><Icon name="grid"/><h1>Edukors Slides Editor</h1><p>{t('processing')}</p></div>;
  return <div className="app"><Tips/>
    <header className="app-header">
      <button type="button" className="app-wordmark" title="edukors.org" aria-label="edukors.org" onClick={()=>void run(()=>api.invoke('website'))}><img className="app-logo" src={logo} alt=""/></button>
      {/* The header is the toolbar: logo, tool groups in a fixed order, then the panel toggles on the right. */}
      <Toolbar t={t} groups={toolGroups} tail={<IconButton icon="settings" label={t('settings')} keys="⌘," onClick={()=>setScreen('settings')}/>}/>
      <div className="header-right">{tab&&<><IconButton icon="panel" label={t('slidePanel')} keys="⌥⌘0" className={railOpen?'active':undefined} aria-pressed={railOpen} onClick={()=>setRailOpen(x=>!x)}/><IconButton icon="spark" label={aiOpen?t('closeAI'):t('openAI')} keys="⇧⌘A" className={aiOpen?'active':undefined} aria-pressed={aiOpen} onClick={()=>setAiOpen(x=>!x)}/></>}</div>
    </header>
    {tabs.length>0&&<div className="tabs" role="tablist">{tabs.map(x=><div key={x.project.deck.id} className={'tab '+(x.project.deck.id===active&&screen==='editor'?'selected':'')}><button role="tab" aria-selected={x.project.deck.id===active} title={x.project.path||undefined} onClick={()=>{setActive(x.project.deck.id);setScreen('editor');}}><Icon name="file"/><span>{tabTitle(x.project.path,t)}</span>{x.dirty&&<span className="dirty-dot" role="img" aria-label={t('unsaved')}/>}</button><IconButton icon="close" label={t('closeTab')} keys="⌘W" className="icon" onClick={()=>requestClose([x.project.deck.id])}/></div>)}<IconButton icon="plus" label={t('new')} keys="⌘N" className="icon" onClick={()=>setScreen('new')}/></div>}
    {/* The format bar keeps its row while a presentation is open, so selecting an object never resizes the canvas mid-gesture. */}
    {contextMenu&&inEditor&&editSlide&&<CanvasMenu {...contextMenu} t={t} onClose={()=>setContextMenu(null)} onCommand={c=>{setContextMenu(null);frameCommand(c);}}/>}
    {inEditor&&slide&&<div className="manual-toolbar" role="toolbar" aria-label={manualKind?t(manualKind==='text'?'manualText':manualKind==='image'?'manualImage':manualKind==='link'?'manualLink':manualKind==='shape'?'manualShape':'secEdit'):undefined}>
      {/* Crop works on any selected image: the button toggles a crop box dragged on the canvas (editRuntime). */}
      {imageSel&&<><div className="manual-group" role="group" aria-label={t('crop')}><IconButton icon="crop" label={t('crop')} className={cropOn?'icon active':'icon'} aria-pressed={cropOn} onMouseDown={e=>e.preventDefault()} onClick={()=>frameCommand({type:'crop'})}/></div><span className="separator"/></>}
      {manualKind&&manualEl&&objectStyle&&<>
      {manualKind==='text'&&<>
        {/* Text controls never take the focus from the slide, so the selected characters stay selected. */}
        <div className="manual-group" role="group" aria-label={t('secEdit')}>
          {([['bold','B'],['italic','I'],['underline','U'],['strikeThrough','S']] as const).map(([cmd,label])=><button key={cmd} type="button" className={'format-button '+cmd} data-tip={t((cmd==='strikeThrough'?'strike':cmd) as any)} aria-label={t((cmd==='strikeThrough'?'strike':cmd) as any)} onMouseDown={e=>e.preventDefault()} onClick={()=>formatText(cmd)}>{label}</button>)}
          {fontControls(formatText,()=>frameCommand({type:'hold'}))}
        </div><span className="separator"/>
      </>}
      {manualKind==='link'&&<><div className="manual-group" role="group" aria-label={t('secEdit')}>
        {(()=>{const look=linkLook(manualEl);return([['bold','B','fontWeight',look.bold?'400':'700'],['italic','I','fontStyle',look.italic?'normal':'italic'],['underline','U','textDecoration',look.underline?'none':'underline']] as const).map(([cmd,label,key,value])=><button key={cmd} type="button" className={'format-button '+cmd+(look[cmd]?' on':'')} data-tip={t(cmd)} aria-label={t(cmd)} aria-pressed={look[cmd]} onClick={()=>linkStyle(key,value)}>{label}</button>);})()}
        {fontControls((command,value)=>linkStyle(command as LinkStyle,value))}
        {(['alignLeft','alignCenter','alignRight'] as const).map((key,i)=><IconButton key={key} icon={key} label={t(key)} className="icon" onClick={()=>frameCommand({type:'align',axis:'x',value:['start','center','end'][i]})}/>)}
      </div><span className="separator"/></>}
      {manualKind==='shape'?(()=>{const look=shapeLook(manualEl);return <div className="manual-group" role="group" aria-label={t('manualShape')}>
        <Pick label={t('shapeType')} value={<ShapeIcon type={look.type}/>} grid options={shapeTypes.map(x=>({value:x,label:<ShapeIcon type={x}/>,title:t(('shape_'+x) as any)}))} onPick={v=>changeManual((s,i)=>setShape(s,i,{type:v as any}))}/>
        <label>{t('line')}<Pick label={t('line')} value={look.width+'px'} options={[0,1,2,4,8].map(n=>({value:String(n),label:n+'px'}))} onPick={v=>changeManual((s,i)=>setShape(s,i,{width:Number(v)}))}/></label>
        {/* A line color on a shape without a line also turns the line on. */}
        <ColorPick t={t} label={t('lineColor')} value={controlColor(look.stroke,'#2f4fd0')} more={t('customColor')} onPick={v=>changeManual((s,i)=>setShape(s,i,{stroke:v,...look.width?{}:{width:2}}))}/>
        <label>{t('fill')}<ColorPick t={t} label={t('fill')} value={look.fill==='none'?'transparent':controlColor(look.fill,'#4a6cf7')} none={t('noFill')} more={t('customColor')} onPick={v=>changeManual((s,i)=>setShape(s,i,{fill:v}))}/></label>
        <label className="manual-check"><input type="checkbox" checked={look.shadow} onChange={e=>changeManual((s,i)=>setShape(s,i,{shadow:e.target.checked}))}/>{t('shadow')}</label>
      </div>;})():manualKind==='link'?<div className="manual-group link-controls">
        <label>{t('linkUrl')}<input key={`${editSlide!.id}-${selectedManual.index}`} type="url" defaultValue={manualEl.dataset.url||''} onBlur={e=>{if(e.target.value!==manualEl.dataset.url)setLink(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'){e.currentTarget.blur();}}}/></label>
        <label>{t('caption')}<input key={`caption-${editSlide!.id}-${selectedManual.index}`} type="text" defaultValue={manualEl.querySelector('[data-link-caption]')?.textContent||''} onBlur={e=>setCaption(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
        <label className="manual-check"><input type="checkbox" checked={linkHasQr(manualEl)} onChange={e=>{try{setQr(e.target.checked);}catch(err){setError(String(err));}}}/>{t('qrCode')}</label>
      </div>:<div className="manual-group" role="group" aria-label={t('line')}>
        <label>{t('line')}<Pick label={t('line')} value={(parseInt((objectStyle.borderWidth||''))||0)+'px'} options={[0,1,2,4,8].map(n=>({value:String(n),label:n+'px'}))} onPick={v=>changeObjectStyle({'border-width':v+'px','border-style':v==='0'?'none':'solid'})}/></label>
        {/* A line color on a box without a line also turns the line on. */}
        <ColorPick t={t} label={t('lineColor')} value={controlColor((objectStyle.borderColor||''),'#172033')} more={t('customColor')} onPick={v=>changeObjectStyle({'border-color':v,...!parseFloat(objectStyle.borderWidth||'')||objectStyle.borderStyle==='none'?{'border-width':'2px','border-style':'solid'}:{}})}/>
        <label>{t('fill')}<ColorPick t={t} label={t('fill')} value={(objectStyle.backgroundColor||'')&&!/(?:transparent|rgba\([^)]*,\s*0\))$/.test(objectStyle.backgroundColor||'')?controlColor((objectStyle.backgroundColor||''),'#ffffff'):'transparent'} none={t('noFill')} more={t('customColor')} onPick={v=>changeObjectStyle({'background-color':v})}/></label>
        {/* Images take a drop-shadow, which follows their transparent pixels; boxes a box-shadow. */}
        <label className="manual-check"><input type="checkbox" checked={!!objectStyle.boxShadow&&objectStyle.boxShadow!=='none'||/drop-shadow/.test(objectStyle.filter||'')} onChange={e=>manualKind==='image'?changeShadow(e.target.checked):changeObjectStyle({'box-shadow':e.target.checked?'0 12px 30px #17203355':'none'})}/>{t('shadow')}</label>
      </div>}
    </>}</div>}
    {!tab&&<main className="empty-desk" aria-label={t('workspace')}><div className="desk-mark" aria-hidden="true"><img src={logo} alt=""/><span>Slides Editor</span></div></main>}
    {!tab&&<footer className="statusbar"><span className="app-version" title="Edukors Slides Editor">v{__APP_VERSION__}</span></footer>}
    {/* One category: Blank (built in) and the user's templates, which can be renamed and deleted. A double click creates. */}
    {homeScreen&&<Modal sheet title={screen==='recent'?t('recent'):t('new')} onClose={closeOverlay}><div className="home-layout">
      <main className="gallery">
        {screen==='recent'&&<div className="gallery-heading"><div><p>{t('welcomeSub')}</p></div></div>}
        {screen==='recent'?<div className="recent-list">{prefs.recent.length?prefs.recent.map(p=><button key={p} onClick={()=>void run(()=>open(p))}><Icon name="file"/><div><strong>{p.split(/[\\/]/).at(-1)}</strong><small>{p}</small></div><Icon name="chevron"/></button>):<p className="empty">{t('noRecent')}</p>}</div>:<>
        <div className="gallery-controls"><input aria-label={t('searchTemplates')} placeholder={t('searchTemplates')} value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="template-grid">{t('blank').toLowerCase().includes(search.toLowerCase())&&<button className={'template-card '+(selectedTemplate==='blank'?'selected':'')} onClick={()=>setSelectedTemplate('blank')} onDoubleClick={()=>void run(()=>create('blank'))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void run(()=>create('blank'));}}}><div className="template-art"><Preview deck={blankDeck} slide={blankDeck.slides[0]}/>{selectedTemplate==='blank'&&<span className="template-check"><Icon name="check"/></span>}</div><strong>{t('blank')}</strong></button>}
          {templates.filter(x=>x.title.toLowerCase().includes(search.toLowerCase())).map(x=>{const id='custom:'+x.id;return <div className="custom-card" key={x.id}><button className={'template-card '+(selectedTemplate===id?'selected':'')} onClick={()=>setSelectedTemplate(id)} onDoubleClick={()=>void run(()=>create(id))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void run(()=>create(id));}}}><div className="template-art"><TemplatePreview id={x.id}/>{selectedTemplate===id&&<span className="template-check"><Icon name="check"/></span>}</div></button><TemplateRow t={t} template={x} onChange={list=>{setTemplates(list);if(!list.some(v=>'custom:'+v.id===selectedTemplate))setSelectedTemplate('blank');}} run={run}/></div>;})}</div>
        {loading&&<p className="empty">{t('processing')}</p>}
        </>}
      </main></div>{screen==='new'&&<footer className="modal-actions"><Button onClick={closeOverlay}>{t('cancel')}</Button><Button className="primary" disabled={loading} onClick={()=>void run(()=>create(selectedTemplate))}>{t('createButton')}</Button></footer>}</Modal>}
    {screen==='settings'&&<Modal sheet title={t('settings')} onClose={closeOverlay}><div className="settings-layout"><aside className="home-nav">{[['general','settings'],['accounts','account'],['assistantSettings','spark'],['pollSettings','poll']].map(([key,icon])=><Button key={key} icon={icon} className={settingsTab===key?'selected':''} onClick={()=>setSettingsTab(key)}>{t(key as any)}</Button>)}</aside><main className="settings-main">
      {settingsTab==='general'&&<><section><h2>{t('language')}</h2><p>{t('languageHelp')}</p><div className="language-options">{[['pt','Português'],['en','English'],['es','Español']].map(([code,label])=><label className={'language-option '+(prefs.language===code?'selected':'')} key={code}><input type="radio" name="language" value={code} checked={prefs.language===code} onChange={()=>updatePrefs({language:code as Language})}/><span><strong>{label}</strong><small>{code}</small></span></label>)}</div><div className="info"><Icon name="info"/>{t('languageNote')}</div><div className="success"><Icon name="check"/>{t('autoSaved')}</div></section></>}
      {settingsTab==='accounts'&&windows&&<p className="settings-note">{t('aiWindows')}</p>}
      {settingsTab==='accounts'&&<ProviderAccounts prefs={prefs} t={t} onChange={updatePrefs} onStatus={(id,status)=>setProviderStatus(s=>({...s,[id]:status}))} onError={setError}/>}
      {settingsTab==='pollSettings'&&<PollServerSettings prefs={prefs} t={t} onChange={updatePrefs}/>}
      {settingsTab==='assistantSettings'&&<section><h2>{t('systemPrompt')}</h2><div className="prompt-tabs" role="tablist">{(['global','deck'] as const).map(k=><button key={k} role="tab" aria-selected={promptTab===k} className={promptTab===k?'active':''} onClick={()=>setPromptTab(k)}>{t(k==='global'?'promptGlobal':'promptDeck')}</button>)}</div>
        {promptTab==='global'?<><p>{t('systemPromptHelp')}</p><textarea className="code system-prompt" aria-label={t('promptGlobal')} rows={14} maxLength={20000} value={prefs.systemPrompt||''} onChange={e=>updatePrefs({systemPrompt:e.target.value})}/></>
        :deck?<><p>{t('promptDeckHelp')}</p><textarea className="code system-prompt" aria-label={t('promptDeck')} rows={14} maxLength={20000} value={deck.systemPrompt||''} onChange={e=>setDeckPrompt(e.target.value)}/></>:<p>{t('promptNoDeck')}</p>}</section>}
    </main></div></Modal>}
    {inEditor&&tab&&deck&&slide&&<>
      <div className="editor-layout">{railOpen&&(masterItem?<aside className="slide-rail master-rail" style={{width:railWidth}} onPointerDown={toSlides} onFocus={toSlides} aria-label={t('editMaster')}>{railTools}<div className="rail-caption"><span>{t('editMaster')}</span><IconButton icon="close" label={t('closeMaster')} onClick={toggleMaster}/></div>
        <div className="master-tabs" role="tablist" aria-label={t('editMaster')}>{(['bases','layouts'] as const).map(value=><button key={value} id={'master-tab-'+value} type="button" role="tab" aria-selected={masterTab===value} aria-controls="master-items" tabIndex={masterTab===value?0:-1} onClick={()=>selectMasterTab(value)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const next=e.key==='Home'?'bases':e.key==='End'?'layouts':value==='bases'?'layouts':'bases';selectMasterTab(next);document.getElementById('master-tab-'+next)?.focus();}}}>{t(value==='bases'?'basesCaption':'layoutsCaption')}</button>)}</div>
        <div className="slide-list" id="master-items" role="tabpanel" aria-labelledby={'master-tab-'+masterTab} ref={railRef}>{visibleMasterItems.map(item=>{const label=itemName(deck,item),isMaster=item.startsWith('m:'),isActive=item==='m:'+deck.activeMaster;return <div key={item} className={'slide-item '+(isMaster?'master-item':'layout-item')+(item===masterItem?' selected':'')+(isActive?' active-master':'')}><button className="master-preview" onClick={()=>setMasterView(item)} onDoubleClick={()=>setRenaming(item)} aria-label={label+(isActive?` (${t('activeMasterBadge')})`:'')} title={label}><LazyPreview deck={masterDeck(deck,item)} slide={masterSlide(deck,item)}/></button>
          {/* Names are renamed in place: double click (or the rename button), Enter saves, Esc cancels. */}
          <div className="master-item-caption">{renaming===item?<input className="item-name" autoFocus defaultValue={label} maxLength={200} aria-label={t('renameItem')} onBlur={e=>renameItem(item,e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.stopPropagation();e.currentTarget.value=label;e.currentTarget.blur();}}}/>:<span className="item-name" title={label} onDoubleClick={()=>setRenaming(item)}>{label}</span>}{isMaster&&<button type="button" className="master-activate" aria-label={`${t('activateMaster')}: ${label}`} data-tip={`${t('activateMaster')}: ${label}`} aria-pressed={isActive} onClick={()=>activateMaster(item.slice(2))}><Icon name="check"/></button>}</div></div>;})}</div>{railHandle}</aside>:
      <aside className={'slide-rail'+(selMode==='canvas'?' inactive':'')} style={{width:railWidth}} aria-label={t('slidePanel')} onPointerDown={toSlides} onFocus={toSlides}>{railTools}<div className="rail-caption"><span>{t('slides')}</span><span>{deck.slides.length}</span></div><div className="slide-list" ref={railRef}>{deck.slides.map((s,index)=><div key={s.id} data-id={s.id} draggable onDragStart={e=>e.dataTransfer.setData('text/esf-slide',s.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/esf-slide');if(!id||id===s.id)return;mutate(d=>{const from=d.slides.findIndex(x=>x.id===id);if(from<0)return;const [moved]=d.slides.splice(from,1);d.slides.splice(d.slides.findIndex(x=>x.id===s.id),0,moved);});}} className={'slide-item '+(tab.selected.includes(s.id)?'selected':'')}><span className="slide-number">{index+1}</span><button onClick={e=>selectSlide(s.id,e)} aria-label={`${t('slide')} ${index+1}: ${s.title}`}><LazyPreview deck={deck} slide={s}/></button></div>)}</div>{railHandle}</aside>)}
      <main className="workbench" onDragOver={e=>e.preventDefault()} onDrop={e=>void run(()=>dropFiles(e))}>
        <div className="canvas-scroll"><div className="slide-canvas" style={{width:`calc(min(100cqw, 100cqh * 16 / 9) * ${zoom/100})`}}><Preview deck={canvasDeck!} slide={editSlide!} edit={canvasEdit} frameRef={editorFrame}/></div></div>
        {!masterItem&&<div className="notes-bar"><label>{t('notes')}<textarea rows={2} value={slide.notes} placeholder={t('notes')} onChange={e=>mutate(d=>{d.slides.find(s=>s.id===slide.id)!.notes=e.target.value;})}/></label></div>}
      </main>
      {aiOpen&&<aside className="ai-sidebar" style={{width:aiWidth}}><div className="ai-resize" role="separator" aria-orientation="vertical" aria-label={t('resizeAI')} title={t('resizeAI')} tabIndex={0} onPointerDown={e=>resizePanel(e,'ai')} onDoubleClick={()=>setAiWidth(360)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setAiWidth(w=>Math.max(300,Math.min(900,w+(e.key==='ArrowLeft'?24:-24))));}}}/><header><button type="button" className="ai-title" title={t('sessions')} aria-expanded={sessionsOpen} onClick={()=>setSessionsOpen(x=>!x)}><Icon name="spark"/><span>{chatTitle(tab.chat)||t('assistant')}</span></button><div className="ai-actions"><ContextRing t={t} total={tab.total} language={prefs.language}/><IconButton icon="plus" label={t('newSession')} disabled={tab.busy} onClick={newConversation}/><IconButton icon="clock" label={t('sessions')} className={sessionsOpen?'active':''} aria-pressed={sessionsOpen} onClick={()=>setSessionsOpen(x=>!x)}/></div></header>
      {sessionsOpen?<div className="session-list" role="list" aria-label={t('sessions')}><input className="session-search" type="search" aria-label={t('searchSessions')} placeholder={t('searchSessions')} value={sessionQuery} onChange={e=>setSessionQuery(e.target.value)}/>{(()=>{const list=snapshot(tab).filter(c=>(c.title||t('untitledSession')).toLowerCase().includes(sessionQuery.trim().toLowerCase()));return list.length?list.map(c=><div role="listitem" key={c.id} className={'session-item '+(c.id===tab.conversation?'current':'')}><button disabled={tab.busy&&c.id!==tab.conversation} onClick={()=>openConversation(c.id)}><strong>{c.title||t('untitledSession')}</strong><small>{new Date(c.updated).getTime()>0?new Date(c.updated).toLocaleString(prefs.language,{dateStyle:'short',timeStyle:'short'}):''} · {c.chat.filter(m=>m.role!=='activity').length} {t('messages')}</small></button><IconButton icon="trash" label={t('deleteSession')} disabled={tab.busy&&c.id===tab.conversation} onClick={()=>{if(confirm(t('deleteSessionConfirm')))deleteConversation(c.id);}}/></div>):<p className="empty-sessions">{t('noSessions')}</p>;})()}</div>:<>
      <div className="chat-list" ref={chatRef} onScroll={e=>{const el=e.currentTarget;chatStick.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}}>{!tab.chat.length?<div className="chat-empty"><span className="spark-orb"><Icon name="spark"/></span><h3>{t('welcome')}</h3><p>{t('noChanges')}</p><button className="suggestion" onClick={()=>updateTab(active,x=>({...x,prompt:prefs.language==='pt'?'Melhore a clareza deste slide.':prefs.language==='es'?'Mejora la claridad de esta diapositiva.':'Improve the clarity of this slide.'}))}>{prefs.language==='pt'?'Melhore este slide':prefs.language==='es'?'Mejora esta diapositiva':'Improve this slide'} <span>↗</span></button></div>:tab.chat.map((m,i)=>m.role==='activity'?m.body?<details className="activity expandable" key={i}><summary><span className={'dot'+dotState(i,m)}/><span>{activityText(t,m)}</span><Icon name="chevron"/></summary><pre>{m.body}</pre></details>:<div className="activity" key={i}><span className={'dot'+dotState(i,m)}/><span>{activityText(t,m)}</span></div>:<div className={'message '+m.role} key={i}><small>{m.role==='user'?(prefs.language==='pt'?'Você':prefs.language==='es'?'Tú':'You'):m.agent||t('assistant')}</small>{m.text&&<p className={m.text.startsWith('⚠')?'chat-notice error':undefined}>{m.text}</p>}{m.questions&&<Questions t={t} questions={m.questions} answered={!!m.answered||tab.busy} onAnswer={a=>void run(()=>send(a))}/>}</div>)}{tab.busy&&<div className="thinking"><span className="dot running"/>{t('thinking')}{tab.progress!==undefined&&<> · {t('actWriting')} {(tab.progress/1024).toFixed(tab.progress<10240?1:0)} KB</>}{tab.tokens!==undefined&&tab.tokens>0&&<> · {compact(tab.tokens,prefs.language)} tokens</>}{tab.started&&<b>{Math.max(0,Math.floor((Date.now()-tab.started)/1000))} s</b>}</div>}{tab.proposal&&<Button className="outline" onClick={()=>{if(confirm(t('proposalWarning'))){mutate(d=>{d.slides=tab.proposal!.slides;d.masters=tab.proposal!.masters;d.activeMaster=tab.proposal!.activeMaster;d.layouts=tab.proposal!.layouts;d.assets=[...d.assets,...tab.proposal!.assets.filter(a=>!d.assets.some(b=>b.id===a.id))];});updateTab(active,x=>({...x,proposal:undefined}));}}}>{t('applyProposal')}</Button>}</div><div className="composer"><div className="composer-chips"><div className="context-chip"><Icon name={masterItem?'master':'file'}/>{masterItem?masterLabel(masterItem):tab.selected.length>1?`${tab.selected.length} ${t('selected')}`:`${t('slide')} ${deck.slides.indexOf(slide)+1}`}</div>{tab.attachments.map(f=><div className="context-chip attachment" key={f.path} title={f.path}><Icon name="clip"/><span>{f.name}</span><button aria-label={`${t('removeAttachment')}: ${f.name}`} title={t('removeAttachment')} onClick={()=>updateTab(active,x=>({...x,attachments:x.attachments.filter(a=>a.path!==f.path)}))}><Icon name="close"/></button></div>)}</div><textarea value={tab.prompt} onChange={e=>updateTab(active,x=>({...x,prompt:e.target.value}))} placeholder={t('ask')} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void run(send);}}}/><label className="composer-account"><span>{t('selectAccount')}</span><select value={prefs.activeProfile} disabled={tab.busy} onChange={e=>{updatePrefs({activeProfile:e.target.value});setModelOpen(false);}}><option value="">{t('selectAccount')}</option><AccountOptions profiles={prefs.profiles}/></select></label><div className="composer-bottom"><div className="composer-left"><IconButton icon="clip" label={t('attach')} className="icon" disabled={tab.busy} onClick={()=>void run(attach)}/><span>{tab.busy?t('thinking'):t('ready')}</span></div><div className="composer-right"><div className="model-picker" ref={modelRef}><button className="model-button" disabled={!activeAccount||tab.busy} title={t('modelHelp')} aria-haspopup="dialog" aria-expanded={modelOpen} onClick={()=>setModelOpen(x=>!x)}><span>{accountModels.find(m=>m.id===activeAccount?.model)?.name||activeAccount?.model||t('modelDefault')}{activeAccount?.effort?' · '+effortLabel(t,activeAccount?.effort):''}</span><Icon name="chevron"/></button>{modelOpen&&<div className="model-pop" role="dialog" aria-label={t('aiModel')}><div className="model-list" role="radiogroup" aria-label={t('aiModel')}>{accountModels.map(m=><button key={m.id} role="radio" aria-checked={(activeAccount?.model||'')===m.id} className={(activeAccount?.model||'')===m.id?'selected':''} onClick={()=>updateAccount({model:m.id})}><span>{m.name||t('modelDefault')}</span>{(activeAccount?.model||'')===m.id&&<Icon name="check"/>}</button>)}</div><label className="custom-model">{t('customModel')}<input value={activeAccount?.model||''} onChange={e=>updateAccount({model:e.target.value})} placeholder={t('modelDefault')}/></label>{accountEfforts.length>0&&<label className="effort" title={t('effortHelp')}><span>{t('effort')} <b>{effortLabel(t,activeAccount?.effort)}</b></span><input type="range" min={0} max={accountEfforts.length-1} step={1} value={Math.max(0,accountEfforts.indexOf((activeAccount?.effort||'') as any))} aria-label={t('effort')} aria-valuetext={effortLabel(t,activeAccount?.effort)} onChange={e=>updateAccount({effort:accountEfforts[Number(e.target.value)]})}/></label>}</div>}</div>{tab.busy?<Button className="stop" onClick={()=>void run(()=>api.invoke('aiCancel',active))}>{t('stop')}</Button>:<IconButton icon="send" label={t('send')} keys="↩" className="primary send" disabled={!tab.prompt.trim()||!activeAccount} onClick={()=>void run(send)}/>}</div></div></div></>}<SessionBar t={t} agent={prefs.profiles.find(p=>p.id===prefs.activeProfile)?.name} limits={limits[prefs.activeProfile]} language={prefs.language} usage={tab.profile===prefs.activeProfile?tab.usage:undefined} live={tab.busy?tab.tokens:undefined}/></aside>}
      </div><footer className="statusbar"><span className={tab.dirty?'dirty':'saved'}><Icon name={tab.dirty?'file':'check'}/>{tab.dirty?t('unsaved'):t('saved')}</span><button title={tab.project.path} disabled={!tab.project.path} onClick={()=>void run(()=>api.invoke('reveal',tab.project.path))}>{tab.project.path?tab.project.path.split(/[\\/]/).slice(-2).reverse().join(' — '):t('untitled')}</button><span className="status-center">{masterItem?`${t('editMaster')} · ${masterLabel(masterItem)}`:<>{t('slide')} {deck.slides.indexOf(slide)+1} {t('of')} {deck.slides.length} · <button className="layout-name" title={t('changeLayout')} onClick={()=>setLayoutPick('change')}>{layoutOf(deck,slide.layoutId).name}</button></>}</span><span className="app-version" title="Edukors Slides Editor">v{__APP_VERSION__}</span></footer>
    </>}
    {layoutPick&&tab&&deck&&slide&&<LayoutPicker t={t} deck={deck} mode={layoutPick} initial={slide.layoutId} onPick={id=>layoutPick==='insert'?addSlide(id):changeLayout(id)} onClose={()=>setLayoutPick(null)}/>}
    {templateName!==null&&deck&&<Modal small title={t('saveTemplate')} onClose={()=>setTemplateName(null)}><form onSubmit={e=>{e.preventDefault();const title=templateName.trim();if(!title)return;setTemplateName(null);void run(async()=>{await api.invoke('saveTemplate',{...deck,title});await refreshTemplates();setNotice(t('templateSaved'));});}}><label className="field">{t('templateName')}<input autoFocus value={templateName} maxLength={200} onChange={e=>setTemplateName(e.target.value)}/></label><footer><Button type="button" onClick={()=>setTemplateName(null)}>{t('cancel')}</Button><Button className="primary" type="submit" disabled={!templateName.trim()}>{t('save')}</Button></footer></form></Modal>}
    {update&&!notice&&<div className="toast" role="status"><Icon name="info"/>{t('updateReady').replace('{v}',update)}<button type="button" className="toast-action" onClick={()=>void run(()=>api.invoke('installUpdate'))}>{t('updateRestart')}</button><IconButton icon="close" label={t('close')} onClick={()=>setUpdate('')}/></div>}
    {notice&&<div className="toast" role="status"><Icon name="info"/>{notice}<IconButton icon="close" label={t('close')} onClick={()=>setNotice('')}/></div>}
    {error&&<Modal small title={t('error')} onClose={()=>setError('')}><p className="error-message">{error}</p><footer><Button className="primary" onClick={()=>setError('')}>{t('ok')}</Button></footer></Modal>}
    {pollTarget&&deck?.id===pollTarget.deck&&<Modal title={pollWords[prefs.language].title} onClose={()=>setPollTarget(null)}><PollEditor key={pollTarget.slide} initial={pollTarget.poll} lang={prefs.language} server={prefs.pollServer} onCancel={()=>setPollTarget(null)} onSave={poll=>{mutate(d=>{const target=d.slides.find(s=>s.id===pollTarget.slide);if(target){if(poll){target.poll=poll;target.title=poll.prompt.slice(0,200);}else delete target.poll;}});setManualSelection(null);canvasRange.current=null;setImageSel(false);setCropOn(false);setPollTarget(null);}}/></Modal>}
    {exportOpen&&deck&&slide&&<Modal title={t('exportTitle')} onClose={()=>{if(!exporting)setExportOpen(false);}} wide><p className="modal-subtitle">{deck.title} · {deck.slides.length} {t('slides').toLowerCase()}</p><div className="export-columns"><div><div className="format-options">{['html','pdf','pptx'].map(f=><button key={f} className={format===f?'selected':''} disabled={exporting} onClick={()=>{setFormat(f);setExportResult('');}}><Icon name="file"/><span><strong>{f.toUpperCase()} {f==='html'&&<em>{t('recommended')}</em>}</strong><small>{t((f+'Desc') as any)}</small></span><span className="radio-dot"/></button>)}</div><div className="export-info"><h3>{format.toUpperCase()}</h3><p>{format==='html'?t('htmlInfo'):t('staticInfo')}</p>{format==='html'&&['embedded','animations','tools'].map(k=><div key={k}><Icon name="check"/>{t(k as any)}</div>)}</div></div><div className="export-preview"><Preview deck={deck} slide={slide}/></div></div>{exportResult&&<div className="export-success"><span><Icon name="check"/>{t('exported')}</span><Button onClick={()=>void run(()=>api.invoke('openOutput',exportResult))}>{t('openFile')}</Button><Button onClick={()=>void run(()=>api.invoke('reveal',exportResult))}>{t('openFolder')}</Button></div>}<footer><Button disabled={exporting} onClick={()=>setExportOpen(false)}>{t('cancel')}</Button><Button className="primary" disabled={exporting} onClick={()=>void run(exportDeck)}>{exporting?t('exporting'):`${t('exportName')} ${format.toUpperCase()}`}</Button></footer></Modal>}
    {closeRequest&&<Modal small title={t('dirtyClose')} onClose={()=>setCloseRequest(null)}><p>{tabs.filter(x=>closeRequest.ids.includes(x.project.deck.id)&&x.dirty).map(x=>x.project.deck.title).join(', ')}</p><footer><Button onClick={()=>setCloseRequest(null)}>{t('cancel')}</Button><Button onClick={()=>void run(()=>finishClose(closeRequest.ids,closeRequest.quit,false))}>{t('discard')}</Button><Button className="primary" onClick={()=>void run(()=>finishClose(closeRequest.ids,closeRequest.quit,true))}>{t('save')}</Button></footer></Modal>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
