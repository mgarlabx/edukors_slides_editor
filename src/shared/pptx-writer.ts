// Editable PowerPoint package: each slide gets its picture background (what has no native equivalent) and, on top,
// native text boxes, pictures and shapes described by pptx-extract.ts. 16:9, 16 × 9 in, like the image export.
import {zipSync,strToU8} from 'fflate';
import {escapeHtml} from './model';
import type {PptxItem,PptxLook,PptxParagraph,PptxRun,PptxSlideObjects} from './pptx-extract';

const xml=(s:string)=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`;
const REL='http://schemas.openxmlformats.org/package/2006/relationships';
const OREL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P='http://schemas.openxmlformats.org/presentationml/2006/main';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const CX=14630400,CY=8229600;
const group=`<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
const e=(s:string)=>escapeHtml(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const int=(n:number)=>Math.max(0,Math.round(Number.isFinite(n)?n:0));
const clr=(c:{hex:string;alpha:number})=>`<a:srgbClr val="${/^[0-9A-F]{6}$/.test(c.hex)?c.hex:'000000'}">${c.alpha<1?`<a:alpha val="${int(c.alpha*100000)}"/>`:''}</a:srgbClr>`;

export interface EditableSlide {background:Uint8Array;objects:PptxSlideObjects;notes?:string}
export function createEditablePptx(slides:EditableSlide[],title:string){
  const f:Record<string,Uint8Array>={},add=(name:string,value:string)=>f[name]=strToU8(xml(value));
  const media=new Set<string>();
  slides.forEach((slide,i)=>{
    const n=i+1,k=CX/(slide.objects.width||1600),emu=(px:number)=>int(px*k);
    const rels=[`<Relationship Id="rId1" Type="${OREL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`,`<Relationship Id="rId2" Type="${OREL}/image" Target="../media/slide${n}-background.png"/>`];
    f[`ppt/media/slide${n}-background.png`]=slide.background;media.add('png');
    let id=2;const rel=(type:string,target:string,external=false)=>{const r=`rId${rels.length+1}`;rels.push(`<Relationship Id="${r}" Type="${OREL}/${type}" Target="${e(target)}"${external?' TargetMode="External"':''}/>`);return r;};
    const xfrm=(it:{x:number;y:number;w:number;h:number})=>`<a:xfrm><a:off x="${emu(it.x)}" y="${emu(it.y)}"/><a:ext cx="${Math.max(1,emu(it.w))}" cy="${Math.max(1,emu(it.h))}"/></a:xfrm>`;
    const geometry=(prst:string,it:PptxItem&PptxLook)=>prst==='roundRect'||(prst==='rect'&&it.radius)?`<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${int(Math.min(50000,(it.radius||0)/Math.max(1,Math.min(it.w,it.h))*100000))}"/></a:avLst></a:prstGeom>`:`<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>`;
    const lookXml=(l:PptxLook)=>(l.fill?`<a:solidFill>${clr({...l.fill,alpha:l.fill.alpha*(l.opacity??1)})}</a:solidFill>`:'<a:noFill/>')
      +(l.line?`<a:ln w="${int(l.line.width*k)}"><a:solidFill>${clr(l.line)}</a:solidFill>${l.line.dash?`<a:prstDash val="${l.line.dash}"/>`:''}</a:ln>`:'<a:ln><a:noFill/></a:ln>')
      +(l.shadow?'<a:effectLst><a:outerShdw blurRad="190500" dist="76200" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="172033"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst>':'');
    const runXml=(r:PptxRun)=>{
      const font=e(r.font||'Arial'),size=Math.max(100,Math.min(400000,Math.round(r.size*k/12700*100)));
      const props=`sz="${size}"${r.spacing?` spc="${Math.max(-400000,Math.min(400000,Math.round(r.spacing*k/12700*100)))}"`:''}${r.bold?' b="1"':''}${r.italic?' i="1"':''}${r.underline?' u="sng"':''}${r.strike?' strike="sngStrike"':''}${r.script?` baseline="${r.script==='super'?30000:-25000}"`:''} dirty="0"`;
      const inner=`${r.color?`<a:solidFill>${clr(r.color)}</a:solidFill>`:''}<a:latin typeface="${font}"/><a:ea typeface="${font}"/><a:cs typeface="${font}"/>${r.href?`<a:hlinkClick r:id="${rel('hyperlink',r.href,true)}"/>`:''}`;
      return r.br?`<a:br><a:rPr ${props}>${inner}</a:rPr></a:br>`:`<a:r><a:rPr ${props}>${inner}</a:rPr><a:t>${e(r.text)}</a:t></a:r>`;
    };
    const paragraphXml=(p:PptxParagraph)=>{const last=p.runs.filter(r=>!r.br).at(-1)||p.runs.at(-1);
      return`<a:p><a:pPr algn="${p.align}">${p.lineSpacing&&p.lineSpacing>40&&p.lineSpacing<400?`<a:lnSpc><a:spcPct val="${p.lineSpacing*1000}"/></a:lnSpc>`:''}<a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>${p.runs.map(runXml).join('')}${last?`<a:endParaRPr sz="${Math.max(100,Math.min(400000,Math.round(last.size*k/12700*100)))}" dirty="0"/>`:''}</a:p>`;};
    const shapes=slide.objects.items.map(it=>{
      const name=`${it.type} ${id}`,cNv=`<p:cNvPr id="${id++}" name="${e(name)}"${it.type==='image'&&it.descr?` descr="${e(it.descr)}"`:''}/>`;
      if(it.type==='image'){
        const m=/^data:image\/(png|jpeg|gif);base64,(.+)$/i.exec(it.src);if(!m)return'';
        const ext=m[1].toLowerCase()==='jpeg'?'jpeg':m[1].toLowerCase(),file=`slide${n}-image${id}.${ext}`;f[`ppt/media/${file}`]=Uint8Array.from(Buffer.from(m[2],'base64'));media.add(ext);
        const [l,t,r,b]=it.crop||[0,0,0,0],crop=it.crop?`<a:srcRect l="${int(l*1000)}" t="${int(t*1000)}" r="${int(r*1000)}" b="${int(b*1000)}"/>`:'';
        // A cropped image shows only its visible part, so the frame shrinks to it.
        const shown={x:it.x+it.w*l/100,y:it.y+it.h*t/100,w:it.w*(1-(l+r)/100),h:it.h*(1-(t+b)/100)};
        return`<p:pic><p:nvPicPr>${cNv}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rel('image',`../media/${file}`)}"/>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(shown)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${it.line?`<a:ln w="${int(it.line.width*k)}"><a:solidFill>${clr(it.line)}</a:solidFill></a:ln>`:''}${it.shadow?'<a:effectLst><a:outerShdw blurRad="190500" dist="76200" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="172033"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst>':''}</p:spPr></p:pic>`;
      }
      if(it.type==='text'){
        const [l,t,r,b]=it.insets.map(v=>int(v*k));
        return`<p:sp><p:nvSpPr>${cNv}<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(it)}${geometry('rect',it)}${lookXml(it)}</p:spPr><p:txBody><a:bodyPr wrap="${it.singleLine?'none':'square'}" lIns="${l}" tIns="${t}" rIns="${r}" bIns="${b}" anchor="${it.anchor}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${it.paragraphs.map(paragraphXml).join('')}</p:txBody></p:sp>`;
      }
      return`<p:sp><p:nvSpPr>${cNv}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(it)}${geometry(it.type==='shape'?it.geometry:'rect',it)}${lookXml(it)}</p:spPr><p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr dirty="0"/></a:p></p:txBody></p:sp>`;
    }).join('');
    add(`ppt/slides/slide${n}.xml`,`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OREL}"><p:cSld><p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="rId2"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${group}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    add(`ppt/slides/_rels/slide${n}.xml.rels`,`<Relationships xmlns="${REL}">${rels.join('')}</Relationships>`);
  });
  const types={png:'image/png',jpeg:'image/jpeg',gif:'image/gif'} as Record<string,string>;
  add('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...media].map(x=>`<Default Extension="${x}" ContentType="${types[x]}"/>`).join('')}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${slides.map((_,i)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`);
  add('_rels/.rels',`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OREL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  add('docProps/core.xml',`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${e(title)}</dc:title></cp:coreProperties>`);
  add('ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OREL}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${CX}" cy="${CY}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  add('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OREL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_,i)=>`<Relationship Id="rId${i+2}" Type="${OREL}/slide" Target="slides/slide${i+1}.xml"/>`).join('')}<Relationship Id="rId${slides.length+2}" Type="${OREL}/theme" Target="theme/theme1.xml"/></Relationships>`);
  add('ppt/slideMasters/slideMaster1.xml',`<p:sldMaster xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OREL}"><p:cSld><p:spTree>${group}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels',`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OREL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${OREL}/theme" Target="../theme/theme1.xml"/></Relationships>`);
  add('ppt/slideLayouts/slideLayout1.xml',`<p:sldLayout xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OREL}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels',`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OREL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  add('ppt/theme/theme1.xml',`<a:theme xmlns:a="${A}" name="Neutral"><a:themeElements><a:clrScheme name="Neutral">${Object.entries({dk1:'000000',lt1:'FFFFFF',dk2:'172336',lt2:'F2F4F8',accent1:'5365DE',accent2:'52846D',accent3:'4C7F9D',accent4:'657185',accent5:'CABDA7',accent6:'E1E6EF',hlink:'5365DE',folHlink:'657185'}).map(([k,v])=>`<a:${k}><a:srgbClr val="${v}"/></a:${k}>`).join('')}</a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Neutral"><a:fillStyleLst>${[1,2,3].map(()=>'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')}</a:fillStyleLst><a:lnStyleLst>${[1,2,3].map(()=>'<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>').join('')}</a:lnStyleLst><a:effectStyleLst>${[1,2,3].map(()=>'<a:effectStyle><a:effectLst/></a:effectStyle>').join('')}</a:effectStyleLst><a:bgFillStyleLst>${[1,2,3].map(()=>'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
  return zipSync(f,{level:6});
}
