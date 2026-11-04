// The assistant's tools (Common's EdukorsAiAssistant): the only way the agent changes a presentation. They act on the
// presentation of the conversation, whichever tab is visible; each accepted change is one undo step.
import {agentContext,applySlideChanges,removedSlides} from '../shared/assistant';
import {applySchema} from '../shared/assistant-schema';
import {Asset,Deck} from '../shared/model';
import {itemName} from '../shared/masters';
import {Store} from './store';

/** The next deck for an apply_changes call, or false when nothing changes. Throws problems the agent can fix. */
export function assistantChanges(deck:Deck,revision:number,args:unknown):Deck|false{
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid presentation changes.');
  const input=args as Record<string,unknown>;
  if(input.expectedRevision!==revision)throw Error('The presentation changed. Read the document again before applying changes.');
  const allowed=new Set([...Object.keys(applySchema.properties),'expectedRevision']);
  if(Object.keys(input).some(key=>!allowed.has(key)))throw Error('Unknown presentation change.');
  if(input.assets!==undefined&&(!Array.isArray(input.assets)||input.assets.length))throw Error('Add images with import_image, then reference them as asset:ID.');
  const {expectedRevision,...changes}=input;
  const next=applySlideChanges(deck,changes);
  if(!next)return false;
  if(removedSlides(deck,next).length)throw Error('Only the user can delete existing slides.');
  return next;
}

/** What each request carries: the selected slides in full, the index of the others, and what the person is looking at. */
export function assistantContext(store:Store,doc:number){
  const tab=store.get(doc);if(!tab)return null;
  const view=tab.masterView?{view:`Slide master: ${tab.masterView.startsWith('m:')?'base':'layout'} "${itemName(tab.deck,tab.masterView)}" (${tab.masterView.slice(2)}); the active base is ${tab.deck.activeMaster}`}:{};
  return {revision:tab.version,...view,...tab.deck.systemPrompt?{documentInstructions:tab.deck.systemPrompt}:{},...agentContext(tab.deck,tab.selected)};
}

export function createSlidesTools<D extends {id:number}>(store:Store,options:{downloadImage?:(url:string)=>Promise<Asset>}={}){
  const tab=(doc:D)=>{const value=store.get(doc.id);if(!value)throw Error('The presentation is no longer open.');return value;};
  const tools:any[]=[
    {
      name:'read_document',description:'Reads every slide (HTML, CSS, script, notes, layout, interactive question), base and layout, plus the current revision. Image data is omitted; images are referenced as asset:ID.',
      label:()=>'Read presentation',changes:false,
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      run:(doc:D)=>{const t=tab(doc);return{revision:t.version,selected:t.selected,...agentContext(t.deck,t.deck.slides.map(s=>s.id))};}
    },
    {
      name:'apply_changes',description:'Creates or updates slides, bases, layouts and the presentation instructions. Read first and pass the revision as expectedRevision. Send only the fields that change; existing slides cannot be deleted. Each accepted change can be undone by the user.',
      label:()=>'Changed presentation',changes:true,
      inputSchema:{...applySchema,properties:{...applySchema.properties,expectedRevision:{type:'integer',minimum:0}},required:['expectedRevision']},
      run:(doc:D,args:unknown)=>{
        const t=tab(doc),next=assistantChanges(t.deck,t.version,args);
        const changed=!!next&&store.mutate(doc.id,deck=>{for(const key of Object.keys(deck) as (keyof Deck)[])delete deck[key];Object.assign(deck,structuredClone(next));});
        return{changed,revision:tab(doc).version};
      }
    }
  ];
  if(options.downloadImage)tools.push({
    name:'import_image',description:'Downloads an image (https, PNG/JPEG/WebP/GIF/SVG/AVIF, at most 50 MB) into the presentation and returns its reference (asset:ID) for slide HTML or CSS. Does not place it on a slide.',
    label:()=>'Imported image',changes:true,
    inputSchema:{type:'object',properties:{url:{type:'string',maxLength:4000}},required:['url'],additionalProperties:false},
    run:async(doc:D,args:any)=>{
      const asset=await options.downloadImage!(String(args?.url||''));
      store.mutate(doc.id,deck=>{if(!deck.assets.some(a=>a.id===asset.id))deck.assets.push(asset);});
      return{reference:'asset:'+asset.id,name:asset.name,mime:asset.mime,revision:tab(doc).version};
    }
  });
  return tools;
}
