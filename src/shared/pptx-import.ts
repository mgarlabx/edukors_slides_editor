import {Deck,ImportIssue,newDeck,newSlide,escapeHtml,validateDeck} from './model';
import {PresentationPackage,OfficeRelationship,readPresentationPackage,children,descendants,OFFICE_REL,STRICT_OFFICE_REL} from './openxml';

export type PptxCompatibilityIssue=ImportIssue;
export interface PptxImportResult {deck:Deck;issues:PptxCompatibilityIssue[]}
interface Viewport {scale:number;left:number;top:number}
interface Box {x:number;y:number;width:number;height:number;rotation:number;flipH:boolean;flipV:boolean}
const first=(node:Element|Document,name:string)=>descendants(node,name)[0];
const direct=(node:Node|undefined,name:string)=>node?children(node,name)[0]:undefined;
const attr=(node:Element|undefined,name:string)=>node?.getAttribute(name)||'';
const number=(value:string,fallback=0)=>value!==''&&Number.isFinite(Number(value))?Number(value):fallback;
const isOfficeRel=(type:string,kind:string)=>type===OFFICE_REL+'/'+kind||type===STRICT_OFFICE_REL+'/'+kind;
const relId=(node:Element,name='id')=>node.getAttributeNS(OFFICE_REL,name)||node.getAttributeNS(STRICT_OFFICE_REL,name)||node.getAttribute('r:'+name)||'';
const base64=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);};
const mimeTypes=new Set(['image/png','image/jpeg','image/gif','image/webp','image/avif','image/svg+xml']);
const decimal=(value:number)=>String(Math.round(value*1000)/1000);

