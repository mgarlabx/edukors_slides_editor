import {Deck,Layout,Master,ImportIssue,newDeck,escapeHtml,validateDeck} from './model';
import {PresentationPackage,OfficeRelationship,readPresentationPackage,children,descendants,OFFICE_REL,STRICT_OFFICE_REL} from './openxml';
import {pptxGeometry} from './pptx-shapes';

export type PptxCompatibilityIssue=ImportIssue;
export interface PptxImportResult {deck:Deck;issues:PptxCompatibilityIssue[]}
// EMU → canvas pixels: x' = a·x + c·y + e, y' = b·x + d·y + f; groups compose their child space into it.
interface Matrix {a:number;b:number;c:number;d:number;e:number;f:number}
interface Space {m:Matrix;sx:number;sy:number;rotation:number}
interface Box {x:number;y:number;width:number;height:number;rotation:number;flipH:boolean;flipV:boolean}
type Palette=Record<string,string>;
// Everything a part (slide, layout, master) needs to resolve inherited colors, fonts, text styles and placeholders.
interface Part {name:string;doc:Document;rels:readonly OfficeRelationship[];layout?:Document;master?:Document;palette:Palette;fonts:{major:string;minor:string};theme?:Document}
interface Context {pkg:PresentationPackage;deck:Deck;issues:PptxCompatibilityIssue[];images:Map<string,string>;scale:number;defaults?:Element;slideId?:string;counter:{n:number}}

