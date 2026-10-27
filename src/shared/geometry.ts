export type EditRect={left:number;top:number;width:number;height:number};
export type EditMatrix={a:number;b:number;c:number;d:number};
// Serialized with the canvas runtime. Geometry never depends on DOM state or rounding to whole pixels.
export function canvasGeometry(){
  const multiply=(p:EditMatrix,q:EditMatrix):EditMatrix=>({a:p.a*q.a+p.c*q.b,b:p.b*q.a+p.d*q.b,c:p.a*q.c+p.c*q.d,d:p.b*q.c+p.d*q.d});
  const vector=(m:EditMatrix,x:number,y:number)=>({x:m.a*x+m.c*y,y:m.b*x+m.d*y});
  const inverse=(m:EditMatrix,x:number,y:number)=>{const det=m.a*m.d-m.b*m.c;return Math.abs(det)<1e-10?null:{x:(m.d*x-m.c*y)/det,y:(m.a*y-m.b*x)/det};};
  // Recover any local box point from its axis-aligned screen bounds, including rotated/flipped boxes.
  const anchor=(r:EditRect,width:number,height:number,m:EditMatrix,fx:number,fy:number)=>({
    x:r.left-Math.min(0,m.a*width)-Math.min(0,m.c*height)+m.a*width*fx+m.c*height*fy,
    y:r.top-Math.min(0,m.b*width)-Math.min(0,m.d*height)+m.b*width*fx+m.d*height*fy
  });
  const translation=(value:string,width:number,height:number)=>{const p=value.trim().split(/\s+/),px=(v:string|undefined,size:number)=>!v||v==='none'?0:parseFloat(v)*(v.endsWith('%')?size/100:1);return[px(p[0],width),px(p[1],height)];};
  return{multiply,vector,inverse,anchor,translation};
}
// Self-contained: this function is also serialized into the isolated editor frame.
export function alignMovement(bounds:EditRect,targets:EditRect[],dx:number,dy:number,locked:'x'|'y'|null=null,disabled=false,tolerance=5){
  const guides:{axis:number;position:number;from:number;to:number}[]=[];
  if(locked==='x')dx=0;if(locked==='y')dy=0;
  if(disabled)return{dx,dy,guides};
  const matches:{axis:number;position:number;target:EditRect}[]=[];
  for(const axis of [0,1]){
    if(locked===(axis===0?'x':'y'))continue;
    const start=axis?bounds.top:bounds.left,size=axis?bounds.height:bounds.width,delta=axis?dy:dx;
    let best=tolerance,correction=0,line:number|null=null,other:EditRect|null=null;
    for(const t of targets){const a=axis?t.top:t.left,w=axis?t.height:t.width;
      for(const from of [start,start+size/2,start+size])for(const to of [a,a+w/2,a+w]){const diff=to-from-delta;if(Math.abs(diff)<best){best=Math.abs(diff);correction=diff;line=to;other=t;}}}
    if(line!==null&&other){if(axis)dy+=correction;else dx+=correction;matches.push({axis,position:line,target:other});}
  }
  // Draw using both final deltas, so guide endpoints follow diagonal movement correctly.
  for(const {axis,position,target:t} of matches)guides.push({axis,position,
    from:axis?Math.min(bounds.left+dx,t.left):Math.min(bounds.top+dy,t.top),
    to:axis?Math.max(bounds.left+bounds.width+dx,t.left+t.width):Math.max(bounds.top+bounds.height+dy,t.top+t.height)});
  return{dx,dy,guides};
}

// Corner or side resize, with the opposite corner/side fixed. Deltas and dimensions share the same coordinate space.
export function resizeImage(width:number,height:number,dx:number,dy:number,corner:string,free=false){
  const west=corner.includes('w'),north=corner.includes('n'),x=/[ew]/.test(corner)?(west?-dx:dx):0,y=/[ns]/.test(corner)?(north?-dy:dy):0;
  let w:number,h:number;
  if(free){w=Math.max(8,Math.min(16000,width+x));h=Math.max(8,Math.min(16000,height+y));}
  else{const factor=Math.max(Math.max(8/width,8/height),Math.min(Math.min(16000/width,16000/height),1+(width*x+height*y)/(width*width+height*height)));w=width*factor;h=height*factor;}
  return{width:w,height:h,x:west?width-w:0,y:north?height-h:0};
}
// Resized objects: text boxes (fit) keep growing with their text, the height is only a minimum. Self-contained too.
export function boxStyle(width:number,height:number,x:number,y:number,fit=false){
  return{boxSizing:'border-box',width:width+'px',height:fit?'auto':height+'px',minWidth:'0px',minHeight:fit?height+'px':'0px',maxWidth:'none',maxHeight:'none',flex:'0 0 auto',translate:`${x}px ${y}px`};
}