function themeColors(pkg:PresentationPackage){
  const colors:Record<string,string>={dk1:'000000',lt1:'FFFFFF',dk2:'1F497D',lt2:'EEECE1',accent1:'4F81BD',accent2:'C0504D',accent3:'9BBB59',accent4:'8064A2',accent5:'4BACC6',accent6:'F79646',hlink:'0000FF',folHlink:'800080'};
  const theme=[...pkg.contentTypes].find(([,type])=>type==='application/vnd.openxmlformats-officedocument.theme+xml');
  if(theme){
    const scheme=first(pkg.xml(theme[0]),'clrScheme');
    if(scheme)for(const entry of children(scheme)){
      const color=children(entry)[0],value=attr(color,color?.localName==='sysClr'?'lastClr':'val');
      if(/^[a-f\d]{6}$/i.test(value))colors[entry.localName]=value;
    }
  }
  return colors;
}
function color(node:Element|undefined,palette:Record<string,string>,fallback='transparent'){
  if(!node)return fallback;
  const choice=children(node).find(child=>['srgbClr','schemeClr','sysClr'].includes(child.localName));
  if(!choice)return fallback;
  const key=attr(choice,'val'),aliases:Record<string,string>={tx1:'dk1',tx2:'dk2',bg1:'lt1',bg2:'lt2'};
  const value=choice.localName==='schemeClr'?palette[aliases[key]||key]:attr(choice,choice.localName==='sysClr'?'lastClr':'val');
  return /^[a-f\d]{6}$/i.test(value)?'#'+value:fallback;
}
function box(node:Element,viewport:Viewport):Box|undefined{
  const properties=direct(node,'spPr')||direct(node,'grpSpPr')||node;
  const transform=direct(properties,'xfrm')||direct(node,'xfrm');
  if(!transform)return;
  const offset=direct(transform,'off'),extent=direct(transform,'ext');
  const width=number(attr(extent,'cx'))*viewport.scale,height=number(attr(extent,'cy'))*viewport.scale;
  if(!offset||!extent||width<=0||height<=0)return;
  return {x:number(attr(offset,'x'))*viewport.scale+viewport.left,y:number(attr(offset,'y'))*viewport.scale+viewport.top,width,height,rotation:number(attr(transform,'rot'))/60000,flipH:attr(transform,'flipH')==='1',flipV:attr(transform,'flipV')==='1'};
}
function boxStyle(value:Box){
  const transform=[value.rotation?`rotate(${decimal(value.rotation)}deg)`:'',value.flipH?'scaleX(-1)':'',value.flipV?'scaleY(-1)':''].filter(Boolean).join(' ');
  return `position:absolute;left:${decimal(value.x)}px;top:${decimal(value.y)}px;width:${decimal(value.width)}px;height:${decimal(value.height)}px;${transform?'transform:'+transform+';':''}`;
}
function matchingPlaceholder(node:Element,part:Document|undefined){
  if(!part)return;
  const placeholder=first(node,'ph');if(!placeholder)return;
  const index=attr(placeholder,'idx'),type=attr(placeholder,'type')||'body';
  return descendants(part,'sp').find(shape=>{
    const candidate=first(shape,'ph');
    return candidate&&(index?attr(candidate,'idx')===index:(attr(candidate,'type')||'body')===type);
  });
}
function relatedPart(pkg:PresentationPackage,owner:string,kind:string){
  return pkg.relationships(owner).find(relation=>isOfficeRel(relation.type,kind)&&!relation.external)?.target;
}
function safeLink(relation:OfficeRelationship|undefined){
  if(!relation?.external)return '';
  try{const url=new URL(relation.target);return ['http:','https:','mailto:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
function paragraphs(body:Element,relationships:readonly OfficeRelationship[],palette:Record<string,string>,viewport:Viewport){
  const fontScale=12700*viewport.scale;
  const listStyle=direct(body,'lstStyle');
  return children(body,'p').map(paragraph=>{
    const properties=direct(paragraph,'pPr');
    const level=Math.min(8,Math.max(0,number(attr(properties,'lvl'))));
    const defaults=direct(properties,'defRPr')||direct(direct(listStyle,'lvl'+(level+1)+'pPr'),'defRPr')||direct(paragraph,'endParaRPr');
    const alignment=({l:'left',ctr:'center',r:'right',just:'justify',dist:'justify'} as Record<string,string>)[attr(properties,'algn')]||'left';
    const pieces=children(paragraph).map(run=>{
      if(run.localName==='br')return '<br>';
      if(!['r','fld'].includes(run.localName))return '';
      const properties=direct(run,'rPr')||defaults;
      const rawFont=attr(direct(properties,'latin'),'typeface')||attr(direct(defaults,'latin'),'typeface');
      const font=/^[\p{L}\p{N} _.,+-]{1,200}$/u.test(rawFont)&&!rawFont.startsWith('+')?rawFont:'Arial';
      const size=number(attr(properties,'sz'),number(attr(defaults,'sz'),1800))/100*fontScale;
      const styles=[`font-size:${decimal(Math.max(1,Math.min(400,size)))}px`,`font-family:'${font}'`,`color:${color(direct(properties,'solidFill'),palette,'#000000')}`];
      if(attr(properties,'b')==='1')styles.push('font-weight:700');
      if(attr(properties,'i')==='1')styles.push('font-style:italic');
      const decorations=[];
      if(attr(properties,'u')&&attr(properties,'u')!=='none')decorations.push('underline');
      if(attr(properties,'strike')&&attr(properties,'strike')!=='noStrike')decorations.push('line-through');
      if(decorations.length)styles.push('text-decoration:'+decorations.join(' '));
      let content=escapeHtml(children(run,'t').map(text=>text.textContent||'').join(''));
      const baseline=number(attr(properties,'baseline'));
      if(baseline)content=`<${baseline<0?'sub':'sup'}>${content}</${baseline<0?'sub':'sup'}>`;
      content=`<span style="${escapeHtml(styles.join(';'))}">${content}</span>`;
      const hyperlink=direct(properties,'hlinkClick'),href=hyperlink?safeLink(relationships.find(relation=>relation.id===relId(hyperlink))):'';
      return href?`<a href="${escapeHtml(href)}">${content}</a>`:content;
    }).join('')||'<br>';
    const bullet=direct(properties,'buChar'),numbered=direct(properties,'buAutoNum');
    const marker=bullet?`display:list-item;list-style-type:disc;list-style-position:inside;margin-left:${level*24}px;`:numbered?`display:list-item;list-style-type:decimal;list-style-position:inside;margin-left:${level*24}px;`:'';
    return `<p style="margin:0;text-align:${alignment};${marker}">${pieces}</p>`;
  }).join('');
}

/** Imports editable text and pictures; unsupported objects remain backed by the complete original package. */
export async function importPptx(bytes:Uint8Array,title='PowerPoint presentation'):Promise<PptxImportResult>{
  const pkg=await readPresentationPackage(bytes),presentation=pkg.xml(pkg.main);
  const size=first(presentation,'sldSz'),width=number(attr(size,'cx')),height=number(attr(size,'cy'));
  if(width<=0||height<=0)throw Error('Invalid PowerPoint page dimensions.');
  const scale=Math.min(1600/width,900/height),viewport={scale,left:(1600-width*scale)/2,top:(900-height*scale)/2};
  const deck=newDeck(title.trim().slice(0,500)||'PowerPoint presentation');deck.slides=[];
  deck.masters[0].css+='\n.slide{padding:0;background:#fff}';
  const palette=themeColors(pkg),issues:PptxCompatibilityIssue[]=[];
  const images=new Map<string,string>(),slideIds=new Set<string>();
  const slideList=first(presentation,'sldIdLst');
  const slideReferences=slideList?children(slideList,'sldId'):[];
  if(!slideReferences.length||slideReferences.length>300)throw Error('A presentation needs 1–300 slides.');
  issues.push({code:'powerpoint-master-layout-preview',detail:'Original master, layout and theme parts are preserved. Native master/layout editing and complete inherited rendering are still being implemented.'});
  if(Math.abs(width/height-16/9)>.001)issues.push({code:'page-letterboxed',detail:'The original page proportions are preserved inside the 1600 × 900 editor canvas.'});
  for(const [index,reference] of slideReferences.entries()){
    const numericId=attr(reference,'id');
    if(!/^\d+$/.test(numericId)||slideIds.has(numericId))throw Error('Invalid or duplicate PowerPoint slide ID.');
    slideIds.add(numericId);
    const relation=pkg.relationships(pkg.main).find(item=>item.id===relId(reference));
    if(!relation||relation.external||!isOfficeRel(relation.type,'slide'))throw Error('Missing PowerPoint slide relationship.');
    const part=relation.target,document=pkg.xml(part),relationships=pkg.relationships(part);
    const layoutPart=relatedPart(pkg,part,'slideLayout'),layout=layoutPart?pkg.xml(layoutPart):undefined;
    const masterPart=layoutPart?relatedPart(pkg,layoutPart,'slideMaster'):undefined,master=masterPart?pkg.xml(masterPart):undefined;
    const slide=newSlide(deck.layouts[0]);slide.id='s-pptx-'+numericId;slide.title=attr(first(document,'cSld'),'name')||`Slide ${index+1}`;
    const shapeIds=new Set<string>();
    const tree=first(document,'spTree');if(!tree)throw Error('PowerPoint slide has no shape tree.');
    const rendered:string[]=[];
    for(const node of children(tree)){
      if(['nvGrpSpPr','grpSpPr','extLst'].includes(node.localName))continue;
      const identity=first(node,'cNvPr'),id=attr(identity,'id'),name=(attr(identity,'name')||node.localName).slice(0,200);
      if(!/^\d+$/.test(id)||shapeIds.has(id))throw Error('Invalid or duplicate PowerPoint object ID.');
      shapeIds.add(id);
      const placeholder=matchingPlaceholder(node,layout)||matchingPlaceholder(node,master);
      const bounds=box(node,viewport)||(placeholder?box(placeholder,viewport):undefined);
      const location=bounds||{x:viewport.left,y:viewport.top,width:Math.max(80,width*scale),height:90,rotation:0,flipH:false,flipV:false};
      if(!bounds)issues.push({slideId:slide.id,objectId:id,code:'geometry-inherited-or-missing',detail:`${name}: geometry could not be fully resolved.`});
      const properties=direct(node,'spPr'),fill=color(direct(properties,'solidFill'),palette),line=direct(properties,'ln');
      const border=line&&!direct(line,'noFill')?`${decimal(Math.max(.1,number(attr(line,'w'),9525)*scale))}px solid ${color(direct(line,'solidFill'),palette,'#000000')}`:'none';
      const style=boxStyle(location)+`background:${fill};border:${border};box-sizing:border-box;`;
      const body=direct(node,'txBody');
      if(node.localName==='sp'&&body&&(descendants(body,'t').some(text=>!!text.textContent)||attr(first(node,'cNvSpPr'),'txBox')==='1')){
        const text=paragraphs(body,relationships,palette,viewport),bodyProperties=direct(body,'bodyPr');
        const padding=[['tIns',45720],['rIns',91440],['bIns',45720],['lIns',91440]].map(([key,fallback])=>decimal(number(attr(bodyProperties,String(key)),Number(fallback))*scale)+'px').join(' ');
        const anchor=({t:'start',ctr:'center',b:'end'} as Record<string,string>)[attr(bodyProperties,'anchor')]||'start';
        rendered.push(`<div data-manual="text" data-pptx-id="${id}" style="${escapeHtml(style+`padding:${padding};align-content:${anchor};overflow:hidden;`)}">${text}</div>`);
      }else if(node.localName==='pic'){
        const blip=first(node,'blip'),image=relationships.find(item=>item.id===relId(blip||node,'embed'));
        const mime=image&&!image.external?pkg.contentTypes.get(image.target):undefined;
        if(image&&!image.external&&isOfficeRel(image.type,'image')&&mime&&mimeTypes.has(mime)){
          const data=pkg.parts.get(image.target)!;
          const svgText=mime==='image/svg+xml'?decoderText(data):'';
          if(mime==='image/svg+xml'&&/<\s*script\b|\bon\w+\s*=|<!\s*(?:DOCTYPE|ENTITY)|(?:href\s*=\s*["']?|url\(\s*["']?)(?:https?:|file:|\/\/)/i.test(svgText)){
            issues.push({slideId:slide.id,objectId:id,code:'unsafe-svg-preview',detail:`${name}: the original SVG is preserved but not rendered.`});
          }else{
            let asset=images.get(image.target);
            if(!asset){asset='asset-pptx-'+(images.size+1);images.set(image.target,asset);deck.assets.push({id:asset,name:image.target.slice(image.target.lastIndexOf('/')+1),mime,data:base64(data)});}
            const crop=first(node,'srcRect');
            if(crop&&['l','r','t','b'].some(key=>number(attr(crop,key))))issues.push({slideId:slide.id,objectId:id,code:'picture-crop-preview',detail:`${name}: original crop is preserved in the PowerPoint source; preview fidelity requires review.`});
            rendered.push(`<img data-manual="image" data-pptx-id="${id}" alt="${escapeHtml(name)}" src="asset:${asset}" style="${escapeHtml(boxStyle(location)+'object-fit:fill;')}"/>`);
            continue;
          }
        }else issues.push({slideId:slide.id,objectId:id,code:'unsupported-image',detail:`${name}: linked or unsupported image retained in the original package.`});
        rendered.push(unsupported(node,id,name,style));
      }else if(node.localName==='sp'&&['rect','roundRect','ellipse'].includes(attr(first(node,'prstGeom'),'prst'))){
        const preset=attr(first(node,'prstGeom'),'prst');
        rendered.push(`<div data-manual="shape" data-pptx-id="${id}" style="${escapeHtml(style+(preset==='ellipse'?'border-radius:50%;':preset==='roundRect'?'border-radius:16px;':''))}"></div>`);
      }else{
        rendered.push(unsupported(node,id,name,style));
        issues.push({slideId:slide.id,objectId:id,code:'unsupported-object',detail:`${name}: ${node.localName} is preserved in the source package; direct editing is not supported yet.`});
      }
    }
    const notesPart=relatedPart(pkg,part,'notesSlide');
    if(notesPart)slide.notes=descendants(pkg.xml(notesPart),'sp').filter(shape=>attr(first(shape,'ph'),'type')==='body').flatMap(shape=>descendants(shape,'t').map(text=>text.textContent||'')).join('\n');
    if(first(document,'timing')||first(document,'transition'))issues.push({slideId:slide.id,code:'powerpoint-motion',detail:'PowerPoint animation and transition data is preserved in the source; the HTML player does not execute it.'});
    slide.html=`<section class="slide" data-pptx-slide-id="${numericId}" style="padding:0">${rendered.join('')}</section>`;
    deck.slides.push(slide);
  }
  deck.importReport={format:'pptx',version:1,sourceName:title.slice(0,500),issues:issues.slice(0,5000).map(issue=>({...issue,detail:issue.detail.slice(0,1000)})),omitted:Math.max(0,issues.length-5000)};
  validateDeck(deck);
  return {deck,issues};
}
function decoderText(bytes:Uint8Array){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return '<script>';}}
function unsupported(node:Element,id:string,name:string,style:string){
  return `<div data-pptx-id="${id}" data-pptx-unsupported="${escapeHtml(node.localName)}" style="${escapeHtml(style+'border:1px dashed #64748b;overflow:hidden;padding:8px;')}">${escapeHtml(name)}</div>`;
}