const first=(node:Element|Document|undefined,name:string)=>node?descendants(node,name)[0]:undefined;
const direct=(node:Node|undefined,name:string)=>node?children(node,name)[0]:undefined;
const attr=(node:Element|undefined,name:string)=>node?.getAttribute(name)||'';
const number=(value:string,fallback=0)=>value!==''&&Number.isFinite(Number(value))?Number(value):fallback;
const isOfficeRel=(type:string,kind:string)=>type===OFFICE_REL+'/'+kind||type===STRICT_OFFICE_REL+'/'+kind;
const relId=(node:Element,name='id')=>node.getAttributeNS(OFFICE_REL,name)||node.getAttributeNS(STRICT_OFFICE_REL,name)||node.getAttribute('r:'+name)||'';
const base64=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);};
const mimeTypes=new Set(['image/png','image/jpeg','image/gif','image/webp','image/avif','image/svg+xml']);
const decimal=(value:number)=>String(Math.round(value*1000)/1000);
const multiply=(p:Matrix,q:Matrix):Matrix=>({a:p.a*q.a+p.c*q.b,b:p.b*q.a+p.d*q.b,c:p.a*q.c+p.c*q.d,d:p.b*q.c+p.d*q.d,e:p.a*q.e+p.c*q.f+p.e,f:p.b*q.e+p.d*q.f+p.f});
const apply=(m:Matrix,x:number,y:number)=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f});
const BASE_CSS=`*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000}
.slide{position:relative;width:1600px;height:900px;padding:0;overflow:hidden;background:#fff}p{margin:0}
[data-step]{transition:opacity .25s,transform .25s}[data-step].pending{opacity:0;transform:translateY(12px)}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

// ---------- Colors ----------
function theme(pkg:PresentationPackage,masterPart:string){
  const part=pkg.relationships(masterPart).find(r=>isOfficeRel(r.type,'theme')&&!r.external)?.target;
  return part?pkg.xml(part):undefined;
}
function themePalette(doc:Document|undefined,master:Document|undefined):Palette{
  const colors:Palette={dk1:'000000',lt1:'FFFFFF',dk2:'1F497D',lt2:'EEECE1',accent1:'4F81BD',accent2:'C0504D',accent3:'9BBB59',accent4:'8064A2',accent5:'4BACC6',accent6:'F79646',hlink:'0000FF',folHlink:'800080'};
  const scheme=first(doc,'clrScheme');
  if(scheme)for(const entry of children(scheme)){const c=children(entry)[0],v=attr(c,c?.localName==='sysClr'?'lastClr':'val');if(/^[a-f\d]{6}$/i.test(v))colors[entry.localName]=v;}
  // The master's color map says which theme colors bg1/tx1/bg2/tx2 are.
  const map=first(master,'clrMap'),aliases:Record<string,string>={bg1:'lt1',tx1:'dk1',bg2:'lt2',tx2:'dk2'};
  for(const [key,fallback] of Object.entries(aliases)){const target=attr(map,key)||fallback;colors[key]=colors[target]||colors[fallback];}
  return colors;
}
const presetColors:Record<string,string>={black:'000000',white:'FFFFFF',red:'FF0000',green:'008000',blue:'0000FF',yellow:'FFFF00',gray:'808080',grey:'808080',orange:'FFA500',purple:'800080',darkGray:'A9A9A9',lightGray:'D3D3D3'};
function hsl(r:number,g:number,b:number){const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;if(max===min)return[0,0,l];const d=max-min,s=l>.5?d/(2-max-min):d/(max+min);const h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;return[h/6,s,l];}
function rgb(h:number,s:number,l:number){if(!s)return[l,l,l];const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q,t=(x:number)=>{x=(x+1)%1;return x<1/6?p+(q-p)*6*x:x<1/2?q:x<2/3?p+(q-p)*(2/3-x)*6:p;};return[t(h+1/3),t(h),t(h-1/3)];}
// A color element (srgbClr, schemeClr, sysClr, prstClr, scrgbClr) with its modifiers, as CSS; phClr is the style's color.
function colorValue(choice:Element|undefined,palette:Palette,placeholder?:string):string|undefined{
  if(!choice)return;
  let hex='';
  if(choice.localName==='srgbClr')hex=attr(choice,'val');
  else if(choice.localName==='schemeClr')hex=attr(choice,'val')==='phClr'?(placeholder||'').replace('#',''):palette[attr(choice,'val')]||'';
  else if(choice.localName==='sysClr')hex=attr(choice,'lastClr')||(attr(choice,'val')==='window'?'FFFFFF':'000000');
  else if(choice.localName==='prstClr')hex=presetColors[attr(choice,'val')]||'';
  else if(choice.localName==='scrgbClr')hex=['r','g','b'].map(k=>Math.round(Math.min(1,Math.max(0,number(attr(choice,k))/100000))*255).toString(16).padStart(2,'0')).join('');
  if(!/^[a-f\d]{6}$/i.test(hex))return;
  let [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255),alpha=1;
  for(const mod of children(choice)){
    const v=number(attr(mod,'val'))/100000;
    if(mod.localName==='alpha')alpha=v;
    else if(mod.localName==='tint'){[r,g,b]=[r,g,b].map(c=>c+(1-c)*(1-v));}
    else if(mod.localName==='shade'){[r,g,b]=[r,g,b].map(c=>c*v);}
    else if(['lumMod','lumOff','satMod'].includes(mod.localName)){let [h,s,l]=hsl(r,g,b);if(mod.localName==='lumMod')l*=v;else if(mod.localName==='lumOff')l+=v;else s*=v;[r,g,b]=rgb(h,Math.min(1,Math.max(0,s)),Math.min(1,Math.max(0,l)));}
  }
  const to=(c:number)=>Math.round(Math.min(1,Math.max(0,c))*255);
  return alpha<1?`rgba(${to(r)},${to(g)},${to(b)},${decimal(Math.max(0,alpha))})`:'#'+[r,g,b].map(c=>to(c).toString(16).padStart(2,'0')).join('').toUpperCase();
}
const colorChild=(node:Element|undefined)=>node?children(node).find(c=>/^(srgbClr|schemeClr|sysClr|prstClr|scrgbClr)$/.test(c.localName)):undefined;
const color=(node:Element|undefined,palette:Palette,fallback?:string,placeholder?:string)=>colorValue(colorChild(node),palette,placeholder)||fallback;

// ---------- Fills and lines ----------
interface Fill {css:string;svg:string;defs:string}
function gradient(node:Element,palette:Palette,placeholder?:string,id='g'):Fill|undefined{
  const stops=descendants(node,'gs').map(gs=>({at:number(attr(gs,'pos'))/1000,color:color(gs,palette,undefined,placeholder)})).filter(s=>s.color).sort((a,b)=>a.at-b.at);
  if(!stops.length)return;
  const lin=direct(node,'lin'),radial=direct(node,'path');
  const list=stops.map(s=>`${s.color} ${decimal(s.at)}%`).join(',');
  const angle=number(attr(lin,'ang'))/60000;
  const css=radial?`radial-gradient(circle,${list})`:`linear-gradient(${decimal(angle+90)}deg,${list})`;
  const rad=angle*Math.PI/180,x=Math.cos(rad)/2,y=Math.sin(rad)/2;
  const svgStops=stops.map(s=>`<stop offset="${decimal(s.at)}%" stop-color="${s.color}"/>`).join('');
  const defs=radial?`<radialGradient id="${id}">${svgStops}</radialGradient>`:`<linearGradient id="${id}" x1="${decimal(.5-x)}" y1="${decimal(.5-y)}" x2="${decimal(.5+x)}" y2="${decimal(.5+y)}">${svgStops}</linearGradient>`;
  return {css,svg:`url(#${id})`,defs};
}
function fillOf(owner:Element|undefined,ctx:Context,part:Part,placeholder?:string,id='g'):Fill|undefined{
  if(!owner)return;
  for(const node of children(owner)){
    if(node.localName==='noFill')return {css:'transparent',svg:'none',defs:''};
    if(node.localName==='solidFill'){const c=color(node,part.palette,undefined,placeholder);if(c)return {css:c,svg:c,defs:''};}
    if(node.localName==='gradFill')return gradient(node,part.palette,placeholder,id);
    if(node.localName==='blipFill'){const asset=picture(node,ctx,part);if(asset)return {css:`url(asset:${asset}) center/cover no-repeat`,svg:'none',defs:''};}
  }
}
// A theme style reference (fillRef/lnRef/bgRef idx) resolved against the theme's format scheme.
function themeStyle(part:Part,list:string,idx:number){
  const scheme=first(part.theme,list);if(!scheme||idx<1)return;
  return children(scheme)[idx-1];
}
function shapeFill(node:Element,ctx:Context,part:Part,id:string,group?:Fill):Fill{
  const props=direct(node,'spPr')||direct(node,'grpSpPr');
  if(props&&direct(props,'grpFill')&&group)return group;
  const own=fillOf(props,ctx,part,undefined,id);if(own)return own;
  const ref=direct(direct(node,'style'),'fillRef');
  if(ref&&number(attr(ref,'idx'))>0){
    const phClr=color(ref,part.palette),style=themeStyle(part,'fillStyleLst',number(attr(ref,'idx')));
    if(style){const wrapper=style.ownerDocument!.createElement('x');wrapper.appendChild(style.cloneNode(true));const resolved=fillOf(wrapper,ctx,part,phClr,id);if(resolved)return resolved;}
    if(phClr)return {css:phClr,svg:phClr,defs:''};
  }
  return {css:'transparent',svg:'none',defs:''};
}
interface Line {color:string;width:number;dash:string}
function lineOf(node:Element,part:Part,scale:number):Line|undefined{
  const props=direct(node,'spPr'),ln=direct(props,'ln'),ref=direct(direct(node,'style'),'lnRef');
  if(ln&&direct(ln,'noFill'))return;
  let stroke=ln?color(direct(ln,'solidFill'),part.palette)||color(direct(ln,'gradFill')?first(direct(ln,'gradFill'),'gs'):undefined,part.palette):undefined;
  let width=number(attr(ln,'w'),0);
  if(ref&&number(attr(ref,'idx'))>0){
    const style=themeStyle(part,'lnStyleLst',number(attr(ref,'idx')));
    stroke=stroke||color(direct(style,'solidFill'),part.palette,undefined,color(ref,part.palette))||color(ref,part.palette);
    width=width||number(attr(style,'w'),9525);
  }
  if(!stroke)return;
  const px=Math.max(.5,(width||9525)*scale),dash=attr(direct(ln,'prstDash'),'val');
  const pattern=dash==='dash'||dash==='lgDash'||dash==='sysDash'?`${decimal(px*4)} ${decimal(px*3)}`:dash==='dot'||dash==='sysDot'?`${decimal(px)} ${decimal(px*2)}`:'';
  return {color:stroke,width:px,dash:pattern};
}

