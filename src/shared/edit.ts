import type {Slide} from './model';
import {boxStyle} from './geometry';
export type SelectionDetails={index:number;kind:'text'|'image'|'link'|'shape'|'box';crop:boolean;fonts?:string[];style:Partial<Record<'fontFamily'|'fontSize'|'color'|'borderWidth'|'borderColor'|'borderStyle'|'backgroundColor'|'boxShadow'|'filter',string>>};
export type ObjectStyle=Partial<Record<'border-width'|'border-color'|'border-style'|'background-color'|'box-shadow'|'filter'|'z-index'|'position'|'isolation'|'text-align'|'align-content'|'justify-content'|'align-items',string>>;
// Properties the frame may set on an object: the format bar, stacking order and text alignment (context menu).
// Images get their shadow as a drop-shadow filter, which follows transparent pixels.
const fixed:Record<string,RegExp>={filter:/^(none|drop-shadow\(-?[\d.]+(px)? -?[\d.]+(px)? [\d.]+(px)? #[\da-f]{3,8}\))$/i,'z-index':/^-?\d{1,6}$/,position:/^relative$/,isolation:/^isolate$/,'text-align':/^(left|center|right)$/,'align-content':/^(start|center|end)$/,'justify-content':/^(flex-start|center|flex-end)$/,'align-items':/^(flex-start|center|flex-end)$/};
export const objectStyleKeys=['border-width','border-color','border-style','background-color','box-shadow',...Object.keys(fixed)];
const styleValue=(key:string,value:unknown)=>objectStyleKeys.includes(key)&&typeof value==='string'&&value.length<=256&&!/[;{}<>]|url\s*\(/i.test(value)&&(!fixed[key]||fixed[key].test(value));
export function cleanSelection(value:any,index:number|undefined):SelectionDetails|undefined{
  if(!value||value.index!==index||!Number.isInteger(index)||!['text','image','link','shape','box'].includes(value.kind))return;
  const style:SelectionDetails['style']={};
  for(const key of ['fontFamily','fontSize','color','borderWidth','borderColor','borderStyle','backgroundColor','boxShadow','filter'] as const)if(typeof value.style?.[key]==='string')style[key]=value.style[key].slice(0,512);
  return{index:index!,kind:value.kind,crop:value.crop===true,style,fonts:Array.isArray(value.fonts)?value.fonts.filter((f:unknown)=>typeof f==='string'&&f.length<200).slice(0,200):[]};
}
// Direct editing on the canvas. Every element of the slide HTML is addressed by its position in document order, the same
// on the annotated canvas document and on the saved HTML, so the frame only sends small operations (browser only: DOMParser).
// The frame decides what is an object (text block, media, or a box with background/border/shadow) from computed styles.
export type EditOp={type:'text';index:number;html:string}|{type:'move';index:number;x:number;y:number;inline?:boolean}|{type:'resize';index:number;width:number;height:number;x:number;y:number;fit?:boolean}|{type:'delete';index:number}|{type:'crop';index:number;inset:number[]}|{type:'style';index:number;style:ObjectStyle};
const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html');
// Slides written without data-field (by the AI or imported) still get editable text: each visible text block is a target.
const inlineTags=new Set('A ABBR B BDI BDO BR CITE CODE DATA DFN EM I KBD MARK Q S SAMP SMALL SPAN STRONG SUB SUP TIME U VAR'.split(' '));
function textBlocks(doc:Document){const out:HTMLElement[]=[],walk=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT),own=(el:Element)=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent!.trim());
  for(let n=walk.nextNode();n;n=walk.nextNode()){const el=n.parentElement;if(!n.textContent!.trim()||!el||el.closest('script,style,svg,template,noscript,textarea,select,option'))continue;
    let block:HTMLElement=el;while(inlineTags.has(block.tagName)&&block.parentElement&&block.parentElement!==doc.body)block=block.parentElement;
    if(block!==el&&!own(block)){let c:HTMLElement=el;while(c.parentElement!==block)c=c.parentElement!;block=c;}
    if(!out.some(b=>b===block||b.contains(block)))out.push(block);}
  return out;}
// Source whitespace collapses as on screen and <br> is a new line.
export const fieldText=(el:Element)=>{const c=el.cloneNode(true) as Element;c.querySelectorAll('br').forEach(b=>b.replaceWith('\u0000'));return(c.textContent||'').replace(/\s+/g,' ').trim().replace(/ ?\u0000 ?/g,'\n');};
const elements=(doc:Document)=>[...doc.body.querySelectorAll('*')];
// Text blocks are edited as a whole: layout fields, or for slides without data-field each visible block of text.
function textTargets(doc:Document){
  // A data-field may identify an image or an entire card, not just editable text.
  const media='img,svg,video,canvas',textOnly=(el:Element)=>!el.matches(media)&&!el.querySelector(media);
  const found=[...new Set([...doc.querySelectorAll('[data-field]'),...textBlocks(doc)].map(el=>{const field=el.closest('[data-field]');return field&&textOnly(field)?field:el;}))].filter(el=>el.getAttribute('data-field')!=='image-label'&&textOnly(el));
  return found.filter(el=>!found.some(o=>o!==el&&o.contains(el)));
}
// An inserted link is one object (moved and resized as a box, its text set from the format bar), even without a visible box;
// an inserted shape is one object too (its SVG is not media of its own).
export function annotate(html:string){
  const doc=parse(html),text=new Set(textTargets(doc));
  elements(doc).forEach((el,i)=>{el.setAttribute('data-esf-edit',String(i));const manual=el.getAttribute('data-manual'),kind=manual==='shape'?'shape':manual==='link'?'link':/^(img|svg|video|canvas)$/i.test(el.tagName)?'media':text.has(el)?'text':'';
    // Layout elements are locked like the master's objects; of a layout field only the text is edited (fixed in place).
    if(el.closest('[data-from-layout]')&&!el.matches('[data-image-slot] img')){if(kind==='text'&&el.hasAttribute('data-field')&&!el.closest('[data-manual]'))el.setAttribute('data-esf-fixed','');else{el.setAttribute('data-esf-locked','');return;}}
    if(kind)el.setAttribute('data-esf-kind',kind);});
  return doc.body.innerHTML;
}
export const editIndex=(doc:Document,el:Element)=>elements(doc).indexOf(el);
// Operations come from the slide frame, where slide scripts also run: accept only well-formed ones.
export function cleanOp(op:any):EditOp|null{
  if(!op||!Number.isInteger(op.index)||op.index<0)return null;
  if(op.type==='text'&&typeof op.html==='string'&&op.html.length<=500000)return{type:'text',index:op.index,html:op.html};
  if(op.type==='move'&&[op.x,op.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=16000)){const c=(n:number)=>Math.round(n*100)/100;return{type:'move',index:op.index,x:c(op.x),y:c(op.y),...op.inline===true?{inline:true}:{}};}
  if(op.type==='resize'&&[op.width,op.height,op.x,op.y].every(Number.isFinite)&&op.width>=1&&op.height>=1&&op.width<=16000&&op.height<=16000&&Math.abs(op.x)<=16000&&Math.abs(op.y)<=16000){const c=(n:number)=>Math.round(n*100)/100;return{type:'resize',index:op.index,width:c(op.width),height:c(op.height),x:c(op.x),y:c(op.y),...op.fit===true?{fit:true}:{}};}
  if(op.type==='delete')return{type:'delete',index:op.index};
  if(op.type==='style'&&op.style&&typeof op.style==='object'){
    const entries=Object.entries(op.style);
    if(entries.length&&entries.every(([key,value])=>styleValue(key,value)))return{type:'style',index:op.index,style:Object.fromEntries(entries)};
  }
  // Crop: inset percentages (top, right, bottom, left) that always keep part of the image.
  if(op.type==='crop'&&Array.isArray(op.inset)&&op.inset.length===4&&op.inset.every((n:any)=>Number.isFinite(n)&&n>=0&&n<100)&&op.inset[0]+op.inset[2]<100&&op.inset[1]+op.inset[3]<100)return{type:'crop',index:op.index,inset:op.inset.map((n:number)=>Math.round(n*10)/10)};
  return null;
}
// The edited block keeps its inline markup (colored spans, bold…). Chromium editing may add <font> or wrap lines in
// <div>/<p>; those become a span and <br>. Scripts, event attributes and editor marks never reach the saved HTML.
function inlineContent(target:Element,html:string){
  const doc=target.ownerDocument,tpl=doc.createElement('template');tpl.innerHTML=html;
  const clean=(node:Node)=>{for(const c of [...node.childNodes]){
    if(c.nodeType===3)continue;if(c.nodeType!==1){c.remove();continue;}
    const el=c as Element,tag=el.tagName.toUpperCase();
    if(/^(SCRIPT|STYLE|TEMPLATE|IFRAME|OBJECT|EMBED|NOSCRIPT|META|LINK)$/.test(tag)){el.remove();continue;}
    clean(el);
    for(const a of [...el.attributes])if(/^on|^contenteditable$|^data-esf-/i.test(a.name)||/^\s*javascript:/i.test(a.value))el.removeAttribute(a.name);
    if(tag==='FONT'){const span=doc.createElement('span'),color=el.getAttribute('color');if(color)span.style.color=color;span.append(...el.childNodes);el.replaceWith(span);}
    else if(tag==='DIV'||tag==='P'){if(el.previousSibling)el.before(doc.createElement('br'));el.replaceWith(...el.childNodes);}
  }};
  clean(tpl.content);return tpl.content;
}
// The static version (previews, PDF, PPTX) gets each change on its counterpart: same data-field, or the element at the same
// position with the same tag and text when both versions have the same structure; otherwise it would stay stale and is dropped.
// All operations of a gesture resolve their elements first, so deleting several never shifts the others.
export function applyEdits(slide:Slide,ops:EditOp[]):Slide{
  const doc=parse(slide.html),all=elements(doc),sdoc=slide.staticHtml?parse(slide.staticHtml):null,sall=sdoc?elements(sdoc):[];
  const jobs=ops.filter(op=>{const el=all[op.index];return el&&(!el.closest('[data-from-layout]')||op.type==='text'&&el.hasAttribute('data-field')&&!el.closest('[data-manual]')||el.matches('[data-image-slot] img'));}).map(op=>{const el=all[op.index],field=el.getAttribute('data-field');let twins:Element[]=[];
    if(sdoc){if(field)twins=sall.filter(x=>x.getAttribute('data-field')===field);else{const t=sall[op.index];if(sall.length===all.length&&t?.tagName===el.tagName&&fieldText(t)===fieldText(el))twins=[t];}}
    return{op,el,twins};});
  if(!jobs.length)return slide;
  const apply=(op:EditOp,el:Element)=>{
    if(op.type==='style'&&'style' in el)for(const [key,value] of Object.entries(op.style))(el as HTMLElement).style.setProperty(key,value,'important');
    if(op.type==='text')el.replaceChildren(inlineContent(el,op.html));
    if(op.type==='move'&&'style' in el){const s=(el as HTMLElement).style;s.setProperty('translate',`${op.x}px ${op.y}px`,'important');if(op.inline)s.setProperty('display','inline-block','important');}
    if(op.type==='crop'&&'style' in el)(el as HTMLElement).style.setProperty('clip-path',`inset(${op.inset.map(n=>n+'%').join(' ')})`,'important');
    if(op.type==='resize'&&'style' in el)for(const [key,value] of Object.entries(boxStyle(op.width,op.height,op.x,op.y,op.fit)))(el as HTMLElement).style.setProperty(key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value,'important');
    if(op.type==='delete'){const slot=el.parentElement?.closest<HTMLElement>('[data-image-slot]');
      // An image removed from a layout slot gives the placeholder back, as in the "Text and image" layout.
      if(slot&&el.tagName==='IMG'&&slot.children.length===1){slot.innerHTML='<span data-field="image-label" style="font-size:28px;color:var(--muted)">＋</span>';slot.style.border='2px dashed #8895ac55';}else{const shadow=el.parentElement?.matches('[data-image-shadow]')&&el.parentElement.children.length===1?el.parentElement:null;(shadow||el).remove();}}
  };
  for(const j of [...jobs.filter(j=>j.op.type!=='delete'),...jobs.filter(j=>j.op.type==='delete')]){apply(j.op,j.el);j.twins.forEach(t=>apply(j.op,t));}
  // The slide title (thumbnail label, presenter view) follows the layout's title field.
  const titled=jobs.find(j=>j.op.type==='text'&&j.el.getAttribute('data-field')==='title'&&j.el.isConnected),title=titled&&fieldText(titled.el).replace(/\n/g,' ')||slide.title;
  return{...slide,title,html:doc.body.innerHTML,staticHtml:sdoc?(jobs.every(j=>j.twins.length)?sdoc.body.innerHTML:''):slide.staticHtml};
}
