import type {Slide} from './model';
import {boxStyle} from './geometry';
export type SelectionDetails={index:number;kind:'text'|'image'|'link'|'shape'|'line'|'table'|'box';crop:boolean;fonts?:string[];list?:'bulleted'|'numbered'|'none';style:Partial<Record<'fontFamily'|'fontSize'|'fontWeight'|'fontStyle'|'textDecorationLine'|'verticalAlign'|'color'|'borderWidth'|'borderColor'|'borderStyle'|'backgroundColor'|'boxShadow'|'filter'|'opacity'|'textAlign'|'alignContent'|'lineHeight',string>>};
export type ObjectStyle=Partial<Record<'border-width'|'border-color'|'border-style'|'background-color'|'box-shadow'|'filter'|'opacity'|'z-index'|'position'|'isolation'|'text-align'|'align-content'|'justify-content'|'align-items'|'font-size'|'line-height'|'vertical-align'|'font-weight'|'font-style'|'text-decoration-line'|'color'|'font-family',string>>;
// Properties the frame may set on an object: the format bar, stacking order and text alignment (context menu).
// Images get their shadow as a drop-shadow filter, which follows transparent pixels. A text block's own font size
// follows its text after a size change (canvas.ts, fitBlockSize), so its lines are not spaced for a larger size.
const fixed:Record<string,RegExp>={'font-size':/^\d{1,4}(\.\d{1,2})?px$/,filter:/^(none|drop-shadow\(-?[\d.]+(px)? -?[\d.]+(px)? [\d.]+(px)? #[\da-f]{3,8}\))$/i,'z-index':/^-?\d{1,6}$/,position:/^relative$/,isolation:/^isolate$/,'text-align':/^(left|center|right|justify)$/,opacity:/^(0(\.\d{1,3})?|1(\.0{1,3})?)$/,'align-content':/^(start|center|end)$/,'justify-content':/^(flex-start|center|flex-end)$/,'align-items':/^(flex-start|center|flex-end)$/,'line-height':/^[0-5](\.\d{1,2})?$/,'vertical-align':/^(top|middle|bottom)$/,
  // Text look set on an empty table cell (several cells formatted at once), so what is typed there later has it.
  'font-weight':/^(400|700)$/,'font-style':/^(normal|italic)$/,'text-decoration-line':/^(none|underline|line-through)$/,color:/^(#[\da-f]{3,8}|rgba?\([\d.,\s%]+\))$/i,'font-family':/^[\w\s"',-]{1,200}$/};
export const objectStyleKeys=['border-width','border-color','border-style','background-color','box-shadow',...Object.keys(fixed)];
const styleValue=(key:string,value:unknown)=>objectStyleKeys.includes(key)&&typeof value==='string'&&value.length<=256&&!/[;{}<>]|url\s*\(/i.test(value)&&(!fixed[key]||fixed[key].test(value));
export function cleanSelection(value:any,index:number|undefined):SelectionDetails|undefined{
  if(!value||value.index!==index||!Number.isInteger(index)||!['text','image','link','shape','line','table','box'].includes(value.kind))return;
  const style:SelectionDetails['style']={};
  for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','textDecorationLine','verticalAlign','color','borderWidth','borderColor','borderStyle','backgroundColor','boxShadow','filter','opacity','textAlign','alignContent','lineHeight'] as const)if(typeof value.style?.[key]==='string')style[key]=value.style[key].slice(0,512);
  return{index:index!,kind:value.kind,crop:value.crop===true,style,fonts:Array.isArray(value.fonts)?value.fonts.filter((f:unknown)=>typeof f==='string'&&f.length<200).slice(0,200):[],...['bulleted','numbered','none'].includes(value.list)?{list:value.list}:{}};
}
// Direct editing on the canvas. Every element of the slide HTML is addressed by its position in document order, the same
// on the annotated canvas document and on the saved HTML, so the frame only sends small operations (browser only: DOMParser).
// The frame decides what is an object (text block, media, or a box with background/border/shadow) from computed styles.
export type EditOp={type:'text';index:number;html:string}|{type:'move';index:number;x:number;y:number;inline?:boolean}|{type:'resize';index:number;width:number;height:number;x:number;y:number;fit?:boolean}|{type:'delete';index:number}|{type:'crop';index:number;inset:number[]}|{type:'rotate';index:number;angle:number}|{type:'style';index:number;style:ObjectStyle}|{type:'tableSize';index:number;cols?:number[];rows?:number[]};
const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html');
// Slides written without data-field (by the AI or imported) still get editable text: each visible text block is a target.
const inlineTags=new Set('A ABBR B BDI BDO BR CITE CODE DATA DFN EM I KBD MARK Q S SAMP SMALL SPAN STRONG SUB SUP TIME U VAR'.split(' '));
// A paragraph is one text even when all its words sit in spans (PowerPoint runs, partial formatting); other blocks made
// only of inline children (a card with a badge and a value) keep each child as its own text.
const paragraphTags=new Set('P H1 H2 H3 H4 H5 H6 LI DT DD FIGCAPTION CAPTION BLOCKQUOTE'.split(' '));
function textBlocks(doc:Document){const out:HTMLElement[]=[],walk=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT),own=(el:Element)=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent!.trim());
  for(let n=walk.nextNode();n;n=walk.nextNode()){const el=n.parentElement;if(!n.textContent!.trim()||!el||el.closest('script,style,svg,template,noscript,textarea,select,option'))continue;
    let block:HTMLElement=el;while(inlineTags.has(block.tagName)&&block.parentElement&&block.parentElement!==doc.body)block=block.parentElement;
    if(block!==el&&!own(block)&&!paragraphTags.has(block.tagName)){let c:HTMLElement=el;while(c.parentElement!==block)c=c.parentElement!;block=c;}
    if(!out.some(b=>b===block||b.contains(block)))out.push(block);}
  return out;}
// Source whitespace collapses as on screen and <br> is a new line.
export const fieldText=(el:Element)=>{const c=el.cloneNode(true) as Element;c.querySelectorAll('br').forEach(b=>b.replaceWith('\u0000'));return(c.textContent||'').replace(/\s+/g,' ').trim().replace(/ ?\u0000 ?/g,'\n');};
const elements=(doc:Document)=>[...doc.body.querySelectorAll('*')];
// Text blocks are edited as a whole: layout fields, or for slides without data-field each visible block of text.
function textTargets(doc:Document){
  // A data-field may identify an image or an entire card, not just editable text.
  const media='img,svg,video,canvas',textOnly=(el:Element)=>!el.matches(media)&&!el.querySelector(media);
  // Each cell of an inserted table is a text of its own, even empty.
  const found=[...new Set([...doc.querySelectorAll('[data-field]'),...doc.querySelectorAll('table[data-manual=table] :is(td,th)'),...textBlocks(doc)].map(el=>{const field=el.closest('[data-field]');return field&&textOnly(field)?field:el;}))].filter(el=>el.getAttribute('data-field')!=='image-label'&&textOnly(el));
  return found.filter(el=>!found.some(o=>o!==el&&o.contains(el)));
}
// An inserted link is one object (moved and resized as a box, its text set from the format bar), even without a visible box;
// an inserted shape is one object too (its SVG is not media of its own). An inserted table is one object whose cells are texts.
export function annotate(html:string){
  const doc=parse(html),text=new Set(textTargets(doc));
  elements(doc).forEach((el,i)=>{el.setAttribute('data-esf-edit',String(i));const manual=el.getAttribute('data-manual'),kind=manual==='shape'?'shape':manual==='line'?'line':manual==='link'?'link':manual==='table'?'table':/^(img|svg|video|canvas)$/i.test(el.tagName)?'media':text.has(el)?'text':'';
    // Everything a layout brings, its texts included, is locked on the slides like the base's objects (decision of
    // 02/11/2026): layouts change only in the slide master; a slide's own content is its own objects. A layout's empty
    // image slot still takes the slide's picture.
    if(el.closest('[data-from-layout]')&&!el.matches('[data-image-slot] img')){el.setAttribute('data-esf-locked','');return;}
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
  // A table's columns (percentages of its width) and rows (heights in px).
  if(op.type==='tableSize'&&(op.cols!==undefined||op.rows!==undefined)){
    const ok=(a:any,min:number,max:number)=>a===undefined||Array.isArray(a)&&a.length>=1&&a.length<=100&&a.every((n:any)=>Number.isFinite(n)&&n>=min&&n<=max),c=(n:number)=>Math.round(n*100)/100;
    if(ok(op.cols,0.1,100)&&ok(op.rows,1,16000))return{type:'tableSize',index:op.index,...op.cols?{cols:op.cols.map(c)}:{},...op.rows?{rows:op.rows.map(c)}:{}};
  }
  if(op.type==='rotate'&&Number.isFinite(op.angle)&&Math.abs(op.angle)<=720)return{type:'rotate',index:op.index,angle:Math.round(op.angle*10)/10};
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
  const jobs=ops.filter(op=>{const el=all[op.index];return el&&(!el.closest('[data-from-layout]')||el.matches('[data-image-slot] img'));}).map(op=>{const el=all[op.index],field=el.getAttribute('data-field');let twins:Element[]=[];
    if(sdoc){if(field)twins=sall.filter(x=>x.getAttribute('data-field')===field);else{const t=sall[op.index];if(sall.length===all.length&&t?.tagName===el.tagName&&fieldText(t)===fieldText(el))twins=[t];}}
    return{op,el,twins};});
  if(!jobs.length)return slide;
  const apply=(op:EditOp,el:Element)=>{
    if(op.type==='style'&&'style' in el)for(const [key,value] of Object.entries(op.style))(el as HTMLElement).style.setProperty(key,value,'important');
    if(op.type==='text')el.replaceChildren(inlineContent(el,op.html));
    if(op.type==='move'&&'style' in el){const s=(el as HTMLElement).style;s.setProperty('translate',`${op.x}px ${op.y}px`,'important');if(op.inline)s.setProperty('display','inline-block','important');}
    // Rotation is the CSS rotate property: it turns the object around its center and adds to any transform it has.
    if(op.type==='rotate'&&'style' in el){const s=(el as HTMLElement).style,a=((op.angle%360)+540)%360-180;if(Math.abs(a)<0.05)s.removeProperty('rotate');else s.setProperty('rotate',`${Math.round(a*10)/10}deg`,'important');}
    if(op.type==='tableSize'&&el.matches('table[data-manual=table]')){const t=el as HTMLTableElement,d=t.ownerDocument;
      if(op.cols){let cg=t.querySelector(':scope>colgroup');if(!cg){cg=d.createElement('colgroup');t.insertBefore(cg,t.firstChild);}
        if(cg.children.length!==op.cols.length)cg.replaceChildren(...op.cols.map(()=>d.createElement('col')));[...cg.children].forEach((col,i)=>(col as HTMLElement).style.setProperty('width',op.cols![i]+'%','important'));}
      if(op.rows&&t.rows.length===op.rows.length){[...t.rows].forEach((tr,i)=>tr.style.setProperty('height',op.rows![i]+'px','important'));t.style.setProperty('height',Math.round(op.rows.reduce((a,b)=>a+b,0)*100)/100+'px','important');}}
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
