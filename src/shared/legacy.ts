import {Deck,validateDeck} from './model';
const base64=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
export async function loadLegacyDeck(m:any,read:(p:string)=>Promise<Uint8Array>):Promise<Deck>{
  if(!Array.isArray(m.slides)||m.slides.length>300||!Array.isArray(m.assets)||m.assets.length>2000||!Array.isArray(m.masters)||m.masters.length>50||!Array.isArray(m.layouts)||m.layouts.length>100)throw Error('Invalid ESF structure.');
  const text=async(p:string)=>new TextDecoder('utf-8',{fatal:true}).decode(await read(p));
  const deck={format:m.format,schemaVersion:m.schemaVersion,runtimeVersion:m.runtimeVersion,id:m.id,revision:m.revision,title:m.title,canvas:m.canvas,activeMaster:m.activeMaster,...m.importReport?{importReport:m.importReport}:{},
    masters:await Promise.all(m.masters.map(async(x:any)=>({id:x.id,name:x.name,html:await text(x.html),css:await text(x.css)}))),
    layouts:await Promise.all(m.layouts.map(async(l:any)=>({id:l.id,name:l.name,html:await text(l.html),...l.css!==undefined?{css:await text(l.css)}:{},...l.masterId!==undefined?{masterId:l.masterId}:{}}))),
    slides:await Promise.all(m.slides.map(async(s:any)=>({id:s.id,title:s.title,layoutId:s.layoutId,html:await text(s.html),css:s.css?await text(s.css):'',script:s.script?await text(s.script):'',staticHtml:s.staticHtml?await text(s.staticHtml):'',notes:s.notes||'',...s.poll!==undefined?{poll:s.poll}:{}}))),
    assets:await Promise.all(m.assets.map(async(a:any)=>({id:a.id,name:a.name,mime:a.mime,data:base64(await read(a.path))}))),
    ...m.systemPrompt==='ai/system-prompt.md'?{systemPrompt:await text('ai/system-prompt.md')}:{}};
  validateDeck(deck);return deck;
}
