import {Deck,Slide,Layout} from './model';
const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html');
const rootOf=(doc:Document)=>doc.querySelector<HTMLElement>('.slide')||doc.body;
export const fromLayout='data-from-layout';
const bound='data-layout-id';
const field='[data-field]:not([data-manual],[data-manual] *)';
const within=(els:Element[],sel:string)=>els.flatMap(el=>[...(el.matches(sel)?[el]:[]),...el.querySelectorAll(sel)]);
// Only used once for documents saved before ownership was explicit. Never compare a slide against newly inserted objects.
function skeleton(el:Element,content=false){
  const c=el.cloneNode(true) as Element;
  for(const e of [c,...c.querySelectorAll('*')]){e.removeAttribute('style');for(const a of [...e.attributes])if(a.name.startsWith('data-esf-'))e.removeAttribute(a.name);}
  if(!content){for(const e of within([c],field))e.innerHTML='';for(const e of within([c],'[data-image-slot]'))e.innerHTML='';}
  return c.outerHTML;
}
function compose(html:string,layout:Layout,before:Layout){
  const doc=parse(html),root=rootOf(doc),oldRoot=rootOf(parse(before.html)),nextRoot=rootOf(parse(layout.html));
  const kids=[...root.children],oldKids=[...oldRoot.children],explicit=root.hasAttribute(bound)||kids.some(el=>el.hasAttribute(fromLayout));
  const used=new Set<Element>();
  const owned=explicit?kids.filter(el=>el.hasAttribute(fromLayout)):kids.filter(el=>{
    if(el.hasAttribute('data-slide-owned'))return false;
    const key=skeleton(el,el.hasAttribute('data-manual')),match=oldKids.find(x=>!used.has(x)&&skeleton(x,x.hasAttribute('data-manual'))===key);
    if(match)used.add(match);return !!match;
  });
  const out=[...nextRoot.children].map(el=>{const c=doc.importNode(el,true) as Element;c.setAttribute(fromLayout,'');return c;});
  const fields=within(owned,field),defaults=within(oldKids,field),counts=new Map<string,number>();
  for(const target of within(out,field)){
    const name=target.getAttribute('data-field')!,i=counts.get(name)||0;counts.set(name,i+1);
    const source=fields.filter(x=>x.getAttribute('data-field')===name)[i],previous=defaults.filter(x=>x.getAttribute('data-field')===name)[i];
    // Unchanged placeholder content follows the layout. User text and rich formatting stay local.
    if(source&&(!previous||source.innerHTML!==previous.innerHTML))target.innerHTML=source.innerHTML;
  }
  const images=within(owned,'[data-image-slot]'),oldImages=within(oldKids,'[data-image-slot]');
  within(out,'[data-image-slot]').forEach((slot,i)=>{
    const name=slot.getAttribute('data-image-slot'),source=name?images.find(x=>x.getAttribute('data-image-slot')===name):images[i],previous=name?oldImages.find(x=>x.getAttribute('data-image-slot')===name):oldImages[i];
    if(source&&source.innerHTML!==previous?.innerHTML){slot.replaceChildren(...[...source.childNodes].map(n=>doc.importNode(n,true)));if(slot.querySelector('img'))(slot as HTMLElement).style.border='0';}
  });
  // Remove attributes/styles deleted in the layout, retaining properties the slide itself added.
  const extraClasses=[...root.classList].filter(c=>!oldRoot.classList.contains(c));
  for(const a of [...oldRoot.attributes])if(!['class','style',bound].includes(a.name)&&!nextRoot.hasAttribute(a.name)&&root.getAttribute(a.name)===a.value)root.removeAttribute(a.name);
  for(const prop of [...oldRoot.style])if(!nextRoot.style.getPropertyValue(prop)&&root.style.getPropertyValue(prop)===oldRoot.style.getPropertyValue(prop))root.style.removeProperty(prop);
  for(const prop of [...nextRoot.style])root.style.setProperty(prop,nextRoot.style.getPropertyValue(prop),nextRoot.style.getPropertyPriority(prop));
  for(const a of [...nextRoot.attributes])if(!['class','style',bound].includes(a.name))root.setAttribute(a.name,a.value);
  root.className=[...new Set([...nextRoot.classList,...extraClasses])].join(' ');
  root.setAttribute(bound,layout.id);
  root.replaceChildren(...out,...kids.filter(el=>!owned.includes(el)));
  return doc.body.innerHTML;
}
export function applyLayout(s:Slide,layout:Layout,before:Layout=layout):Slide{
  const html=compose(s.html,layout,before),staticHtml=s.staticHtml?compose(s.staticHtml,layout,before):'';
  if(html===s.html&&staticHtml===s.staticHtml)return s;
  return{...s,html,staticHtml,title:parse(html).querySelector('[data-field=title]')?.textContent?.trim()||s.title};
}
// A copied object becomes independent in its new context, including nested inherited objects.
export function cleanLayout(html:string){
  if(!/data-(?:from-layout|layout-id|slide-owned)/.test(html))return html;
  const doc=parse(html);for(const el of doc.querySelectorAll('*'))for(const key of [fromLayout,bound,'data-slide-owned'])el.removeAttribute(key);
  return doc.body.innerHTML;
}
export function syncLayouts(base:Deck|null,next:Deck):Deck{
  const layouts=next.layouts.map(l=>{const html=cleanLayout(l.html);return html===l.html?l:{...l,html};});
  const slides=next.slides.map(s=>{
    const layout=layouts.find(l=>l.id===s.layoutId);if(!layout)return s;
    const old=base?.slides.find(x=>x.id===s.id),rebuilt=old&&old.layoutId!==s.layoutId&&rootOf(parse(s.html)).getAttribute(bound)===layout.id;
    const before=rebuilt?layout:base?.layouts.find(l=>l.id===(old?.layoutId||layout.id))||layout;
    if(old&&old.html===s.html&&old.staticHtml===s.staticHtml&&old.layoutId===s.layoutId&&before.html===layout.html)return s;
    return applyLayout(s,layout,before);
  });
  return layouts.some((l,i)=>l!==next.layouts[i])||slides.some((s,i)=>s!==next.slides[i])?{...next,layouts,slides}:next;
}

