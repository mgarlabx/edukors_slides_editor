import {Deck,Slide,activeMaster} from './model';
import {cleanLayout,syncLayouts} from './layout';
// Slide master view: each master and each layout is edited on the canvas as a pseudo slide, written back by putSlide.
// Items are 'm:<master ID>' and 'l:<layout ID>', in rail order: the masters (alternatives, one active), then the shared layouts.
// Virtual IDs cannot collide with persisted slide IDs (which always start with s-).
export const masterPrefix='@master:',layoutPrefix='@layout:';
export const masterItems=(deck:Deck)=>[...deck.masters.map(m=>'m:'+m.id),...deck.layouts.map(l=>'l:'+l.id)];
export const itemName=(deck:Deck,item:string)=>(item.startsWith('m:')?deck.masters.find(m=>'m:'+m.id===item):deck.layouts.find(l=>'l:'+l.id===item))?.name||'';
export function masterSlide(deck:Deck,item:string):Slide{
  if(item.startsWith('m:')){const master=deck.masters.find(m=>'m:'+m.id===item)||activeMaster(deck);return{id:masterPrefix+master.id,title:master.name,layoutId:'',html:`<section class="slide">${master.html}</section>`,css:'',script:'',staticHtml:'',notes:''};}
  const layout=deck.layouts.find(l=>'l:'+l.id===item)||deck.layouts[0];
  return{id:layoutPrefix+layout.id,title:layout.name,layoutId:layout.id,html:layout.html,css:'',script:'',staticHtml:'',notes:''};
}
// A master item shows its objects as its own content, with its own CSS (active or not); layouts show the active master behind.
export const masterDeck=(deck:Deck,item:string)=>item.startsWith('m:')?{...deck,activeMaster:item.slice(2),masters:deck.masters.map(m=>'m:'+m.id===item?{...m,html:''}:m)}:deck;
export const findSlide=(deck:Deck,id:string)=>deck.slides.find(s=>s.id===id)||(id.startsWith(masterPrefix)&&deck.masters.some(m=>masterPrefix+m.id===id)?masterSlide(deck,'m:'+id.slice(masterPrefix.length)):id.startsWith(layoutPrefix)&&deck.layouts.some(l=>layoutPrefix+l.id===id)?masterSlide(deck,'l:'+id.slice(layoutPrefix.length)):undefined);
export function putSlide(deck:Deck,s:Slide){
  if(deck.slides.some(x=>x.id===s.id)){deck.slides=deck.slides.map(x=>x.id===s.id?s:x);return;}
  if(s.id.startsWith(masterPrefix)){const id=s.id.slice(masterPrefix.length),html=new DOMParser().parseFromString(s.html,'text/html').querySelector('.slide')?.innerHTML??'';deck.masters=deck.masters.map(m=>m.id===id?{...m,html,css:s.css||m.css}:m);}
  else if(s.id.startsWith(layoutPrefix)){const id=s.id.slice(layoutPrefix.length),base={...deck};deck.layouts=deck.layouts.map(l=>l.id===id?{...l,html:cleanLayout(s.html),...s.css?{css:s.css}:{}}:l);deck.slides=syncLayouts(base,deck).slides;}
  else deck.slides=deck.slides.map(x=>x.id===s.id?s:x);
}
