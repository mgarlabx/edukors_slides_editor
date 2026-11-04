import {children,descendants} from './openxml';
import type {ShapeType} from './manual';

// PowerPoint shape geometry as SVG paths in the shape's own size (w × h). Preset shapes follow the DrawingML preset
// definitions for their default look and main adjustment; custom geometry (custGeom) is converted path by path.
export interface Geometry {paths:{d:string;fill:boolean}[];width:number;height:number;native?:ShapeType}
const n=(v:number)=>String(Math.round(v*100)/100);
const poly=(points:[number,number][])=>'M'+points.map(([x,y])=>n(x)+' '+n(y)).join('L')+'Z';
function star(w:number,h:number,points:number,inner:number,offset=-Math.PI/2){
  const list:[number,number][]=[];
  for(let i=0;i<points*2;i++){const r=i%2?inner:1,a=offset+i*Math.PI/points;list.push([w/2+Math.cos(a)*w/2*r,h/2+Math.sin(a)*h/2*r]);}
  return poly(list);
}
// Explosions are fixed outlines on a 21 600 grid (VML lists; an empty value is 0).
const seal=(list:string,w:number,h:number)=>{const v=list.split(',').map(x=>Number(x||0));const pts:[number,number][]=[];for(let i=0;i+1<v.length;i+=2)pts.push([v[i]*w/21600,v[i+1]*h/21600]);return poly(pts);};
const seal1='10800,5800,8352,2295,7312,6320,370,2295,4627,7617,,8615,3722,11775,135,14587,5532,13697,4762,17617,7715,15627,8485,21600,10532,14935,13247,19737,14020,14457,18145,18095,16837,12942,21600,13290,17607,10475,21097,8137,16702,7315,18380,4457,14155,5325,14522,0';
const seal2='11462,4342,9722,1887,8550,6382,4502,3625,5372,7171,1172,8270,3935,11592,,12877,3330,15370,1285,17825,4805,18240,4375,21600,7525,18125,8250,21600,9997,18240,11777,20532,12530,18083,14857,21600,15365,18200,16982,20525,17475,16950,19355,16240,19137,14075,21600,13165,18892,11542,21357,9270,18727,7855,19735,6210,17172,5715,17325,4342,15105,4245,14890,1885,12945,3570';
function adjustments(props:Element|undefined,inherited?:Element){
  const values:Record<string,number>={};
  for(const source of [inherited,props])for(const gd of source?descendants(source,'gd').filter(g=>g.parentNode&&(g.parentNode as Element).localName==='avLst'):[]){
    const m=/^val\s+(-?\d+)$/.exec(gd.getAttribute('fmla')||'');if(m)values[gd.getAttribute('name')||'']=Number(m[1]);
  }
  return (name:string,fallback:number)=>values[name]??fallback;
}
export function pptxGeometry(preset:string,props:Element|undefined,w:number,h:number,inherited?:Element):Geometry|undefined{
  w=Math.max(1,w);h=Math.max(1,h);
  const ss=Math.min(w,h),adj=adjustments(props,inherited),one=(d:string,native?:ShapeType):Geometry=>({paths:[{d,fill:true}],width:w,height:h,native});
  const rr=(r:number)=>{r=Math.min(r,w/2,h/2);return `M${n(r)} 0H${n(w-r)}A${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)}V${n(h-r)}A${n(r)} ${n(r)} 0 0 1 ${n(w-r)} ${n(h)}H${n(r)}A${n(r)} ${n(r)} 0 0 1 0 ${n(h-r)}V${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0Z`;};
  const ellipse=`M0 ${n(h/2)}A${n(w/2)} ${n(h/2)} 0 1 1 ${n(w)} ${n(h/2)}A${n(w/2)} ${n(h/2)} 0 1 1 0 ${n(h/2)}Z`;
  switch(preset){
    case 'custom':return custom(props,w,h);
    case 'rect':case 'flowChartProcess':case 'wedgeRectCallout':return one(`M0 0H${n(w)}V${n(h)}H0Z`,'rect');
    case 'roundRect':case 'flowChartAlternateProcess':case 'wedgeRoundRectCallout':case 'round2SameRect':case 'round1Rect':return one(rr(ss*adj('adj',16667)/100000),'rounded');
    case 'flowChartTerminator':return one(rr(ss/2));
    case 'ellipse':case 'flowChartConnector':case 'wedgeEllipseCallout':return one(ellipse,'ellipse');
    case 'triangle':{const x=w*adj('adj',50000)/100000;return one(poly([[x,0],[w,h],[0,h]]),x===w/2?'triangle':undefined);}
    case 'rtTriangle':return one(poly([[0,0],[w,h],[0,h]]),'rightTriangle');
    case 'diamond':case 'flowChartDecision':return one(poly([[w/2,0],[w,h/2],[w/2,h],[0,h/2]]),'diamond');
    case 'parallelogram':case 'flowChartInputOutput':{const x=Math.min(w,ss*adj('adj',25000)/100000);return one(poly([[x,0],[w,0],[w-x,h],[0,h]]));}
    case 'trapezoid':{const x=Math.min(w/2,ss*adj('adj',25000)/100000);return one(poly([[x,0],[w-x,0],[w,h],[0,h]]));}
    case 'pentagon':return one(poly([[w/2,0],[w,h*.382],[w*.809,h],[w*.191,h],[0,h*.382]]),'pentagon');
    case 'hexagon':{const x=Math.min(w/2,ss*adj('adj',25000)/100000);return one(poly([[x,0],[w-x,0],[w,h/2],[w-x,h],[x,h],[0,h/2]]));}
    case 'octagon':{const x=Math.min(w/2,h/2,ss*adj('adj',29289)/100000);return one(poly([[x,0],[w-x,0],[w,x],[w,h-x],[w-x,h],[x,h],[0,h-x],[0,x]]));}
    case 'homePlate':{const x=Math.min(w,ss*adj('adj',50000)/100000);return one(poly([[0,0],[w-x,0],[w,h/2],[w-x,h],[0,h]]));}
    case 'chevron':{const x=Math.min(w/2,ss*adj('adj',50000)/100000);return one(poly([[0,0],[w-x,0],[w,h/2],[w-x,h],[0,h],[x,h/2]]));}
    case 'plus':case 'mathPlus':{const x=ss*adj('adj',25000)/100000;return one(poly([[x,0],[w-x,0],[w-x,x],[w,x],[w,h-x],[w-x,h-x],[w-x,h],[x,h],[x,h-x],[0,h-x],[0,x],[x,x]]));}
    case 'rightArrow':case 'leftArrow':case 'upArrow':case 'downArrow':{
      const horizontal=preset==='rightArrow'||preset==='leftArrow',L=horizontal?w:h,T=horizontal?h:w;
      const shaft=T*adj('adj1',50000)/100000,head=Math.min(L,ss*adj('adj2',50000)/100000),a=(T-shaft)/2;
      let pts:[number,number][]=[[0,a],[L-head,a],[L-head,0],[L,T/2],[L-head,T],[L-head,T-a],[0,T-a]];
      if(preset==='leftArrow')pts=pts.map(([x,y])=>[L-x,y]);
      if(preset==='upArrow')pts=pts.map(([x,y])=>[y,L-x]);
      if(preset==='downArrow')pts=pts.map(([x,y])=>[y,x]);
      return one(poly(pts),preset==='rightArrow'&&Math.abs(shaft/T-.4)<.02&&Math.abs(head/L-.38)<.02?'arrow':undefined);
    }
    case 'leftRightArrow':{const shaft=h*adj('adj1',50000)/100000,head=Math.min(w/2,ss*adj('adj2',50000)/100000),a=(h-shaft)/2;return one(poly([[0,h/2],[head,0],[head,a],[w-head,a],[w-head,0],[w,h/2],[w-head,h],[w-head,h-a],[head,h-a],[head,h]]));}
    case 'star4':return one(star(w,h,4,adj('adj',12500)/50000));
    case 'star5':return one(star(w,h,5,adj('adj',19098)/50000),'star');
    case 'star6':return one(star(w,h,6,adj('adj',28868)/50000));
    case 'star7':return one(star(w,h,7,adj('adj',34601)/50000));
    case 'star8':return one(star(w,h,8,adj('adj',38250)/50000));
    case 'star10':return one(star(w,h,10,adj('adj',42533)/50000));
    case 'star12':return one(star(w,h,12,adj('adj',37500)/50000));
    case 'star16':return one(star(w,h,16,adj('adj',37500)/50000));
    case 'star24':return one(star(w,h,24,adj('adj',37500)/50000));
    case 'star32':return one(star(w,h,32,adj('adj',37500)/50000));
    case 'irregularSeal1':return one(seal(seal1,w,h));
    case 'irregularSeal2':return one(seal(seal2,w,h));
    case 'donut':{const r=ss*adj('adj',25000)/100000,iw=w/2-r,ih=h/2-r;return{paths:[{d:ellipse+(iw>0&&ih>0?`M${n(r)} ${n(h/2)}A${n(iw)} ${n(ih)} 0 1 0 ${n(w-r)} ${n(h/2)}A${n(iw)} ${n(ih)} 0 1 0 ${n(r)} ${n(h/2)}Z`:''),fill:true}],width:w,height:h};}
    case 'heart':return one(`M${n(w/2)} ${n(h/4)}C${n(w*.85)} ${n(-h/12)} ${n(w*1.4)} ${n(h/2.6)} ${n(w/2)} ${n(h)}C${n(-w*.4)} ${n(h/2.6)} ${n(w*.15)} ${n(-h/12)} ${n(w/2)} ${n(h/4)}Z`);
    case 'line':case 'straightConnector1':return {paths:[{d:`M0 0L${n(w)} ${n(h)}`,fill:false}],width:w,height:h};
    case 'bentConnector2':return {paths:[{d:`M0 0H${n(w)}V${n(h)}`,fill:false}],width:w,height:h};
    case 'bentConnector3':return {paths:[{d:`M0 0H${n(w/2)}V${n(h)}H${n(w)}`,fill:false}],width:w,height:h};
    case 'curvedConnector3':return {paths:[{d:`M0 0C${n(w/2)} 0 ${n(w/2)} ${n(h)} ${n(w)} ${n(h)}`,fill:false}],width:w,height:h};
  }
}
// custGeom: each path has its own coordinate space (w/h attributes); arcTo continues from the current point.
function custom(props:Element|undefined,w:number,h:number):Geometry|undefined{
  const list=props?descendants(props,'path').filter(p=>p.parentNode&&(p.parentNode as Element).localName==='pathLst'):[];
  if(!list.length)return;
  const paths:Geometry['paths']=[];
  for(const path of list){
    const pw=Number(path.getAttribute('w')||0)||w,ph=Number(path.getAttribute('h')||0)||h,sx=w/pw,sy=h/ph;
    let d='',cx=0,cy=0,ok=true;
    const pt=(el:Element)=>{const x=Number(el.getAttribute('x')),y=Number(el.getAttribute('y'));if(!Number.isFinite(x)||!Number.isFinite(y))ok=false;return [x*sx,y*sy] as [number,number];};
    for(const cmd of children(path)){
      const pts=children(cmd,'pt').map(pt);
      if(cmd.localName==='moveTo'&&pts[0]){[cx,cy]=pts[0];d+=`M${n(cx)} ${n(cy)}`;}
      else if(cmd.localName==='lnTo'&&pts[0]){[cx,cy]=pts[0];d+=`L${n(cx)} ${n(cy)}`;}
      else if(cmd.localName==='cubicBezTo'&&pts.length===3){d+='C'+pts.map(p=>n(p[0])+' '+n(p[1])).join(' ');[cx,cy]=pts[2];}
      else if(cmd.localName==='quadBezTo'&&pts.length===2){d+='Q'+pts.map(p=>n(p[0])+' '+n(p[1])).join(' ');[cx,cy]=pts[1];}
      else if(cmd.localName==='arcTo'){
        const rx=Number(cmd.getAttribute('wR'))*sx,ry=Number(cmd.getAttribute('hR'))*sy,st=Number(cmd.getAttribute('stAng'))/60000*Math.PI/180,sw=Number(cmd.getAttribute('swAng'))/60000*Math.PI/180;
        if(![rx,ry,st,sw].every(Number.isFinite)){ok=false;continue;}
        const ox=cx-rx*Math.cos(st),oy=cy-ry*Math.sin(st),ex=ox+rx*Math.cos(st+sw),ey=oy+ry*Math.sin(st+sw);
        d+=`A${n(rx)} ${n(ry)} 0 ${Math.abs(sw)>Math.PI?1:0} ${sw>0?1:0} ${n(ex)} ${n(ey)}`;cx=ex;cy=ey;
      }else if(cmd.localName==='close')d+='Z';
    }
    if(ok&&d)paths.push({d,fill:path.getAttribute('fill')!=='none'});
  }
  return paths.length?{paths,width:w,height:h}:undefined;
}
