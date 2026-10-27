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
function parse(buf:Buffer,file:string):Face|null{
  if(buf.length<12||![0x00010000,0x4f54544f,0x74727565].includes(buf.readUInt32BE(0)))return null;
  const tables:Record<string,number>={},n=buf.readUInt16BE(4);
  for(let i=0;i<n;i++){const at=12+i*16;if(at+16>buf.length)return null;tables[buf.toString('latin1',at,at+4)]=buf.readUInt32BE(at+8);}
  if(tables.name===undefined)return null;
  const name=tables.name,count=buf.readUInt16BE(name+2),strings=name+buf.readUInt16BE(name+4),names:Record<number,string>={};
  for(let i=0;i<count;i++){
    const r=name+6+i*12,platform=buf.readUInt16BE(r),id=buf.readUInt16BE(r+6),len=buf.readUInt16BE(r+8),off=strings+buf.readUInt16BE(r+10);
    if(![1,2,16,17].includes(id)||off+len>buf.length)continue;
    if(platform===3||platform===0){const b=Buffer.from(buf.subarray(off,off+len));b.swap16();names[id]=b.toString('utf16le');}
    else if(platform===1&&names[id]===undefined)names[id]=buf.toString('latin1',off,off+len);
  }
  const family=names[16]||names[1];if(!family)return null;
  let weight='400',italic=/italic|oblique/i.test(names[17]||names[2]||'');
  if(tables['OS/2']!==undefined){const o=tables['OS/2'];weight=String(buf.readUInt16BE(o+4)||400);italic||=!!(buf.readUInt16BE(o+62)&1);}
  const fvar=tables.fvar;
  if(fvar!==undefined){
    const axes=buf.readUInt16BE(fvar+4)>0?fvar+buf.readUInt16BE(fvar+4):0,axisCount=buf.readUInt16BE(fvar+8),size=buf.readUInt16BE(fvar+10);
    for(let i=0;i<axisCount&&axes;i++){const a=axes+i*size;if(buf.toString('latin1',a,a+4)==='wght')weight=`${Math.round(buf.readInt32BE(a+4)/65536)} ${Math.round(buf.readInt32BE(a+12)/65536)}`;}
  }
  return{family,file,variable:fvar!==undefined,weight,italic};
}
// Fonts installed by the user and for all users, per system.
const fontDirs=()=>process.platform==='win32'?[path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'Microsoft/Windows/Fonts'),path.join(process.env.WINDIR||'C:\\Windows','Fonts')]
  :process.platform==='linux'?[path.join(os.homedir(),'.local/share/fonts'),path.join(os.homedir(),'.fonts'),'/usr/local/share/fonts','/usr/share/fonts']
  :[path.join(os.homedir(),'Library/Fonts'),'/Library/Fonts'];
let installed:Promise<Face[]>|undefined;
async function installedFaces(){
  const dirs=(process.env.ESF_FONT_DIRS?.split(path.delimiter)||fontDirs()).filter(Boolean),faces:Face[]=[];
  for(const dir of dirs){
    // Linux keeps fonts in subfolders (truetype/<family>/…).
    let files:string[]=[];try{files=await fs.readdir(dir,{recursive:process.platform==='linux'});}catch{continue;}
    for(const f of files.filter(f=>/\.(ttf|otf)$/i.test(f))){try{const file=path.join(dir,f),face=parse(await fs.readFile(file),file);if(face)faces.push(face);}catch{}}
  }
  return faces;
}
const families=(css:string)=>[...css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)].map(m=>m[1].split(',').map(x=>x.replace(/\\/g,'').replace(/!important/i,'').trim().replace(/^["']|["']$/g,'').trim()).filter(Boolean));
export async function embedFonts(deck:Deck):Promise<{deck:Deck;embedded:string[];missing:string[]}>{
  const css=[...deck.masters.flatMap(m=>[m.css,m.html]),...deck.layouts.flatMap(l=>[l.css||'',l.html]),...deck.slides.flatMap(s=>[s.css,s.html,s.staticHtml])].join('\n');
  const declared=new Set(families(css.match(/@font-face\s*\{[^}]*\}/gi)?.join('\n')||'').flat().map(x=>x.toLowerCase()));
  const lists=families(css.replace(/@font-face\s*\{[^}]*\}/gi,'')),wanted=new Map<string,string>();
  for(const list of lists)for(const f of list){const k=f.toLowerCase();if(!generic.has(k)&&!common.has(k)&&!k.startsWith('ui-')&&!k.startsWith('var(')&&!declared.has(k))wanted.set(k,f);}
  if(!wanted.size)return{deck,embedded:[],missing:[]};
  installed??=installedFaces();const faces=await installed;
  const next=structuredClone(deck),embedded:string[]=[],missing:string[]=[];let rules='';
  for(const [key,name] of wanted){
    const all=faces.filter(f=>f.family.toLowerCase()===key);
    // Primary families that are not installed here are reported; fallbacks in a list are not.
    if(!all.length){if(lists.some(l=>l[0]?.toLowerCase()===key))missing.push(name);continue;}
    const chosen=all.some(f=>f.variable)?all.filter(f=>f.variable):all;
    for(const face of chosen){
      const bytes=await fs.readFile(face.file),id='asset-'+createHash('sha256').update(bytes).digest('hex'),mime=/\.otf$/i.test(face.file)?'font/otf':'font/ttf';
      if(!next.assets.some(a=>a.id===id))next.assets.push({id,name:path.basename(face.file),mime,data:bytes.toString('base64')});
      rules+=`@font-face{font-family:"${name.replace(/"/g,'')}";src:url("asset:${id}");font-weight:${face.weight};font-style:${face.italic?'italic':'normal'};font-display:block}\n`;
    }
    embedded.push(name);
  }
  // Every master gets the faces, so switching the active one keeps them.
  for(const m of next.masters)m.css=rules+m.css;
  return{deck:next,embedded,missing};
}