// ---------- Geometry ----------
function boxOf(node:Element,space:Space,inherited?:Element):Box|undefined{
  const props=direct(node,'spPr')||direct(node,'grpSpPr');
  const xfrm=direct(props,'xfrm')||direct(node,'xfrm')||(inherited?direct(direct(inherited,'spPr'),'xfrm'):undefined);
  const off=direct(xfrm,'off'),ext=direct(xfrm,'ext');
  if(!off||!ext)return;
  const cx=number(attr(ext,'cx')),cy=number(attr(ext,'cy')),x=number(attr(off,'x')),y=number(attr(off,'y'));
  const center=apply(space.m,x+cx/2,y+cy/2),width=cx*space.sx,height=cy*space.sy;
  return {x:center.x-width/2,y:center.y-height/2,width,height,rotation:number(attr(xfrm,'rot'))/60000+space.rotation,flipH:attr(xfrm,'flipH')==='1',flipV:attr(xfrm,'flipV')==='1'};
}
function boxStyle(value:Box,height='height'){
  const transform=[value.rotation%360?`rotate(${decimal(value.rotation)}deg)`:'',value.flipH?'scaleX(-1)':'',value.flipV?'scaleY(-1)':''].filter(Boolean).join(' ');
  return `position:absolute;left:${decimal(value.x)}px;top:${decimal(value.y)}px;width:${decimal(Math.max(1,value.width))}px;${height}:${decimal(Math.max(1,value.height))}px;${transform?'transform:'+transform+';':''}`;
}
function groupSpace(node:Element,space:Space):Space{
  const xfrm=direct(direct(node,'grpSpPr'),'xfrm');
  const off=direct(xfrm,'off'),ext=direct(xfrm,'ext'),chOff=direct(xfrm,'chOff'),chExt=direct(xfrm,'chExt');
  if(!off||!ext)return space;
  const x=number(attr(off,'x')),y=number(attr(off,'y')),cx=number(attr(ext,'cx')),cy=number(attr(ext,'cy'));
  const ccx=number(attr(chExt,'cx'),cx),ccy=number(attr(chExt,'cy'),cy),sx=ccx?cx/ccx:1,sy=ccy?cy/ccy:1;
  const rot=number(attr(xfrm,'rot'))/60000,rad=rot*Math.PI/180,mx=x+cx/2,my=y+cy/2;
  const fx=attr(xfrm,'flipH')==='1'?-1:1,fy=attr(xfrm,'flipV')==='1'?-1:1;
  // child → group frame (scale and offset), then flip and rotate around the group's center.
  const local:Matrix={a:sx,b:0,c:0,d:sy,e:x-number(attr(chOff,'x'))*sx,f:y-number(attr(chOff,'y'))*sy};
  const turn=multiply(multiply({a:1,b:0,c:0,d:1,e:mx,f:my},{a:Math.cos(rad)*fx,b:Math.sin(rad)*fx,c:-Math.sin(rad)*fy,d:Math.cos(rad)*fy,e:0,f:0}),{a:1,b:0,c:0,d:1,e:-mx,f:-my});
  return {m:multiply(space.m,multiply(turn,local)),sx:space.sx*sx,sy:space.sy*sy,rotation:space.rotation+rot};
}

