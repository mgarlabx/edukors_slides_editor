// Editable PowerPoint export, browser side. Runs inside the hidden window that shows one slide (its static state) and
// describes what PowerPoint can hold as native objects: text blocks (with runs, fonts, colors, alignment, links), images
// (with crop) and Slides shapes, plus plain boxes (solid fill, border). Everything else (gradients, background images,
// free SVG, the question widget) stays in the slide's picture background. Both functions are sent as source text
// (Function.toString), so they must not use anything outside themselves.

export interface PptxRun {text:string;font:string;size:number;spacing?:number;color?:{hex:string;alpha:number};bold?:boolean;italic?:boolean;underline?:boolean;strike?:boolean;script?:'sub'|'super';href?:string;br?:boolean}
export interface PptxParagraph {align:'l'|'ctr'|'r'|'just';lineSpacing?:number;runs:PptxRun[]}
export interface PptxLook {fill?:{hex:string;alpha:number};line?:{hex:string;alpha:number;width:number;dash?:'dash'|'sysDot'};radius?:number;shadow?:boolean;opacity?:number}
export type PptxItem=
  ({type:'text';paragraphs:PptxParagraph[];anchor:'t'|'ctr'|'b';insets:[number,number,number,number];singleLine:boolean}&PptxBox&PptxLook)|
  ({type:'box'}&PptxBox&PptxLook)|
  ({type:'image';src:string;crop?:[number,number,number,number];descr?:string}&PptxBox&PptxLook)|
  ({type:'shape';geometry:string}&PptxBox&PptxLook);
export interface PptxBox {x:number;y:number;w:number;h:number}
export interface PptxSlideObjects {width:number;height:number;items:PptxItem[]}

