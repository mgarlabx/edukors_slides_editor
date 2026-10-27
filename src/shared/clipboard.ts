import {Asset,Deck,Layout,Master,Slide,duplicateSlides,masterOf,newSlide,uid} from './model';
import {cleanLayout} from './layout';
export interface SlidesClipboard {masterItem?:'master'|'layout';format:'esf-slides';deckId:string;slides:Slide[];layouts:Layout[];masters:Master[];assets:Asset[]}
export function copySlides(deck:Deck,ids:string[]):SlidesClipboard{
  const slides=deck.slides.filter(s=>ids.includes(s.id)),layouts=deck.layouts.filter(l=>slides.some(s=>s.layoutId===l.id)).map(l=>({...l,masterId:masterOf(deck,{layoutId:l.id}).id}));
  const masters=deck.masters.filter(m=>layouts.some(l=>l.masterId===m.id));
  const text=JSON.stringify({slides,layouts,masters}),assets=deck.assets.filter(a=>text.includes('asset:'+a.id));
  return structuredClone({format:'esf-slides',deckId:deck.id,slides,layouts,masters,assets});
}
// IDs from another file are not guaranteed to be content hashes (e.g. AI-created resources).
export function importResources(deck:Deck,assets:Asset[]=[]){
  const ids=new Map<string,string>();
  for(const asset of assets){
    const same=deck.assets.find(a=>a.mime===asset.mime&&a.data===asset.data);
    if(same){ids.set(asset.id,same.id);continue;}
    const id=deck.assets.some(a=>a.id===asset.id)?uid('asset'):asset.id;
    deck.assets.push({...asset,id});ids.set(asset.id,id);
  }
  return(text:string)=>text.replace(/asset:([\w-]+)/g,(ref,id)=>ids.has(id)?'asset:'+ids.get(id):ref);
}
// Mutates only the destination clone; caller validates and records a single undo step.
export function pasteSlides(deck:Deck,p:SlidesClipboard,afterId:string):Slide[]{
  if(!p||p.format!=='esf-slides'||!Array.isArray(p.slides)||!p.slides.length||p.slides.length+deck.slides.length>300||!Array.isArray(p.assets))throw Error('Invalid slides clipboard or slide limit.');
  const replace=importResources(deck,p.assets),slides=duplicateSlides(p.slides),layouts=new Map<string,string>(),masters=new Map<string,string>();
  for(const slide of slides){
    for(const k of ['html','css','script','staticHtml'] as const){if(typeof slide[k]!=='string')throw Error('Invalid slides clipboard.');slide[k]=replace(slide[k]);}
    if(layouts.has(slide.layoutId)){slide.layoutId=layouts.get(slide.layoutId)!;continue;}
    const oldId=slide.layoutId,source=p.layouts?.find(l=>l.id===oldId),existing=deck.layouts.find(l=>l.id===oldId);
    if(p.deckId===deck.id&&existing){layouts.set(oldId,oldId);continue;}
    let masterId:string|undefined;
    const sourceMaster=p.masters?.find(m=>m.id===source?.masterId);
    if(sourceMaster){
      masterId=masters.get(sourceMaster.id);
      if(!masterId){const html=replace(sourceMaster.html),css=replace(sourceMaster.css),same=deck.masters.find(m=>m.html===html&&m.css===css);
        masterId=same?.id||uid('m');if(!same)deck.masters.push({...sourceMaster,id:masterId,html,css});masters.set(sourceMaster.id,masterId);}
    }
    const html=source?replace(source.html):'<section class="slide"></section>',css=source?.css===undefined?undefined:replace(source.css);
    const same=deck.layouts.find(l=>l.html===html&&(l.css||'')===(css||'')&&(l.masterId||deck.activeMaster)===(masterId||deck.activeMaster));
    const layout=same||{id:uid('l'),name:source?.name||'Blank',html,...css!==undefined?{css}:{},...masterId?{masterId}:{}};
    if(!same)deck.layouts.push(layout);layouts.set(oldId,layout.id);slide.layoutId=layout.id;
  }
  const at=deck.slides.findIndex(s=>s.id===afterId);deck.slides.splice(at<0?deck.slides.length:at+1,0,...slides);
  return slides;
}
// New ownership and DOM IDs prevent pasted fragments from locking themselves or targeting existing SVGs/links.
export function independentObjects(html:string[],css:string,replace:(text:string)=>string,script=''){
  const doc=new DOMParser().parseFromString('<section></section>','text/html'),container=doc.body;
  container.innerHTML=html.map(replace).join('');const ids=new Map<string,string>(),fields=new Map<string,string>();
  for(const el of container.querySelectorAll('[id]')){const old=el.id;if(!ids.has(old))ids.set(old,uid('object'));el.id=ids.get(old)!;}
  for(const el of container.querySelectorAll('*')){
    for(const a of [...el.attributes]){
      if(/^data-esf-|^data-from-layout$|^data-layout-id$|^contenteditable$/.test(a.name)){el.removeAttribute(a.name);continue;}
      let value=a.value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,(all,q,id)=>ids.has(id)?`url(${q}#${ids.get(id)}${q})`:all);
      if(['href','xlink:href'].includes(a.name)&&value.startsWith('#')&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));
      if(['aria-labelledby','aria-describedby'].includes(a.name))value=value.split(/\s+/).map(id=>ids.get(id)||id).join(' ');
      el.setAttribute(a.name,value);
    }
    if(el.hasAttribute('data-field')){const old=el.getAttribute('data-field')!,field=uid('manual');fields.set(old,field);el.setAttribute('data-field',field);}
  }
  for(const el of container.children)el.setAttribute('data-slide-owned','');
  css=replace(css).replace(/#([\w-]+)/g,(all,id)=>ids.has(id)?'#'+ids.get(id):all);
  // The copied behavior follows the new IDs and fields: #id selectors, getElementById('id') and [data-field=…].
  script=replace(script).replace(/#([\w-]+)/g,(all,id)=>ids.has(id)?'#'+ids.get(id):all).replace(/(['"`])([\w-]+)\1/g,(all,q,id)=>ids.has(id)?q+ids.get(id)+q:all)
    .replace(/(data-field\s*=\s*\\?['"]?)([\w-]+)/g,(all,pre,f)=>fields.has(f)?pre+fields.get(f):all);
  return{html:[...container.children].map(el=>el.outerHTML),css,script};
}

// A pasted behavior joins the slide's own: each script sets window.slideBehavior, and both run on every hook.
export function joinBehavior(own:string,pasted:string){
  if(!pasted.trim()||own.includes(pasted))return own;if(!own.trim())return pasted;
  const k=uid('b').replace(/-/g,'_');
  return`${own}\n{const own_${k}=window.slideBehavior;window.slideBehavior=undefined;\ntry{\n${pasted}\n}catch(e){setTimeout(()=>{throw e;});}\nconst pasted_${k}=window.slideBehavior;window.slideBehavior=own_${k};
if(pasted_${k}&&own_${k})window.slideBehavior=Object.fromEntries(['mount','enter','step','leave','dispose','renderStatic'].map(h=>[h,(...a)=>{const r=[own_${k},pasted_${k}].map(b=>{try{return b[h]?.(...a);}catch(e){setTimeout(()=>{throw e;});}});return r.some(v=>typeof v?.then==='function')?Promise.all(r).then(x=>x.find(v=>v!==undefined)):r.find(v=>v!==undefined);}]));else if(pasted_${k})window.slideBehavior=pasted_${k};}`;
}
// Whole master/layout items use the same portable clipboard as slides. They can also be pasted as normal slides.
export function copyMasterItem(deck:Deck,item:string):SlidesClipboard{
  const isMaster=item.startsWith('m:'),master=deck.masters.find(m=>'m:'+m.id===item);
  const layout:Layout|undefined=isMaster&&master?{id:uid('l'),name:master.name,html:'<section class="slide"></section>',masterId:master.id}:deck.layouts.find(l=>'l:'+l.id===item);
  if(!layout)throw Error('The copied master or layout no longer exists.');
  const slide=newSlide(layout),source={...deck,layouts:[layout],slides:[slide]};
  return{...copySlides(source,[slide.id]),masterItem:isMaster?'master':'layout'};
}
// Pasting in master view adds independent items; existing slides are never replaced or modified.
export function pasteMasterItems(deck:Deck,p:SlidesClipboard):string[]{
  if(p.masterItem==='master'){
    const source=p.masters?.[0];if(!source)throw Error('Invalid master clipboard.');
    const replace=importResources(deck,p.assets),master={...source,id:uid('m'),html:replace(source.html),css:replace(source.css)};
    deck.masters.push(master);return['m:'+master.id];
  }
  const existing=new Set(deck.layouts.map(l=>l.id)),staged={...deck,slides:[] as Slide[]};
  const slides=pasteSlides(staged,p,''),layouts=slides.map(s=>{
    const source=staged.layouts.find(l=>l.id===s.layoutId)!;
    return{id:uid('l'),name:(s.title||source.name).slice(0,200),html:cleanLayout(s.staticHtml||s.html),css:[source.css,s.css].filter(Boolean).join('\n'),masterId:source.masterId||deck.activeMaster};
  });
  deck.layouts=[...staged.layouts.filter(l=>existing.has(l.id)),...layouts];
  return layouts.map(l=>'l:'+l.id);
}
