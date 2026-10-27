import {escapeHtml,uid} from './model';
import type {Slide} from './model';
import {annotate,editIndex} from './edit';
import type {SelectionDetails} from './edit';
import {qrSvg} from './qr';

export type ManualKind='text'|'image'|'link'|'shape';
export type ManualStyle='borderWidth'|'borderColor'|'backgroundColor'|'boxShadow'|'fontFamily'|'fontSize'|'color'|'objectFit'|'objectPosition'|'clipPath';
const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html');
// Shapes are an SVG filling their box: rectangles and the ellipse in CSS pixels (round corners stay round), the others on a
// 100 × 100 grid stretched to the box with a stroke that keeps its width. Fill, line and width live in the painted part's style.
export const shapeTypes=['rect','rounded','ellipse','triangle','rightTriangle','diamond','pentagon','hexagon','arrow','star'] as const;
export type ShapeType=typeof shapeTypes[number];
export const shapePaths:Record<string,string>={triangle:'M50 0L100 100H0Z',rightTriangle:'M0 0L100 100H0Z',diamond:'M50 0L100 50L50 100L0 50Z',pentagon:'M50 0L100 38L81 100H19L0 38Z',hexagon:'M25 0H75L100 50L75 100H25L0 50Z',arrow:'M0 30H62V0L100 50L62 100V70H0Z',star:'M50 0L61.8 35.4H99L68.8 57.3L80.3 92.7L50 70.8L19.7 92.7L31.2 57.3L1 35.4H38.2Z'};
export type ShapeLook={type:ShapeType;fill:string;stroke:string;width:number;shadow:boolean};
const shapeShadow='drop-shadow(0 12px 18px #17203355)';
const color=(v:string)=>/^(#[\da-f]{3,8}|rgba?\([\d.,\s%]+\)|none|transparent)$/i.test(v.trim())?v.trim():null;
function shapeSvg(look:Omit<ShapeLook,'shadow'>){
  const style=`fill:${look.fill};stroke:${look.stroke};stroke-width:${look.width}px;vector-effect:non-scaling-stroke`,path=shapePaths[look.type];
  const part=path?`<path data-shape-part d="${path}" style="${style}"/>`:look.type==='ellipse'?`<ellipse data-shape-part cx="50%" cy="50%" rx="50%" ry="50%" style="${style}"/>`:`<rect data-shape-part width="100%" height="100%"${look.type==='rounded'?' rx="28" ry="28"':''} style="${style}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${path?'viewBox="0 0 100 100" preserveAspectRatio="none" ':''}width="100%" height="100%" style="display:block;width:100%;height:100%;overflow:visible">${part}</svg>`;
}
export function shapeLook(el:Element):ShapeLook{
  const part=el.querySelector<SVGElement>('[data-shape-part]'),type=(shapeTypes as readonly string[]).includes((el as HTMLElement).dataset.shape||'')?(el as HTMLElement).dataset.shape as ShapeType:'rect';
  return{type,fill:part?.style.fill||part?.getAttribute('fill')||'none',stroke:part?.style.stroke||part?.getAttribute('stroke')||'#2f4fd0',width:parseFloat(part?.style.strokeWidth||part?.getAttribute('stroke-width')||'0')||0,shadow:/drop-shadow/.test((el as HTMLElement).style?.filter||'')};
}
export function setShape(slide:Slide,index:number,change:Partial<ShapeLook>){return updateElement(slide,index,el=>{
  if(el.dataset.manual!=='shape')return;const look={...shapeLook(el),...change};
  if(!(shapeTypes as readonly string[]).includes(look.type))return;
  look.fill=color(look.fill==='transparent'?'none':look.fill)||'none';look.stroke=color(look.stroke)||'#2f4fd0';look.width=Math.max(0,Math.min(64,Number(look.width)||0));
  el.dataset.shape=look.type;el.innerHTML=shapeSvg(look);
  if(change.shadow!==undefined){if(look.shadow)el.style.filter=shapeShadow;else el.style.removeProperty('filter');}
});}
// A link's text is its <a>: font, color and weight are set there (its box keeps the alignment).
export type LinkStyle='fontSize'|'fontFamily'|'color'|'fontWeight'|'fontStyle'|'textDecoration';
export function setLinkStyle(slide:Slide,index:number,key:LinkStyle,value:string){return updateElement(slide,index,el=>{const a=el.querySelector('a');if(a)a.style.setProperty(key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value,'important');});}
export const linkLook=(el:Element)=>{const a=el.querySelector('a');return{bold:/^(bold|bolder|[6-9]00)$/.test(a?.style.fontWeight||''),italic:a?.style.fontStyle==='italic',underline:!/none/.test(a?.style.textDecoration||'')};};
const safeUrl=(value:string)=>{try{const url=new URL(value.trim());return /^(https?:|mailto:)$/.test(url.protocol)?url.href:null;}catch{return null;}};
export function insertManual(slide:Slide,kind:ManualKind,payload=''):{slide:Slide;index:number}{
  const doc=parse(slide.html),el=doc.createElement(kind==='image'?'img':'div');
  el.setAttribute('data-manual',kind);
  el.style.cssText='position:absolute;left:500px;top:270px;width:600px;min-height:100px;z-index:10;box-sizing:border-box';
  if(kind==='text'){
    el.setAttribute('data-field',uid('manual'));
    el.style.cssText+=';font:48px Arial,sans-serif;color:#172033;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px';
    el.innerHTML=escapeHtml(payload);
  }else if(kind==='shape'){
    const type=(shapeTypes as readonly string[]).includes(payload)?payload as ShapeType:'rect',square=!/^(rect|rounded|arrow)$/.test(type);
    el.dataset.shape=type;el.style.removeProperty('min-height');el.style.width=(square?300:420)+'px';el.style.height=(square?300:260)+'px';
    el.innerHTML=shapeSvg({type,fill:'#4a6cf7',stroke:'#2f4fd0',width:0});
  }else if(kind==='image'){
    el.setAttribute('src',payload);el.setAttribute('alt','');
    el.style.cssText+=';height:340px;object-fit:contain';
  }else{
    // A link is only its text (the caption, when given, replaces the URL); its QR code is a separate image.
    const url=safeUrl(payload)||'https://example.com/';
    el.setAttribute('data-url',url);el.setAttribute('data-link-id',uid('link'));el.style.removeProperty('min-height');
    el.innerHTML=`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="font:30px Arial,sans-serif;color:#5265e8;overflow-wrap:anywhere">${escapeHtml(url)}</a><span data-link-caption hidden></span>`;
  }
  (doc.querySelector('.slide')||doc.body).append(el);
  return{slide:{...slide,html:doc.body.innerHTML,staticHtml:''},index:editIndex(doc,el)};
}
export function manualElement(slide:Slide,index:number){const doc=parse(slide.html);return [...doc.body.querySelectorAll('*')][index] as HTMLElement|undefined;}
// Selection addresses the actual source element. Legacy objects need no data-manual marker or migration.
export function editableAt(slide:Slide,index:number,details?:SelectionDetails){
  const doc=parse(annotate(slide.html)),el=[...doc.body.querySelectorAll('*')][index] as HTMLElement|undefined;if(!el||!('style' in el)||el.matches('.slide'))return null;
  const kind:SelectionDetails['kind']=details?.index===index?details.kind:el.dataset.manual==='shape'?'shape':/^(img|svg|video|canvas)$/i.test(el.tagName)?'image':el.dataset.esfKind==='text'?'text':el.dataset.manual==='link'?'link':'box';
  return{kind,index,element:el};
}
// Image shadow: a drop-shadow, which follows transparent pixels. An image placed on the slide (absolute) gets it on a wrapper
// filling its parent, because the crop (clip-path) would cut a shadow of its own; the stacking order goes with it.
export const imageShadow='drop-shadow(0 12px 18px #17203366)';
export function wrapShadow(doc:Document,el:HTMLElement,filter:string){
  const w=doc.createElement('div');w.setAttribute('data-image-shadow','');w.setAttribute('style',`position:absolute;inset:0;pointer-events:none;filter:${filter}`);
  const z=el.style.getPropertyValue('z-index');if(z){w.style.zIndex=z;el.style.removeProperty('z-index');}
  el.replaceWith(w);w.append(el);
}
export function setImageShadow(slide:Slide,index:number,on:boolean){
  const doc=parse(slide.html),el=elementAt(doc,index);if(!el)return{slide,index};
  const wrap=el.parentElement?.matches('[data-image-shadow]')?el.parentElement:null;
  if(wrap){if(wrap.style.zIndex)el.style.setProperty('z-index',wrap.style.zIndex,'important');wrap.replaceWith(el);}
  el.style.removeProperty('filter');el.style.removeProperty('box-shadow');
  if(on){if(el.style.position==='absolute')wrapShadow(doc,el,imageShadow);else el.style.setProperty('filter',imageShadow,'important');}
  if(!el.getAttribute('style'))el.removeAttribute('style');
  return{slide:{...slide,html:doc.body.innerHTML,staticHtml:''},index:editIndex(doc,el)};
}
const elementAt=(doc:Document,index:number)=>{const el=[...doc.body.querySelectorAll('*')][index] as HTMLElement|undefined;return el&&'style' in el&&!el.matches('.slide')?el:null;};
export function updateElement(slide:Slide,index:number,fn:(el:HTMLElement)=>void):Slide{
  const doc=parse(slide.html),el=[...doc.body.querySelectorAll('*')][index] as HTMLElement|undefined;
  if(!el||!('style' in el)||el.matches('.slide'))return slide;
  const before=new Map([...el.style].map(key=>[key,el.style.getPropertyValue(key)]));
  fn(el);
  // Explicit formatting must override legacy stylesheets, including their !important rules.
  for(const key of [...el.style])if(el.style.getPropertyValue(key)!==before.get(key))el.style.setProperty(key,el.style.getPropertyValue(key),'important');
  return{...slide,html:doc.body.innerHTML,staticHtml:''};
}
export function setElementStyle(slide:Slide,index:number,key:ManualStyle,value:string){return updateElement(slide,index,el=>{el.style[key]=value;});}
export {safeUrl};
const linkLabel=(el:HTMLElement)=>{const a=el.querySelector('a'),caption=el.querySelector('[data-link-caption]')?.textContent?.trim();if(a)a.textContent=caption||el.dataset.url||'';};
const qrSrc=(url:string)=>'data:image/svg+xml,'+encodeURIComponent(qrSvg(url));
const qrsOf=(el:HTMLElement)=>el.dataset.linkId?[...el.ownerDocument.querySelectorAll<HTMLImageElement>('img[data-link-qr]')].filter(q=>q.dataset.linkQr===el.dataset.linkId):[];
export const linkHasQr=(el:HTMLElement)=>qrsOf(el).length>0;
export function setLinkUrl(slide:Slide,index:number,url:string){return updateElement(slide,index,el=>{el.dataset.url=url;const a=el.querySelector('a');if(a)a.href=url;linkLabel(el);qrsOf(el).forEach(q=>q.src=qrSrc(url));});}
export function setLinkCaption(slide:Slide,index:number,caption:string){return updateElement(slide,index,el=>{const c=el.querySelector('[data-link-caption]')||el.appendChild(el.ownerDocument.createElement('span'));c.setAttribute('data-link-caption','');c.textContent=caption.trim();linkLabel(el);});}
// The QR code goes next to the link, as its own image object.
export function setLinkQr(slide:Slide,index:number,enabled:boolean){return updateElement(slide,index,el=>{
  if(!el.dataset.linkId)el.dataset.linkId=uid('link');
  const existing=qrsOf(el);if(!enabled){existing.forEach(q=>q.remove());return;}if(existing.length)return;
  const qr=el.ownerDocument.createElement('img'),left=parseFloat(el.style.left)||0,top=parseFloat(el.style.top)||0,width=parseFloat(el.style.width)||600;
  qr.setAttribute('data-manual','image');qr.dataset.linkQr=el.dataset.linkId;qr.alt='QR code';qr.src=qrSrc(el.dataset.url||'');
  qr.style.cssText=`position:absolute;left:${Math.min(left+width+32,1220)}px;top:${top}px;width:360px;height:360px;z-index:10;box-sizing:border-box;object-fit:contain`;
  if(el.style.translate)qr.style.translate=el.style.translate;el.after(qr);
});}
