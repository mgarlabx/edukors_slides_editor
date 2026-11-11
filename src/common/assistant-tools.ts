// The assistant's tools (Common's EdukorsAiAssistant): the only way the agent changes a presentation. They act on the
// presentation of the conversation, whichever tab is visible; each accepted change is one undo step.
import {agentContext,applySlideChanges,removedSlides} from '../shared/assistant';
import {applySchema} from '../shared/assistant-schema';
import {Asset,Deck,usedAssets} from '../shared/model';
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

export type ModelImage={mimeType:string;data:string;width?:number;height?:number};
// Formats the model reads as they are, and the largest image sent unchanged (base64 characters); larger images and
// other formats (SVG, AVIF…) go through `showImage` (the page draws them, scaled down) or are refused.
const modelFormats=['image/png','image/jpeg','image/gif','image/webp'],modelBytes=4_500_000;
export function createSlidesTools<D extends {id:number}>(store:Store,options:{capturePage?:(args:object)=>Promise<{asset:Asset;width:number;height:number;title:string;url:string;preview:ModelImage}>;downloadImage?:(url:string)=>Promise<Asset>;showImage?:(asset:Asset)=>Promise<ModelImage>;showSlide?:(deck:Deck,slideId:string)=>Promise<ModelImage>}={}){
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
    },
    {
      name:'read_image',description:'Shows you an image kept in the presentation (asset:ID, as listed in the assets of the document), so you can see what it depicts. Large images arrive scaled down.',
      label:()=>'Viewed image',changes:false,
      inputSchema:{type:'object',properties:{asset:{type:'string',maxLength:300,description:'asset:ID or the ID'}},required:['asset'],additionalProperties:false},
      run:async(doc:D,args:any)=>{
        const id=String(args?.asset||'').replace(/^asset:/,''),asset=tab(doc).deck.assets.find(a=>a.id===id);
        if(!asset)throw Error(`There is no image asset:${id} in the presentation.`);
        if(!asset.mime.startsWith('image/'))throw Error(`asset:${id} is not an image (${asset.mime}).`);
        const image:ModelImage=options.showImage?await options.showImage(asset):modelFormats.includes(asset.mime)&&asset.data.length<=modelBytes?{mimeType:asset.mime,data:asset.data}:(()=>{throw Error(`asset:${id} cannot be shown here.`);})();
        return{asset:'asset:'+id,name:asset.name,mime:asset.mime,...image.width?{shownWidth:image.width,shownHeight:image.height}:{},images:[{mimeType:image.mimeType,data:image.data}]};
      }
    }
  ];
  if(options.showSlide)tools.push({
    name:'view_slide',description:'Shows you a slide as it looks when presented (its base, layout, content, images and fonts, after animations finish), so you can check what you made: use it after apply_changes whenever the look matters (drawings, SVG, layout, overflow).',
    label:()=>'Viewed slide',changes:false,
    inputSchema:{type:'object',properties:{slide:{type:'string',maxLength:300,description:'The slide id'}},required:['slide'],additionalProperties:false},
    run:async(doc:D,args:any)=>{
      const deck=tab(doc).deck,id=String(args?.slide||''),slide=deck.slides.find(s=>s.id===id);
      if(!slide)throw Error(`There is no slide ${id} in the presentation.`);
      const part:Deck={...deck,slides:[slide]},image=await options.showSlide!({...part,assets:usedAssets(part)},id);
      return{slide:id,title:slide.title,...image.width?{shownWidth:image.width,shownHeight:image.height}:{},images:[{mimeType:image.mimeType,data:image.data}]};
    }
  });
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
  if(options.capturePage)tools.push({
    name:'capture_page',description:'Captures a web page as a PNG (by default the whole page, top to bottom) in a browser of the app, and adds it to the presentation as an image (asset:ID); you also see it. Use it for screenshots of websites: your own commands have no network and cannot run a browser. language asks the site for that language (Accept-Language, e.g. pt-BR); when the site needs a click instead (a language menu), pass script: JavaScript run in the page before the capture (it may click elements and await). The image is often tall: to show it whole on a slide, put it in a box with overflow-y:auto (the presenter scrolls it).',
    label:()=>'Captured page',changes:true,
    inputSchema:{type:'object',properties:{url:{type:'string',maxLength:4000},fullPage:{type:'boolean',description:'Whole page height (default true); false: only the first screen'},width:{type:'number',minimum:320,maximum:2400,description:'Viewport width in px (default 1280)'},language:{type:'string',maxLength:35,description:'Preferred language, e.g. pt-BR'},script:{type:'string',maxLength:20000,description:'JavaScript run in the page before capturing (async allowed)'},wait:{type:'number',minimum:0,maximum:15000,description:'Milliseconds to wait after loading and after the script (default 1500)'}},required:['url'],additionalProperties:false},
    run:async(doc:D,args:any)=>{
      const r=await options.capturePage!({url:String(args?.url||''),fullPage:args?.fullPage,width:args?.width,language:args?.language,script:args?.script,wait:args?.wait});
      store.mutate(doc.id,deck=>{if(!deck.assets.some(a=>a.id===r.asset.id))deck.assets.push(r.asset);});
      return{reference:'asset:'+r.asset.id,width:r.width,height:r.height,title:r.title,url:r.url,revision:tab(doc).version,images:[{mimeType:r.preview.mimeType,data:r.preview.data}]};
    }
  });
  return tools;
}
