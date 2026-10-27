import {BrowserWindow} from 'electron';
import {zipSync,strToU8} from 'fflate';
import {Deck,Slide,escapeHtml} from '../shared/model';
import {slideDocument} from '../shared/render';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Loads each slide's static state in an isolated hidden window; capture=false only checks
// readiness and script errors (used to validate AI changes before applying them).
async function renderSlides(deck:Deck,slides:Slide[],tempRoot:string,capture:boolean){
  const win=new BrowserWindow({show:false,width:1600,height:900,useContentSize:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  const folder=path.join(tempRoot,'capture-'+randomUUID());await fs.mkdir(folder,{recursive:true});
  const images:Buffer[]=[],errors:{id:string;title:string;message:string}[]=[];
  try{
    for(const slide of slides){
      const file=path.join(folder,'slide.html');await fs.writeFile(file,slideDocument(deck,slide,true));
      // A script stuck in a loop never lets the load finish; the timeout below still fires.
      void win.loadFile(file).catch(()=>{});
      const start=Date.now();let ready=false,error='';
      while(Date.now()-start<8000){
        const state=await Promise.race([win.webContents.executeJavaScript('[Boolean(window.__slideReady),window.__slideError||""]').catch(()=>[false,'']),new Promise(r=>setTimeout(()=>r([false,'']),1000))]) as [boolean,string];
        [ready,error]=state;if(ready||error)break;
        await new Promise(r=>setTimeout(r,40));
      }
      if(!ready||error){
        errors.push({id:slide.id,title:slide.title,message:error||'Slide did not become ready within 8 s (script loop or missing resource?).'});
        if(capture)throw Error(slide.title+': '+errors.at(-1)!.message);
        if(!ready){win.webContents.forcefullyCrashRenderer();await new Promise(r=>setTimeout(r,200));}
        continue;
      }
      if(capture)images.push((await win.webContents.capturePage()).toPNG());
    }
    return {images,errors};
  }finally{win.destroy();await fs.rm(folder,{recursive:true,force:true});}
}
export async function captureSlides(deck:Deck,tempRoot:string){return (await renderSlides(deck,deck.slides,tempRoot,true)).images;}
export async function checkSlides(deck:Deck,ids:string[],tempRoot:string){return (await renderSlides(deck,deck.slides.filter(s=>ids.includes(s.id)),tempRoot,false)).errors;}
export async function createPdf(images:Buffer[],tempRoot:string){
  const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const file=path.join(tempRoot,randomUUID()+'.html');
  try{
    await fs.writeFile(file,`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:16in 9in;margin:0}*{box-sizing:border-box}body{margin:0}img{display:block;width:16in;height:9in;break-after:page}img:last-child{break-after:auto}</style></head><body>${images.map(b=>`<img src="data:image/png;base64,${b.toString('base64')}">`).join('')}</body></html>`);
    await win.loadFile(file);
    await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode()))');
    return await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,margins:{top:0,bottom:0,left:0,right:0}});
  }finally{win.destroy();await fs.rm(file,{force:true});}
}
const xml=(s:string)=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`;
const REL='http://schemas.openxmlformats.org/package/2006/relationships';
const OREL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P='http://schemas.openxmlformats.org/presentationml/2006/main';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const group=`<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
export function createPptx(images:Buffer[],title:string){
  const f:Record<string,Uint8Array>={};
  const add=(name:string,value:string)=>f[name]=strToU8(xml(value));
  add('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${images.map((_,i)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`);
  add('_rels/.rels',`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OREL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  add('docProps/core.xml',`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeHtml(title)}</dc:title></cp:coreProperties>`);
  add('ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OREL}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${images.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="14630400" cy="8229600" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  add('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OREL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${images.map((_,i)=>`<Relationship Id="rId${i+2}" Type="${OREL}/slide" Target="slides/slide${i+1}.xml"/>`).join('')}</Relationships>`);
  add('ppt/slideMasters/slideMaster1.xml',`<p:sldMaster xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OREL}"><p:cSld><p:spTree>${group}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels',`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OREL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${OREL}/theme" Target="../theme/theme1.xml"/></Relationships>`);
  add('ppt/slideLayouts/slideLayout1.xml',`<p:sldLayout xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OREL}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels',`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OREL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  add('ppt/theme/theme1.xml',`<a:theme xmlns:a="${A}" name="Neutral"><a:themeElements><a:clrScheme name="Neutral">${Object.entries({dk1:'000000',lt1:'FFFFFF',dk2:'172336',lt2:'F2F4F8',accent1:'5365DE',accent2:'52846D',accent3:'4C7F9D',accent4:'657185',accent5:'CABDA7',accent6:'E1E6EF',hlink:'5365DE',folHlink:'657185'}).map(([k,v])=>`<a:${k}><a:srgbClr val="${v}"/></a:${k}>`).join('')}</a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Neutral"><a:fillStyleLst>${[1,2,3].map(()=>'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')}</a:fillStyleLst><a:lnStyleLst>${[1,2,3].map(()=>'<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>').join('')}</a:lnStyleLst><a:effectStyleLst>${[1,2,3].map(()=>'<a:effectStyle><a:effectLst/></a:effectStyle>').join('')}</a:effectStyleLst><a:bgFillStyleLst>${[1,2,3].map(()=>'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
  images.forEach((b,i)=>{
    const n=i+1;f[`ppt/media/image${n}.png`]=b;
    add(`ppt/slides/slide${n}.xml`,`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OREL}"><p:cSld><p:spTree>${group}<p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide ${n}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="14630400" cy="8229600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    add(`ppt/slides/_rels/slide${n}.xml.rels`,`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OREL}/image" Target="../media/image${n}.png"/><Relationship Id="rId2" Type="${OREL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
  });
  return Buffer.from(zipSync(f,{level:6}));
}
