import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {Deck} from '../shared/model';
// Fonts named in the slides' CSS but installed only on this computer (user or /Library fonts) are embedded
// in the exported HTML, so it renders the same elsewhere. Generic and cross-platform families are left alone.
const generic=new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui','emoji','math','fangsong','inherit','initial','unset','revert','-apple-system','blinkmacsystemfont']);
const common=new Set(['arial','helvetica','helvetica neue','georgia','times','times new roman','verdana','tahoma','trebuchet ms','courier','courier new','segoe ui','menlo','monaco','consolas','sf pro','sf pro text','sf pro display','avenir','avenir next','gill sans','palatino','optima','futura','impact','comic sans ms','lucida grande','roboto','noto sans','apple color emoji','segoe ui emoji']);
type Face={family:string;file:string;variable:boolean;weight:string;italic:boolean};
// Reads only the table directory and the name, OS/2 and fvar tables: Office alone brings ~500 MB of fonts per app.
async function parse(file:string):Promise<Face|null>{
  const fh=await fs.open(file,'r');
  try{
    const read=async(at:number,length:number)=>{const b=Buffer.alloc(Math.max(0,length));const {bytesRead}=await fh.read(b,0,b.length,at);return b.subarray(0,bytesRead);};
    const head=await read(0,12);
    if(head.length<12||![0x00010000,0x4f54544f,0x74727565].includes(head.readUInt32BE(0)))return null;
    const n=head.readUInt16BE(4),dir=await read(12,n*16),tables:Record<string,{at:number;length:number}>={};
    for(let i=0;i<n&&i*16+16<=dir.length;i++)tables[dir.toString('latin1',i*16,i*16+4)]={at:dir.readUInt32BE(i*16+8),length:dir.readUInt32BE(i*16+12)};
    if(!tables.name||tables.name.length>4_000_000)return null;
    const buf=await read(tables.name.at,tables.name.length),count=buf.readUInt16BE(2),strings=buf.readUInt16BE(4),names:Record<number,string>={};
    for(let i=0;i<count&&6+i*12+12<=buf.length;i++){
      const r=6+i*12,platform=buf.readUInt16BE(r),id=buf.readUInt16BE(r+6),len=buf.readUInt16BE(r+8),off=strings+buf.readUInt16BE(r+10);
      if(![1,2,16,17].includes(id)||off+len>buf.length)continue;
      if(platform===3||platform===0){const b=Buffer.from(buf.subarray(off,off+len));b.swap16();names[id]=b.toString('utf16le');}
      else if(platform===1&&names[id]===undefined)names[id]=buf.toString('latin1',off,off+len);
    }
    const family=names[16]||names[1];if(!family)return null;
    let weight='400',italic=/italic|oblique/i.test(names[17]||names[2]||'');
    if(tables['OS/2']){const o=await read(tables['OS/2'].at,64);if(o.length>=64){weight=String(o.readUInt16BE(4)||400);italic||=!!(o.readUInt16BE(62)&1);}}
    const variable=!!tables.fvar;
    if(variable&&tables.fvar.length<=65536){
      const f=await read(tables.fvar.at,tables.fvar.length),axes=f.readUInt16BE(4),axisCount=f.readUInt16BE(8),size=f.readUInt16BE(10);
      for(let i=0;i<axisCount&&axes;i++){const a=axes+i*size;if(a+16<=f.length&&f.toString('latin1',a,a+4)==='wght')weight=`${Math.round(f.readInt32BE(a+4)/65536)} ${Math.round(f.readInt32BE(a+12)/65536)}`;}
    }
    return{family,file,variable,weight,italic};
  }finally{await fh.close();}
}
// Fonts installed by the user and for all users, per system, plus the ones Microsoft Office brings for itself (Aptos,
// its default since 2023, lives only inside the Office apps and in Office's cloud-font cache).
const officeApps=['PowerPoint','Word','Excel','Outlook','OneNote'];
const fontDirs=()=>process.platform==='win32'?[path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'Microsoft/Windows/Fonts'),path.join(process.env.WINDIR||'C:\\Windows','Fonts'),path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'Microsoft/FontCache/4/CloudFonts')]
  :process.platform==='linux'?[path.join(os.homedir(),'.local/share/fonts'),path.join(os.homedir(),'.fonts'),'/usr/local/share/fonts','/usr/share/fonts']
  :[path.join(os.homedir(),'Library/Fonts'),'/Library/Fonts',...officeApps.map(a=>`/Applications/Microsoft ${a}.app/Contents/Resources/DFonts`),path.join(os.homedir(),'Library/Group Containers/UBF8T346G9.Office/FontCache/4/CloudFonts')];