// ---------- Placeholders and text styles ----------
function placeholderIn(node:Element,doc:Document|undefined){
  const ph=first(node,'ph');if(!ph||!doc)return;
  const idx=attr(ph,'idx'),type=attr(ph,'type')||'body';
  const shapes=descendants(doc,'sp').filter(s=>first(s,'ph'));
  const norm=(t:string)=>t==='ctrTitle'?'title':t==='subTitle'?'body':t||'body';
  return (idx?shapes.find(s=>attr(first(s,'ph'),'idx')===idx):undefined)||shapes.find(s=>norm(attr(first(s,'ph'),'type'))===norm(type));
}
// Level properties from the most specific to the most general: shape, layout placeholder, master placeholder, master
// text styles (title/body/other) and the presentation's default text style.
function levelChain(node:Element,part:Part,ctx:Context,level:number){
  const key='lvl'+(level+1)+'pPr',list:Element[]=[];
  const push=(style:Element|undefined)=>{const value=direct(style,key);if(value)list.push(value);};
  push(direct(direct(node,'txBody'),'lstStyle'));
  const ph=first(node,'ph'),layoutPh=placeholderIn(node,part.layout),masterPh=placeholderIn(node,part.master)||(layoutPh?placeholderIn(layoutPh,part.master):undefined);
  push(direct(direct(layoutPh,'txBody'),'lstStyle'));push(direct(direct(masterPh,'txBody'),'lstStyle'));
  const styles=first(part.master,'txStyles'),type=attr(ph,'type');
  if(ph)push(direct(styles,/^(title|ctrTitle)$/.test(type)?'titleStyle':/^(dt|ftr|sldNum)$/.test(type)?'otherStyle':'bodyStyle'));
  else push(direct(styles,'otherStyle'));
  push(ctx.defaults);
  return {list,layoutPh,masterPh};
}
const pick=(chain:Element[],read:(el:Element)=>string|undefined)=>{for(const el of chain){const v=read(el);if(v)return v;}return '';};
function fontName(raw:string,part:Part){
  const name=raw==='+mj-lt'||raw==='+mj-ea'?part.fonts.major:raw==='+mn-lt'||raw==='+mn-ea'?part.fonts.minor:raw;
  return /^[\p{L}\p{N} _.,+-]{1,200}$/u.test(name)&&!name.startsWith('+')?name:'';
}
function safeLink(relation:OfficeRelationship|undefined){
  if(!relation?.external)return '';
  try{const url=new URL(relation.target);return ['http:','https:','mailto:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
function textHtml(node:Element,part:Part,ctx:Context,textColor?:string){
  const body=direct(node,'txBody')!,fontScale=12700*ctx.scale;
  const fit=first(direct(body,'bodyPr'),'normAutofit'),shrink=number(attr(fit,'fontScale'),100000)/100000,lineCut=number(attr(fit,'lnSpcReduction'))/100000;
  const counters:number[]=[];
  return children(body,'p').map(paragraph=>{
    const own=direct(paragraph,'pPr'),level=Math.min(8,Math.max(0,number(attr(own,'lvl'))));
    const chain=[...(own?[own]:[]),...levelChain(node,part,ctx,level).list];
    const defaults=chain.map(el=>direct(el,'defRPr')).filter((el):el is Element=>!!el);
    const runProps=(run:Element)=>[...(direct(run,'rPr')?[direct(run,'rPr')!]:[]),...defaults];
    const size=(props:Element[])=>number(pick(props,el=>attr(el,'sz')),1800)/100*fontScale*shrink;
    const runs=children(paragraph).filter(r=>['r','fld','br'].includes(r.localName));
    const firstSize=size(runProps(runs.find(r=>r.localName!=='br')||direct(paragraph,'endParaRPr')||paragraph));
    const styleOf=(props:Element[])=>{
      const font=fontName(pick(props,el=>attr(direct(el,'latin'),'typeface')),part);
      const fill=pick(props,el=>direct(el,'solidFill')?color(direct(el,'solidFill'),part.palette):undefined)||textColor||'#'+(part.palette.tx1||'000000');
      const styles=[`font-size:${decimal(Math.max(1,Math.min(400,size(props))))}px`,...font?[`font-family:'${font}'`]:[],`color:${fill}`];
      const b=pick(props,el=>attr(el,'b')),i=pick(props,el=>attr(el,'i')),u=pick(props,el=>attr(el,'u')),strike=pick(props,el=>attr(el,'strike'));
      if(b==='1'||b==='true')styles.push('font-weight:700');
      if(i==='1'||i==='true')styles.push('font-style:italic');
      const decorations=[];if(u&&u!=='none')decorations.push('underline');if(strike&&strike!=='noStrike')decorations.push('line-through');
      if(decorations.length)styles.push('text-decoration:'+decorations.join(' '));
      const caps=pick(props,el=>attr(el,'cap'));if(caps==='all')styles.push('text-transform:uppercase');else if(caps==='small')styles.push('font-variant:small-caps');
      const spacing=number(pick(props,el=>attr(el,'spc')));if(spacing)styles.push(`letter-spacing:${decimal(spacing/100*fontScale)}px`);
      return styles.join(';');
    };
    const pieces=runs.map(run=>{
      if(run.localName==='br')return '<br>';
      const props=runProps(run);
      let content=escapeHtml(children(run,'t').map(t=>t.textContent||'').join(''));
      const baseline=number(attr(direct(run,'rPr'),'baseline'));
      if(baseline)content=`<${baseline<0?'sub':'sup'}>${content}</${baseline<0?'sub':'sup'}>`;
      content=`<span style="${escapeHtml(styleOf(props))}">${content}</span>`;
      const link=direct(direct(run,'rPr'),'hlinkClick'),href=link?safeLink(part.rels.find(r=>r.id===relId(link))):'';
      return href?`<a href="${escapeHtml(href)}">${content}</a>`:content;
    }).join('');
    const empty=`<span style="${escapeHtml(styleOf([...(direct(paragraph,'endParaRPr')?[direct(paragraph,'endParaRPr')!]:[]),...defaults]))}"><br></span>`;
    const algn=pick(chain,el=>attr(el,'algn'));
    const css=[`text-align:${({ctr:'center',r:'right',just:'justify',dist:'justify'} as Record<string,string>)[algn]||'left'}`];
    // PowerPoint's single line spacing is about 1.2 × the font size.
    const lnSpc=chain.map(el=>direct(el,'lnSpc')).find(Boolean),pct=direct(lnSpc,'spcPct'),pts=direct(lnSpc,'spcPts');
    if(pts)css.push(`line-height:${decimal(number(attr(pts,'val'))/100*fontScale)}px`);
    else css.push(`line-height:${decimal(Math.max(.5,1.2*(pct?number(attr(pct,'val'),100000)/100000:1)*(1-lineCut)))}`);
    for(const [key,prop] of [['spcBef','margin-top'],['spcAft','margin-bottom']]){
      const space=chain.map(el=>direct(el,key)).find(Boolean),spPts=direct(space,'spcPts'),spPct=direct(space,'spcPct');
      const px=spPts?number(attr(spPts,'val'))/100*fontScale:spPct?number(attr(spPct,'val'))/100000*firstSize:0;
      if(px)css.push(`${prop}:${decimal(px)}px`);
    }
    const marL=number(pick(chain,el=>attr(el,'marL')))*ctx.scale,indent=number(pick(chain,el=>attr(el,'indent')))*ctx.scale;
    if(marL)css.push(`padding-left:${decimal(marL)}px`);
    const none=chain.find(el=>direct(el,'buNone')||direct(el,'buChar')||direct(el,'buAutoNum'));
    const bullet=none&&!direct(none,'buNone')&&runs.length?none:undefined;
    let marker='';
    counters.length=Math.max(counters.length,level+1);
    if(bullet&&direct(bullet,'buAutoNum')){
      counters[level]=(counters[level]||number(attr(direct(bullet,'buAutoNum'),'startAt'),1)-1)+1;counters.length=level+1;
      const scheme=attr(direct(bullet,'buAutoNum'),'type'),n=counters[level];
      const label=/alpha/i.test(scheme)?String.fromCharCode((/UcPeriod|Uc/.test(scheme)?64:96)+((n-1)%26)+1):/roman/i.test(scheme)?roman(n,/Uc/.test(scheme)):String(n);
      marker=label+(/Paren(R|Both)/.test(scheme)?')':'.');
    }else if(bullet){counters.length=level;marker=attr(direct(bullet,'buChar'),'char')||'•';}
    else counters.length=level;
    if(marker){
      const bulletColor=color(direct(bullet!,'buClr'),part.palette),bulletFont=fontName(attr(direct(bullet!,'buFont'),'typeface'),part);
      const width=Math.max(0,-indent);
      css.push(`text-indent:${decimal(indent)}px`);
      marker=`<span style="${escapeHtml(`display:inline-block;min-width:${decimal(width)}px;text-indent:0;font-size:${decimal(firstSize)}px;${bulletColor?'color:'+bulletColor+';':''}${bulletFont&&!/wingdings|symbol/i.test(bulletFont)?`font-family:'${bulletFont}';`:''}`)}">${escapeHtml(/wingdings|symbol/i.test(bulletFont)?'•':marker)}</span>`;
    }else if(indent)css.push(`text-indent:${decimal(indent)}px`);
    return `<p style="${escapeHtml('margin:0;'+css.join(';'))}">${marker}${pieces||empty}</p>`;
  }).join('');
}
function roman(n:number,upper:boolean){const map:[number,string][]=[[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];let out='';for(const [v,s] of map)while(n>=v){out+=s;n-=v;}return upper?out.toUpperCase():out;}
function bodyProps(node:Element,part:Part,ctx:Context){
  const {layoutPh,masterPh}=levelChain(node,part,ctx,0);
  const list=[direct(direct(node,'txBody'),'bodyPr'),direct(direct(layoutPh,'txBody'),'bodyPr'),direct(direct(masterPh,'txBody'),'bodyPr')].filter((x):x is Element=>!!x);
  const get=(key:string)=>pick(list,el=>el.hasAttribute(key)?attr(el,key):undefined);
  const padding=[['tIns',45720],['rIns',91440],['bIns',45720],['lIns',91440]].map(([k,f])=>decimal(number(get(String(k)),Number(f))*ctx.scale)+'px').join(' ');
  return {padding,anchor:({ctr:'center',b:'end'} as Record<string,string>)[get('anchor')]||'start',nowrap:get('wrap')==='none'};
}
const hasText=(node:Element)=>descendants(direct(node,'txBody')||node,'t').some(t=>(t.textContent||'').trim());

// ---------- Pictures ----------
function picture(blipOwner:Element,ctx:Context,part:Part){
  const blip=first(blipOwner,'blip');if(!blip)return;
  const image=part.rels.find(r=>r.id===relId(blip,'embed'));
  const mime=image&&!image.external?ctx.pkg.contentTypes.get(image.target):undefined;
  if(!image||image.external||!isOfficeRel(image.type,'image')||!mime||!mimeTypes.has(mime))return;
  const data=ctx.pkg.parts.get(image.target)!;
  if(mime==='image/svg+xml'&&/<\s*script\b|\bon\w+\s*=|<!\s*(?:DOCTYPE|ENTITY)|(?:href\s*=\s*["']?|url\(\s*["']?)(?:https?:|file:|\/\/)/i.test(decoderText(data)))return;
  let asset=ctx.images.get(image.target);
  if(!asset){asset='asset-pptx-'+(ctx.images.size+1);ctx.images.set(image.target,asset);ctx.deck.assets.push({id:asset,name:image.target.slice(image.target.lastIndexOf('/')+1),mime,data:base64(data)});}
  return asset;
}
function decoderText(bytes:Uint8Array){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return '<script>';}}

// ---------- Objects ----------
// Renders the shape tree of a slide, layout or master. Placeholders of layouts and masters are prompts, not content.
function shapes(tree:Element,part:Part,ctx:Context,space:Space,content:boolean,group?:Fill):string[]{
  const out:string[]=[];
  for(let node of children(tree)){
    if(node.localName==='AlternateContent')node=direct(node,'Fallback')?children(direct(node,'Fallback')!)[0]:children(direct(node,'Choice')||node)[0];
    if(!node||['nvGrpSpPr','grpSpPr','extLst'].includes(node.localName))continue;
    const identity=first(node,'cNvPr'),id=/^\d+$/.test(attr(identity,'id'))?attr(identity,'id'):String(++ctx.counter.n),name=(attr(identity,'name')||node.localName).slice(0,200);
    const ph=first(direct(direct(node,'nvSpPr')||direct(node,'nvPicPr')||node,'nvPr')||node,'ph');
    if(ph&&!content)continue;
    if(attr(identity,'hidden')==='1')continue;
    if(node.localName==='grpSp'){const gspace=groupSpace(node,space),gfill=fillOf(direct(node,'grpSpPr'),ctx,part,undefined,`g-${ctx.slideId}-${id}`)||group;out.push(...shapes(node,part,ctx,gspace,content,gfill));continue;}
    const inherited=ph?placeholderIn(node,part.layout)||placeholderIn(node,part.master):undefined;
    const bounds=boxOf(node,space,inherited)||(inherited?boxOf(inherited,space,placeholderIn(inherited,part.master)):undefined);
    if(!bounds){ctx.issues.push({slideId:ctx.slideId,objectId:id,code:'geometry-inherited-or-missing',detail:`${name}: geometry could not be resolved.`});continue;}
    const tag=`data-pptx-id="${id}"`;
    if(node.localName==='pic'){
      const asset=picture(direct(node,'blipFill')||node,ctx,part);
      if(!asset){ctx.issues.push({slideId:ctx.slideId,objectId:id,code:'unsupported-image',detail:`${name}: linked or unsupported image retained in the original package.`});out.push(unsupported(node,id,name,boxStyle(bounds)));continue;}
      // A PowerPoint crop shows part of the picture in the frame: the whole picture is laid out and clipped to the frame.
      const crop=first(node,'srcRect'),[l,t,r,b]=['l','t','r','b'].map(k=>Math.max(0,number(attr(crop,k))/100000));
      let box=bounds,clip='';
      if(l+r<.99&&t+b<.99&&(l||t||r||b)){const w=bounds.width/(1-l-r),h=bounds.height/(1-t-b);box={...bounds,x:bounds.x-l*w,y:bounds.y-t*h,width:w,height:h};clip=`clip-path:inset(${decimal(t*100)}% ${decimal(r*100)}% ${decimal(b*100)}% ${decimal(l*100)}%);`;}
      const alpha=number(attr(first(node,'alphaModFix'),'amt'),100000)/100000;
      out.push(`<img data-manual="image" ${tag} alt="${escapeHtml(attr(identity,'descr')||name)}" src="asset:${asset}" style="${escapeHtml(boxStyle(box)+'object-fit:fill;'+clip+(alpha<1?`opacity:${decimal(alpha)};`:''))}"/>`);
      continue;
    }
    if(node.localName==='graphicFrame'){out.push(unsupported(node,id,name,boxStyle(bounds)));ctx.issues.push({slideId:ctx.slideId,objectId:id,code:'unsupported-object',detail:`${name}: tables, charts and diagrams are preserved in the source package; direct editing is not supported yet.`});continue;}
    if(!['sp','cxnSp'].includes(node.localName)){out.push(unsupported(node,id,name,boxStyle(bounds)));ctx.issues.push({slideId:ctx.slideId,objectId:id,code:'unsupported-object',detail:`${name}: ${node.localName} is not supported yet.`});continue;}
    const fill=shapeFill(node,ctx,part,`g-${ctx.slideId}-${id}`,group),line=lineOf(node,part,ctx.scale);
    const text=node.localName==='sp'&&direct(node,'txBody')&&(hasText(node)||attr(first(node,'cNvSpPr'),'txBox')==='1')?node:undefined;
    const props=direct(node,'spPr'),preset=attr(first(props,'prstGeom'),'prst')||(first(props,'custGeom')?'custom':inherited?attr(first(inherited,'prstGeom'),'prst')||'rect':'rect');
    const visible=fill.svg!=='none'||!!line;
    if(ph&&!text&&!visible)continue;  // empty placeholders do not show in PowerPoint either
    const plain=['rect','roundRect','ellipse','flowChartProcess','flowChartAlternateProcess','flowChartConnector'].includes(preset)&&!fill.defs;
    const fontRef=direct(direct(node,'style'),'fontRef'),fontColor=fontRef?color(fontRef,part.palette):undefined;
    const geometry=visible?pptxGeometry(preset,props,bounds.width,bounds.height,inherited):undefined;
    if(visible&&!geometry)ctx.issues.push({slideId:ctx.slideId,objectId:id,code:'shape-approximated',detail:`${name}: shape "${preset}" is shown as a rectangle.`});
    if(text&&(plain||!visible)){
      // Text boxes (and simple filled boxes with text) are one editable object; nothing clips their text.
      const {padding,anchor,nowrap}=bodyProps(node,part,ctx),radius=/ellipse|Connector/.test(preset)?'border-radius:50%;':/roundRect|AlternateProcess/.test(preset)?`border-radius:${decimal(Math.min(bounds.width,bounds.height)*number(attr(first(props,'gd'),'fmla').replace('val ',''),16667)/100000)}px;`:'';
      const look=visible?`background:${fill.css};${line?`border:${decimal(line.width)}px ${line.dash?'dashed':'solid'} ${line.color};`:''}${radius}`:'';
      out.push(`<div data-manual="text" ${tag} style="${escapeHtml(boxStyle(bounds,anchor==='start'?'min-height':'height')+look+`padding:${padding};align-content:${anchor};${nowrap?'white-space:nowrap;':''}overflow-wrap:break-word;`)}">${textHtml(node,part,ctx,fontColor)}</div>`);
      continue;
    }
    if(visible){
      const svg=shapeSvg(geometry||pptxGeometry('rect',props,bounds.width,bounds.height)!,fill,line,bounds,node.localName==='cxnSp'||preset==='line');
      out.push(`<div data-manual="shape" data-shape="${geometry?.native||'pptx'}" ${tag} style="${escapeHtml(boxStyle(bounds))}">${svg}</div>`);
    }
    if(text){const {padding,anchor,nowrap}=bodyProps(node,part,ctx);out.push(`<div data-manual="text" data-pptx-id="${id}-text" style="${escapeHtml(boxStyle(bounds)+`padding:${padding};align-content:${anchor};${nowrap?'white-space:nowrap;':''}overflow-wrap:break-word;`)}">${textHtml(node,part,ctx,fontColor)}</div>`);}
  }
  return out;
}
function shapeSvg(geometry:{paths:{d:string;fill:boolean}[];width:number;height:number},fill:Fill,line:Line|undefined,box:Box,open:boolean){
  const stroke=line?`stroke:${line.color};stroke-width:${decimal(line.width)}px;${line.dash?`stroke-dasharray:${line.dash};`:''}`:'stroke:none;';
  const parts=geometry.paths.map(p=>`<path data-shape-part d="${p.d}" style="${escapeHtml(`fill:${p.fill&&!open?fill.svg:'none'};${stroke}vector-effect:non-scaling-stroke`)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${decimal(Math.max(1,geometry.width))} ${decimal(Math.max(1,geometry.height))}" preserveAspectRatio="none" width="100%" height="100%" style="display:block;width:100%;height:100%;overflow:visible">${fill.defs?`<defs>${fill.defs}</defs>`:''}${parts}</svg>`;
}
function unsupported(node:Element,id:string,name:string,style:string){
  return `<div data-pptx-id="${id}" data-pptx-unsupported="${escapeHtml(node.localName)}" style="${escapeHtml(style+'border:1px dashed #64748b;overflow:hidden;padding:8px;')}">${escapeHtml(name)}</div>`;
}
// Background of a slide, layout or master (bgPr or a theme reference), as a CSS background value.
function background(part:Part,ctx:Context){
  const bg=first(first(part.doc,'cSld'),'bg');if(!bg)return;
  const props=direct(bg,'bgPr');
  if(props)return fillOf(props,ctx,part,undefined,'bg')?.css;
  const ref=direct(bg,'bgRef');if(!ref)return;
  const idx=number(attr(ref,'idx')),phClr=color(ref,part.palette);
  const style=idx>1000?themeStyle(part,'bgFillStyleLst',idx-1000):idx>0?themeStyle(part,'fillStyleLst',idx):undefined;
  if(style){const wrapper=style.ownerDocument!.createElement('x');wrapper.appendChild(style.cloneNode(true));const f=fillOf(wrapper,ctx,part,phClr,'bg');if(f)return f.css;}
  return phClr;
}
const cssEscape=(value:string)=>value.replace(/[<>]/g,'');

/** Imports slides, layouts and masters with their backgrounds, text, pictures and shapes; the original file is never changed. */
export async function importPptx(bytes:Uint8Array,title='PowerPoint presentation'):Promise<PptxImportResult>{
  const pkg=await readPresentationPackage(bytes),presentation=pkg.xml(pkg.main);
  const size=first(presentation,'sldSz'),width=number(attr(size,'cx')),height=number(attr(size,'cy'));
  if(width<=0||height<=0)throw Error('Invalid PowerPoint page dimensions.');
  const scale=Math.min(1600/width,900/height),root:Space={m:{a:scale,b:0,c:0,d:scale,e:(1600-width*scale)/2,f:(900-height*scale)/2},sx:scale,sy:scale,rotation:0};
  const deck=newDeck(title.trim().slice(0,500)||'PowerPoint presentation');deck.slides=[];deck.masters=[];deck.layouts=[];
  const issues:PptxCompatibilityIssue[]=[];
  const ctx:Context={pkg,deck,issues,images:new Map(),scale,defaults:first(presentation,'defaultTextStyle'),counter:{n:100000}};
  const slideList=first(presentation,'sldIdLst'),slideReferences=slideList?children(slideList,'sldId'):[];
  if(!slideReferences.length||slideReferences.length>300)throw Error('A presentation needs 1–300 slides.');
  if(Math.abs(width/height-16/9)>.001)issues.push({code:'page-letterboxed',detail:'The original page proportions are preserved inside the 1600 × 900 editor canvas.'});
  const masters=new Map<string,Master>(),layouts=new Map<string,Layout>(),slideIds=new Set<string>();
  const partOf=(name:string,layoutPart?:string,masterPart?:string):Part=>{
    const doc=pkg.xml(name),master=masterPart?pkg.xml(masterPart):undefined,th=masterPart?theme(pkg,masterPart):undefined;
    const fonts={major:attr(first(first(th,'majorFont'),'latin'),'typeface')||'Arial',minor:attr(first(first(th,'minorFont'),'latin'),'typeface')||'Arial'};
    return {name,doc,rels:pkg.relationships(name),layout:layoutPart?pkg.xml(layoutPart):undefined,master,palette:themePalette(th,master),fonts,theme:th};
  };
  const masterFor=(masterPart:string)=>{
    let master=masters.get(masterPart);if(master)return master;
    const part=partOf(masterPart,undefined,masterPart),tree=first(part.doc,'spTree');
    ctx.slideId='m'+(masters.size+1);
    const bg=background(part,ctx),css=BASE_CSS+(bg?`\n.slide{background:${cssEscape(bg)}}`:'');
    master={id:'m-pptx-'+(masters.size+1),name:(attr(first(part.doc,'cSld'),'name')||'PowerPoint master '+(masters.size+1)).slice(0,200),html:tree?shapes(tree,part,ctx,root,false).join(''):'',css};
    masters.set(masterPart,master);deck.masters.push(master);return master;
  };
  const layoutFor=(layoutPart:string,masterPart:string)=>{
    let layout=layouts.get(layoutPart);if(layout)return layout;
    const master=masterFor(masterPart),part=partOf(layoutPart,layoutPart,masterPart),tree=first(part.doc,'spTree');
    ctx.slideId='l'+(layouts.size+1);
    const bg=background(part,ctx),hide=part.doc.documentElement.getAttribute('showMasterSp')==='0';
    const css=[bg?`.slide{background:${cssEscape(bg)}}`:'',hide?'.esf-master{display:none}':''].filter(Boolean).join('\n');
    layout={id:'l-pptx-'+(layouts.size+1),name:(attr(first(part.doc,'cSld'),'name')||'Layout '+(layouts.size+1)).slice(0,200),html:`<section class="slide">${tree?shapes(tree,part,ctx,root,false).join(''):''}</section>`,...css?{css}:{},masterId:master.id};
    layouts.set(layoutPart,layout);deck.layouts.push(layout);return layout;
  };
  for(const [index,reference] of slideReferences.entries()){
    const numericId=attr(reference,'id');
    if(!/^\d+$/.test(numericId)||slideIds.has(numericId))throw Error('Invalid or duplicate PowerPoint slide ID.');
    slideIds.add(numericId);
    const relation=pkg.relationships(pkg.main).find(item=>item.id===relId(reference));
    if(!relation||relation.external||!isOfficeRel(relation.type,'slide'))throw Error('Missing PowerPoint slide relationship.');
    const name=relation.target,layoutPart=pkg.relationships(name).find(r=>isOfficeRel(r.type,'slideLayout')&&!r.external)?.target;
    const masterPart=layoutPart?pkg.relationships(layoutPart).find(r=>isOfficeRel(r.type,'slideMaster')&&!r.external)?.target:undefined;
    let layout:Layout;
    if(layoutPart&&masterPart)layout=layoutFor(layoutPart,masterPart);
    else{
      if(!deck.masters.length){const m={id:'m-pptx-0',name:'PowerPoint master',html:'',css:BASE_CSS};deck.masters.push(m);}
      layout=deck.layouts.find(l=>l.id==='l-pptx-0')||(deck.layouts.push({id:'l-pptx-0',name:'Blank',html:'<section class="slide"></section>',masterId:deck.masters[0].id}),deck.layouts.at(-1)!);
    }
    const part=partOf(name,layoutPart,masterPart),tree=first(part.doc,'spTree');
    if(!tree)throw Error('PowerPoint slide has no shape tree.');
    const slideId='s-pptx-'+numericId;ctx.slideId=slideId;
    const bg=background(part,ctx),hide=part.doc.documentElement.getAttribute('showMasterSp')==='0';
    const html=`<section class="slide" data-pptx-slide-id="${numericId}" data-layout-id="${layout.id}" style="padding:0">${shapes(tree,part,ctx,root,true).join('')}</section>`;
    const css=[bg?`.slide{background:${cssEscape(bg)}}`:'',hide?'.esf-master,.slide>[data-from-layout]{display:none}':''].filter(Boolean).join('\n');
    const notesPart=pkg.relationships(name).find(r=>isOfficeRel(r.type,'notesSlide')&&!r.external)?.target;
    const notes=notesPart?descendants(pkg.xml(notesPart),'sp').filter(s=>attr(first(s,'ph'),'type')==='body').flatMap(s=>children(direct(s,'txBody')||s,'p').map(p=>descendants(p,'t').map(t=>t.textContent||'').join(''))).join('\n'):'';
    if(first(part.doc,'timing')||first(part.doc,'transition'))issues.push({slideId,code:'powerpoint-motion',detail:'PowerPoint animations and transitions are not imported.'});
    deck.slides.push({id:slideId,title:attr(first(part.doc,'cSld'),'name')||`Slide ${index+1}`,layoutId:layout.id,html,css,script:'',staticHtml:'',notes});
  }
  // One master: it is the active base and layouts follow it without a copy binding.
  deck.activeMaster=deck.masters[0].id;
  if(deck.masters.length===1)for(const l of deck.layouts)delete l.masterId;
  deck.importReport={format:'pptx',version:1,sourceName:title.slice(0,500),issues:issues.slice(0,5000).map(issue=>({...issue,detail:issue.detail.slice(0,1000)})),omitted:Math.max(0,issues.length-5000)};
  validateDeck(deck);
  return {deck,issues};
}
