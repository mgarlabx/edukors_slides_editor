import type {Slide} from './model';
import {editIndex} from './edit';

// A table is one object (<table data-manual="table">, moved, resized and rotated as a box); each cell is a text of its
// own, edited on the canvas. Its height is a minimum: rows grow with their text. Row and column changes work on the
// table's grid (each position → the cell covering it), rebuilt into rows afterwards, so merged cells stay rectangles.
export const tableActions=['addRowBefore','addRowAfter','addColumnBefore','addColumnAfter','deleteRow','deleteColumn','mergeCells','splitCell','toggleHeaderRow','deleteTable'] as const;
export type TableAction=typeof tableActions[number];
// Every cell has the same minimum height (one line and its padding), so an empty row is as tall as one with text and the
// table's extra height is shared equally among its rows.
const line='2px solid #9aa5b8',bodyCss=`border:${line};padding:10px 16px;height:calc(1.2em + 20px);vertical-align:middle;overflow-wrap:anywhere`,headCss=`${bodyCss};background-color:#e3e8f2;font-weight:700`;
const rowHeight=80;
export function tableHtml(rows:number,cols:number){
  rows=Math.max(1,Math.min(20,Math.round(rows)||3));cols=Math.max(1,Math.min(20,Math.round(cols)||3));
  const width=Math.min(1400,Math.max(600,cols*220)),height=rows*rowHeight,pct=Math.round(10000/cols)/100;
  const row=(tag:string,css:string)=>`<tr>${`<${tag} style="${css}"></${tag}>`.repeat(cols)}</tr>`;
  return`<table data-manual="table" style="position:absolute;left:${(1600-width)/2}px;top:${(900-height)/2}px;width:${width}px;height:${height}px;z-index:10;box-sizing:border-box;border-collapse:collapse;table-layout:fixed;font:28px Arial,sans-serif;color:#172033;text-align:left"><colgroup>${`<col style="width:${pct}%">`.repeat(cols)}</colgroup><tbody>${row('th',headCss)}${row('td',bodyCss).repeat(rows-1)}</tbody></table>`;
}
type Cell=HTMLTableCellElement;
const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html');
export const isCell=(el:Element|null|undefined):el is Cell=>!!el&&/^(TD|TH)$/.test(el.tagName)&&!!el.closest('table[data-manual=table]');
export const tableOf=(el:Element|null|undefined)=>el?.closest<HTMLTableElement>('table[data-manual=table]')||null;
function grid(table:HTMLTableElement){
  const m:Cell[][]=[];
  [...table.rows].forEach((tr,r)=>{m[r]=m[r]||[];let c=0;for(const cell of tr.cells){while(m[r][c])c++;
    for(let i=0;i<Math.max(1,cell.rowSpan);i++)for(let j=0;j<Math.max(1,cell.colSpan);j++)(m[r+i]=m[r+i]||[])[c+j]=cell;c+=Math.max(1,cell.colSpan);}});
  const cols=Math.max(0,...m.map(r=>r.length));
  for(let r=0;r<m.length;r++)for(let c=0;c<cols;c++)if(!m[r][c])m[r][c]=blank(table,null);
  return m;
}
// A new cell looks like a body cell of the table (its first <td>), or like the reference cell when that is one.
function blank(table:HTMLTableElement,like:Cell|null){
  const model=like?.tagName==='TD'?like:table.querySelector('td'),cell=table.ownerDocument.createElement('td');
  cell.setAttribute('style',model?.getAttribute('style')||bodyCss);return cell;
}
// Writes the grid back: each cell in the row of its top left position, spans from the positions it covers.
// trs: the row elements in the grid's order (their heights go with their rows).
function rebuild(table:HTMLTableElement,m:Cell[][],trs:HTMLTableRowElement[]=[...table.rows]){
  const body=table.tBodies[0]||table.appendChild(table.ownerDocument.createElement('tbody')),rows=m.map((_,r)=>trs[r]||table.ownerDocument.createElement('tr'));
  for(const tr of [...table.rows])tr.replaceChildren();
  const done=new Set<Cell>();
  m.forEach((row,r)=>{const tr=rows[r];
    row.forEach((cell,c)=>{if(done.has(cell))return;done.add(cell);
      let h=1,w=1;while(m[r+h]?.[c]===cell)h++;while(row[c+w]===cell)w++;
      if(h>1)cell.rowSpan=h;else cell.removeAttribute('rowspan');if(w>1)cell.colSpan=w;else cell.removeAttribute('colspan');tr.append(cell);});});
  for(const tr of [...table.rows])if(!rows.includes(tr))tr.remove();
  body.append(...rows);
}
// Rows with their own heights: the table is as tall as they are; otherwise its height follows the number of rows.
function fitHeight(table:HTMLTableElement,from:number,to:number){
  const hs=[...table.rows].map(tr=>parseFloat(tr.style.height));
  if(hs.length&&hs.every(h=>h>0))table.style.setProperty('height',Math.round(hs.reduce((a,b)=>a+b,0)*100)/100+'px','important');else scaleHeight(table,from,to);
}
// Column widths live in a <colgroup> (percentages of the table's width), kept as many as the grid's columns.
function columns(table:HTMLTableElement,count:number){
  const doc=table.ownerDocument;let cg=table.querySelector<HTMLElement>(':scope>colgroup');
  if(!cg){cg=doc.createElement('colgroup');table.insertBefore(cg,table.firstChild);}
  if(cg.children.length!==count)cg.replaceChildren(...Array.from({length:count},()=>doc.createElement('col')));
  return [...cg.children] as HTMLElement[];
}
function setWidths(cols:HTMLElement[],widths:number[]){
  const sum=widths.reduce((a,b)=>a+b,0)||1;cols.forEach((c,i)=>c.style.setProperty('width',Math.round(widths[i]/sum*10000)/100+'%','important'));
}
const widthsOf=(cols:HTMLElement[])=>{const w=cols.map(c=>parseFloat(c.style.width));return w.every(x=>x>0)?w:cols.map(()=>100/cols.length);};
const where=(m:Cell[][],cell:Cell)=>{const out:{r:number;c:number}[]=[];m.forEach((row,r)=>row.forEach((x,c)=>{if(x===cell)out.push({r,c});}));return out;};
// The rows and columns the selected cells cover, grown until no merged cell is cut.
function range(m:Cell[][],cells:Cell[]){
  const ps=cells.flatMap(c=>where(m,c));if(!ps.length)return null;
  let r0=Math.min(...ps.map(p=>p.r)),r1=Math.max(...ps.map(p=>p.r)),c0=Math.min(...ps.map(p=>p.c)),c1=Math.max(...ps.map(p=>p.c));
  for(let grew=true;grew;){grew=false;for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)for(const p of where(m,m[r][c])){
    if(p.r<r0){r0=p.r;grew=true;}if(p.r>r1){r1=p.r;grew=true;}if(p.c<c0){c0=p.c;grew=true;}if(p.c>c1){c1=p.c;grew=true;}}}
  return{r0,r1,c0,c1};
}
const scaleHeight=(table:HTMLTableElement,from:number,to:number)=>{const h=parseFloat(table.style.height);if(h>0&&from>0&&to>0)table.style.setProperty('height',Math.round(h*to/from*100)/100+'px','important');};
const empty=(cell:Cell)=>!(cell.textContent||'').trim()&&!cell.querySelector('img,svg');
function retag(cell:Cell,tag:'td'|'th'){
  if(cell.tagName.toLowerCase()===tag)return cell;const next=cell.ownerDocument.createElement(tag) as Cell;
  for(const a of [...cell.attributes])next.setAttribute(a.name,a.value);next.append(...cell.childNodes);
  if(tag==='th'){next.style.setProperty('font-weight','700');if(!next.style.backgroundColor)next.style.setProperty('background-color','#e3e8f2');}
  else{next.style.removeProperty('font-weight');if(/^(#e3e8f2|rgb\(227, 232, 242\))$/i.test(next.style.backgroundColor))next.style.removeProperty('background-color');}
  cell.replaceWith(next);return next;
}
// Applies a table action to the selected cells (or to the whole table when the table itself is selected). Returns the
// new slide and what to select afterwards (a cell, the table, or nothing when the table is gone).
export function tableAction(slide:Slide,indices:number[],action:TableAction):{slide:Slide;select:number[]}|null{
  const doc=parse(slide.html),all=[...doc.body.querySelectorAll('*')],picked=indices.map(i=>all[i]).filter(Boolean);
  const table=picked.map(tableOf).find(Boolean);if(!table||table.closest('[data-from-layout]'))return null;
  const whole=picked.includes(table),m=grid(table),rows=m.length,cols=m[0]?.length||0,cols0=cols;if(!rows||!cols)return null;
  const cells=whole?[...new Set(m.flat())]:picked.filter((el):el is Cell=>isCell(el)&&tableOf(el)===table);
  const box=range(m,cells);if(!box)return null;
  const done=(focus:Element|null)=>({slide:{...slide,html:doc.body.innerHTML,staticHtml:''},select:focus&&focus.isConnected?[editIndex(doc,focus)]:[]});
  if(action==='deleteTable'){table.remove();return done(null);}
  if(action==='addRowBefore'||action==='addRowAfter'){
    const at=action==='addRowBefore'?box.r0:box.r1+1,ref=m[action==='addRowBefore'?box.r0:box.r1];
    // A merged cell across the new row's place grows over it; elsewhere a new cell.
    const row=ref.map((cell,c)=>at>0&&at<rows&&m[at-1][c]===m[at][c]?m[at][c]:blank(table,cell));
    const trs=[...table.rows],tr=doc.createElement('tr'),height=trs[action==='addRowBefore'?box.r0:box.r1]?.style.height;if(height)tr.style.setProperty('height',height,'important');
    m.splice(at,0,row);trs.splice(at,0,tr);rebuild(table,m,trs);fitHeight(table,rows,rows+1);return done(row.find(c=>!ref.includes(c))||row[0]);
  }
  if(action==='addColumnBefore'||action==='addColumnAfter'){
    const at=action==='addColumnBefore'?box.c0:box.c1+1,refCol=action==='addColumnBefore'?box.c0:box.c1;let first:Cell|null=null;
    const colEls=columns(table,cols0),widths=widthsOf(colEls);widths.splice(at,0,widths[refCol]);const col=doc.createElement('col');colEls[0].parentElement!.insertBefore(col,colEls[at]||null);colEls.splice(at,0,col);setWidths(colEls,widths);
    const made=new Map<Cell,Cell>();
    m.forEach((row,r)=>{const ref=row[refCol];let cell:Cell;
      if(at>0&&at<cols&&row[at-1]===row[at])cell=row[at];
      else{
        // A cell spanning rows next to the new column gets one new cell spanning the same rows.
        cell=made.get(ref)||(ref.tagName==='TH'?retag(blank(table,null),'th'):blank(table,ref));made.set(ref,cell);first??=cell;
      }
      row.splice(at,0,cell);});
    rebuild(table,m);return done(first);
  }
  if(action==='deleteRow'||action==='deleteColumn'){
    const rowWise=action==='deleteRow',[from,to]=whole?(rowWise?[rows-1,rows-1]:[cols-1,cols-1]):rowWise?[box.r0,box.r1]:[box.c0,box.c1];
    if(to-from+1>=(rowWise?rows:cols)){table.remove();return done(null);}
    const trs=[...table.rows];
    if(rowWise){m.splice(from,to-from+1);trs.splice(from,to-from+1);}
    else{m.forEach(row=>row.splice(from,to-from+1));const list=columns(table,cols),widths=widthsOf(list);list.splice(from,to-from+1).forEach(c=>c.remove());widths.splice(from,to-from+1);setWidths(list,widths);}
    rebuild(table,m,trs);if(rowWise)fitHeight(table,rows,rows-(to-from+1));
    const r=rowWise?Math.min(from,m.length-1):Math.min(box.r0,m.length-1),c=rowWise?Math.min(box.c0,m[0].length-1):Math.min(from,m[0].length-1);
    return done(whole?table:m[r][c]);
  }
  if(action==='mergeCells'){
    const keep=m[box.r0][box.c0],others=new Set<Cell>();
    for(let r=box.r0;r<=box.r1;r++)for(let c=box.c0;c<=box.c1;c++){const cell=m[r][c];if(cell!==keep)others.add(cell);m[r][c]=keep;}
    if(!others.size)return null;
    for(const cell of others){if(!empty(cell)){if(!empty(keep))keep.append(doc.createElement('br'));keep.append(...cell.childNodes);}cell.remove();}
    rebuild(table,m);return done(keep);
  }
  if(action==='splitCell'){
    let changed=false;
    for(const cell of new Set(cells)){const ps=where(m,cell);if(ps.length<2)continue;changed=true;
      ps.slice(1).forEach(p=>{m[p.r][p.c]=cell.tagName==='TH'?retag(blank(table,null),'th'):blank(table,cell);});}
    if(!changed)return null;rebuild(table,m);return done(whole?table:cells[0]);
  }
  if(action==='toggleHeaderRow'){
    const first=[...new Set(m[0])].filter(cell=>where(m,cell)[0].r===0),on=first.every(cell=>cell.tagName==='TH'),focus=cells[0];let after:Element=focus;
    for(const cell of first){const next=retag(cell,on?'td':'th');if(cell===focus)after=next;}
    return done(whole?table:after);
  }
  return null;
}
// Cell fill: the selected cells, or every cell of a selected table.
export function setCellFill(slide:Slide,indices:number[],color:string):Slide{
  const doc=parse(slide.html),all=[...doc.body.querySelectorAll('*')],picked=indices.map(i=>all[i]).filter(Boolean),value=color==='transparent'||color==='none'?'transparent':color;
  if(!/^(#[\da-f]{3,8}|transparent)$/i.test(value))return slide;
  const cells=[...new Set(picked.flatMap(el=>el.matches('table[data-manual=table]')?[...el.querySelectorAll<Cell>('td,th')].filter(c=>tableOf(c)===el):isCell(el)?[el]:[]))].filter(c=>!c.closest('[data-from-layout]'));
  if(!cells.length)return slide;
  for(const cell of cells)cell.style.setProperty('background-color',value,'important');
  return{...slide,html:doc.body.innerHTML,staticHtml:''};
}
// The fill shown in the bar: the first selected cell's own background.
export function cellFillOf(slide:Slide,indices:number[]){
  const doc=parse(slide.html),all=[...doc.body.querySelectorAll('*')],el=all[indices[0]];
  const cell=el?.matches('table[data-manual=table]')?el.querySelector<Cell>('td,th'):isCell(el)?el:null;
  return cell?.style.backgroundColor||'';
}
// Whether the selection is a table or cells of one (the format bar then offers the table group).
export function tableSelection(slide:Slide,indices:number[]){
  if(!indices.length)return null;const doc=parse(slide.html),all=[...doc.body.querySelectorAll('*')],els=indices.map(i=>all[i]);
  if(els.length===1&&els[0]?.matches('table[data-manual=table]'))return'table' as const;
  const t=tableOf(els[0]);return t&&els.every(el=>isCell(el)&&tableOf(el)===t)?'cells' as const:null;
}
// Cell borders: the selected cells, or every cell of a selected table. Width 0 or the style "none" hide them; a hidden
// border also hides the neighbor's side of a shared edge (collapsed borders keep the hidden one).
export type BorderLook={width:number;style:'solid'|'dashed'|'dotted'|'none';color:string};
function cellsFor(doc:Document,indices:number[]){
  const all=[...doc.body.querySelectorAll('*')],picked=indices.map(i=>all[i]).filter(Boolean);
  return [...new Set(picked.flatMap(el=>el.matches('table[data-manual=table]')?[...el.querySelectorAll<Cell>('td,th')].filter(c=>tableOf(c)===el):isCell(el)?[el]:[]))].filter(c=>!c.closest('[data-from-layout]'));
}
function borderOf(cell:Cell):BorderLook{
  const s=cell.style,st=s.borderTopStyle,width=parseFloat(s.borderTopWidth)||0;
  return{width,style:st==='hidden'||st==='none'||!width?'none':st==='dashed'||st==='dotted'?st:'solid',color:s.borderTopColor||'#9aa5b8'};
}
export function setCellBorder(slide:Slide,indices:number[],change:Partial<BorderLook>):Slide{
  if(change.width!==undefined&&!(Number.isFinite(change.width)&&change.width>=0&&change.width<=50))return slide;
  if(change.style!==undefined&&!['solid','dashed','dotted','none'].includes(change.style))return slide;
  if(change.color!==undefined&&!/^#[\da-f]{3,8}$/i.test(change.color))return slide;
  const doc=parse(slide.html),cells=cellsFor(doc,indices);if(!cells.length)return slide;
  for(const cell of cells){
    const now=borderOf(cell),next={...now,...change};
    // Choosing a line style or a color brings back a hidden border; choosing a width on a hidden one makes it solid.
    if(now.style==='none'&&change.style===undefined&&(change.width||change.color))next.style='solid';
    if(next.style!=='none'&&!(next.width>0))next.width=2;
    if(change.width===0)next.style='none';
    cell.style.setProperty('border',next.style==='none'?`0px hidden ${next.color}`:`${next.width}px ${next.style} ${next.color}`,'important');
  }
  return{...slide,html:doc.body.innerHTML,staticHtml:''};
}
export function cellBorderOf(slide:Slide,indices:number[]):BorderLook|null{const cell=cellsFor(parse(slide.html),indices)[0];return cell?borderOf(cell):null;}
// The table's shadow (the whole object): selected as a table or through its cells.
const tableShadow='0 12px 30px #17203355';
const tableFor=(doc:Document,indices:number[])=>{const all=[...doc.body.querySelectorAll('*')];for(const i of indices){const el=all[i];const t=el?.matches('table[data-manual=table]')?el as HTMLTableElement:tableOf(el);if(t&&!t.closest('[data-from-layout]'))return t;}return null;};
export function setTableShadow(slide:Slide,indices:number[],on:boolean):Slide{
  const doc=parse(slide.html),t=tableFor(doc,indices);if(!t)return slide;
  if(on)t.style.setProperty('box-shadow',tableShadow,'important');else t.style.removeProperty('box-shadow');
  return{...slide,html:doc.body.innerHTML,staticHtml:''};
}
export const tableShadowOf=(slide:Slide,indices:number[])=>{const t=tableFor(parse(slide.html),indices);return!!t&&!!t.style.boxShadow&&t.style.boxShadow!=='none';};
