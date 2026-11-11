import type {alignMovement,boxStyle,resizeImage,canvasGeometry,EditMatrix} from './geometry';
import type {EditOp,SelectionDetails,ObjectStyle} from './edit';

// Direct editing on the editor canvas, modeled on PowerPoint. Objects are text blocks, media and visible boxes
// (background, border or shadow); layout-only wrappers are skipped. A press on empty space draws a selection band
// (objects fully inside it), Shift/Cmd toggles objects, and dragging moves the whole selection. A click on an object
// inside a selected one goes one level down (a card, then its text); a click on a text that ends up selected edits it.
// Elements carry data-esf-edit (annotate in edit.ts); the frame reports operations ({type:'ops'}) and the selection
// ({type:'state'}) to the editor, which applies them to the saved HTML.
export function editRuntime(config:{select:number[];editing:boolean;range?:{start:number;end:number}|null},align:typeof alignMovement,resize:typeof resizeImage,boxStyle:typeof import('./geometry').boxStyle,geometry:ReturnType<typeof canvasGeometry>,markers:(root:Element)=>void){
  const send=(type:string,extra:any={})=>parent.postMessage({app:'esf-edit',type,...extra},'*');
  const root=(document.querySelector('.slide')||document.body) as HTMLElement,html=document.documentElement;
  const css=document.createElement('style');
  // Objects stay clickable even when the slide CSS turns their pointer events off (an inline SVG only where it paints, so its empty box does not cover what is behind).
  css.textContent='html{touch-action:none}[data-esf-kind]:not(svg){pointer-events:auto!important}svg[data-esf-kind] *{pointer-events:visiblePainted!important}*{-webkit-user-select:none;user-select:none}[contenteditable],[contenteditable] *{-webkit-user-select:text;user-select:text;cursor:text}[contenteditable]{outline:none!important}[data-esf-ui]{position:fixed;z-index:2147483646;box-sizing:border-box;pointer-events:none;border-radius:2px;display:none}[data-esf-ui=resize]{pointer-events:auto;background:white;border:1.5px solid #2f6fed;touch-action:none;z-index:2147483647}[data-esf-ui=crop]{border:1.5px solid #fff;outline:1px solid #2f6fed;box-shadow:0 0 0 100vmax #10182680;border-radius:0}[data-esf-ui=cropgrip]{pointer-events:auto;background:#fff;border:2px solid #10182a;border-radius:1px;touch-action:none;z-index:2147483647}[data-esf-ui=rotate]{pointer-events:auto;background:white;border:1.5px solid #2f6fed;border-radius:50%;touch-action:none;z-index:2147483647;cursor:grab}[data-esf-ui=stem]{background:#2f6fed;border-radius:0;transform-origin:50% 0}[data-esf-ui=sel]{border:1.5px solid #2f6fed}[data-esf-ui=group]{border:1px dashed #2f6fed}[data-esf-ui=guide]{background:#d946b4;border-radius:0}[data-esf-ui=hover]{border:1px solid #2f6fed88}[data-esf-ui=tip]{border-radius:0;font:600 12px/1 system-ui,sans-serif;color:#2f6fed;white-space:nowrap;font-variant-numeric:tabular-nums;text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 4px #fff}[data-esf-ui=band]{border:1px solid #2f6fed;background:#2f6fed14}[data-esf-edge]{position:absolute;pointer-events:auto;cursor:move;touch-action:none}[data-esf-edge=n],[data-esf-edge=s]{left:0;right:0;height:8px}[data-esf-edge=n]{top:-4px}[data-esf-edge=s]{bottom:-4px}[data-esf-edge=e],[data-esf-edge=w]{top:0;bottom:0;width:8px}[data-esf-edge=e]{right:-4px}[data-esf-edge=w]{left:-4px}html[data-esf-cursor],html[data-esf-cursor] *{cursor:var(--esf-cursor)!important}::highlight(esf-sel){background-color:#b4d3fd}[data-esf-ui=tcol]{pointer-events:auto;cursor:col-resize}[data-esf-ui=trow]{pointer-events:auto;cursor:row-resize}[data-esf-ui=tpickc],[data-esf-ui=tpickr]{pointer-events:auto;border-radius:2px;background:#2f6fed1f}[data-esf-ui=tpickc]:hover,[data-esf-ui=tpickr]:hover{background:#2f6fed66}[data-esf-ui=tpickc]{cursor:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27%3E%3Cpath d=%27M8 15L3 8h3V1h4v7h3z%27 fill=%27%23000%27 stroke=%27%23fff%27/%3E%3C/svg%3E") 8 15,s-resize}[data-esf-ui=tpickr]{cursor:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27%3E%3Cpath d=%27M15 8L8 3v3H1v4h7v3z%27 fill=%27%23000%27 stroke=%27%23fff%27/%3E%3C/svg%3E") 15 8,e-resize}';
  document.head.appendChild(css);
  // Isolate handles from arbitrary slide CSS (including div/img rules and !important declarations).
  const overlay=document.createElement('esf-editor-overlay');overlay.style.cssText='all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important';html.appendChild(overlay);
  const shadow=overlay.attachShadow({mode:'open'});shadow.appendChild(css.cloneNode(true));
  const ui=(kind:string)=>{const d=document.createElement('div');d.setAttribute('data-esf-ui',kind);shadow.appendChild(d);return d;};
  const hover=ui('hover'),band=ui('band'),group=ui('group'),guides=[ui('guide'),ui('guide')],stem=ui('stem'),turn=ui('rotate'),tip=ui('tip'),boxes:HTMLElement[]=[];
  function edges(d:HTMLElement){for(const side of ['n','s','e','w']){const edge=document.createElement('span');edge.dataset.esfEdge=side;d.appendChild(edge);}return d;}
  edges(group);
  const cursor=(value:string)=>{html.style.setProperty('--esf-cursor',value);html.toggleAttribute('data-esf-cursor',!!value);};
  const handles=['nw','ne','sw','se','n','s','e','w'].map(corner=>{const h=ui('resize');h.dataset.corner=corner;h.style.cursor=corner.length===1?(/[ns]/.test(corner)?'ns':'ew')+'-resize':corner==='nw'||corner==='se'?'nwse-resize':'nesw-resize';return h;});
  // Crop mode (format bar): the image shows whole, the kept area is a box with eight grips; dragging inside pans it.
  const cropBox=ui('crop'),cropGrips=['nw','ne','sw','se','n','s','e','w'].map(corner=>{const h=ui('cropgrip');h.dataset.corner=corner;h.style.cursor=handles.find(x=>x.dataset.corner===corner)!.style.cursor;return h;});
  type Snapshot={el:HTMLElement;style:string|null;base:number[];parent:EditMatrix;inline:boolean;bounds:DOMRect};
  type GestureBase={pointer:number;x:number;y:number;moved:boolean};
  type MoveGesture=GestureBase&{type:'move';items:Snapshot[];bounds:DOMRect;targets:DOMRect[];before:HTMLElement[];toggle?:HTMLElement;click:{chain:HTMLElement[];k:number}|null};
  type ResizeGesture=GestureBase&{type:'resize';rows:number[]|null;rowStyles:(string|null)[];item:Snapshot;frac:number[];corner:string;text:boolean;free:boolean;width:number;height:number;matrix:EditMatrix;anchor:{x:number;y:number};fx:number;fy:number};
  // Several objects resized together: each keeps its place relative to the group's opposite corner or side.
  type ScaleItem=Snapshot&{width:number;height:number;text:boolean;image:boolean;cx:number;cy:number};
  type ScaleGesture=GestureBase&{type:'scale';items:ScaleItem[];rect:DOMRect;corner:string;free:boolean};
  type BandGesture=GestureBase&{type:'band';keep:HTMLElement[];before:HTMLElement[];targets:{el:HTMLElement;r:DOMRect}[]};
  type CropGesture=GestureBase&{type:'crop';corner:string;base:number[];width:number;height:number;matrix:EditMatrix};
  // Rotation around the object's center: own is its CSS rotate (what changes), shown the angle it has on screen.
  // A whole group turns around its common center: each member turns as much and its center goes around that center.
  type RotateItem={item:Snapshot;own:number;angle:number;cx:number;cy:number};
  type RotateGesture=GestureBase&{type:'rotate';items:RotateItem[];cx:number;cy:number;start:number;shown:number;delta:number;box:DOMRect|null};
  // A table's column or row border dragged: sizes in layout px (columns: widths; rows: heights), as they were and now.
  type TableGesture=GestureBase&{type:'table';axis:'col'|'row';table:HTMLTableElement;i:number;sizes:number[];now:number[];style:string|null;rowStyles:(string|null)[];colStyles:(string|null)[]};
  let gesture:MoveGesture|ResizeGesture|ScaleGesture|BandGesture|CropGesture|RotateGesture|TableGesture|null=null;
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
  // Groups are a mark on their members (data-group-id), so any objects group without changing the slide's structure or
  // layout: a press on a member selects the whole group (a second press, only that member).
  const gid=(el:Element)=>el.getAttribute('data-group-id')||'';
  const groupOf=(el:HTMLElement)=>{const id=gid(el);return id?free([...root.querySelectorAll<HTMLElement>('[data-group-id]')].filter(x=>gid(x)===id&&isObject(x))):[el];};
  const withGroups=(list:HTMLElement[])=>[...new Set(list.flatMap(groupOf))];
  const entry=(chain:HTMLElement[])=>chain.find(el=>gid(el))||imageIn(chain)||chain[0];
  // A layout field in a slide: its text is edited, but it is not moved, resized, restyled or deleted (the layout owns it).
  // A table's cells are its texts: edited and formatted, never moved, resized or deleted on their own (the table is the object).
  const cellOf=(el:Element|null|undefined):el is HTMLElement=>!!el&&/^(TD|TH)$/.test(el.tagName)&&kind(el)==='text'&&!!el.parentElement?.closest('[data-esf-kind=table]');
  const tableCells=(el:Element)=>{const t=el.parentElement!.closest('[data-esf-kind=table]')!;return[...t.querySelectorAll<HTMLElement>('td,th')].filter(c=>c.parentElement!.closest('[data-esf-kind=table]')===t);};
  const sameTable=(a:Element,b:Element)=>a.parentElement?.closest('[data-esf-kind=table]')===b.parentElement?.closest('[data-esf-kind=table]');
  // Tables: the grid (each position → the cell covering it), ranges of cells grown over merged ones, and the sizes of
  // columns and rows in layout px. Columns are sized by the table's <colgroup> (percentages), rows by their heights.
  const tableOfCell=(el:Element)=>el.parentElement!.closest<HTMLTableElement>('[data-esf-kind=table]')!;
  const selTable=()=>{if(selection.length===1&&kind(selection[0])==='table')return selection[0] as HTMLTableElement;if(!selection.length||!selection.every(cellOf))return null;const t=tableOfCell(selection[0]);return selection.every(c=>tableOfCell(c)===t)?t:null;};
  function gridOf(t:HTMLTableElement){const m:HTMLElement[][]=[];[...t.rows].forEach((tr,r)=>{m[r]=m[r]||[];let c=0;for(const cell of [...tr.cells]){while(m[r][c])c++;for(let i=0;i<Math.max(1,cell.rowSpan);i++)for(let j=0;j<Math.max(1,cell.colSpan);j++)(m[r+i]=m[r+i]||[])[c+j]=cell;c+=Math.max(1,cell.colSpan);}});return m;}
  type Span={r0:number;r1:number;c0:number;c1:number};
  function spanOf(m:HTMLElement[][],cells:HTMLElement[]):Span|null{
    const at=(cell:HTMLElement)=>{const out:number[][]=[];m.forEach((row,r)=>row.forEach((x,c)=>{if(x===cell)out.push([r,c]);}));return out;};
    const ps=cells.flatMap(at);if(!ps.length)return null;let r0=Math.min(...ps.map(p=>p[0])),r1=Math.max(...ps.map(p=>p[0])),c0=Math.min(...ps.map(p=>p[1])),c1=Math.max(...ps.map(p=>p[1]));
    for(let grew=true;grew;){grew=false;for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const x=m[r]?.[c];if(!x)continue;for(const [pr,pc] of at(x)){if(pr<r0){r0=pr;grew=true;}if(pr>r1){r1=pr;grew=true;}if(pc<c0){c0=pc;grew=true;}if(pc>c1){c1=pc;grew=true;}}}}
    return{r0,r1,c0,c1};
  }
  const cellsIn=(m:HTMLElement[][],b:Span)=>{const out=new Set<HTMLElement>();for(let r=b.r0;r<=b.r1;r++)for(let c=b.c0;c<=b.c1;c++)if(m[r]?.[c])out.add(m[r][c]);return[...out].filter(cellOf);};
  const rangeOf=(a:HTMLElement,b:HTMLElement)=>{const m=gridOf(tableOfCell(a)),s=spanOf(m,[a,b]);return s?cellsIn(m,s):[a];};
  const rowSizes=(t:HTMLTableElement)=>[...t.rows].map(tr=>tr.offsetHeight||1);
  function colSizes(t:HTMLTableElement,m=gridOf(t)){
    const n=Math.max(0,...m.map(r=>r.length)),bx:number[]=Array(n+1).fill(NaN);
    for(const cell of new Set(m.flat())){const cs=m.flatMap(r=>r.map((x,c)=>x===cell?c:-1)).filter(c=>c>=0),c0=Math.min(...cs),c1=Math.max(...cs);
      if(isNaN(bx[c0]))bx[c0]=cell.offsetLeft;if(isNaN(bx[c1+1]))bx[c1+1]=cell.offsetLeft+cell.offsetWidth;}
    if(isNaN(bx[0]))bx[0]=0;if(isNaN(bx[n]))bx[n]=t.offsetWidth;
    for(let i=1;i<n;i++)if(isNaN(bx[i])){let j=i;while(isNaN(bx[j]))j++;bx[i]=bx[i-1]+(bx[j]-bx[i-1])/(j-i+1);}
    return bx.slice(1).map((x,i)=>Math.max(1,x-bx[i]));
  }
  const r2=(n:number)=>Math.round(n*100)/100,pcts=(cols:number[])=>{const sum=cols.reduce((a,b)=>a+b,0)||1;return cols.map(c=>r2(c/sum*100));};
  function sizeTable(t:HTMLTableElement,cols:number[]|null,rows:number[]|null){
    if(cols){let cg=t.querySelector<HTMLElement>(':scope>colgroup');if(!cg){cg=document.createElement('colgroup');cg.setAttribute('data-esf-new','');t.insertBefore(cg,t.firstChild);}
      if(cg.children.length!==cols.length){if(!cg.hasAttribute('data-esf-new'))return;cg.replaceChildren(...cols.map(()=>document.createElement('col')));}
      const p=pcts(cols);[...cg.children].forEach((c,i)=>(c as HTMLElement).style.setProperty('width',p[i]+'%','important'));}
    if(rows){[...t.rows].forEach((tr,i)=>tr.style.setProperty('height',r2(rows[i])+'px','important'));t.style.setProperty('height',r2(rows.reduce((a,b)=>a+b,0))+'px','important');}
  }
  // A colgroup the frame added is numbered as in the saved HTML (right after the table); the elements after it move on.
  function numberColgroup(t:HTMLTableElement){const cg=t.querySelector<HTMLElement>(':scope>colgroup[data-esf-new]');if(!cg)return;cg.removeAttribute('data-esf-new');const base=index(t),n=cg.children.length+1;
    for(const node of document.querySelectorAll<HTMLElement>('[data-esf-edit]')){const k=index(node);if(k>base)node.setAttribute('data-esf-edit',String(k+n));}
    cg.setAttribute('data-esf-edit',String(base+1));[...cg.children].forEach((c,i)=>c.setAttribute('data-esf-edit',String(base+2+i)));}
  const tableOp=(t:HTMLTableElement,cols:number[]|null,rows:number[]|null)=>{numberColgroup(t);pending.push({type:'tableSize',index:index(t),...cols?{cols:pcts(cols)}:{},...rows?{rows:rows.map(r2)}:{}});};
  let anchorCell:HTMLElement|null=null,cellRange:HTMLElement|null=null;const tableUi:Record<string,HTMLElement[]>={};
  // With a table or its cells selected: its inner column borders and its row borders can be dragged; with cells
  // selected, bars above the columns and beside the rows select a whole column or row (⇧ extends). Not on a turned table.
  function placeTable(){
    // The bars and border strips are kept and moved (not made anew), so hover and presses stay on the same elements.
    const used:Record<string,number>={},hideRest=()=>{for(const [k,list] of Object.entries(tableUi))list.slice(used[k]||0).forEach(d=>show(d,null));};
    const t=selTable();if(!t||crop||turned(t)||gesture&&gesture.type!=='table'){hideRest();return;}
    const r=t.getBoundingClientRect(),s=r.width/(t.offsetWidth||1),m=gridOf(t),cols=colSizes(t,m),trs=[...t.rows],ys=trs.map(tr=>tr.getBoundingClientRect());
    const add=(k:string,i:number,box:{left:number;top:number;width:number;height:number})=>{const list=tableUi[k]||=[],n=used[k]=(used[k]||0)+1,d=list[n-1]||(list[n-1]=ui(k));d.dataset.i=String(i);show(d,box,0);};
    let x=r.left;const xs=[x,...cols.map(w=>x+=w*s)];
    // A border is dragged only where it exists: not across a merged cell.
    for(let i=1;i<cols.length;i++)for(let a=0;a<m.length;){if(m[a][i-1]===m[a][i]){a++;continue;}let b=a;while(b+1<m.length&&m[b+1][i-1]!==m[b+1][i])b++;add('tcol',i,{left:xs[i]-3,top:ys[a].top,width:6,height:ys[b].bottom-ys[a].top});a=b+1;}
    trs.forEach((tr,i)=>{const next=m[i+1];for(let a=0;a<cols.length;){if(next&&m[i][a]===next[a]){a++;continue;}let b=a;while(b+1<cols.length&&!(next&&m[i][b+1]===next[b+1]))b++;add('trow',i,{left:xs[a],top:ys[i].bottom-3,width:xs[b+1]-xs[a],height:6});a=b+1;}});
    if(selection.every(cellOf)){
      for(let c=0;c<cols.length;c++)add('tpickc',c,{left:xs[c]+1,top:r.top-14,width:Math.max(4,xs[c+1]-xs[c]-2),height:9});
      trs.forEach((tr,i)=>{const b=tr.getBoundingClientRect();add('tpickr',i,{left:r.left-14,top:b.top+1,width:9,height:Math.max(4,b.height-2)});});
    }
    hideRest();
  }
  const tableUiKind=(t:Element)=>/^t(col|row|pickc|pickr)$/.test(t.getAttribute('data-esf-ui')||'')?t.getAttribute('data-esf-ui')!:'';
  const locked=(el:Element)=>el.hasAttribute('data-esf-fixed');
  const fixed=(el:Element)=>locked(el)||cellOf(el),free=(list:HTMLElement[])=>list.filter(el=>!fixed(el));
  const scalable=()=>free(outer()).filter(el=>isImage(el)||getComputedStyle(el).display!=='inline');
  const isImage=(el:Element)=>/^(img|svg)$/i.test(el.tagName)||/url\(/i.test(getComputedStyle(el).backgroundImage);
  const imageIn=(chain:HTMLElement[])=>[...chain].reverse().find(isImage);
  // Text boxes resize freely from corners and sides (inline elements have no box to size); images only from corners.
  const textBox=(el:Element)=>(kind(el)==='text'||kind(el)==='link')&&!isImage(el)&&getComputedStyle(el).display!=='inline';
  const isLine=(el:Element)=>kind(el)==='line';
  // Rotation: the object's own CSS rotate, and the angle of its whole transform on screen.
  const ownAngle=(el:Element)=>{const v=getComputedStyle(el).rotate;if(!v||v==='none')return 0;const n=parseFloat(v.split(' ').at(-1)!);return v.endsWith('rad')?n*180/Math.PI:v.endsWith('turn')?n*360:n||0;};
  const screenAngle=(el:Element)=>{const m=matrix(el);return(m.a*m.d-m.b*m.c<0?Math.atan2(-m.c,m.d):Math.atan2(m.b,m.a))*180/Math.PI;}; // a mirrored object (scaleX(-1)) keeps its angle
  const rotatable=(el:HTMLElement|null)=>!!el&&!fixed(el)&&(isImage(el)||getComputedStyle(el).display!=='inline');
  const painted=(s:CSSStyleDeclaration)=>!/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(s.backgroundColor)||s.backgroundImage!=='none'||s.boxShadow!=='none'||(['Top','Right','Bottom','Left'] as const).some(k=>parseFloat(s[`border${k}Width`])>0&&s[`border${k}Style`]!=='none');
  function isObject(el:Element){
    if(el===root||!el.hasAttribute('data-esf-edit')||el.hasAttribute('data-esf-locked')||el.parentElement?.closest('[data-esf-kind]:not([data-esf-kind=table])'))return false;
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    if(s.display==='none'||s.visibility==='hidden'||!r.width||!r.height)return false;
    if(kind(el)||painted(s))return true;
    // Empty boxes drawn by ::before/::after (pulsing dots, rings, bars) are objects too.
    return!el.children.length&&(['::before','::after'] as const).some(p=>{const ps=getComputedStyle(el,p);return!/^(none|normal)$/.test(ps.content)&&ps.display!=='none'&&painted(ps);});
  }
  // Objects containing the element, outermost first.
  const chainOf=(t:Element|null)=>{const out:HTMLElement[]=[];for(let el=t;el&&el!==root&&el!==document.body;el=el.parentElement)if(isObject(el))out.unshift(el as HTMLElement);return t&&root.contains(t)?out:[];};
  // A press on something that is not an object (a transparent wrapper an animation spins or scales over the slide)
  // reaches the topmost object under the pointer instead.
  const under=(t:Element,x:number,y:number)=>{if(chainOf(t).length)return t;for(const el of document.elementsFromPoint(x,y))if(el!==overlay&&root.contains(el)&&chainOf(el).length)return el;return t;};
  const tops=()=>[...root.querySelectorAll<HTMLElement>('[data-esf-edit]')].filter(el=>isObject(el)&&!chainOf(el.parentElement).length);
  // Nested selected objects move with their selected ancestor, never twice.
  const outer=()=>selection.filter(el=>!selection.some(o=>o!==el&&o.contains(el)));
  const indices=()=>selection.filter(el=>el.isConnected).map(index);
  // Several texts selected: the bar shows the first one and formats them all (whole texts).
  // A whole table selected: its cells are the texts (the bar formats them all).
  const texts=()=>{if(selection.length===1&&kind(selection[0])==='table'){const c=[...selection[0].querySelectorAll<HTMLElement>('td,th')].filter(x=>cellOf(x)&&tableOfCell(x)===selection[0]);return c.length?c:null;}const list=outer().filter(el=>!locked(el));return selection.length>1&&list.length===selection.length&&list.every(el=>kind(el)==='text'&&!isImage(el))?list:null;};
  // Bulleted and numbered lists: the text's lines become the items of a <ul>/<ol> (and back). Only a text field that is a
  // block able to hold a list (inserted texts are <div>s); a <p> or heading would be split by the HTML parser.
  const listOf=(el:HTMLElement)=>!el.hasAttribute('data-field')||!/^(DIV|SECTION|ARTICLE|ASIDE|BLOCKQUOTE|TD|TH|FIGCAPTION|HEADER|FOOTER)$/.test(el.tagName)?undefined
    :el.querySelector(':scope>ul')?'bulleted' as const:el.querySelector(':scope>ol')?'numbered' as const:'none' as const;
  function setList(el:HTMLElement,type:string){
    // Lists and blocks become lines separated by <br>; each line keeps its formatting (a <b> around two lines is split).
    const br=()=>document.createElement('br');
    for(const block of [...el.querySelectorAll<HTMLElement>(':scope>ul,:scope>ol,:scope>div,:scope>p')]){
      const parts=/^(UL|OL)$/.test(block.tagName)?[...block.children].flatMap((li,i)=>i?[br(),...li.childNodes]:[...li.childNodes]):[...block.childNodes];
      if(block.previousSibling)parts.unshift(br());if(block.nextSibling)parts.push(br());block.replaceWith(...parts);}
    if(type!=='bulleted'&&type!=='numbered')return;
    const lines:DocumentFragment[]=[],breaks=[...el.querySelectorAll('br')];
    for(let i=0;i<=breaks.length;i++){const r=document.createRange();if(i)r.setStartAfter(breaks[i-1]);else r.setStart(el,0);if(i<breaks.length)r.setEndBefore(breaks[i]);else r.setEnd(el,el.childNodes.length);
      const f=r.cloneContents();if((f.textContent||'').trim()||f.querySelector('img,svg'))lines.push(f);}
    const list=document.createElement(type==='numbered'?'ol':'ul');list.setAttribute('style','margin:0;padding-left:1.2em');
    for(const f of lines.length?lines:[document.createDocumentFragment()]){const li=document.createElement('li');li.append(f);list.append(li);}
    el.replaceChildren(list);
  }
  // Texts rewritten together gain or lose inner elements (<b>, <li>…): the reloaded slide numbers its elements anew, so
  // the ones after each rewritten text move by the difference (the operations already carry the old numbers).
  function rewrite(list:HTMLElement[],change:(el:HTMLElement)=>void){
    const shifts:{at:number;el:HTMLElement;by:number}[]=[];
    for(const el of list){const before=el.innerHTML,count=el.querySelectorAll('*').length;change(el);markers(el);
      if(el.innerHTML!==before){pending.push({type:'text',index:index(el),html:el.innerHTML});shifts.push({at:index(el),el,by:el.querySelectorAll('*').length-count});}}
    if(shifts.some(x=>x.by))for(const node of document.querySelectorAll<HTMLElement>('[data-esf-edit]')){
      const n=index(node),by=shifts.reduce((sum,x)=>sum+(x.at<n&&!x.el.contains(node)?x.by:0),0);if(by)node.setAttribute('data-esf-edit',String(n+by));}
  }
  function details():SelectionDetails|undefined{
    const el=selection.length===1||texts()?selection[0]:null;if(!el)return;
    // Formatting goes on spans inside the box: without a caret in it, the bar shows the look of its first characters.
    const node=getSelection()?.anchorNode,walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let first:Element|null=null;
    for(let n=walk.nextNode();n&&!first;n=walk.nextNode())if(n.textContent!.trim())first=n.parentElement;
    const text=editing===el&&node?.nodeType===3?node.parentElement:first||el;
    const s=getComputedStyle(el),font=getComputedStyle(text&&el.contains(text)?text:el),style:SelectionDetails['style']={};
    for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','textDecorationLine','verticalAlign','color'] as const)style[key]=font[key];
    for(const key of ['borderWidth','borderColor','borderStyle','backgroundColor','boxShadow','filter','opacity','textAlign','alignContent'] as const)style[key]=s[key];
    // A table cell is aligned vertically by vertical-align (shown as the box alignment).
    if(cellOf(el))style.alignContent=({middle:'center',bottom:'end'} as Record<string,string>)[s.verticalAlign]||'start';
    // Line spacing as a multiple of the box's font size ("normal" is about 1.2).
    style.lineHeight=String(Math.round((parseFloat(s.lineHeight)/(parseFloat(s.fontSize)||1)||1.2)*100)/100);
    if(el.parentElement?.matches('[data-image-shadow]'))style.filter=getComputedStyle(el.parentElement).filter;
    const list=kind(el)==='text'&&!isImage(el)?listOf(el):undefined;
    return{...list&&{list},index:index(el),kind:kind(el)==='link'?'link':kind(el)==='shape'?'shape':kind(el)==='line'?'line':kind(el)==='table'?'table':isImage(el)||kind(el)==='media'?'image':kind(el)==='text'?'text':'box',crop:isImage(el),fonts:[...new Set([...document.fonts].map(f=>f.family.replace(/["']/g,'')))],style};
  }
  // Grouping: two or more objects of the slide (not already exactly one group); ungrouping: the groups in the selection.
  const groupable=()=>{const list=outer();return list.length>1&&free(list).length===list.length&&!(gid(list[0])&&groupOf(list[0]).length===list.length&&list.every(el=>gid(el)===gid(list[0])))?list:null;};
  // Align and distribute treat a group as one object: its members keep their places within it.
  const units=()=>{const out:HTMLElement[][]=[],byId=new Map<string,HTMLElement[]>();for(const el of free(outer())){const id=gid(el);if(!id){out.push([el]);continue;}let u=byId.get(id);if(!u){u=[];byId.set(id,u);out.push(u);}u.push(el);}return out;};
  // The whole selection is exactly one group: it rotates as one.
  const oneGroup=()=>{const list=free(outer()),id=list.length>1?gid(list[0]):'';return id&&list.every(el=>gid(el)===id)&&groupOf(list[0]).length===list.length&&list.every(rotatable)?list:null;};
  const groups=()=>{const ids=new Set(selection.map(gid).filter(Boolean));return ids.size?[...root.querySelectorAll<HTMLElement>('[data-group-id]')].filter(x=>ids.has(gid(x))):[];};
  const state=()=>send('state',{indices:indices(),editing:!!editing,details:details(),group:!!groupable(),ungroup:groups().length>0});
  const flush=()=>{if(!pending.length||gesture||crop||nudged.size)return;send('ops',{ops:pending,indices:indices(),editing:!!editing,range:editing&&savedRange?chars(editing,savedRange):null});pending=[];};
  // Selection, snapping and hit zones use the same object bounds.
  // A cropped image is selected, snapped and resized by its visible part.
  const rect=(el:HTMLElement):DOMRect=>{
    const r=el.getBoundingClientRect(),[t,ri,b,l]=insetOf(el);if(!t&&!ri&&!b&&!l)return r;
    const points=[[l/100,t/100],[1-ri/100,t/100],[l/100,1-b/100],[1-ri/100,1-b/100]].map(([x,y])=>point(el,x,y));
    const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
    return new DOMRect(left,top,Math.max(...points.map(p=>p.x))-left,Math.max(...points.map(p=>p.y))-top);
  };
  function show(d:HTMLElement,r:{left:number;top:number;width:number;height:number}|null,pad=4,turn=0){if(!r){d.style.display='none';return;}Object.assign(d.style,{display:'block',left:r.left-pad+'px',top:r.top-pad+'px',width:r.width+2*pad+'px',height:r.height+2*pad+'px',transform:turn?`rotate(${turn}rad)`:''});}
  // A turned object's outline turns with it: the box through its (visible) corners, rotated around its center.
  function showTurned(d:HTMLElement,el:HTMLElement,pad=4){
    const [t,ri,b,l]=insetOf(el),p0=point(el,l/100,t/100),p1=point(el,1-ri/100,t/100),p2=point(el,l/100,1-b/100),p3=point(el,1-ri/100,1-b/100);
    const w=Math.hypot(p1.x-p0.x,p1.y-p0.y),h=Math.hypot(p2.x-p0.x,p2.y-p0.y),cx=(p0.x+p3.x)/2,cy=(p0.y+p3.y)/2;
    show(d,{left:cx-w/2,top:cy-h/2,width:w,height:h},pad,Math.atan2(p1.y-p0.y,p1.x-p0.x));
  }
  const turned=(el:HTMLElement)=>Math.abs(((screenAngle(el)%360)+540)%360-180)>0.05;
  function place(){
    selection=selection.filter(el=>el.isConnected);placeTable();
    if(crop){
      boxes.forEach(d=>show(d,null));show(group,null);handles.forEach(h=>show(h,null));show(turn,null);show(stem,null);const [t,ri,b,l]=crop.inset;
      const at=(c:string)=>point(crop!.el,c.includes('w')?l/100:c.includes('e')?1-ri/100:(1+l/100-ri/100)/2,c.includes('n')?t/100:c.includes('s')?1-b/100:(1+t/100-b/100)/2);
      const points=['nw','ne','sw','se'].map(at),left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
      show(cropBox,{left,top,width:Math.max(...points.map(p=>p.x))-left,height:Math.max(...points.map(p=>p.y))-top},0);
      cropGrips.forEach(h=>{const p=at(h.dataset.corner!);show(h,{left:p.x-5,top:p.y-5,width:10,height:10},0);});return;
    }
    show(cropBox,null);cropGrips.forEach(h=>show(h,null));
    while(boxes.length<selection.length)boxes.push(edges(ui('sel')));
    const one=selection.length===1&&!fixed(selection[0])?selection[0]:null,image=one&&isImage(one)?one:null,text=one&&!image&&textBox(one)?one:null,box=one&&!image&&!text&&getComputedStyle(one).display!=='inline'?one:null,sized=image||text||box,line=box&&isLine(box)?box:null;
    // A resizable text box shows its real box, the one the handles change.
    boxes.forEach((d,i)=>{const el=selection[i];if(el&&selection.length===1&&turned(el))showTurned(d,el);else show(d,el?(el===text?text.getBoundingClientRect():rect(el)):null);});
    // The rotation handle: a dot on a short stem beyond the middle of the top side, in the object's own direction.
    if(sized&&rotatable(sized)&&!editing){
      const [t,ri,b,l]=insetOf(sized),fx=(1+l/100-ri/100)/2,top=point(sized,fx,t/100),mid=point(sized,fx,(1+t/100-b/100)/2),a=screenAngle(sized)*Math.PI/180;
      let ux=top.x-mid.x,uy=top.y-mid.y;const len=Math.hypot(ux,uy);if(len<1){ux=Math.sin(a);uy=-Math.cos(a);}else{ux/=len;uy/=len;}
      const far=line?18:22,hx=top.x+ux*far,hy=top.y+uy*far;
      show(turn,{left:hx-6,top:hy-6,width:12,height:12},0);
      show(stem,{left:top.x-0.5,top:top.y,width:1,height:Math.max(0,far-6)},0,Math.atan2(uy,ux)-Math.PI/2);
    }else if(oneGroup()&&!editing){
      // A whole group: the dot above its common box; while it turns, the box turns with it (members' boxes do not).
      const g=gesture?.type==='rotate'&&gesture.box?gesture:null,b=g?g.box!:bounds(outer()),a=g?g.delta*Math.PI/180:0,cx=b.left+b.width/2,cy=b.top+b.height/2;
      const at=(x:number,y:number)=>({x:cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),y:cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)});
      const top=at(cx,b.top-4),hand=at(cx,b.top-26);
      show(turn,{left:hand.x-6,top:hand.y-6,width:12,height:12},0);
      show(stem,{left:top.x-0.5,top:top.y,width:1,height:16},0,a+Math.PI);
    }else{show(turn,null);show(stem,null);}
    const turning=gesture?.type==='rotate'&&gesture.box?gesture:null;
    if(turning)show(group,turning.box,4,turning.delta*Math.PI/180);else show(group,selection.length>1?bounds(outer()):null);
    const several=selection.length>1&&!turning&&scalable().length?bounds(outer()):null,sides=several&&!scalable().some(isImage);
    if(several){handles.forEach(h=>{const c=h.dataset.corner!,x=c.includes('w')?several.left:c.includes('e')?several.right:several.left+several.width/2,y=c.includes('n')?several.top:c.includes('s')?several.bottom:several.top+several.height/2;
      show(h,sides||c.length===2?{left:x-5+(c.includes('w')?-4:c.includes('e')?4:0),top:y-5+(c.includes('n')?-4:c.includes('s')?4:0),width:10,height:10}:null,0);});}
    else handles.forEach(h=>{const c=h.dataset.corner!,[t,ri,b,l]=sized?insetOf(sized):[0,0,0,0];
      const p=sized?point(sized,c.includes('w')?l/100:c.includes('e')?1-ri/100:(1+l/100-ri/100)/2,c.includes('n')?t/100:c.includes('s')?1-b/100:(1+t/100-b/100)/2):null;
      show(h,p&&(line?c==='e'||c==='w':text||box||c.length===2)?{left:p.x-5,top:p.y-5,width:10,height:10}:null,0);});
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
      if(isLine(el)&&!dx)continue;
      let w=Math.max(4,m.width+dx),h=isLine(el)?m.height:Math.max(4,m.height+dy);
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
  function select(list:HTMLElement[]){if(crop)endCrop(true);collectNudge();if(editing&&!list.includes(editing))finish();selection=list;
    if(list.length&&list.every(cellOf)&&!(anchorCell&&list.includes(anchorCell)))anchorCell=list[0];show(hover,null);place();state();}
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
  function finish(){const el=editing;if(!el)return;editing=null;savedRange=null;el.removeEventListener('blur',blurText);el.removeAttribute('contenteditable');getSelection()?.removeAllRanges();paint();markers(el);const html=el.innerHTML;if(html!==original)pending.push({type:'text',index:index(el),html});place();state();}
  let savedRange:Range|null=null;
  const highlights=(window as any).CSS?.highlights,Highlight=(window as any).Highlight;
  function paint(){if(!highlights||!Highlight)return;if(editing&&savedRange&&!savedRange.collapsed&&!document.hasFocus())highlights.set('esf-sel',new Highlight(savedRange));else highlights.delete('esf-sel');}
  // Character offsets of the selection inside the edited text, which survive the frame reloads.
  const chars=(el:HTMLElement,r:Range)=>{const before=document.createRange();before.selectNodeContents(el);before.setEnd(r.startContainer,r.startOffset);const start=before.toString().length;before.setEnd(r.endContainer,r.endOffset);return{start,end:before.toString().length};};
  // Line spacing follows the text. Every line is at least as tall as the block's own font size (the browser's strut),
  // so after the text was made smaller its lines kept the spacing of the old size. The block therefore takes the
  // smallest size of its text: one size everywhere → that size on the block and none on the runs; mixed sizes → text
  // that had the block's size keeps it in a span of its own. Blocks holding other blocks (lists) and runs sized
  // in em or % are left as they are. Returns the block's new size, or null when nothing changed.
  function fitBlockSize(el:HTMLElement):string|null{
    if([...el.children].some(c=>c.tagName!=='BR'&&!getComputedStyle(c).display.startsWith('inline')))return null;
    const sizedAncestor=(t:Text)=>{for(let n=t.parentElement;n&&n!==el;n=n.parentElement)if(n.style.fontSize)return n;return null;};
    const texts:Text[]=[],walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);for(let n=walk.nextNode();n;n=walk.nextNode())if((n as Text).length)texts.push(n as Text);
    if(!texts.length)return null;
    const holders=texts.map(sizedAncestor);
    if(holders.some(h=>h&&!/^[\d.]+px$/.test(h.style.fontSize)))return null;
    const own=parseFloat(getComputedStyle(el).fontSize),sizes=holders.map(h=>h?parseFloat(h.style.fontSize):own),low=Math.min(...sizes);
    if(sizes.every(n=>n===low)){
      if(!holders.some(Boolean))return null;
      el.querySelectorAll<HTMLElement>('[style]').forEach(x=>{x.style.removeProperty('font-size');if(!x.getAttribute('style'))x.removeAttribute('style');if(x.tagName==='SPAN'&&!x.attributes.length)x.replaceWith(...x.childNodes);});
    }else{
      if(low>=own)return null;
      texts.forEach((t,i)=>{if(holders[i])return;const span=document.createElement('span');span.style.setProperty('font-size',own+'px','important');t.replaceWith(span);span.append(t);});
    }
    const value=Math.round(low*100)/100+'px';el.style.setProperty('font-size',value,'important');return value;
  }
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
    if(m.type==='group'||m.type==='ungroup'){if(crop)endCrop(true);collectNudge();finish();flush();const list=m.type==='group'?groupable():groups();if(list?.length)send(m.type,{indices:list.map(index)});return;}
    if(m.type==='cropCancel'){endCrop(false);return;}
    // Table actions (format bar): a text being typed is committed first, then the editor changes the table.
    if(m.type==='table'&&typeof m.action==='string'){if(crop)endCrop(true);collectNudge();
      // Selecting rows or columns and sharing their sizes equally need the rendered table: done here.
      const t=selTable();
      if(t&&['selectRow','selectColumn','distributeRows','distributeColumns'].includes(m.action)){
        finish();const g=gridOf(t),n=Math.max(...g.map(r=>r.length)),b=kind(selection[0])==='table'?{r0:0,r1:g.length-1,c0:0,c1:n-1}:spanOf(g,selection.filter(cellOf));if(!b){flush();return;}
        if(m.action==='selectRow'||m.action==='selectColumn'){const sp=spanOf(g,cellsIn(g,m.action==='selectRow'?{...b,c0:0,c1:n-1}:{...b,r0:0,r1:g.length-1}));if(sp)select(cellsIn(g,sp));flush();return;}
        const rowWise=m.action==='distributeRows',sizes=rowWise?rowSizes(t):colSizes(t,g),[from,to]=rowWise?[b.r0,b.r1]:[b.c0,b.c1];
        if(to>from){const avg=sizes.slice(from,to+1).reduce((a,c)=>a+c,0)/(to-from+1);for(let i=from;i<=to;i++)sizes[i]=avg;sizeTable(t,rowWise?null:sizes,rowWise?sizes:null);tableOp(t,rowWise?null:sizes,rowWise?sizes:null);}
        place();state();flush();return;
      }
      finish();flush();send('table',{action:m.action,value:typeof m.value==='string'?m.value:undefined,indices:indices()});return;}
    // Pressed anywhere else in the editor: an edit the bar kept open is committed.
    if(m.type==='release'){held=false;if(crop)endCrop(true);if(editing&&!document.hasFocus()){finish();flush();}return;}
    if(m.type==='style'&&(selection.length===1&&!locked(selection[0])||texts())&&m.style&&typeof m.style==='object'){
      const entries=Object.entries(m.style);
      if(!entries.length||!entries.every(([key,value])=>(['border-width','border-color','border-style','background-color','box-shadow','filter','opacity'].includes(key)||key==='line-height'&&/^[0-5](\.\d{1,2})?$/.test(String(value)))&&typeof value==='string'&&CSS.supports(key,value)))return;
      collectNudge();finish();
      for(const el of texts()||[selection[0]]){for(const [key,value] of entries)el.style.setProperty(key,value as string,'important');pending.push({type:'style',index:index(el),style:m.style as ObjectStyle});}
      place();state();flush();return;
    }
    // Several objects aligned to each other (their common box) or spread with equal gaps (three or more), as in Common.
    if(m.type==='arrange'&&['left','center','right','top','middle','bottom','distributeH','distributeV'].includes(m.value)){
      collectNudge();finish();const items=units();if(items.length<2)return;
      const rects=items.map(bounds),L=Math.min(...rects.map(r=>r.left)),R=Math.max(...rects.map(r=>r.right)),T=Math.min(...rects.map(r=>r.top)),B=Math.max(...rects.map(r=>r.bottom));
      const moves=rects.map(r=>({dx:m.value==='left'?L-r.left:m.value==='center'?(L+R)/2-(r.left+r.right)/2:m.value==='right'?R-r.right:0,dy:m.value==='top'?T-r.top:m.value==='middle'?(T+B)/2-(r.top+r.bottom)/2:m.value==='bottom'?B-r.bottom:0}));
      if(m.value==='distributeH'||m.value==='distributeV'){
        if(items.length<3)return;const h=m.value==='distributeH',order=rects.map((r,i)=>i).sort((a,b)=>h?rects[a].left-rects[b].left:rects[a].top-rects[b].top);
        const size=(r:DOMRect)=>h?r.width:r.height,start=h?L:T,gap=((h?R:B)-start-rects.reduce((sum,r)=>sum+size(r),0))/(items.length-1);let cursor=start;
        for(const i of order){const r=rects[i];if(h)moves[i].dx=cursor-r.left;else moves[i].dy=cursor-r.top;cursor+=size(r)+gap;}
      }
      items.forEach((unit,i)=>{const {dx,dy}=moves[i];if(Math.abs(dx)<0.01&&Math.abs(dy)<0.01)return;
        for(const el of unit){const z=parseFloat(getComputedStyle(el).zoom)||1,d=geometry.inverse(geometry.multiply(matrix(el.parentElement),{a:z,b:0,c:0,d:z}),dx,dy);if(!d)return;
        const [x,y]=offset(el);setPosition(el,x+d.x,y+d.y);const [nx,ny]=offset(el);pending.push({type:'move',index:index(el),x:nx,y:ny});}});
      place();state();flush();return;
    }
    if(m.type==='edit'&&selection.length===1&&kind(selection[0])==='text'&&!isImage(selection[0])){begin(selection[0]);return;}
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
      for(const el of (texts()||outer()).filter(el=>!locked(el)&&(kind(el)==='text'||kind(el)==='link'))){
        let style:ObjectStyle;const d=getComputedStyle(el),v=m.value as string;
        if(m.axis==='x')style={'text-align':v==='start'?'left':v==='end'?'right':'center'};
        else if(cellOf(el))style={'vertical-align':v==='start'?'top':v==='end'?'bottom':'middle'};
        else if(/flex/.test(d.display))style={[d.flexDirection.startsWith('column')?'justify-content':'align-items']:v==='center'?'center':'flex-'+v};
        else if(d.display==='inline')continue;
        else style={'align-content':v};
        for(const [key,value] of Object.entries(style))el.style.setProperty(key,value!,'important');
        pending.push({type:'style',index:index(el),style});
      }
      place();state();flush();return;
    }
    if(m.type!=='format')return;
    if(m.command==='list'){
      const list=(texts()||(selection.length===1&&kind(selection[0])==='text'?selection:[])).filter(el=>listOf(el));if(!list.length)return;
      collectNudge();finish();
      rewrite(list,el=>setList(el,m.value));
      place();state();flush();return;
    }
    // Several texts: each one is formatted whole, all to the same state (bold on or off as the bar asks, not toggled one by one).
    const many=texts();
    if(many){
      collectNudge();finish();
      // An empty text (a table cell) takes the look on itself, so what is typed there later has it.
      const look=emptyLook(m),blank=look?many.filter(el=>!(el.textContent||'').trim()&&!el.querySelector('img,svg')):[];
      for(const el of blank){for(const [k,v] of Object.entries(look!))el.style.setProperty(k,v!,'important');pending.push({type:'style',index:index(el),style:look!});}
      rewrite(many.filter(el=>!blank.includes(el)),el=>{
        el.setAttribute('contenteditable','true');el.focus({preventScroll:true});
        const sel=getSelection()!,r=document.createRange();r.selectNodeContents(el);sel.removeAllRanges();sel.addRange(r);
        if(['bold','italic','underline','strikeThrough'].includes(m.command)){if(document.queryCommandState(m.command)!==!!m.on)document.execCommand(m.command,false);}
        else if(m.command==='subscript'||m.command==='superscript')for(const c of ['subscript','superscript']){if(document.queryCommandState(c)!==(m.script===c.slice(0,-6)))document.execCommand(c,false);}
        else formatRange(el,sel,m);
        sel.removeAllRanges();el.removeAttribute('contenteditable');el.blur();
      });
      place();state();flush();return;
    }
    if(selection.length!==1||kind(selection[0])!=='text')return;
    const el=selection[0];if(editing!==el){begin(el);if(m.range&&Number.isInteger(m.range.start)&&Number.isInteger(m.range.end))selectChars(el,m.range.start,m.range.end);}
    const sel=getSelection()!;if(savedRange&&el.contains(savedRange.commonAncestorContainer)){sel.removeAllRanges();sel.addRange(savedRange);}
    // Without a selection the whole text is formatted.
    if(!sel.rangeCount||sel.isCollapsed){const r=document.createRange();r.selectNodeContents(el);sel.removeAllRanges();sel.addRange(r);}
    if(['bold','italic','underline','strikeThrough','subscript','superscript'].includes(m.command))document.execCommand(m.command,false);
    else formatRange(el,sel,m);
    // Commit now (one undoable slide edit); the reloaded frame resumes the edit with the same characters selected.
    markers(el);const range=sel.rangeCount?chars(el,sel.getRangeAt(0)):null,html=el.innerHTML;
    if(html!==original)pending.push({type:'text',index:index(el),html});original=html;
    if(pending.length){send('ops',{ops:pending,indices:indices(),editing:true,range});pending=[];}
    savedRange=sel.rangeCount?sel.getRangeAt(0).cloneRange():null;paint();
  });
  const emptyLook=(m:any):ObjectStyle|null=>{const v=typeof m.value==='string'?m.value:'';
    return m.command==='bold'?{'font-weight':m.on?'700':'400'}:m.command==='italic'?{'font-style':m.on?'italic':'normal'}:m.command==='underline'?{'text-decoration-line':m.on?'underline':'none'}:m.command==='strikeThrough'?{'text-decoration-line':m.on?'line-through':'none'}
      :m.command==='color'&&/^#[\da-f]{3,8}$/i.test(v)?{color:v}:m.command==='fontFamily'&&/^[\w\s"',-]{1,200}$/.test(v)?{'font-family':v}:m.command==='fontSize'&&/^\d{1,4}(\.\d{1,2})?px$/.test(v)?{'font-size':v}:null;};
  // Text alignment, color, font and size on the selected characters of one text.
  function formatRange(el:HTMLElement,sel:Selection,m:any){
    if(['justifyLeft','justifyCenter','justifyRight','justifyFull'].includes(m.command)){
      const value=({justifyLeft:'left',justifyCenter:'center',justifyRight:'right',justifyFull:'justify'} as Record<string,string>)[m.command];
      el.style.setProperty('text-align',value,'important');
      pending.push({type:'style',index:index(el),style:{'text-align':value}});
    }
    else if(['color','fontFamily','fontSize'].includes(m.command)&&typeof m.value==='string'){
      // Each selected run of text gets the property (its own span, or a span holding only it), never a span around
      // blocks: wrapping list items would split them into new items (markers follow their text: Common's EdukorsListMarkers).
      const prop=m.command==='color'?'color':m.command==='fontFamily'?'font-family':'font-size',r=sel.getRangeAt(0),runs:Text[]=[];
      const all:Text[]=[],walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);for(let n=walk.nextNode();n;n=walk.nextNode())all.push(n as Text);
      for(const n of all.filter(n=>n.length&&r.intersectsNode(n))){
        const start=n===r.startContainer?r.startOffset:0,end=n===r.endContainer?r.endOffset:n.length;if(start>=end)continue;
        let t=n;if(end<t.length)t.splitText(end);if(start>0)t=t.splitText(start);runs.push(t);
      }
      if(!runs.length)return;
      for(const t of runs){const p=t.parentElement;
        if(p&&p!==el&&p.tagName==='SPAN'&&p.childNodes.length===1)p.style.setProperty(prop,m.value,'important');
        else{const span=document.createElement('span');span.style.setProperty(prop,m.value,'important');t.replaceWith(span);span.append(t);}}
      el.querySelectorAll('span,b,i,u,s,strike,strong,em,font').forEach(x=>{if(!x.textContent&&!x.querySelector('img,br,svg'))x.remove();});
      r.setStart(runs[0],0);r.setEnd(runs.at(-1)!,runs.at(-1)!.length);sel.removeAllRanges();sel.addRange(r);
      if(m.command==='fontSize'){
        const keep=chars(el,r),size=fitBlockSize(el);
        if(size){pending.push({type:'style',index:index(el),style:{'font-size':size}});selectChars(el,keep.start,keep.end);}
      }
    }
  }
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
  function release(pointer:number){if(html.hasPointerCapture(pointer))html.releasePointerCapture(pointer);cursor('');clearGuides();tip.style.display='none';}
  // While moving or resizing: the position (top, left) or the size (height, width) in slide units (1600 × 900), always just
  // outside the object (or the group): above it when moving; past the dragged side when resizing; the other side when there is no room.
  function readout(e:PointerEvent,g:NonNullable<typeof gesture>){
    const v=root.getBoundingClientRect(),k=v.width/1600||1,n=(x:number)=>Math.round(x);
    if(g.type!=='move'&&g.type!=='resize'&&g.type!=='scale'&&g.type!=='rotate'){tip.style.display='none';return;}
    const b=g.type==='resize'?rect(g.item.el):g.type==='rotate'?bounds(g.items.map(i=>i.item.el)):bounds(g.items.map(i=>i.el));let text:string;
    if(g.type==='rotate')text=`${Math.round(((g.shown+g.delta)%360+360)%360)%360}°`;
    else if(g.type==='move')text=`${n((b.top-v.top)/k)}, ${n((b.left-v.left)/k)}`;
    else if(g.type==='resize'){const z=size(g.item.el);text=`${n(z.height)}, ${n(z.width)}`;}
    else text=`${n(b.height/k)}, ${n(b.width/k)}`;
    tip.textContent=text;tip.style.display='block';
    const w=tip.offsetWidth,h=tip.offsetHeight,gap=10,W=innerWidth,H=innerHeight,c=g.type==='move'||g.type==='rotate'?'':g.corner;
    const ax=c.includes('e')?b.right-w:c.includes('w')?b.left:g.type==='move'||g.type==='rotate'?b.left:b.left+(b.width-w)/2,ay=c&&!/[ns]/.test(c)?e.clientY-h/2:b.top;
    const sides={above:[ax,b.top-h-gap],below:[ax,b.bottom+gap],right:[b.right+gap,ay],left:[b.left-w-gap,ay]} as Record<string,number[]>;
    const order=c.includes('n')?['above','below','right','left']:c.includes('s')?['below','above','right','left']:c==='e'?['right','left','below','above']:c==='w'?['left','right','below','above']:['above','below','right','left'];
    const fits=(side:string)=>{const [x,y]=sides[side];return side==='above'||side==='below'?y>=2&&y+h<=H-2:x>=2&&x+w<=W-2;};
    const [x,y]=sides[order.find(fits)||order[0]];
    Object.assign(tip.style,{left:Math.max(2,Math.min(W-w-2,x))+'px',top:Math.max(2,Math.min(H-h-2,y))+'px'});
  }
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
  // From a cell of a table, a press on another cell of it goes straight to that cell.
  function target(chain:HTMLElement[]){let k=chain.length-1;while(k>=0&&!selection.includes(chain[k]))k--;
    const cell=chain.at(-1);if(k<0&&cellOf(cell)&&selection.some(el=>cellOf(el)&&sameTable(el,cell)))return cell;
    return k<0?entry(chain):chain[k+1]||chain[k];}
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
    const tk=tableUiKind(t),ti=Number((t as HTMLElement).dataset?.i),tt=tk?selTable():null;
    if(tt&&(tk==='tpickc'||tk==='tpickr')){
      e.preventDefault();const g=gridOf(tt),n=Math.max(...g.map(r=>r.length));let b:Span=tk==='tpickc'?{r0:0,r1:g.length-1,c0:ti,c1:ti}:{r0:ti,r1:ti,c0:0,c1:n-1};
      const cur=e.shiftKey?spanOf(g,selection.filter(cellOf)):null;if(cur)b=tk==='tpickc'?{...b,c0:Math.min(cur.c0,ti),c1:Math.max(cur.c1,ti)}:{...b,r0:Math.min(cur.r0,ti),r1:Math.max(cur.r1,ti)};
      const sp=spanOf(g,cellsIn(g,b));select(sp?cellsIn(g,sp):[]);flush();return;
    }
    if(tt&&(tk==='tcol'||tk==='trow')){
      e.preventDefault();collectNudge();finish();const cg=tt.querySelector<HTMLElement>(':scope>colgroup'),sizes=tk==='tcol'?colSizes(tt):rowSizes(tt);
      capture(e,{type:'table',axis:tk==='tcol'?'col':'row',table:tt,i:ti,sizes,now:sizes.slice(),style:tt.getAttribute('style'),rowStyles:[...tt.rows].map(tr=>tr.getAttribute('style')),colStyles:cg?[...cg.children].map(c=>c.getAttribute('style')):[],pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false});
      cursor(tk==='tcol'?'col-resize':'row-resize');return;
    }
    if(t===turn&&selection.length){
      const list=selection.length===1?[selection[0]]:oneGroup();if(!list)return;
      e.preventDefault();collectNudge();finish();const box=list.length>1?bounds(list):null,c=box?{x:box.left+box.width/2,y:box.top+box.height/2}:point(list[0],.5,.5);
      const items=list.map(el=>{const p=point(el,.5,.5),own=ownAngle(el);return{item:snapshot(el),own,angle:own,cx:p.x,cy:p.y};});
      // A group shows how much it turned in this gesture; one object, its angle on screen.
      capture(e,{type:'rotate',items,box,cx:c.x,cy:c.y,start:Math.atan2(e.clientY-c.y,e.clientX-c.x),shown:box?0:screenAngle(list[0]),delta:0,pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false});cursor('grabbing');return;
    }
    if(handles.includes(t as HTMLDivElement)&&selection.length===1){
      e.preventDefault();collectNudge();finish();const el=selection[0],m=measure(el),corner=(t as HTMLElement).dataset.corner!,[it,ir,ib,il]=insetOf(el);
      const fx=corner.includes('w')?1-ir/100:il/100,fy=corner.includes('n')?1-ib/100:it/100;
      const tbl=kind(el)==='table'?el as HTMLTableElement:null;
      capture(e,{type:'resize',rows:tbl&&[...tbl.rows].some(tr=>tr.style.height)?rowSizes(tbl):null,rowStyles:tbl?[...tbl.rows].map(tr=>tr.getAttribute('style')):[],item:snapshot(el),frac:[(100-il-ir)/100,(100-it-ib)/100],corner,text:textBox(el),free:!isImage(el),pointer:e.pointerId,x:e.clientX,y:e.clientY,width:m.width,height:m.height,matrix:m.matrix,anchor:point(el,fx,fy),fx,fy,moved:false});return;
    }
    if(handles.includes(t as HTMLDivElement)&&selection.length>1){
      const list=scalable();if(!list.length)return;e.preventDefault();collectNudge();finish();
      const items=list.map(el=>{const r=rect(el);return{...snapshot(el),...size(el),text:textBox(el),image:isImage(el),cx:r.left+r.width/2,cy:r.top+r.height/2};});
      capture(e,{type:'scale',items,rect:bounds(list),corner:(t as HTMLElement).dataset.corner!,free:!list.some(isImage),pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false});return;
    }
    if(t.hasAttribute('data-esf-edge')){startDrag(e,outer(),null);cursor('move');return;}
    const chain=chainOf(under(t,e.clientX,e.clientY));let k=chain.length-1;while(k>=0&&!selection.includes(chain[k]))k--;
    // Objects poking out of the slide (an entrance animation's start position, a slide-wide SVG) count by their visible part.
    const bandTargets=()=>{const v=root.getBoundingClientRect();return free(tops()).flatMap(el=>{const b=rect(el),l=Math.max(b.left,v.left),t=Math.max(b.top,v.top),r=Math.min(b.right,v.right),d=Math.min(b.bottom,v.bottom);return r>l&&d>t?[{el,r:new DOMRect(l,t,r-l,d-t)}]:[];});};
    // The band selects only the slide's own objects: layout fields (text-only, fixed) and master/layout objects stay unmarked.
    if(!chain.length){e.preventDefault();select(e.shiftKey||e.metaKey||e.ctrlKey?selection:[]);capture(e,{type:'band',x:e.clientX,y:e.clientY,keep:selection.slice(),before,targets:bandTargets(),pointer:e.pointerId,moved:false});return;}
    if(e.shiftKey||e.metaKey||e.ctrlKey){
      const el=k>=0?chain[k]:target(chain);
      // ⇧ on a cell selects the cells between it and the first one picked.
      if(e.shiftKey&&cellOf(el)&&anchorCell?.isConnected&&cellOf(anchorCell)&&sameTable(anchorCell,el)){e.preventDefault();const a=anchorCell;select(rangeOf(a,el));anchorCell=a;flush();return;}
      if(selection.includes(el)){startDrag(e,outer(),null,before,el);return;}
      const add=groupOf(el);select([...selection.filter(x=>!add.some(a=>x.contains(a)||a.contains(x))),...add]);startDrag(e,outer(),null,before);return;
    }
    const picked=target(chain);
    const set=k<0?groupOf(picked):[picked];
    if(!(k>=0&&selection.length>1)&&set.length<2&&textInterior(picked,e)){
      if(editing!==picked){finish();select([picked]);begin(picked,e.clientX,e.clientY);}cursor('text');return;
    }
    if(k>=0){startDrag(e,outer(),selection.length===1&&kind(picked)==='text'?null:{chain,k});return;}
    select(set);startDrag(e,set,null,before);
  },true);
  // Right click selects the object under the pointer (keeping a selection that contains it) and asks the editor for the menu.
  // It opens on the press (the contextmenu event is not always delivered to the frame); Ctrl+click is a right click on macOS.
  addEventListener('contextmenu',e=>e.preventDefault(),true);
  function context(t:EventTarget|null,x:number,y:number){
    if(gesture||crop||!(t instanceof Element))return;
    if(!handles.includes(t as HTMLDivElement)&&t!==turn&&!t.hasAttribute('data-esf-edge')){
      const chain=chainOf(under(t,x,y));if(!chain.length){select([]);flush();send('context',{x,y,text:false,count:0});return;}
      if(!chain.some(el=>selection.includes(el)))select(groupOf(target(chain)));
    }
    if(selection.length)send('context',{x,y,text:outer().some(el=>kind(el)==='text'||kind(el)==='link'),count:free(outer()).length,units:units().length});
  }
  function updateGesture(e:PointerEvent){
    const g=gesture;if(!g||e.pointerId!==g.pointer)return;
    let dx=e.clientX-g.x,dy=e.clientY-g.y;
    if(!g.moved&&Math.hypot(dx,dy)<(g.type==='resize'||g.type==='rotate'?3:4))return;
    g.moved=true;show(hover,null);
    if(g.type==='table'){
      // A column border moves between its two columns (the table keeps its width); a row border sets that row's height.
      const t=g.table,s=t.getBoundingClientRect().width/(t.offsetWidth||1),d=(g.axis==='col'?dx:dy)/s,w=g.sizes.slice();
      if(g.axis==='col'){const a=g.i-1,b=g.i,k=Math.max(-(w[a]-24),Math.min(w[b]-24,d));w[a]+=k;w[b]-=k;sizeTable(t,w,null);}
      else{w[g.i]=Math.max(20,w[g.i]+d);sizeTable(t,null,w);}
      g.now=w;place();return;
    }
    if(g.type==='rotate'){
      // Shift turns in steps of 15°; otherwise the angle settles on the nearest multiple of 90° within 3° (Alt: never).
      const delta=(Math.atan2(e.clientY-g.cy,e.clientX-g.cx)-g.start)*180/Math.PI;let shown=g.shown+delta;
      if(e.shiftKey)shown=Math.round(shown/15)*15;else if(!e.altKey){const q=Math.round(shown/90)*90;if(Math.abs(shown-q)<3)shown=q;}
      g.delta=shown-g.shown;const r=g.delta*Math.PI/180;
      for(const it of g.items){const el=it.item.el,own=it.own+g.delta;it.angle=Math.round((((own%360)+540)%360-180)*10)/10;
        restore(el,it.item.style);el.style.setProperty('rotate',`${it.angle}deg`,'important');if(!g.box)continue;
        // The member's center goes around the group's center by the same angle.
        const x=g.cx+(it.cx-g.cx)*Math.cos(r)-(it.cy-g.cy)*Math.sin(r),y=g.cy+(it.cx-g.cx)*Math.sin(r)+(it.cy-g.cy)*Math.cos(r),now=point(el,.5,.5),d=geometry.inverse(it.item.parent,x-now.x,y-now.y);
        if(d)setPosition(el,it.item.base[0]+d.x,it.item.base[1]+d.y);}
      cursor('grabbing');
    }else if(g.type==='crop'){
      if(!crop)return;const local=geometry.inverse(g.matrix,dx,dy);if(!local)return;
      dx=local.x/g.width*100;dy=local.y/g.height*100;
      const [t,ri,b,l]=g.base,min=5,clamp=(v:number,hi:number)=>Math.max(0,Math.min(hi,v));
      if(!g.corner){const x=clamp(l+dx,l+ri),y=clamp(t+dy,t+b);crop.inset=[y,l+ri-x,t+b-y,x];}
      else crop.inset=[g.corner.includes('n')?clamp(t+dy,100-b-min):t,g.corner.includes('e')?clamp(ri-dx,100-l-min):ri,g.corner.includes('s')?clamp(b-dy,100-t-min):b,g.corner.includes('w')?clamp(l+dx,100-ri-min):l];
    }else if(g.type==='resize'){
      const local=geometry.inverse(g.matrix,dx,dy);if(!local)return;
      const next=resize(g.width,g.height,local.x/g.frac[0],local.y/g.frac[1],g.corner,g.free||e.shiftKey),{el,base,parent}=g.item;
      setBox(el,next.width,next.height,base[0],base[1],g.text);
      // A table with row heights of its own: they share the new height in their proportions.
      if(g.rows){const k=next.height/(g.rows.reduce((a,b)=>a+b,0)||1);sizeTable(el as HTMLTableElement,null,g.rows.map(h=>h*k));}
      // Fix the opposite VISIBLE corner after layout reflow, text wrapping and transform-origin changes.
      const current=point(el,g.fx,g.fy),delta=geometry.inverse(parent,g.anchor.x-current.x,g.anchor.y-current.y);
      if(delta)setPosition(el,base[0]+delta.x,base[1]+delta.y);
    }else if(g.type==='scale'){
      const next=resize(g.rect.width,g.rect.height,dx,dy,g.corner,g.free||e.shiftKey),sx=next.width/g.rect.width,sy=next.height/g.rect.height;
      const ax=g.corner.includes('w')?g.rect.right:g.rect.left,ay=g.corner.includes('n')?g.rect.bottom:g.rect.top;
      for(const item of g.items){
        // Images keep their proportion (with Shift the group may stretch; each image then takes the mean scale).
        const kx=item.image?Math.sqrt(sx*sy):sx,ky=item.image?kx:isLine(item.el)?1:sy;
        setBox(item.el,Math.max(4,item.width*kx),Math.max(4,item.height*ky),item.base[0],item.base[1],item.text);
        const r=rect(item.el),d=geometry.inverse(item.parent,ax+(item.cx-ax)*sx-(r.left+r.width/2),ay+(item.cy-ay)*sy-(r.top+r.height/2));
        if(d)setPosition(item.el,item.base[0]+d.x,item.base[1]+d.y);
      }
    }else if(g.type==='band'){
      // The slide fills the canvas edge to edge: near an edge, the band reaches it (objects cut off there count).
      const v=root.getBoundingClientRect(),near=(a:number,b:number)=>Math.abs(a-b)<=8?b:a;
      const x0=near(Math.min(e.clientX,g.x),v.left),y0=near(Math.min(e.clientY,g.y),v.top),x1=near(Math.max(e.clientX,g.x),v.right),y1=near(Math.max(e.clientY,g.y),v.bottom);
      const r={left:x0,top:y0,width:x1-x0,height:y1-y0};show(band,r,0);
      const inside=g.targets.filter(({r:b})=>b.left>=r.left&&b.top>=r.top&&b.right<=r.left+r.width&&b.bottom<=r.top+r.height).map(t=>t.el);
      selection=[...g.keep,...inside.filter(el=>!g.keep.some(k=>k===el||k.contains(el)||el.contains(k)))];
    }else{
      const mg=g as MoveGesture;cursor('move');const locked=e.shiftKey?(Math.abs(dx)>=Math.abs(dy)?'y':'x'):null;
      [dx,dy]=snap(mg,dx,dy,locked,e.altKey);
      for(const item of mg.items){let x=dx,y=dy;if(fixed(item.el))continue;
        if(item.inline){item.el.style.setProperty('display','inline-block','important');setPosition(item.el,item.base[0],item.base[1]);const r=item.el.getBoundingClientRect();x+=item.bounds.left-r.left;y+=item.bounds.top-r.top;}
        const local=geometry.inverse(item.parent,x,y);if(!local)continue;
        setPosition(item.el,item.base[0]+local.x,item.base[1]+local.y);
      }
    }
    place();readout(e,g);
  }
  function endGesture(commit:boolean,e?:PointerEvent){
    if(!gesture||e&&gesture.pointer!==e.pointerId)return;
    if(commit&&e)updateGesture(e); // Pointerup may carry a final position without a preceding pointermove.
    const g=gesture;gesture=null;release(g.pointer);
    if(g.type==='table'){
      const t=g.table;
      if(commit&&g.moved)tableOp(t,g.axis==='col'?g.now:null,g.axis==='row'?g.now:null);
      else{restore(t,g.style);[...t.rows].forEach((tr,i)=>restore(tr,g.rowStyles[i]??null));const cg=t.querySelector<HTMLElement>(':scope>colgroup');if(cg?.hasAttribute('data-esf-new'))cg.remove();else if(cg)[...cg.children].forEach((c,i)=>restore(c as HTMLElement,g.colStyles[i]??null));}
      place();state();flush();return;
    }
    if(g.type==='crop'){if(!commit&&crop)crop.inset=g.base;place();return;}
    if(g.type==='rotate'){
      const done=commit&&g.moved&&Math.abs(g.delta)>.05;
      for(const it of g.items){const el=it.item.el;if(!done){restore(el,it.item.style);continue;}
        pending.push({type:'rotate',index:index(el),angle:it.angle});if(g.box){const [x,y]=offset(el);pending.push({type:'move',index:index(el),x,y});}}
      place();state();flush();return;
    }
    if(g.type==='resize'){
      const {el,style}=g.item;
      if(commit&&g.moved){const [x,y]=offset(el);pending.push({type:'resize',index:index(el),width:parseFloat(el.style.width),height:parseFloat(g.text?el.style.minHeight:el.style.height),x,y,...g.text?{fit:true}:{}});
        if(g.rows)tableOp(el as HTMLTableElement,null,[...(el as HTMLTableElement).rows].map(tr=>parseFloat(tr.style.height)||tr.offsetHeight));}
      else{restore(el,style);if(g.rows)[...(el as HTMLTableElement).rows].forEach((tr,i)=>restore(tr,g.rowStyles[i]??null));}
    }else if(g.type==='scale'){
      for(const {el,style,text} of g.items){if(commit&&g.moved){const [x,y]=offset(el);pending.push({type:'resize',index:index(el),width:parseFloat(el.style.width),height:parseFloat(text?el.style.minHeight:el.style.height),x,y,...text?{fit:true}:{}});}else restore(el,style);}
    }else if(g.type==='band'){selection=commit?withGroups(selection):g.before;show(band,null);}
    else if(!commit){(g as MoveGesture).items.forEach(({el,style})=>restore(el,style));selection=(g as MoveGesture).before;}
    else if(g.moved){for(const {el,base,style,inline} of g.items){const [x,y]=offset(el);if(Math.abs(x-base[0])>.001||Math.abs(y-base[1])>.001)pending.push({type:'move',index:index(el),x,y,...inline?{inline:true}:{}});else restore(el,style);}}
    else if(g.toggle)select(selection.filter(el=>el!==g.toggle));
    else if(g.click){
      const {chain,k}=g.click,multi=selection.length>1,el=multi?chain[Math.max(k,0)]:k<0?entry(chain):imageIn(chain.slice(k+1))||chain[k+1]||chain[k];
      if(multi||selection[0]!==el)select([el]);
      if(e&&!multi&&textInterior(el,e)&&editing!==el)begin(el,e.clientX,e.clientY);
    }
    place();state();flush();
  }
  addEventListener('pointermove',e=>{
    // A move without the button means the release went elsewhere: it still ends the gesture where the pointer is.
    if(gesture){if(e.pointerId===gesture.pointer){if(!(e.buttons&1)){endGesture(true,e);return;}updateGesture(e);}return;}
    if(crop)return;
    // Dragging from a cell being edited into another cell selects the cells between them.
    if(e.buttons===1&&(cellRange||editing&&cellOf(editing))){
      const a=cellRange||editing!,p=e.composedPath()[0],c=p instanceof Element?chainOf(under(p,e.clientX,e.clientY)).at(-1):null;
      if(c&&cellOf(c)&&sameTable(a,c)&&(cellRange||c!==a)){if(editing)finish();cellRange=a;select(rangeOf(a,c));anchorCell=a;cursor('cell');return;}
      if(cellRange)return;
    }
    if(editing&&e.buttons===1){cursor('text');return;}
    const t=e.composedPath()[0];if(!(t instanceof Element))return;
    if(handles.includes(t as HTMLDivElement)||t===turn||tableUiKind(t)){cursor('');show(hover,null);return;}
    if(t.hasAttribute('data-esf-edge')){cursor('move');show(hover,null);return;}
    const chain=chainOf(under(t,e.clientX,e.clientY)),selected=chain.find(el=>selection.includes(el)),next=selection.length>1&&selected?selected:target(chain);
    show(hover,next&&!selection.includes(next)?rect(next):null,2);cursor(next?(selection.length>1&&selected?'move':textInterior(next,e)?'text':'move'):'');
  },true);
  addEventListener('pointerup',e=>{if(cellRange){cellRange=null;cursor('');}if(gesture)endGesture(true,e);else flush();},true);
  // Only Esc cancels a gesture. A lost capture or focus, a cancelled pointer or a resize keeps what was dragged so far
  // (the object never jumps back when the button is released).
  addEventListener('pointercancel',e=>{if(gesture?.pointer===e.pointerId)endGesture(true);},true);
  addEventListener('lostpointercapture',e=>{if(gesture?.pointer===e.pointerId&&!html.hasPointerCapture(e.pointerId))endGesture(true);},true);
  addEventListener('blur',()=>{endGesture(true);collectNudge();flush();});
  addEventListener('pointerleave',()=>{show(hover,null);if(!gesture)cursor('');});
  // Double click goes straight to the innermost text.
  addEventListener('dblclick',e=>{const t=e.target as Element;if(editing?.contains(t))return;const el=chainOf(under(t,e.clientX,e.clientY)).at(-1);if(el&&kind(el)==='text'&&!isImage(el)){select([el]);begin(el,e.clientX,e.clientY);}});
  addEventListener('click',e=>{if((e.target as Element).closest('a'))e.preventDefault();});
  addEventListener('dragstart',e=>e.preventDefault());addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect=e.dataTransfer.types.includes('Files')?'copy':'none';});
  // Files dropped on the slide (images) go to the editor, which inserts them.
  addEventListener('drop',e=>{e.preventDefault();const files=[...(e.dataTransfer?.files||[])];if(files.length)send('files',{files});});
  addEventListener('keydown',e=>{
    // The window's shortcuts (save, duplicate, copy objects, present…) reach the editor, which has no menu bar for
    // them; the frame keeps select all and, while a text is edited, the text's own editing keys.
    if((e.metaKey||e.ctrlKey)&&!crop&&!gesture&&!/^(Meta|Control|Shift|Alt)$/.test(e.key)&&!e.key.startsWith('Arrow')&&!(editing?['a','b','i','u','c','x','v','z','y']:['a']).includes(e.key.toLowerCase())){
      e.preventDefault();send('key',{key:e.key,code:e.code,meta:e.metaKey,ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey});return;
    }
    if(crop){if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();endCrop(e.key==='Enter');}return;}
    if(gesture){if(e.key==='Escape'){e.preventDefault();cancel();}return;}
    if(editing){
      if(e.key==='Escape'){e.preventDefault();finish();place();flush();}
      // In a table, Tab and Shift+Tab go to the next and previous cell. The text is committed later (no frame reload
      // here, which would lose what is typed right after Tab).
      else if(e.key==='Tab'&&!e.metaKey&&!e.ctrlKey&&cellOf(editing)){e.preventDefault();const cells=tableCells(editing),next=cells[cells.indexOf(editing)+(e.shiftKey?-1:1)];if(next){finish();select([next]);begin(next);}}
      // Every new line is a <br>, the same structure the saved text uses.
      else if(e.key==='Enter'&&!e.metaKey&&!e.ctrlKey){
        // In a list item, Enter starts the next item (the browser's own behavior); Shift+Enter is a line inside it.
        const n=getSelection()?.anchorNode,item=(n?.nodeType===1?n as Element:n?.parentElement)?.closest('li');
        if(!e.shiftKey&&item&&editing.contains(item))return;
        e.preventDefault();document.execCommand('insertLineBreak');}
      else if((e.metaKey||e.ctrlKey)&&/^[biu]$/i.test(e.key))return;
      return;
    }
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'){e.preventDefault();select(free(tops()));flush();return;}
    if(e.key==='Tab'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();const all=tops(),at=all.indexOf(selection[0]),el=all[at<0?(e.shiftKey?all.length-1:0):(at+(e.shiftKey?-1:1)+all.length)%all.length];if(el)select([el]);flush();return;}
    if(selection.length&&e.key.startsWith('Arrow')){e.preventDefault();arrow(e.key,e.shiftKey,e.metaKey||e.ctrlKey);return;}
    if(!selection.length||e.metaKey||e.ctrlKey)return;
    if((e.key==='Delete'||e.key==='Backspace')&&selection.every(cellOf)){e.preventDefault();for(const el of selection)if(el.innerHTML){el.innerHTML='';pending.push({type:'text',index:index(el),html:''});}place();state();flush();return;}
    if(e.key==='Enter'&&selection.length===1&&kind(selection[0])==='table'){const first=selection[0].querySelector<HTMLElement>('td,th');if(first&&cellOf(first)){e.preventDefault();select([first]);begin(first);return;}}
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();free(outer()).forEach(el=>pending.push({type:'delete',index:index(el)}));select([]);flush();}
    else if(e.key==='Escape'){e.preventDefault();select([]);flush();}
    else if(e.key==='Enter'&&selection.length===1&&kind(selection[0])==='text'&&!isImage(selection[0])){e.preventDefault();begin(selection[0]);}
  });
  addEventListener('keyup',e=>{if(e.key.startsWith('Arrow'))arrowUp();});
  // Pasting into a text keeps the copied look of the characters (font, size, weight, color…), not the page's markup:
  // only text, line breaks and spans with those properties go in; plain text goes in as it is.
  const pasteLook=['font-family','font-size','font-weight','font-style','color','text-decoration-line','text-decoration-color','text-decoration-style','letter-spacing','word-spacing','text-transform','text-shadow','vertical-align'];
  function pasteHtml(html:string){
    const src=new DOMParser().parseFromString(html,'text/html'),out=document.createDocumentFragment();
    const walk=(node:Node,into:Node)=>{for(const c of [...node.childNodes]){
      if(c.nodeType===3){into.appendChild(document.createTextNode(c.textContent||''));continue;}if(c.nodeType!==1)continue;
      const el=c as HTMLElement,tag=el.tagName;if(/^(SCRIPT|STYLE|TEMPLATE|IFRAME|OBJECT|EMBED|NOSCRIPT|META|LINK|HEAD|TITLE|IMG|SVG|VIDEO|AUDIO|CANVAS)$/.test(tag))continue;
      if(tag==='BR'){into.appendChild(document.createElement('br'));continue;}
      if(/^(DIV|P|LI|H[1-6]|TR|BLOCKQUOTE|PRE)$/.test(tag)&&into.lastChild&&into.lastChild.nodeName!=='BR'&&(into.textContent||'').trim())into.appendChild(document.createElement('br'));
      const span=document.createElement('span'),st=el.style;for(const k of pasteLook){const v=st.getPropertyValue(k);if(v&&!/url\(|var\(|expression/i.test(v))span.style.setProperty(k,v);}
      if(/^(B|STRONG)$/.test(tag)&&!span.style.fontWeight)span.style.fontWeight='700';if(/^(I|EM)$/.test(tag)&&!span.style.fontStyle)span.style.fontStyle='italic';
      if(tag==='U'&&!span.style.textDecorationLine)span.style.textDecorationLine='underline';if(/^(S|STRIKE|DEL)$/.test(tag)&&!span.style.textDecorationLine)span.style.textDecorationLine='line-through';
      if(tag==='SUB'&&!span.style.verticalAlign)span.style.verticalAlign='sub';if(tag==='SUP'&&!span.style.verticalAlign)span.style.verticalAlign='super';
      if(span.getAttribute('style')){walk(el,span);into.appendChild(span);}else walk(el,into);
    }};
    walk(src.body,out);while(out.lastChild?.nodeName==='BR')out.lastChild.remove();
    const box=document.createElement('div');box.appendChild(out);return box.innerHTML;
  }
  addEventListener('paste',e=>{if(!editing)return;e.preventDefault();
    const html=e.clipboardData?.getData('text/html')||'',clean=html?pasteHtml(html):'';
    if(clean&&/<span/.test(clean)){document.execCommand('insertHTML',false,clean);return;}
    (e.clipboardData?.getData('text/plain')||'').split(/\r?\n/).forEach((l,i)=>{if(i)document.execCommand('insertLineBreak');if(l)document.execCommand('insertText',false,l);});});
  addEventListener('resize',()=>{if(gesture)endGesture(true);place();});new ResizeObserver(place).observe(html);document.fonts.ready.then(place);
  root.addEventListener('load',place,true);addEventListener('esf-slide-ready',place);
  // Structural edits and undo/redo reload the frame and restore its selection.
  const initial=config.select.map(i=>document.querySelector<HTMLElement>(`[data-esf-edit="${i}"]`)).filter((el):el is HTMLElement=>!!el);
  select(initial);if(config.editing&&initial.length===1&&kind(initial[0])==='text'){begin(initial[0]);if(config.range&&config.range.end>config.range.start)selectChars(initial[0],config.range.start,config.range.end);paint();}
}