export function relayout(s:Slide,layout:Layout):Slide{
  const old=parse(s.html),oldRoot=rootOf(old),doc=parse(layout.html),root=rootOf(doc);
  const owned=[...oldRoot.children].filter(el=>el.hasAttribute(fromLayout)),own=[...oldRoot.children].filter(el=>!el.hasAttribute(fromLayout));
  const fields=within(owned,field),remaining=[...fields];
  for(const target of [...root.querySelectorAll(field)]){
    const source=remaining.find(f=>f.getAttribute('data-field')===target.getAttribute('data-field'))||remaining[0];
    if(source){target.innerHTML=source.innerHTML;remaining.splice(remaining.indexOf(source),1);}
  }
  const images=within(owned,'[data-image-slot] img');
  for(const slot of root.querySelectorAll<HTMLElement>('[data-image-slot]')){const image=images.shift();if(image){slot.replaceChildren(doc.importNode(image,true));slot.style.border='0';}}
  for(const el of root.children)el.setAttribute(fromLayout,'');root.setAttribute(bound,layout.id);
  // A layout change/deletion must not destroy slide text or independent fragments that have no destination slot.
  for(const source of [...own,...remaining,...images]){if(own.some(el=>el!==source&&el.contains(source)))continue;const c=doc.importNode(source,true) as Element;c.removeAttribute(fromLayout);c.setAttribute('data-slide-owned','');root.append(c);}
  return{...s,layoutId:layout.id,html:doc.body.innerHTML,staticHtml:'',title:root.querySelector('[data-field=title]')?.textContent?.trim()||s.title};
}
