import 'edukors-common-ux/src/ai/ui/ai-conversations.js';
import 'edukors-common-ux/src/package/package.js';
import {Deck,validateDeck} from './model';
declare const __PACKAGE_VERSION__:string|undefined;  // set by scripts/build.mjs
const fromBase64=(value:string):Uint8Array=>{
  const native=(Uint8Array as any).fromBase64;if(native)return native(value);
  const text=atob(value),out=new Uint8Array(text.length);for(let i=0;i<text.length;i++)out[i]=text.charCodeAt(i);return out;
};
const toBase64=(bytes:Uint8Array):string=>{if(typeof (bytes as any).toBase64==='function')return (bytes as any).toBase64();let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result);};
// Resources never change in place, so each one's bytes are decoded once (or kept from the file it was read from):
// saving a large presentation again does not decode hundreds of MB of base64.
const decoded=new WeakMap<object,Uint8Array>();
export function assetBytes(asset:Deck['assets'][number]){let bytes=decoded.get(asset);if(!bytes){bytes=fromBase64(asset.data);decoded.set(asset,bytes);}return bytes;}
// Parts named by their real type: images and fonts already compressed are stored in the ZIP, not deflated again.
const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/avif':'avif','image/svg+xml':'svg','font/woff':'woff','font/woff2':'woff2','font/ttf':'ttf','font/otf':'otf'};
// Common owns OPC/ZIP validation; Slides owns the presentation schema.
const pkg=(globalThis as any).EdukorsPackage;
const main='slides/presentation.json';
const mediaRel='http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const resourceRel='https://edukors.org/package/relationships/resource';
const historyRel='https://edukors.org/package/relationships/legacy-conversations';
// bytesOf supplies resources whose data the caller already holds as bytes (drafts in the main process).
export async function encodeEslx(deck:Deck,history?:Uint8Array,conversations:unknown[]=[],bytesOf?:(asset:Deck['assets'][number])=>Uint8Array|undefined):Promise<Uint8Array>{
  validateDeck(deck);
  const parts:any[]=[],relationships:any[]=[];
  const assets=deck.assets.map((asset,i)=>{
    const id=`rIdAsset${i+1}`,file=`asset${i+1}.${extensions[asset.mime]||'bin'}`;
    parts.push({name:'slides/media/'+file,contentType:asset.mime,content:bytesOf?.(asset)||assetBytes(asset)});
    relationships.push({id,type:asset.mime.startsWith('image/')?mediaRel:resourceRel,target:'media/'+file});
    const {data,...metadata}=asset;return {...metadata,relationship:id};
  });
  if(history){parts.push({name:'slides/ai/legacy-conversations.json',contentType:'application/json',content:history});relationships.push({id:'rIdLegacyHistory',type:historyRel,target:'ai/legacy-conversations.json'});}
  const savedConversations=(globalThis as any).EdukorsAiConversations.toPackage('slides',conversations);
  parts.push(...savedConversations.parts);relationships.push(...savedConversations.relationships);
  return pkg.write({app:{name:'slides',version:typeof __PACKAGE_VERSION__==='string'?__PACKAGE_VERSION__:'dev'},main:{name:main,contentType:pkg.contentType('slides','presentation'),content:{format:'edukors.slides.presentation',version:1,deck:{...deck,assets}},relationships},parts,properties:{title:deck.title}});
}
export async function decodeEslx(bytes:Uint8Array):Promise<{deck:Deck;history?:Uint8Array;conversations:any[]}>{
  const document=await pkg.read(bytes),content=document.json(document.main.name);
  if(document.main.contentType!==pkg.contentType('slides','presentation')||content?.format!=='edukors.slides.presentation'||content.version!==1)throw Error('Unsupported ESLX presentation version. Original preserved.');
  if(!Array.isArray(content.deck?.assets))throw Error('Invalid ESLX assets.');
  const relationships=document.relationships(document.main.name);
  const assets=content.deck.assets.map((asset:any)=>{
    const relation=relationships.find((r:any)=>r.id===asset.relationship);
    if(!relation||relation.external||![mediaRel,resourceRel].includes(relation.type))throw Error('Invalid ESLX resource relationship.');
    const {relationship,...metadata}=asset,bytes=document.bytes(relation.target),result={...metadata,data:toBase64(bytes)};
    decoded.set(result,bytes);return result;
  });
  const deck={...content.deck,assets};validateDeck(deck);
  const history=relationships.find((r:any)=>r.type===historyRel);
  if(history?.external)throw Error('Invalid ESLX history relationship.');
  return {deck,conversations:(globalThis as any).EdukorsAiConversations.fromPackage(document),...history?{history:document.bytes(history.target)}:{}};
}
