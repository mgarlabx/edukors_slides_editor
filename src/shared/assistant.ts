import {Deck,Slide} from './model';
// Merge edits locally so the model never has to copy untouched slide code.
export function applySlideChanges(deck:Deck,out:any):Deck|undefined{
  const updates=out.slideUpdates!==undefined,order=out.slideOrder!==undefined,masters=out.masterUpdates!==undefined,layouts=out.layoutUpdates!==undefined,active=out.activeMaster!==undefined,prompt=out.systemPrompt!==undefined;
  if(!updates&&!order&&!masters&&!layouts&&!active&&!prompt)return undefined;
  const next=structuredClone(deck);
  if(prompt){if(typeof out.systemPrompt!=='string'||out.systemPrompt.length>20000)throw Error('Invalid system prompt.');if(out.systemPrompt.trim())next.systemPrompt=out.systemPrompt;else delete next.systemPrompt;}
  if(updates||order){
    if(updates&&!Array.isArray(out.slideUpdates)||order&&!Array.isArray(out.slideOrder))throw Error('Invalid slide changes.');
    const byId=new Map(next.slides.map(s=>[s.id,s])),seen=new Set<string>();
    for(const slide of (out.slideUpdates||[]) as Partial<Slide>[]){
      if(!slide||typeof slide.id!=='string'||seen.has(slide.id))throw Error('Invalid or duplicate slide update.');
      // An existing slide takes only the fields sent (its interactive question is never the agent's); a new one starts from empty fields.
      seen.add(slide.id);const existing=byId.get(slide.id);byId.set(slide.id,(existing?{...existing,...slide,...existing.poll?{poll:existing.poll}:{}}:{title:'',css:'',script:'',staticHtml:'',notes:'',...slide}) as Slide);
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