let installed:Promise<Face[]>|undefined;
async function installedFaces(){
  const dirs=(process.env.ESF_FONT_DIRS?.split(path.delimiter)||fontDirs()).filter(Boolean),faces:Face[]=[],seen=new Set<string>();
  for(const dir of dirs){
    // Linux and Office's cloud fonts keep them in subfolders (truetype/<family>/…).
    let files:string[]=[];try{files=await fs.readdir(dir,{recursive:true}) as string[];}catch{continue;}
    // The Office apps carry the same fonts: a file name seen in one DFonts folder is not read again.
    for(const f of files.filter(f=>/\.(ttf|otf)$/i.test(f))){
      const office=dir.endsWith('/DFonts');if(office&&seen.has(f))continue;if(office)seen.add(f);
      try{const face=await parse(path.join(dir,f));if(face&&!faces.some(x=>x.family===face.family&&x.weight===face.weight&&x.italic===face.italic))faces.push(face);}catch{}
    }
  }
  return faces;
}
// A value is quoted names and unquoted text up to ; } { or the end of a style attribute.
const families=(css:string)=>[...css.matchAll(/font-family\s*:\s*((?:"[^"<>]*"|'[^'<>]*'|[^;}{"'<>])+)/gi)].map(m=>m[1].split(',').map(x=>x.replace(/\\/g,'').replace(/!important/i,'').trim().replace(/^["']|["']$/g,'').trim()).filter(Boolean));
const styleWeights:Record<string,number>={thin:100,hairline:100,extralight:200,ultralight:200,light:300,medium:500,semibold:600,demibold:600,bold:700,extrabold:800,ultrabold:800,black:900,heavy:900};
type FontAsset={id:string;name:string;mime:string;data:string};
// Weights and styles the text asks for; only the nearest face of each is embedded, not the whole family (Aptos alone has 14).
function usage(css:string){
  const weights=new Set([400]);let italic=false;
  for(const m of css.matchAll(/font-weight\s*:\s*([\w]+)/gi)){const v=m[1].toLowerCase();weights.add(v==='bold'||v==='bolder'?700:v==='lighter'?300:/^\d+$/.test(v)?Math.max(1,Math.min(1000,+v)):400);}
  if(/<(b|strong|h[1-6]|th)[\s>]/i.test(css))weights.add(700);
  if(/font-style\s*:\s*(italic|oblique)|<(i|em)[\s>]/i.test(css))italic=true;
  return{weights:[...weights],styles:italic?[false,true]:[false]};
}
/** @font-face rules (with their font files) for the families the CSS names that are installed only on this computer. */
export async function localFonts(css:string,known:ReadonlySet<string>=new Set()):Promise<{assets:FontAsset[];rules:string;embedded:string[];missing:string[]}>{
  // Styles inside HTML attributes may carry their quotes as entities (style="font-family:&#39;Aptos&#39;").
  css=css.replace(/&(#39|#x27|apos);/gi,"'").replace(/&(quot|#34|#x22);/gi,'"');
  const declared=new Set(families(css.match(/@font-face\s*\{[^}]*\}/gi)?.join('\n')||'').flat().map(x=>x.toLowerCase()));
  const lists=families(css.replace(/@font-face\s*\{[^}]*\}/gi,'')),wanted=new Map<string,string>();
  for(const list of lists)for(const f of list){const k=f.toLowerCase();if(!generic.has(k)&&!common.has(k)&&!k.startsWith('ui-')&&!k.startsWith('var(')&&!declared.has(k))wanted.set(k,f);}
  const assets:FontAsset[]=[],embedded:string[]=[],missing:string[]=[];let rules='';
  if(!wanted.size)return{assets,rules,embedded,missing};
  installed??=installedFaces();const faces=await installed,use=usage(css);
  for(const [key,name] of wanted){
    let all=faces.filter(f=>f.family.toLowerCase()===key),fixed=0;
    // Office names static styles as families ("Open Sans ExtraBold"): the installed base family stands in at that weight.
    const styled=!all.length&&key.match(/^(.+?)[ -](thin|hairline|extralight|ultralight|light|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy)$/);
    if(styled){all=faces.filter(f=>f.family.toLowerCase()===styled[1]);fixed=styleWeights[styled[2]];}
    // Primary families that are not installed here are reported; fallbacks in a list are not.
    if(!all.length){if(lists.some(l=>l[0]?.toLowerCase()===key))missing.push(name);continue;}
    const low=(f:Face)=>+f.weight.split(' ')[0],high=(f:Face)=>+(f.weight.split(' ')[1]||f.weight);
    const distance=(f:Face,w:number)=>w<low(f)?low(f)-w:w>high(f)?w-high(f):0;
    const chosen=new Set<Face>();
    for(const italic of use.styles)for(const w of fixed?[fixed]:use.weights){
      const pool=all.filter(f=>f.italic===italic);if(!pool.length)continue;
      chosen.add(pool.reduce((a,b)=>distance(b,w)<distance(a,w)||distance(b,w)===distance(a,w)&&b.variable&&!a.variable?b:a));
    }
    for(const face of chosen){
      const bytes=await fs.readFile(face.file),id='asset-'+createHash('sha256').update(bytes).digest('hex'),mime=/\.otf$/i.test(face.file)?'font/otf':'font/ttf';
      if(!known.has(id)&&!assets.some(a=>a.id===id))assets.push({id,name:path.basename(face.file),mime,data:bytes.toString('base64')});
      rules+=`@font-face{font-family:"${name.replace(/"/g,'')}";src:url("asset:${id}");font-weight:${fixed||face.weight};font-style:${face.italic?'italic':'normal'};font-display:block}\n`;
    }
    embedded.push(name);
  }
  return{assets,rules,embedded,missing};
}
export const deckText=(deck:Deck)=>[...deck.masters.flatMap(m=>[m.css,m.html]),...deck.layouts.flatMap(l=>[l.css||'',l.html]),...deck.slides.flatMap(s=>[s.css,s.html,s.staticHtml])].join('\n');
export async function embedFonts(deck:Deck):Promise<{deck:Deck;embedded:string[];missing:string[]}>{
  const found=await localFonts(deckText(deck),new Set(deck.assets.map(a=>a.id)));
  if(!found.rules)return{deck,embedded:found.embedded,missing:found.missing};
  // Every master gets the faces, so switching the active one keeps them.
  const next={...deck,assets:[...deck.assets,...found.assets],masters:deck.masters.map(m=>({...m,css:found.rules+m.css}))};
  return{deck:next,embedded:found.embedded,missing:found.missing};
}
