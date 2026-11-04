// State of each open presentation, by the id of its Common document tab: the deck, the selected slides, the slide
// master view and the undo history. It never follows whichever tab is active, so the assistant can change a
// presentation in the background. One change (a gesture, a command, an accepted AI change) is one undo step.
import {Deck,validateDeck} from '../shared/model';
import {syncLayouts} from '../shared/layout';
import {masterItems} from '../shared/masters';

export interface Tab {
  doc:number; deck:Deck; selected:string[]; past:Deck[]; future:Deck[];
  // version counts changes; savedVersion is the version last written to the file (-1: never saved).
  version:number; savedVersion:number;
  // Slide master view: 'm:<id>' (a base) or 'l:<id>' (a layout); null shows the slides.
  masterView:string|null;
  // Conversations of earlier versions (.ESF), kept as they are in their own part of the .eslx.
  history?:Uint8Array;
}
const HISTORY=50;
// Resource data (base64, possibly hundreds of MB) never changes in place: copies share it, and comparisons use the IDs.
const copy=(deck:Deck):Deck=>({...structuredClone({...deck,assets:[]}),assets:deck.assets.slice()});
const shape=(deck:Deck)=>JSON.stringify({...deck,assets:deck.assets.map(a=>a.id)});
export class Store {
  private tabs=new Map<number,Tab>();
  private listeners=new Set<(doc:number)=>void>();
  subscribe(fn:(doc:number)=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
  private emit(doc:number){for(const fn of [...this.listeners])fn(doc);}
  get(doc:number){return this.tabs.get(doc);}
  has(doc:number){return this.tabs.has(doc);}
  list(){return[...this.tabs.values()];}
  add(doc:number,deck:Deck,{history,saved=false}:{history?:Uint8Array;saved?:boolean}={}){
    const synced=syncLayouts(null,copy(deck));validateDeck(synced);
    this.tabs.set(doc,{doc,deck:synced,selected:[synced.slides[0].id],past:[],future:[],version:0,savedVersion:saved?0:-1,masterView:null,history});
    this.emit(doc);return this.tabs.get(doc)!;
  }
  remove(doc:number){if(this.tabs.delete(doc))this.emit(doc);}
  // Selection and view changes: no undo step, no change to the document.
  update(doc:number,fn:(tab:Tab)=>Tab){const tab=this.tabs.get(doc);if(!tab)return;const next=fn(tab);if(next===tab)return;this.tabs.set(doc,next);this.emit(doc);}
  // A change of the presentation: fn edits a copy (and may return the slides to select). Layouts reach the slides that
  // use them, the result is validated (an error leaves everything as it was), and the old deck goes to the history.
  mutate(doc:number,fn:(deck:Deck)=>string[]|void,selection?:string[],merge=false){
    const tab=this.tabs.get(doc);if(!tab)return false;
    let next=copy(tab.deck);const selected=fn(next)||selection;
    next=syncLayouts(tab.deck,next);validateDeck(next);
    if(shape(next)===shape(tab.deck))return false;
    const view=tab.masterView&&masterItems(next).includes(tab.masterView)?tab.masterView:null;
    const keep=(selected||tab.selected).filter(id=>next.slides.some(s=>s.id===id));
    this.tabs.set(doc,{...tab,deck:next,version:tab.version+1,past:merge?tab.past:[...tab.past,tab.deck].slice(-HISTORY),future:[],masterView:view,selected:keep.length?keep:[next.slides[Math.min(next.slides.length-1,Math.max(0,tab.deck.slides.findIndex(s=>s.id===tab.selected[0])))].id]});
    this.emit(doc);return true;
  }
  undo(doc:number,redo=false){
    const tab=this.tabs.get(doc),list=redo?tab?.future:tab?.past;if(!tab||!list?.length)return false;
    const next=list.at(-1)!,old=tab.deck;
    // The slide that appeared (or the one selected before) becomes the selection.
    const selected=[next.slides.find(s=>!old.slides.some(o=>o.id===s.id))?.id||next.slides.find(s=>s.id===tab.selected[0])?.id||next.slides[0].id];
    this.tabs.set(doc,{...tab,deck:next,version:tab.version+1,past:redo?[...tab.past,old]:tab.past.slice(0,-1),future:redo?tab.future.slice(0,-1):[...tab.future,old],selected,masterView:tab.masterView&&masterItems(next).includes(tab.masterView)?tab.masterView:null});
    this.emit(doc);return true;
  }
  markSaved(doc:number,version:number){const tab=this.tabs.get(doc);if(tab&&tab.savedVersion!==version){this.tabs.set(doc,{...tab,savedVersion:version});this.emit(doc);}}
  modified(doc:number){const tab=this.tabs.get(doc);return!!tab&&tab.version!==tab.savedVersion;}
}
