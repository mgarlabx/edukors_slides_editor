import type {alignMovement,boxStyle,resizeImage,canvasGeometry,EditMatrix} from './geometry';
import type {EditOp,SelectionDetails,ObjectStyle} from './edit';

// Direct editing on the editor canvas, modeled on PowerPoint. Objects are text blocks, media and visible boxes
// (background, border or shadow); layout-only wrappers are skipped. A press on empty space draws a selection band
// (objects fully inside it), Shift/Cmd toggles objects, and dragging moves the whole selection. A click on an object
// inside a selected one goes one level down (a card, then its text); a click on a text that ends up selected edits it.
// Elements carry data-esf-edit (annotate in edit.ts); the frame reports operations ({type:'ops'}) and the selection
// ({type:'state'}) to the editor, which applies them to the saved HTML.
export function editRuntime(config:{select:number[];editing:boolean;range?:{start:number;end:number}|null},align:typeof alignMovement,resize:typeof resizeImage,boxStyle:typeof import('./geometry').boxStyle,geometry:ReturnType<typeof canvasGeometry>){
  const send=(type:string,extra:any={})=>parent.postMessage({app:'esf-edit',type,...extra},'*');
  const root=(document.querySelector('.slide')||document.body) as HTMLElement,html=document.documentElement;
  const css=document.createElement('style');
  // Objects stay clickable even when the slide CSS turns their pointer events off (an inline SVG only where it paints, so its empty box does not cover what is behind).
  css.textContent='html{touch-action:none}[data-esf-kind]:not(svg){pointer-events:auto!important}svg[data-esf-kind] *{pointer-events:visiblePainted!important}*{-webkit-user-select:none;user-select:none}[contenteditable],[contenteditable] *{-webkit-user-select:text;user-select:text;cursor:text}[contenteditable]{outline:none!important}[data-esf-ui]{position:fixed;z-index:2147483646;box-sizing:border-box;pointer-events:none;border-radius:2px;display:none}[data-esf-ui=resize]{pointer-events:auto;background:white;border:1.5px solid #2f6fed;touch-action:none;z-index:2147483647}[data-esf-ui=crop]{border:1.5px solid #fff;outline:1px solid #2f6fed;box-shadow:0 0 0 100vmax #10182680;border-radius:0}[data-esf-ui=cropgrip]{pointer-events:auto;background:#fff;border:2px solid #10182a;border-radius:1px;touch-action:none;z-index:2147483647}[data-esf-ui=sel]{border:1.5px solid #2f6fed}[data-esf-ui=group]{border:1px dashed #2f6fed}[data-esf-ui=guide]{background:#d946b4;border-radius:0}[data-esf-ui=hover]{border:1px solid #2f6fed88}[data-esf-ui=band]{border:1px solid #2f6fed;background:#2f6fed14}[data-esf-edge]{position:absolute;pointer-events:auto;cursor:move;touch-action:none}[data-esf-edge=n],[data-esf-edge=s]{left:0;right:0;height:8px}[data-esf-edge=n]{top:-4px}[data-esf-edge=s]{bottom:-4px}[data-esf-edge=e],[data-esf-edge=w]{top:0;bottom:0;width:8px}[data-esf-edge=e]{right:-4px}[data-esf-edge=w]{left:-4px}html[data-esf-cursor],html[data-esf-cursor] *{cursor:var(--esf-cursor)!important}::highlight(esf-sel){background-color:#b4d3fd}';
  document.head.appendChild(css);
  // Isolate handles from arbitrary slide CSS (including div/img rules and !important declarations).
  const overlay=document.createElement('esf-editor-overlay');overlay.style.cssText='all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important';html.appendChild(overlay);
  const shadow=overlay.attachShadow({mode:'open'});shadow.appendChild(css.cloneNode(true));
  const ui=(kind:string)=>{const d=document.createElement('div');d.setAttribute('data-esf-ui',kind);shadow.appendChild(d);return d;};
  const hover=ui('hover'),band=ui('band'),group=ui('group'),guides=[ui('guide'),ui('guide')],boxes:HTMLElement[]=[];
  function edges(d:HTMLElement){for(const side of ['n','s','e','w']){const edge=document.createElement('span');edge.dataset.esfEdge=side;d.appendChild(edge);}return d;}
  edges(group);
  const cursor=(value:string)=>{html.style.setProperty('--esf-cursor',value);html.toggleAttribute('data-esf-cursor',!!value);};
  const handles=['nw','ne','sw','se','n','s','e','w'].map(corner=>{const h=ui('resize');h.dataset.corner=corner;h.style.cursor=corner.length===1?(/[ns]/.test(corner)?'ns':'ew')+'-resize':corner==='nw'||corner==='se'?'nwse-resize':'nesw-resize';return h;});
  // Crop mode (format bar): the image shows whole, the kept area is a box with eight grips; dragging inside pans it.
  const cropBox=ui('crop'),cropGrips=['nw','ne','sw','se','n','s','e','w'].map(corner=>{const h=ui('cropgrip');h.dataset.corner=corner;h.style.cursor=handles.find(x=>x.dataset.corner===corner)!.style.cursor;return h;});
  type Snapshot={el:HTMLElement;style:string|null;base:number[];parent:EditMatrix;inline:boolean;bounds:DOMRect};
  type GestureBase={pointer:number;x:number;y:number;moved:boolean};
  type MoveGesture=GestureBase&{type:'move';items:Snapshot[];bounds:DOMRect;targets:DOMRect[];before:HTMLElement[];toggle?:HTMLElement;click:{chain:HTMLElement[];k:number}|null};
  type ResizeGesture=GestureBase&{type:'resize';item:Snapshot;frac:number[];corner:string;text:boolean;free:boolean;width:number;height:number;matrix:EditMatrix;anchor:{x:number;y:number};fx:number;fy:number};
  type BandGesture=GestureBase&{type:'band';keep:HTMLElement[];before:HTMLElement[];targets:{el:HTMLElement;r:DOMRect}[]};
  type CropGesture=GestureBase&{type:'crop';corner:string;base:number[];width:number;height:number;matrix:EditMatrix};
  let gesture:MoveGesture|ResizeGesture|BandGesture|CropGesture|null=null;
  let crop:{el:HTMLElement;style:string|null;inset:number[];start:number[]}|null=null;
  let selection:HTMLElement[]=[],editing:HTMLElement|null=null,original='',pending:EditOp[]=[],nudge=0;
  const nudged=new Set<HTMLElement>(),resized=new Map<HTMLElement,boolean>();
  const restore=(el:HTMLElement,style:string|null)=>{if(style===null)el.removeAttribute('style');else el.setAttribute('style',style);};
  const coord=(n:number)=>Math.round(Math.max(-16000,Math.min(16000,n))*100)/100;
  const setPosition=(el:HTMLElement,x:number,y:number)=>el.style.setProperty('translate',`${coord(x)}px ${coord(y)}px`,'important');
  const setBox=(el:HTMLElement,width:number,height:number,x:number,y:number,fit:boolean)=>{
    for(const [key,value] of Object.entries(boxStyle(coord(width),coord(height),coord(x),coord(y),fit)))el.style.setProperty(key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value,'important');
  };
  // CSS translate acts in the parent's coordinate system. Resize acts in the object's own axes.
  // Compose the linear part only: layout, transform-origin and translations are recovered from measured bounds.
  function matrix(el:Element|null):EditMatrix{
    if(!el)return{a:1,b:0,c:0,d:1};
    const s=getComputedStyle(el),zoom=parseFloat(s.zoom)||1,t=new DOMMatrixReadOnly(s.transform==='none'?undefined:s.transform);
    const angle=s.rotate==='none'?0:parseFloat(s.rotate.split(' ').at(-1)!),r=angle*(s.rotate.endsWith('rad')?1:s.rotate.endsWith('turn')?2*Math.PI:Math.PI/180);
    const scales=s.scale==='none'?[1,1]:s.scale.split(' ').map(Number),sx=scales[0],sy=scales[1]??sx;
    const own=geometry.multiply({a:Math.cos(r)*sx*zoom,b:Math.sin(r)*sx*zoom,c:-Math.sin(r)*sy*zoom,d:Math.cos(r)*sy*zoom},t);
    return geometry.multiply(matrix(el.parentElement),own);
  }
  function size(el:HTMLElement){
    const s=getComputedStyle(el),px=(key:string)=>parseFloat(s.getPropertyValue(key))||0;
    const extra=(axis:'width'|'height')=>s.boxSizing==='border-box'?0:(axis==='width'?['left','right']:['top','bottom']).reduce((n,side)=>n+px('padding-'+side)+px('border-'+side+'-width'),0);
    return{width:parseFloat(s.width)+extra('width')||el.offsetWidth||1,height:parseFloat(s.height)+extra('height')||el.offsetHeight||1};
  }
  const measure=(el:HTMLElement)=>({...size(el),matrix:matrix(el),bounds:el.getBoundingClientRect()});
  const point=(el:HTMLElement,fx:number,fy:number)=>{const m=measure(el);return geometry.anchor(m.bounds,m.width,m.height,m.matrix,fx,fy);};
  function offset(el:HTMLElement){
    const value=getComputedStyle(el).translate;if(value==='none')return[0,0];
    const z=size(el);
    if(value.split(/\s+/).every(v=>/^-?[\d.]+(?:px|%)?$/.test(v)))return geometry.translation(value,z.width,z.height);
    // Let the browser resolve calc()/mixed units instead of parsing CSS expressions ourselves.
    const style=el.getAttribute('style'),before=el.getBoundingClientRect();el.style.setProperty('translate','0px 0px','important');
    const after=el.getBoundingClientRect();restore(el,style);
    const zoom=parseFloat(getComputedStyle(el).zoom)||1,m=geometry.multiply(matrix(el.parentElement),{a:zoom,b:0,c:0,d:zoom});
    const delta=geometry.inverse(m,before.left-after.left,before.top-after.top);return delta?[delta.x,delta.y]:[0,0];
  }
  const snapshot=(el:HTMLElement):Snapshot=>{const zoom=parseFloat(getComputedStyle(el).zoom)||1;return{el,bounds:el.getBoundingClientRect(),style:el.getAttribute('style'),base:offset(el),parent:geometry.multiply(matrix(el.parentElement),{a:zoom,b:0,c:0,d:zoom}),inline:getComputedStyle(el).display==='inline'&&!/^(IMG|SVG|VIDEO|CANVAS)$/i.test(el.tagName)};};
  const index=(el:Element)=>Number(el.getAttribute('data-esf-edit'));
  const kind=(el:Element)=>el.getAttribute('data-esf-kind');
  // A layout field in a slide: its text is edited, but it is not moved, resized, restyled or deleted (the layout owns it).
  const fixed=(el:Element)=>el.hasAttribute('data-esf-fixed'),free=(list:HTMLElement[])=>list.filter(el=>!fixed(el));
  const isImage=(el:Element)=>/^(img|svg)$/i.test(el.tagName)||/url\(/i.test(getComputedStyle(el).backgroundImage);
  const imageIn=(chain:HTMLElement[])=>[...chain].reverse().find(isImage);
  // Text boxes resize freely from corners and sides (inline elements have no box to size); images only from corners.
  const textBox=(el:Element)=>(kind(el)==='text'||kind(el)==='link')&&!isImage(el)&&getComputedStyle(el).display!=='inline';
  const painted=(s:CSSStyleDeclaration)=>!/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(s.backgroundColor)||s.backgroundImage!=='none'||s.boxShadow!=='none'||(['Top','Right','Bottom','Left'] as const).some(k=>parseFloat(s[`border${k}Width`])>0&&s[`border${k}Style`]!=='none');
  function isObject(el:Element){
    if(el===root||!el.hasAttribute('data-esf-edit')||el.hasAttribute('data-esf-locked')||el.parentElement?.closest('[data-esf-kind]'))return false;
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    if(s.display==='none'||s.visibility==='hidden'||!r.width||!r.height)return false;
    if(kind(el)||painted(s))return true;
    // Empty boxes drawn by ::before/::after (pulsing dots, rings, bars) are objects too.
    return!el.children.length&&(['::before','::after'] as const).some(p=>{const ps=getComputedStyle(el,p);return!/^(none|normal)$/.test(ps.content)&&ps.display!=='none'&&painted(ps);});
  }
  // Objects containing the element, outermost first.
  const chainOf=(t:Element|null)=>{const out:HTMLElement[]=[];for(let el=t;el&&el!==root&&el!==document.body;el=el.parentElement)if(isObject(el))out.unshift(el as HTMLElement);return t&&root.contains(t)?out:[];};
  const tops=()=>[...root.querySelectorAll<HTMLElement>('[data-esf-edit]')].filter(el=>isObject(el)&&!chainOf(el.parentElement).length);
  // Nested selected objects move with their selected ancestor, never twice.
  const outer=()=>selection.filter(el=>!selection.some(o=>o!==el&&o.contains(el)));
  const indices=()=>selection.filter(el=>el.isConnected).map(index);
  function details():SelectionDetails|undefined{
    const el=selection.length===1?selection[0]:null;if(!el)return;
    // Formatting goes on spans inside the box: without a caret in it, the bar shows the look of its first characters.
    const node=getSelection()?.anchorNode,walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let first:Element|null=null;
    for(let n=walk.nextNode();n&&!first;n=walk.nextNode())if(n.textContent!.trim())first=n.parentElement;
    const text=editing===el&&node?.nodeType===3?node.parentElement:first||el;
    const s=getComputedStyle(el),font=getComputedStyle(text&&el.contains(text)?text:el),style:SelectionDetails['style']={};
    for(const key of ['fontFamily','fontSize','color'] as const)style[key]=font[key];
    for(const key of ['borderWidth','borderColor','borderStyle','backgroundColor','boxShadow','filter'] as const)style[key]=s[key];
    if(el.parentElement?.matches('[data-image-shadow]'))style.filter=getComputedStyle(el.parentElement).filter;
    return{index:index(el),kind:kind(el)==='link'?'link':kind(el)==='shape'?'shape':isImage(el)||kind(el)==='media'?'image':kind(el)==='text'?'text':'box',crop:isImage(el),fonts:[...new Set([...document.fonts].map(f=>f.family.replace(/["']/g,'')))],style};
  }
  const state=()=>send('state',{indices:indices(),editing:!!editing,details:details()});
  const flush=()=>{if(!pending.length||gesture||crop||nudged.size)return;send('ops',{ops:pending,indices:indices(),editing:!!editing,range:editing&&savedRange?chars(editing,savedRange):null});pending=[];};
  // Selection, snapping and hit zones use the same object bounds.
  // A cropped image is selected, snapped and resized by its visible part.
  const rect=(el:HTMLElement)=>{
    const r=el.getBoundingClientRect(),[t,ri,b,l]=insetOf(el);if(!t&&!ri&&!b&&!l)return r;
    const points=[[l/100,t/100],[1-ri/100,t/100],[l/100,1-b/100],[1-ri/100,1-b/100]].map(([x,y])=>point(el,x,y));
    const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
    return new DOMRect(left,top,Math.max(...points.map(p=>p.x))-left,Math.max(...points.map(p=>p.y))-top);
  };
  function show(d:HTMLElement,r:{left:number;top:number;width:number;height:number}|null,pad=4){if(!r){d.style.display='none';return;}Object.assign(d.style,{display:'block',left:r.left-pad+'px',top:r.top-pad+'px',width:r.width+2*pad+'px',height:r.height+2*pad+'px'});}
  function place(){
    selection=selection.filter(el=>el.isConnected);
    if(crop){
      boxes.forEach(d=>show(d,null));show(group,null);handles.forEach(h=>show(h,null));const [t,ri,b,l]=crop.inset;
      const at=(c:string)=>point(crop!.el,c.includes('w')?l/100:c.includes('e')?1-ri/100:(1+l/100-ri/100)/2,c.includes('n')?t/100:c.includes('s')?1-b/100:(1+t/100-b/100)/2);
      const points=['nw','ne','sw','se'].map(at),left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
      show(cropBox,{left,top,width:Math.max(...points.map(p=>p.x))-left,height:Math.max(...points.map(p=>p.y))-top},0);
      cropGrips.forEach(h=>{const p=at(h.dataset.corner!);show(h,{left:p.x-5,top:p.y-5,width:10,height:10},0);});return;
    }
    show(cropBox,null);cropGrips.forEach(h=>show(h,null));
    while(boxes.length<selection.length)boxes.push(edges(ui('sel')));
    const one=selection.length===1&&!fixed(selection[0])?selection[0]:null,image=one&&isImage(one)?one:null,text=one&&!image&&textBox(one)?one:null,box=one&&!image&&!text&&getComputedStyle(one).display!=='inline'?one:null,sized=image||text||box;
    // A resizable text box shows its real box, the one the handles change.
    boxes.forEach((d,i)=>show(d,selection[i]?(selection[i]===text?text.getBoundingClientRect():rect(selection[i])):null));
    show(group,selection.length>1?bounds(outer()):null);
    handles.forEach(h=>{const c=h.dataset.corner!,[t,ri,b,l]=sized?insetOf(sized):[0,0,0,0];
      const p=sized?point(sized,c.includes('w')?l/100:c.includes('e')?1-ri/100:(1+l/100-ri/100)/2,c.includes('n')?t/100:c.includes('s')?1-b/100:(1+t/100-b/100)/2):null;
      show(h,p&&(text||box||c.length===2)?{left:p.x-5,top:p.y-5,width:10,height:10}:null,0);});
    boxes.forEach(d=>d.style.borderStyle=editing?'dashed':'solid');
  }
  function collectNudge(){clearTimeout(nudge);nudged.forEach(el=>{const [x,y]=offset(el);pending.push({type:'move',index:index(el),x,y});});nudged.clear();
    resized.forEach((text,el)=>{const [x,y]=offset(el);pending.push({type:'resize',index:index(el),width:parseFloat(el.style.width),height:parseFloat(text?el.style.minHeight:el.style.height),x,y,...text?{fit:true}:{}});});resized.clear();}
  // Arrows move the selection; ⌘+arrows resize it with the visible top left corner fixed (images keep their proportion).
  function arrow(key:string,shift:boolean,meta:boolean){
    const step=shift?10:1,dx=key==='ArrowRight'?step:key==='ArrowLeft'?-step:0,dy=key==='ArrowDown'?step:key==='ArrowUp'?-step:0,items=free(outer());
    if(!meta)items.forEach(el=>{nudged.add(el);const [x,y]=offset(el);setPosition(el,x+dx,y+dy);});
    else for(const el of items){
      const image=isImage(el),text=!image&&textBox(el);if(!image&&getComputedStyle(el).display==='inline')continue;
      const m=measure(el),[it,,,il]=insetOf(el),fx=il/100,fy=it/100,anchor=point(el,fx,fy),[x,y]=offset(el),parent=geometry.multiply(matrix(el.parentElement),{a:parseFloat(getComputedStyle(el).zoom)||1,b:0,c:0,d:parseFloat(getComputedStyle(el).zoom)||1});
      let w=Math.max(4,m.width+dx),h=Math.max(4,m.height+dy);
      if(image){const r=m.height/m.width;if(dx)h=w*r;else w=h/r;}
      setBox(el,w,h,x,y,text);
      const current=point(el,fx,fy),delta=geometry.inverse(parent,anchor.x-current.x,anchor.y-current.y);
      if(delta)setPosition(el,x+delta.x,y+delta.y);
      resized.set(el,text);
    }
    // Saved once the keys rest, as one undo step.
    place();clearTimeout(nudge);
  }
  const arrowUp=()=>{if(nudged.size||resized.size){clearTimeout(nudge);nudge=setTimeout(()=>{collectNudge();flush();},200) as any;}};
  function select(list:HTMLElement[]){if(crop)endCrop(true);collectNudge();if(editing&&!list.includes(editing))finish();selection=list;show(hover,null);place();state();}
  function begin(el:HTMLElement,x?:number,y?:number){
    editing=el;original=el.innerHTML;el.setAttribute('contenteditable','true');el.focus();
    const range=x===undefined?null:(document as any).caretRangeFromPoint?.(x,y),sel=getSelection()!;
    if(range&&el.contains(range.startContainer)){sel.removeAllRanges();sel.addRange(range);}else{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);sel.removeAllRanges();sel.addRange(r);}
    el.addEventListener('blur',blurText);place();state();paint();
  }
  // The editor's format bar takes the focus without ending the edit: it announces itself ('hold') when pressed, so a blur
  // only commits after a short wait; the selection stays painted while the frame has no focus.
  let held=false,blurTimer=0;
  function blurText(){clearTimeout(blurTimer);blurTimer=setTimeout(()=>{if(!held&&!document.hasFocus()){finish();flush();}paint();},150) as any;}
  function finish(){const el=editing;if(!el)return;editing=null;savedRange=null;el.removeEventListener('blur',blurText);el.removeAttribute('contenteditable');getSelection()?.removeAllRanges();paint();const html=el.innerHTML;if(html!==original)pending.push({type:'text',index:index(el),html});place();state();}
  let savedRange:Range|null=null;
  const highlights=(window as any).CSS?.highlights,Highlight=(window as any).Highlight;
  function paint(){if(!highlights||!Highlight)return;if(editing&&savedRange&&!savedRange.collapsed&&!document.hasFocus())highlights.set('esf-sel',new Highlight(savedRange));else highlights.delete('esf-sel');}
  // Character offsets of the selection inside the edited text, which survive the frame reloads.
  const chars=(el:HTMLElement,r:Range)=>{const before=document.createRange();before.selectNodeContents(el);before.setEnd(r.startContainer,r.startOffset);const start=before.toString().length;before.setEnd(r.endContainer,r.endOffset);return{start,end:before.toString().length};};
  function selectChars(el:HTMLElement,start:number,end:number){
    const nodes:Text[]=[],walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);for(let n=walk.nextNode();n;n=walk.nextNode())nodes.push(n as Text);if(!nodes.length)return;
    const point=(offset:number)=>{let left=offset;for(const n of nodes){if(left<=n.length)return[n,left] as const;left-=n.length;}return[nodes.at(-1)!,nodes.at(-1)!.length] as const;};
    const [a,ao]=point(start),[b,bo]=point(end),r=document.createRange(),sel=getSelection()!;r.setStart(a,ao);r.setEnd(b,bo);sel.removeAllRanges();sel.addRange(r);savedRange=r.cloneRange();
  }
  document.addEventListener('selectionchange',()=>{if(editing){const s=getSelection();if(s?.rangeCount&&editing.contains(s.anchorNode)){
    savedRange=s.getRangeAt(0).cloneRange();send('range',savedRange.collapsed?{start:0,end:0}:chars(editing,savedRange));state();
  }}});
  addEventListener('focus',()=>{held=false;clearTimeout(blurTimer);paint();});
  addEventListener('message',e=>{
    const m=e.data;if(e.source!==parent||m?.app!=='esf-editor-command')return;
    if(m.type==='hold'){held=true;return;}
    // Arrows typed while the keyboard is outside the frame.
    if(m.type==='arrow'){if(selection.length&&!editing&&!gesture&&!crop&&/^Arrow(Up|Down|Left|Right)$/.test(m.key))arrow(m.key,!!m.shift,!!m.meta);return;}
    if(m.type==='arrowUp'){arrowUp();return;}
    // Copy (and ⌘D): each selected object's computed look, so it pastes the same on a slide without this slide's CSS.
    // Styles go per element in document order (the editor applies them to the saved HTML, which keeps asset references);
    // the object itself gets its place on the slide (rotation and scale are kept around its center).
    if(m.type==='copy'){
      const props=['color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-spacing','text-align','text-transform','text-decoration','text-shadow','text-indent','white-space','vertical-align','list-style-type','background-color','background-image','background-size','background-position','background-repeat','box-shadow','opacity','box-sizing','display','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','justify-content','align-items','align-content','align-self','gap','grid-template-columns','grid-template-rows','object-fit','object-position','clip-path','filter','transform','transform-origin','rotate','scale','fill','stroke','stroke-width','overflow',
        ...['top','right','bottom','left'].flatMap(k=>[`padding-${k}`,`border-${k}-width`,`border-${k}-style`,`border-${k}-color`]),'border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius'];
      const media=(el:Element)=>/^(IMG|SVG|VIDEO|CANVAS)$/i.test(el.tagName)||/url\(/.test(getComputedStyle(el).backgroundImage);
      const styleOf=(el:Element,top:boolean)=>{const c=getComputedStyle(el),list=[...props,...top?[]:['translate','margin-top','margin-right','margin-bottom','margin-left','position','left','top','right','bottom']];
        if(c.display!=='inline'&&!top){list.push('width');if(media(el))list.push('height');}
        const shadow=top&&el.parentElement?.matches('[data-image-shadow]')?getComputedStyle(el.parentElement).filter:'';
        return list.map(k=>{const v=k==='filter'&&shadow?shadow:c.getPropertyValue(k);return v&&(!/url\(/i.test(v)||[...v.matchAll(/url\(\s*['"]?([^'")]+)/gi)].every(m=>/^(data:|#)/i.test(m[1])))?`${k}:${v}`:'';}).filter(Boolean).join(';');};
      // Custom properties the source CSS uses (in animations, keyframes…) resolve here, so they also work without the source theme.
      const names:string[]=Array.isArray(m.vars)?m.vars.filter((k:unknown)=>typeof k==='string'&&/^--[\w-]{1,100}$/.test(k)).slice(0,500):[];
      const r0=root.getBoundingClientRect(),scale=r0.width/(root.offsetWidth||r0.width)||1;
      const objects=outer().map(el=>{const r=el.getBoundingClientRect(),z=size(el);
        return{index:index(el),width:coord(z.width),height:coord(z.height),text:kind(el)==='text',left:coord((r.left+r.width/2-r0.left)/scale-root.clientLeft-z.width/2),top:coord((r.top+r.height/2-r0.top)/scale-root.clientTop-z.height/2),styles:[styleOf(el,true),...[...el.querySelectorAll('*')].map(x=>x.closest('[data-manual=shape]')?'':styleOf(x,false))],vars:Object.fromEntries(names.map(k=>[k,getComputedStyle(el).getPropertyValue(k).trim()]).filter(([,v])=>v))};});
      send('copied',{id:m.id,objects});return;
    }
    // A right click the editor received on the iframe element itself (not always routed into the frame).
    if(m.type==='contextAt'&&Number.isFinite(m.x)&&Number.isFinite(m.y)){let t=document.elementFromPoint(m.x,m.y);if(t===overlay)t=shadow.elementFromPoint(m.x,m.y)||t;context(t,m.x,m.y);return;}
    if(gesture)return;
    // The slide list took the selection mode: objects on the canvas are deselected (an open text edit is kept as typed).
    if(m.type==='deselect'){if(crop)endCrop(true);select([]);flush();return;}
    if(m.type==='selectAll'){if(crop)endCrop(true);finish();select(free(tops()));flush();return;}
    if(m.type==='crop'){if(crop)endCrop(true);else startCrop();return;}
    if(m.type==='cropCancel'){endCrop(false);return;}
    // Pressed anywhere else in the editor: an edit the bar kept open is committed.
    if(m.type==='release'){held=false;if(crop)endCrop(true);if(editing&&!document.hasFocus()){finish();flush();}return;}
    if(m.type==='style'&&selection.length===1&&!fixed(selection[0])&&m.style&&typeof m.style==='object'){
      const entries=Object.entries(m.style);
      if(!entries.length||!entries.every(([key,value])=>['border-width','border-color','border-style','background-color','box-shadow','filter'].includes(key)&&typeof value==='string'&&CSS.supports(key,value)))return;
      const el=selection[0];collectNudge();finish();
      for(const [key,value] of entries)el.style.setProperty(key,value as string,'important');
      pending.push({type:'style',index:index(el),style:m.style as ObjectStyle});place();state();flush();return;
    }
    // Context menu. Stacking order: z-index above (or below) every other element of the parent, keeping the order of the
    // selected ones; below needs the parent to isolate, or the object would go behind the parent's own background.
    if(m.type==='order'&&(m.value==='front'||m.value==='back')&&selection.length){
      collectNudge();finish();const ops:EditOp[]=[],zOf=(el:Element)=>parseInt(getComputedStyle(el).zIndex)||0;
      const set=(el:HTMLElement,style:ObjectStyle)=>{for(const [key,value] of Object.entries(style))el.style.setProperty(key,value!,'important');ops.push({type:'style',index:index(el),style});};
      for(const p of new Set(free(outer()).map(el=>el.parentElement!).filter(Boolean))){
        const mine=free(outer()).filter(el=>el.parentElement===p),others=[...p.querySelectorAll('[data-esf-edit]')].filter(x=>!mine.some(el=>el===x||el.contains(x))).map(zOf);
        const base=m.value==='front'?Math.max(0,...others)+1:Math.min(0,...others)-mine.length;
        if(m.value==='back'&&p.hasAttribute('data-esf-edit')&&getComputedStyle(p).isolation!=='isolate')set(p,{isolation:'isolate'});
        mine.forEach((el,i)=>set(el,{'z-index':String(base+i),...getComputedStyle(el).position==='static'?{position:'relative'}:{}}));
      }
      pending.push(...ops);place();state();flush();return;
    }
    // Horizontal alignment is text-align; vertical uses the box's own layout (align-content on blocks, flex/grid alignment).
    if(m.type==='align'&&['start','center','end'].includes(m.value)){
      collectNudge();finish();
      for(const el of free(outer()).filter(el=>kind(el)==='text'||kind(el)==='link')){
        let style:ObjectStyle;const d=getComputedStyle(el),v=m.value as string;
        if(m.axis==='x')style={'text-align':v==='start'?'left':v==='end'?'right':'center'};
        else if(/flex/.test(d.display))style={[d.flexDirection.startsWith('column')?'justify-content':'align-items']:v==='center'?'center':'flex-'+v};
        else if(d.display==='inline')continue;
        else style={'align-content':v};
        for(const [key,value] of Object.entries(style))el.style.setProperty(key,value!,'important');
        pending.push({type:'style',index:index(el),style});
      }
      place();state();flush();return;
    }
    if(m.type!=='format'||selection.length!==1||kind(selection[0])!=='text')return;
    const el=selection[0];if(editing!==el){begin(el);if(m.range&&Number.isInteger(m.range.start)&&Number.isInteger(m.range.end))selectChars(el,m.range.start,m.range.end);}
    const sel=getSelection()!;if(savedRange&&el.contains(savedRange.commonAncestorContainer)){sel.removeAllRanges();sel.addRange(savedRange);}
    // Without a selection the whole text is formatted.
    if(!sel.rangeCount||sel.isCollapsed){const r=document.createRange();r.selectNodeContents(el);sel.removeAllRanges();sel.addRange(r);}
    if(['bold','italic','underline','strikeThrough'].includes(m.command))document.execCommand(m.command,false);
    else if(['color','fontFamily','fontSize'].includes(m.command)&&typeof m.value==='string'){
      const r=sel.getRangeAt(0),span=document.createElement('span');
      if(m.command==='color')span.style.setProperty('color',m.value,'important');
      if(m.command==='fontFamily')span.style.setProperty('font-family',m.value,'important');
      if(m.command==='fontSize')span.style.setProperty('font-size',m.value,'important');
      // Nested spans of the same property would hide the new value.
      const frag=r.extractContents();frag.querySelectorAll<HTMLElement>('[style]').forEach(x=>{x.style.removeProperty(m.command==='color'?'color':m.command==='fontFamily'?'font-family':'font-size');if(!x.getAttribute('style'))x.removeAttribute('style');});
      span.append(frag);r.insertNode(span);
      // Splitting the selection leaves empty inline wrappers behind.
      el.querySelectorAll('span,b,i,u,s,strike,strong,em,font').forEach(x=>{if(!x.textContent&&!x.querySelector('img,br,svg'))x.remove();});
      r.selectNodeContents(span);sel.removeAllRanges();sel.addRange(r);
    }
    // Commit now (one undoable slide edit); the reloaded frame resumes the edit with the same characters selected.
    const range=sel.rangeCount?chars(el,sel.getRangeAt(0)):null,html=el.innerHTML;
    if(html!==original)pending.push({type:'text',index:index(el),html});original=html;
    if(pending.length){send('ops',{ops:pending,indices:indices(),editing:true,range});pending=[];}
    savedRange=sel.rangeCount?sel.getRangeAt(0).cloneRange():null;paint();
  });
  function insetOf(el:HTMLElement){const m=getComputedStyle(el).clipPath.match(/inset\(\s*([\d.]+)%(?:\s+([\d.]+)%)?(?:\s+([\d.]+)%)?(?:\s+([\d.]+)%)?\s*\)/);if(!m)return[0,0,0,0];const t=+m[1],r=m[2]!==undefined?+m[2]:t,b=m[3]!==undefined?+m[3]:t,l=m[4]!==undefined?+m[4]:r;return[t,r,b,l];}
  function startCrop(){
    const el=selection.length===1&&isImage(selection[0])?selection[0]:null;if(!el||crop)return;collectNudge();finish();
    crop={el,style:el.getAttribute('style'),inset:insetOf(el),start:insetOf(el)};el.style.setProperty('clip-path','none','important');show(hover,null);place();send('crop',{active:true});
  }
  function endCrop(commit:boolean){
    const c=crop;if(!c)return;if(gesture?.type==='crop')endGesture(false);crop=null;
    const round=c.inset.map(n=>Math.round(n*10)/10),changed=commit&&round.some((n,i)=>n!==c.start[i]);
    restore(c.el,c.style);if(changed)c.el.style.setProperty('clip-path',`inset(${round.map(n=>n+'%').join(' ')})`,'important');
    if(changed)pending.push({type:'crop',index:index(c.el),inset:round});place();send('crop',{active:false});flush();
  }
  function bounds(items:HTMLElement[]){const rs=items.map(rect),left=Math.min(...rs.map(r=>r.left)),top=Math.min(...rs.map(r=>r.top));return new DOMRect(left,top,Math.max(...rs.map(r=>r.right))-left,Math.max(...rs.map(r=>r.bottom))-top);}
  function clearGuides(){guides.forEach(g=>show(g,null));}
  function release(pointer:number){if(html.hasPointerCapture(pointer))html.releasePointerCapture(pointer);cursor('');clearGuides();}
  function capture(e:PointerEvent,next:NonNullable<typeof gesture>){
    gesture=next;
    try{html.setPointerCapture(e.pointerId);}catch{endGesture(false);}
  }
  function cancel(){endGesture(false);}
  function startDrag(e:PointerEvent,items:HTMLElement[],click:MoveGesture['click'],before=selection.slice(),toggle?:HTMLElement){
    if(!items.length)return;e.preventDefault();collectNudge();finish();
    const targets=[root.getBoundingClientRect(),...[...root.querySelectorAll<HTMLElement>('[data-esf-edit]')].filter(el=>isObject(el)&&!items.some(i=>i===el||i.contains(el)||el.contains(i))).map(rect)];
    capture(e,{type:'move',items:items.map(snapshot),bounds:bounds(items),targets,before,pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false,click,toggle});
  }
  function snap(d:MoveGesture,dx:number,dy:number,locked:'x'|'y'|null,disabled:boolean){
    clearGuides();const result=align(d.bounds,d.targets,dx,dy,locked,disabled);
    for(const g of result.guides)show(guides[g.axis],g.axis?{left:g.from,top:g.position,width:g.to-g.from,height:1}:{left:g.position,top:g.from,width:1,height:g.to-g.from},0);
    return[result.dx,result.dy];
  }
  // What a click would pick: the outermost object, or one level below the deepest selected one.
  function target(chain:HTMLElement[]){let k=chain.length-1;while(k>=0&&!selection.includes(chain[k]))k--;return k<0?imageIn(chain)||chain[0]:chain[k+1]||chain[k];}
  const textInterior=(el:HTMLElement,e:PointerEvent)=>{const r=el.getBoundingClientRect(),edge=fixed(el)?0:Math.min(6,r.width/4,r.height/4);return kind(el)==='text'&&!isImage(el)&&e.clientX>r.left+edge&&e.clientX<r.right-edge&&e.clientY>r.top+edge&&e.clientY<r.bottom-edge;};
  addEventListener('pointerdown',e=>{
    // Any press in the slide closes the editor's context menu.
    if(e.button===2||e.button===0&&e.ctrlKey&&/Mac/.test(navigator.platform)){e.preventDefault();if(e.isPrimary)context(e.composedPath()[0],e.clientX,e.clientY);return;}
    if(e.button===0)send('press');
    if(e.button!==0||!e.isPrimary||gesture)return;
    const t=e.composedPath()[0];if(!(t instanceof Element))return;const before=selection.slice();
    if(crop){
      const m=measure(crop.el),p=point(crop.el,0,0),local=geometry.inverse(m.matrix,e.clientX-p.x,e.clientY-p.y),[ct,cr,cb,cl]=crop.inset;
      const inside=local&&local.x>=m.width*cl/100&&local.x<=m.width*(1-cr/100)&&local.y>=m.height*ct/100&&local.y<=m.height*(1-cb/100);
      if(cropGrips.includes(t as HTMLDivElement)||inside){e.preventDefault();capture(e,{type:'crop',corner:cropGrips.includes(t as HTMLDivElement)?(t as HTMLElement).dataset.corner!:'',x:e.clientX,y:e.clientY,base:crop.inset.slice(),pointer:e.pointerId,moved:false,width:m.width,height:m.height,matrix:m.matrix});return;}
      // Commit before accepting another gesture; the parent may need to update the document.
      endCrop(true);return;
    }
    if(handles.includes(t as HTMLDivElement)&&selection.length===1){
      e.preventDefault();collectNudge();finish();const el=selection[0],m=measure(el),corner=(t as HTMLElement).dataset.corner!,[it,ir,ib,il]=insetOf(el);
      const fx=corner.includes('w')?1-ir/100:il/100,fy=corner.includes('n')?1-ib/100:it/100;
      capture(e,{type:'resize',item:snapshot(el),frac:[(100-il-ir)/100,(100-it-ib)/100],corner,text:textBox(el),free:!isImage(el),pointer:e.pointerId,x:e.clientX,y:e.clientY,width:m.width,height:m.height,matrix:m.matrix,anchor:point(el,fx,fy),fx,fy,moved:false});return;
    }
    if(t.hasAttribute('data-esf-edge')){startDrag(e,outer(),null);cursor('move');return;}
    const chain=chainOf(t);let k=chain.length-1;while(k>=0&&!selection.includes(chain[k]))k--;
    // Objects poking out of the slide (an entrance animation's start position, a slide-wide SVG) count by their visible part.
    const bandTargets=()=>{const v=root.getBoundingClientRect();return free(tops()).flatMap(el=>{const b=rect(el),l=Math.max(b.left,v.left),t=Math.max(b.top,v.top),r=Math.min(b.right,v.right),d=Math.min(b.bottom,v.bottom);return r>l&&d>t?[{el,r:new DOMRect(l,t,r-l,d-t)}]:[];});};
    // The band selects only the slide's own objects: layout fields (text-only, fixed) and master/layout objects stay unmarked.
    if(!chain.length){e.preventDefault();select(e.shiftKey||e.metaKey||e.ctrlKey?selection:[]);capture(e,{type:'band',x:e.clientX,y:e.clientY,keep:selection.slice(),before,targets:bandTargets(),pointer:e.pointerId,moved:false});return;}
    if(e.shiftKey||e.metaKey||e.ctrlKey){
      const el=k>=0?chain[k]:imageIn(chain)||chain[0];
      if(selection.includes(el)){startDrag(e,outer(),null,before,el);return;}
      select([...selection.filter(x=>!x.contains(el)&&!el.contains(x)),el]);startDrag(e,outer(),null,before);return;
    }
    const picked=target(chain);
    if(!(k>=0&&selection.length>1)&&textInterior(picked,e)){
      if(editing!==picked){finish();select([picked]);begin(picked,e.clientX,e.clientY);}cursor('text');return;
    }
    if(k>=0){startDrag(e,outer(),selection.length===1&&kind(picked)==='text'?null:{chain,k});return;}
    select([picked]);startDrag(e,[picked],null,before);
  },true);
  // Right click selects the object under the pointer (keeping a selection that contains it) and asks the editor for the menu.
  // It opens on the press (the contextmenu event is not always delivered to the frame); Ctrl+click is a right click on macOS.
  addEventListener('contextmenu',e=>e.preventDefault(),true);
  function context(t:EventTarget|null,x:number,y:number){
    if(gesture||crop||!(t instanceof Element))return;
    if(!handles.includes(t as HTMLDivElement)&&!t.hasAttribute('data-esf-edge')){
      const chain=chainOf(t);if(!chain.length){select([]);return;}
      if(!chain.some(el=>selection.includes(el)))select([target(chain)]);
    }
    if(selection.length)send('context',{x,y,text:outer().some(el=>kind(el)==='text'||kind(el)==='link')});
  }
  function updateGesture(e:PointerEvent){
    const g=gesture;if(!g||e.pointerId!==g.pointer)return;
    let dx=e.clientX-g.x,dy=e.clientY-g.y;
    if(!g.moved&&Math.hypot(dx,dy)<(g.type==='resize'?3:4))return;
    g.moved=true;show(hover,null);
    if(g.type==='crop'){
      if(!crop)return;const local=geometry.inverse(g.matrix,dx,dy);if(!local)return;
      dx=local.x/g.width*100;dy=local.y/g.height*100;
      const [t,ri,b,l]=g.base,min=5,clamp=(v:number,hi:number)=>Math.max(0,Math.min(hi,v));
      if(!g.corner){const x=clamp(l+dx,l+ri),y=clamp(t+dy,t+b);crop.inset=[y,l+ri-x,t+b-y,x];}
      else crop.inset=[g.corner.includes('n')?clamp(t+dy,100-b-min):t,g.corner.includes('e')?clamp(ri-dx,100-l-min):ri,g.corner.includes('s')?clamp(b-dy,100-t-min):b,g.corner.includes('w')?clamp(l+dx,100-ri-min):l];
    }else if(g.type==='resize'){
      const local=geometry.inverse(g.matrix,dx,dy);if(!local)return;
      const next=resize(g.width,g.height,local.x/g.frac[0],local.y/g.frac[1],g.corner,g.free||e.shiftKey),{el,base,parent}=g.item;
      setBox(el,next.width,next.height,base[0],base[1],g.text);
      // Fix the opposite VISIBLE corner after layout reflow, text wrapping and transform-origin changes.
      const current=point(el,g.fx,g.fy),delta=geometry.inverse(parent,g.anchor.x-current.x,g.anchor.y-current.y);
      if(delta)setPosition(el,base[0]+delta.x,base[1]+delta.y);
    }else if(g.type==='band'){
      // The slide fills the canvas edge to edge: near an edge, the band reaches it (objects cut off there count).
      const v=root.getBoundingClientRect(),near=(a:number,b:number)=>Math.abs(a-b)<=8?b:a;
      const x0=near(Math.min(e.clientX,g.x),v.left),y0=near(Math.min(e.clientY,g.y),v.top),x1=near(Math.max(e.clientX,g.x),v.right),y1=near(Math.max(e.clientY,g.y),v.bottom);
      const r={left:x0,top:y0,width:x1-x0,height:y1-y0};show(band,r,0);
      const inside=g.targets.filter(({r:b})=>b.left>=r.left&&b.top>=r.top&&b.right<=r.left+r.width&&b.bottom<=r.top+r.height).map(t=>t.el);
      selection=[...g.keep,...inside.filter(el=>!g.keep.some(k=>k===el||k.contains(el)||el.contains(k)))];
    }else{
      cursor('move');const locked=e.shiftKey?(Math.abs(dx)>=Math.abs(dy)?'y':'x'):null;
      [dx,dy]=snap(g,dx,dy,locked,e.altKey);
      for(const item of g.items){let x=dx,y=dy;if(fixed(item.el))continue;
        if(item.inline){item.el.style.setProperty('display','inline-block','important');setPosition(item.el,item.base[0],item.base[1]);const r=item.el.getBoundingClientRect();x+=item.bounds.left-r.left;y+=item.bounds.top-r.top;}
        const local=geometry.inverse(item.parent,x,y);if(!local)continue;
        setPosition(item.el,item.base[0]+local.x,item.base[1]+local.y);
      }
    }
    place();
  }
  function endGesture(commit:boolean,e?:PointerEvent){
    if(!gesture||e&&gesture.pointer!==e.pointerId)return;
    if(commit&&e)updateGesture(e); // Pointerup may carry a final position without a preceding pointermove.
    const g=gesture;gesture=null;release(g.pointer);
    if(g.type==='crop'){if(!commit&&crop)crop.inset=g.base;place();return;}
    if(g.type==='resize'){
      const {el,style}=g.item;
      if(commit&&g.moved){const [x,y]=offset(el);pending.push({type:'resize',index:index(el),width:parseFloat(el.style.width),height:parseFloat(g.text?el.style.minHeight:el.style.height),x,y,...g.text?{fit:true}:{}});}
      else restore(el,style);
    }else if(g.type==='band'){if(!commit)selection=g.before;show(band,null);}
    else if(!commit){g.items.forEach(({el,style})=>restore(el,style));selection=g.before;}
    else if(g.moved){for(const {el,base,style,inline} of g.items){const [x,y]=offset(el);if(Math.abs(x-base[0])>.001||Math.abs(y-base[1])>.001)pending.push({type:'move',index:index(el),x,y,...inline?{inline:true}:{}});else restore(el,style);}}
    else if(g.toggle)select(selection.filter(el=>el!==g.toggle));
    else if(g.click){
      const {chain,k}=g.click,multi=selection.length>1,el=multi?chain[Math.max(k,0)]:imageIn(chain)||(k<0?chain[0]:chain[k+1]||chain[k]);
      if(multi||selection[0]!==el)select([el]);
      if(e&&!multi&&textInterior(el,e)&&editing!==el)begin(el,e.clientX,e.clientY);
    }
    place();state();flush();
  }
  addEventListener('pointermove',e=>{
    // A move without the button means the release went elsewhere: it still ends the gesture where the pointer is.
    if(gesture){if(e.pointerId===gesture.pointer){if(!(e.buttons&1)){endGesture(true,e);return;}updateGesture(e);}return;}
    if(crop)return;
    if(editing&&e.buttons===1){cursor('text');return;}
    const t=e.composedPath()[0];if(!(t instanceof Element))return;
    if(handles.includes(t as HTMLDivElement)){cursor('');show(hover,null);return;}
    if(t.hasAttribute('data-esf-edge')){cursor('move');show(hover,null);return;}
    const chain=chainOf(t),selected=chain.find(el=>selection.includes(el)),next=selection.length>1&&selected?selected:target(chain);
    show(hover,next&&!selection.includes(next)?rect(next):null,2);cursor(next?(selection.length>1&&selected?'move':textInterior(next,e)?'text':'move'):'');
  },true);
  addEventListener('pointerup',e=>{if(gesture)endGesture(true,e);else flush();},true);
  // Only Esc cancels a gesture. A lost capture or focus, a cancelled pointer or a resize keeps what was dragged so far
  // (the object never jumps back when the button is released).
  addEventListener('pointercancel',e=>{if(gesture?.pointer===e.pointerId)endGesture(true);},true);
  addEventListener('lostpointercapture',e=>{if(gesture?.pointer===e.pointerId&&!html.hasPointerCapture(e.pointerId))endGesture(true);},true);
  addEventListener('blur',()=>{endGesture(true);collectNudge();flush();});
  addEventListener('pointerleave',()=>{show(hover,null);if(!gesture)cursor('');});
  // Double click goes straight to the innermost text.
  addEventListener('dblclick',e=>{const t=e.target as Element;if(editing?.contains(t))return;const el=chainOf(t).at(-1);if(el&&kind(el)==='text'&&!isImage(el)){select([el]);begin(el,e.clientX,e.clientY);}});
  addEventListener('click',e=>{if((e.target as Element).closest('a'))e.preventDefault();});
  addEventListener('dragstart',e=>e.preventDefault());addEventListener('dragover',e=>e.preventDefault());addEventListener('drop',e=>e.preventDefault());
  addEventListener('keydown',e=>{
    if(crop){if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();endCrop(e.key==='Enter');}return;}
    if(gesture){if(e.key==='Escape'){e.preventDefault();cancel();}return;}
    if(editing){
      if(e.key==='Escape'){e.preventDefault();finish();place();flush();}
      // Every new line is a <br>, the same structure the saved text uses.
      else if(e.key==='Enter'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();document.execCommand('insertLineBreak');}
      else if((e.metaKey||e.ctrlKey)&&/^[biu]$/i.test(e.key))return;
      return;
    }
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'){e.preventDefault();select(free(tops()));flush();return;}
    if(e.key==='Tab'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();const all=tops(),at=all.indexOf(selection[0]),el=all[at<0?(e.shiftKey?all.length-1:0):(at+(e.shiftKey?-1:1)+all.length)%all.length];if(el)select([el]);flush();return;}
    if(selection.length&&e.key.startsWith('Arrow')){e.preventDefault();arrow(e.key,e.shiftKey,e.metaKey||e.ctrlKey);return;}
    if(!selection.length||e.metaKey||e.ctrlKey)return;
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();free(outer()).forEach(el=>pending.push({type:'delete',index:index(el)}));select([]);flush();}
    else if(e.key==='Escape'){e.preventDefault();select([]);flush();}
    else if(e.key==='Enter'&&selection.length===1&&kind(selection[0])==='text'&&!isImage(selection[0])){e.preventDefault();begin(selection[0]);}
  });
  addEventListener('keyup',e=>{if(e.key.startsWith('Arrow'))arrowUp();});
  addEventListener('paste',e=>{if(!editing)return;e.preventDefault();(e.clipboardData?.getData('text/plain')||'').split(/\r?\n/).forEach((l,i)=>{if(i)document.execCommand('insertLineBreak');if(l)document.execCommand('insertText',false,l);});});
  addEventListener('resize',()=>{if(gesture)endGesture(true);place();});new ResizeObserver(place).observe(html);document.fonts.ready.then(place);
  root.addEventListener('load',place,true);addEventListener('esf-slide-ready',place);
  // Structural edits and undo/redo reload the frame and restore its selection.
  const initial=config.select.map(i=>document.querySelector<HTMLElement>(`[data-esf-edit="${i}"]`)).filter((el):el is HTMLElement=>!!el);
  select(initial);if(config.editing&&initial.length===1&&kind(initial[0])==='text'){begin(initial[0]);if(config.range&&config.range.end>config.range.start)selectChars(initial[0],config.range.start,config.range.end);paint();}
}