export function extractSlideObjects():PptxSlideObjects{
  const root=(document.querySelector('.slide')||document.body) as HTMLElement,rootRect=root.getBoundingClientRect();
  const items:PptxItem[]=[];
  const cs=(el:Element)=>getComputedStyle(el);
  const color=(value:string)=>{
    const m=/rgba?\(([^)]+)\)/.exec(value||'');if(!m)return undefined;
    const p=m[1].split(/[\s,/]+/).filter(Boolean).map(v=>v.endsWith('%')?parseFloat(v)/100:Number(v));
    const alpha=p.length>3?p[3]:1;if(!(alpha>0))return undefined;
    return{hex:p.slice(0,3).map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join('').toUpperCase(),alpha};
  };
  const box=(el:Element)=>{const r=el.getBoundingClientRect();return{x:r.left-rootRect.left,y:r.top-rootRect.top,w:r.width,h:r.height};};
  const scale=(el:Element)=>{const h=el as HTMLElement;return h.offsetWidth?el.getBoundingClientRect().width/h.offsetWidth:1;};
  const shown=(el:Element)=>{const s=cs(el);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;const r=el.getBoundingClientRect();return r.width>0.5&&r.height>0.5;};
  const inline=new Set(['SPAN','B','STRONG','I','EM','U','S','STRIKE','DEL','INS','SUB','SUP','A','FONT','SMALL','MARK','CODE','BR','Q','ABBR','CITE','BIG','TT','KBD','VAR','TIME','LABEL']);
  const inlineEl=(el:Element)=>inline.has(el.tagName)&&!/^(block|flex|grid|table|list-item)$/.test(cs(el).display)&&!/^(absolute|fixed)$/.test(cs(el).position);
  // A text block: text, and only inline elements (no images, no blocks) inside.
  const textBlock=(el:Element)=>!!el.textContent?.trim()&&[...el.querySelectorAll('*')].every(inlineEl);
  // Fill, border, radius and shadow of a box; undefined when it paints nothing PowerPoint can redo.
  const look=(el:Element):PptxLook=>{
    const s=cs(el),out:PptxLook={};
    if(s.backgroundImage&&s.backgroundImage!=='none')return out;
    const fill=color(s.backgroundColor);if(fill)out.fill=fill;
    const width=parseFloat(s.borderTopWidth)||0,line=s.borderTopStyle!=='none'&&width>0?color(s.borderTopColor):undefined;
    if(line)out.line={...line,width:width*scale(el),...s.borderTopStyle==='dashed'?{dash:'dash' as const}:s.borderTopStyle==='dotted'?{dash:'sysDot' as const}:{}};
    const radius=parseFloat(s.borderTopLeftRadius)||0;if(radius)out.radius=radius*scale(el);
    if(s.boxShadow&&s.boxShadow!=='none')out.shadow=true;
    if(Number(s.opacity)<1)out.opacity=Number(s.opacity);
    return out;
  };
  const paints=(l:PptxLook)=>!!(l.fill||l.line);
  const fontOf=(s:CSSStyleDeclaration)=>(s.fontFamily.split(',')[0]||'Arial').trim().replace(/^["']|["']$/g,'');
  const transform=(text:string,s:CSSStyleDeclaration)=>s.textTransform==='uppercase'?text.toUpperCase():s.textTransform==='lowercase'?text.toLowerCase():text;
  function paragraphsOf(el:Element):PptxParagraph[]{
    const s=cs(el),align=({center:'ctr',right:'r',end:'r',justify:'just'} as Record<string,PptxParagraph['align']>)[s.textAlign]||'l';
    const runs:PptxRun[]=[],k=scale(el);
    const walk=(node:Node,within:Element[])=>{
      if(node.nodeType===3){
        const parent=node.parentElement!,ps=cs(parent),pre=/^pre/.test(ps.whiteSpace);
        let text=node.textContent||'';if(!pre)text=text.replace(/\s+/g,' ');
        if(!text)return;
        const decoration=[parent,...within].map(e=>cs(e).textDecorationLine).join(' ');
        const script=[parent,...within].map(e=>cs(e).verticalAlign).find(v=>v==='sub'||v==='super') as 'sub'|'super'|undefined;
        const href=[parent,...within].find(e=>e.tagName==='A')?.getAttribute('href')||undefined;
        const base={font:fontOf(ps),size:parseFloat(ps.fontSize)*k,spacing:(parseFloat(ps.letterSpacing)||0)*k,color:color(ps.color),bold:parseInt(ps.fontWeight)>=600,italic:ps.fontStyle==='italic',underline:/underline/.test(decoration),strike:/line-through/.test(decoration),script,href:href&&/^(https?:|mailto:)/i.test(href)?href:undefined};
        transform(text,ps).split('\n').forEach((part,i)=>{if(i)runs.push({...base,text:'',br:true});if(part)runs.push({...base,text:part});});
        return;
      }
      if(node.nodeType!==1)return;
      const e=node as Element;if(!shown(e)&&e.tagName!=='BR')return;
      if(e.tagName==='BR'){const ps=cs(e.parentElement!);runs.push({text:'',br:true,font:fontOf(ps),size:parseFloat(ps.fontSize)*k});return;}
      for(const child of e.childNodes)walk(child,e===el?within:[e,...within]);
    };
    for(const child of el.childNodes)walk(child,[]);
    // Leading and trailing spaces of the block (and around line breaks) do not show.
    const trimEdges=(list:PptxRun[])=>{const t=list.filter(r=>!r.br);if(t[0])t[0].text=t[0].text.replace(/^\s+/,'');const last=t.at(-1);if(last)last.text=last.text.replace(/\s+$/,'');return list.filter(r=>r.br||r.text);};
    const first=el.querySelector('*')&&[...el.childNodes].find(n=>n.textContent?.trim())?.parentElement||el;
    const fs=cs(first),lh=parseFloat(fs.lineHeight),size=parseFloat(fs.fontSize);
    return[{align,lineSpacing:lh&&size?Math.round(lh/size*100):undefined,runs:trimEdges(runs)}];
  }
  const done=(el:Element,kind:string)=>el.setAttribute('data-pptx',kind);
  function visit(el:Element){
    if(!shown(el))return;
    if(el!==root&&(el.closest('[data-poll],.esf-poll,.poll')))return;
    const tag=el.tagName.toUpperCase();
    // Slides shapes: preset geometry with the SVG's fill and line.
    const manual=(el as HTMLElement).dataset?.manual;
    if(manual==='shape'){
      const part=el.querySelector('[data-shape-part]'),ps=part?cs(part):null,width=parseFloat(ps?.strokeWidth||'0')||0;
      const geometry=({rect:'rect',rounded:'roundRect',ellipse:'ellipse',triangle:'triangle',rightTriangle:'rtTriangle',diamond:'diamond',pentagon:'pentagon',hexagon:'hexagon',arrow:'rightArrow',star:'star5'} as Record<string,string>)[(el as HTMLElement).dataset.shape||'rect']||'rect';
      const fill=ps&&ps.fill!=='none'?color(ps.fill):undefined,stroke=ps&&width&&ps.stroke!=='none'?color(ps.stroke):undefined;
      items.push({type:'shape',geometry,...box(el),...fill?{fill}:{},...stroke?{line:{...stroke,width:width*scale(el)}}:{},...(/drop-shadow/.test(cs(el).filter)?{shadow:true}:{}),...Number(cs(el).opacity)<1?{opacity:Number(cs(el).opacity)}:{}});
      done(el,'shape');return;
    }
    if(tag==='IMG'){
      const img=el as HTMLImageElement;if(!img.complete||!img.naturalWidth)return;
      const m=/inset\(\s*([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s*\)/.exec(cs(el).clipPath||'');
      let src=img.currentSrc||img.src;
      if(!/^data:image\/(png|jpeg|gif);/i.test(src)){
        const canvas=document.createElement('canvas'),w=Math.min(img.naturalWidth,4096),h=Math.round(img.naturalHeight*w/img.naturalWidth);
        canvas.width=w;canvas.height=h;const g=canvas.getContext('2d');if(!g)return;g.drawImage(img,0,0,w,h);
        try{src=canvas.toDataURL('image/png');}catch{return;}
      }
      const shadow=/drop-shadow/.test(cs(el).filter)||/drop-shadow/.test(el.parentElement?cs(el.parentElement).filter:'');
      items.push({type:'image',src,...box(el),...m?{crop:[+m[4],+m[1],+m[2],+m[3]] as [number,number,number,number]}:{},descr:img.alt||undefined,...look(el),...shadow?{shadow:true}:{}});
      done(el,'image');return;
    }
    if(/^(SVG|CANVAS|VIDEO|IFRAME|OBJECT|EMBED|svg)$/.test(el.tagName))return;
    if(el!==root&&textBlock(el)){
      const s=cs(el),k=scale(el),l=look(el);
      const display=s.display,anchor=(/flex|grid/.test(display)?({center:'ctr','flex-end':'b',end:'b'} as Record<string,'ctr'|'b'>)[s.alignItems]:({center:'ctr',end:'b'} as Record<string,'ctr'|'b'>)[s.alignContent])||'t';
      const paragraphs=paragraphsOf(el);
      const lh=parseFloat(s.lineHeight)||parseFloat(s.fontSize)*1.2;
      const singleLine=!paragraphs.some(p=>p.runs.some(r=>r.br))&&el.getBoundingClientRect().height<lh*k*1.6;
      items.push({type:'text',...box(el),paragraphs,anchor,insets:[parseFloat(s.paddingLeft)*k,parseFloat(s.paddingTop)*k,parseFloat(s.paddingRight)*k,parseFloat(s.paddingBottom)*k],singleLine,...l});
      done(el,'text');return;
    }
    if(el!==root){
      const l=look(el),b=box(el);
      if(paints(l)&&b.w*b.h<rootRect.width*rootRect.height*0.95){items.push({type:'box',...b,...l});done(el,'box');}
    }
    for(const child of el.children)visit(child);
  }
  visit(root);
  return{width:rootRect.width,height:rootRect.height,items};
}

// Hides what became native objects, so the picture background keeps only the rest (gradients, decorations, free SVG).
export function hideExtractedObjects(){
  const set=(el:HTMLElement,props:Record<string,string>)=>{for(const [k,v] of Object.entries(props))el.style.setProperty(k,v,'important');};
  const flat={'background-color':'transparent','border-color':'transparent','box-shadow':'none','outline-color':'transparent'};
  for(const el of document.querySelectorAll<HTMLElement>('[data-pptx]')){
    const kind=el.dataset.pptx;
    if(kind==='image'||kind==='shape'){set(el,{visibility:'hidden'});if(el.parentElement?.matches('[data-image-shadow]'))set(el.parentElement,{filter:'none'});continue;}
    set(el,flat);
    if(kind==='text')for(const t of [el,...el.querySelectorAll<HTMLElement>('*')])set(t,{color:'transparent','-webkit-text-fill-color':'transparent','text-shadow':'none','text-decoration-color':'transparent',...t===el?{}:flat});
  }
}
