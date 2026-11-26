// Slide transitions and object animations (request of 26/11/2026).
// A transition belongs to the slide it enters (Slide.transition) and plays when the presentation moves forward to it.
// Entrance and exit animations are attributes of the object in the slide HTML, so they travel with copy and paste,
// duplicate, undo and the assistant:
//   data-anim-in / data-anim-out          effect (in: appear fade spin dissolve zoom up down left right; out: same, appear = disappear)
//   data-anim-in-dur / data-anim-out-dur  duration in ms
//   data-anim-in-trigger / …-out-trigger  click (default), with (the previous effect), after (the previous effect)
//   data-anim-in-order / …-out-order      place in the slide's sequence (1, 2, …); without it, document order, first
// Grouped objects (data-group-id) animate as one: setting an animation on a member sets it on the whole group, the group
// takes one place in the sequence, and in the runtime its members move together (spin and zoom around the group's
// center, slides by the group's distance).
// The older progressive reveal (data-step, toggling the .pending class of the slide's own CSS) stays: each data-step
// without data-anim-in is an entrance on click, in document order.
import type {Slide} from './model';
export const transitionTypes=['fade','zoom','split','up','down','left','right'] as const;
export const animTypes=['appear','fade','spin','dissolve','zoom','up','down','left','right'] as const;
export const animTriggers=['click','with','after'] as const;
export type TransitionType=typeof transitionTypes[number];
export type AnimType=typeof animTypes[number];
export type AnimTrigger=typeof animTriggers[number];
export type Phase='in'|'out';
export interface Transition {type:TransitionType;duration:number}
export const durationLimits={min:100,max:10000};
export const defaultTransitionDuration=700,defaultAnimDuration=500;
export const validTransition=(t:any):t is Transition=>!!t&&typeof t==='object'&&(transitionTypes as readonly string[]).includes(t.type)&&Number.isInteger(t.duration)&&t.duration>=durationLimits.min&&t.duration<=durationLimits.max&&Object.keys(t).every(k=>k==='type'||k==='duration');
export const clampDuration=(ms:number)=>Math.round(Math.min(durationLimits.max,Math.max(durationLimits.min,ms)));

// Start tags and their attributes, read as text (playerDocument runs in the main process, without a DOM).
const tagPattern=/<([a-zA-Z][\w-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
const attrPattern=/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
function startTags(html:string){
  const out:Record<string,string>[]=[];
  for(const m of html.matchAll(tagPattern)){const attrs:Record<string,string>={};for(const a of m[2].matchAll(attrPattern))attrs[a[1].toLowerCase()]=a[2]??a[3]??a[4]??'';out.push(attrs);}
  return out;
}
const triggerOf=(v:string|undefined):AnimTrigger=>(animTriggers as readonly string[]).includes(v||'')?v as AnimTrigger:'click';
// The number of clicks the slide's sequence takes (the player's step count): each data-step without data-anim-in and each
// animation started on click.
export function countSteps(html:string){
  let n=0;const groups=new Set<string>();
  for(const a of startTags(html)){
    if('data-step' in a&&!('data-anim-in' in a))n++;
    for(const phase of ['in','out']){
      if(!(animTypes as readonly string[]).includes(a['data-anim-'+phase]))continue;
      const group=a['data-group-id'];
      // A group is one effect: its first member's trigger counts, once.
      if(group){if(groups.has(group+'|'+phase))continue;groups.add(group+'|'+phase);}
      if(triggerOf(a[`data-anim-${phase}-trigger`])==='click')n++;
    }
  }
  return n;
}

// ---------- Editing (browser: DOMParser) ----------
export interface AnimSpec {effect:AnimType;duration:number;trigger:AnimTrigger;order:number}
export interface AnimPatch {effect?:AnimType|null;duration?:number;trigger?:AnimTrigger;order?:number}
const parse=(html:string)=>new DOMParser().parseFromString(html,'text/html');
const all=(doc:Document)=>[...doc.body.querySelectorAll('*')];
const attr=(phase:Phase,key='')=>`data-anim-${phase}${key?'-'+key:''}`;
export function animationOf(el:Element,phase:Phase):AnimSpec|null{
  const effect=el.getAttribute(attr(phase));if(!(animTypes as readonly string[]).includes(effect||''))return null;
  const duration=Number(el.getAttribute(attr(phase,'dur'))),order=Number(el.getAttribute(attr(phase,'order')));
  return{effect:effect as AnimType,duration:Number.isFinite(duration)&&duration>0?clampDuration(duration):defaultAnimDuration,trigger:triggerOf(el.getAttribute(attr(phase,'trigger'))||undefined),order:Number.isInteger(order)&&order>0?order:0};
}
// Every animation of a slide (layout and base objects are not the slide's), in the order they play. The members of a
// group make one entry (els), placed by its first member.
interface Entry {el:Element;els:Element[];phase:Phase;order:number;pos:number;legacy:boolean}
const groupOf=(el:Element)=>el.getAttribute('data-group-id')||'';
function entries(doc:Document){
  const list:Entry[]=[],units=new Map<string,Entry>();
  all(doc).forEach((el,pos)=>{
    if(el.closest('[data-from-layout],.esf-master'))return;
    for(const phase of ['in','out'] as const){
      const a=animationOf(el,phase);if(!a)continue;
      const key=groupOf(el)&&groupOf(el)+'|'+phase,unit=key?units.get(key):undefined;
      if(unit){unit.els.push(el);continue;}
      const entry={el,els:[el],phase,order:a.order,pos,legacy:false};list.push(entry);if(key)units.set(key,entry);
    }
    if(el.hasAttribute('data-step')&&!el.hasAttribute('data-anim-in'))list.push({el,els:[el],phase:'in',order:0,pos,legacy:true});
  });
  return list.sort((a,b)=>(a.order&&b.order?a.order-b.order:a.order?1:b.order?-1:0)||a.pos-b.pos||(a.phase==='in'?-1:1));
}
// Numbers the sequence 1…n, in the order it plays now (data-step reveals keep their place without a number).
function renumber(list:Entry[]){list.forEach((e,i)=>{if(!e.legacy)e.els.forEach(el=>el.setAttribute(attr(e.phase,'order'),String(i+1)));});}
export interface SlideAnimations {index:number;in?:AnimSpec&{legacy?:boolean};out?:AnimSpec;inPos?:number;outPos?:number}
// What the selected objects have (the first one's values), and the size of the slide's sequence.
export function animationsAt(slide:Slide,indices:number[]){
  const doc=parse(slide.html),els=all(doc),list=entries(doc),place=(el:Element,phase:Phase)=>list.findIndex(e=>e.els.includes(el)&&e.phase===phase)+1;
  const objects=indices.map(i=>els[i]).filter((el):el is Element=>!!el&&!el.closest('[data-from-layout]'));
  const first=objects[0],legacy=first&&first.hasAttribute('data-step')&&!first.hasAttribute('data-anim-in');
  const inAnim=first?animationOf(first,'in')||(legacy?{effect:'fade' as AnimType,duration:250,trigger:'click' as AnimTrigger,order:0,legacy:true}:null):null,outAnim=first?animationOf(first,'out'):null;
  return{objects:objects.length,total:list.length,in:inAnim?{...inAnim,order:place(first!,'in')}:null,out:outAnim?{...outAnim,order:place(first!,'out')}:null};
}
// Sets (or removes, effect null) one phase's animation on the objects; a new animation goes to the end of the sequence,
// and a new place (order) moves it there, the others shifting around it. A member of a group stands for the whole
// group: every member gets the same animation, which is one entry of the sequence.
export function setAnimation(slide:Slide,indices:number[],phase:Phase,patch:AnimPatch):Slide{
  const doc=parse(slide.html),els=all(doc),usable=(el:Element|undefined):el is Element=>!!el&&!el.closest('[data-from-layout]')&&!el.hasAttribute('data-esf-fixed');
  const picked=indices.map(i=>els[i]).filter(usable),groups=new Set(picked.map(groupOf).filter(Boolean));
  const targets=[...new Set([...picked,...els.filter(el=>groups.has(groupOf(el))&&usable(el))])].sort((a,b)=>els.indexOf(a)-els.indexOf(b));
  if(!targets.length)return slide;
  // Members of a group follow its first member: the same effect, duration and trigger.
  for(const g of groups){
    const members=targets.filter(el=>groupOf(el)===g),lead=members.find(el=>animationOf(el,phase));if(!lead)continue;
    for(const el of members)if(el!==lead)for(const k of ['','dur','trigger'])el.setAttribute(attr(phase,k),lead.getAttribute(attr(phase,k))||'');
  }
  let list=entries(doc);
  for(const el of targets){
    if(patch.effect===null){for(const k of ['','dur','trigger','order'])el.removeAttribute(attr(phase,k));if(phase==='in')el.removeAttribute('data-step');continue;}
    const had=animationOf(el,phase);
    if(patch.effect){el.setAttribute(attr(phase),patch.effect);if(phase==='in')el.removeAttribute('data-step');}
    else if(!had&&!(phase==='in'&&el.hasAttribute('data-step')))continue;
    // A data-step reveal edited here becomes an animation of its own (fade, as it looked), in the same place.
    if(!had&&phase==='in'&&!patch.effect)el.setAttribute(attr(phase),'fade');
    if(patch.duration!==undefined)el.setAttribute(attr(phase,'dur'),String(clampDuration(patch.duration)));
    else if(!el.hasAttribute(attr(phase,'dur')))el.setAttribute(attr(phase,'dur'),String(defaultAnimDuration));
    if(patch.trigger)el.setAttribute(attr(phase,'trigger'),patch.trigger);
    else if(!el.hasAttribute(attr(phase,'trigger')))el.setAttribute(attr(phase,'trigger'),'click');
    if(!had){
      const group=groupOf(el),unit=group?list.find(e=>!e.legacy&&e.phase===phase&&groupOf(e.el)===group&&targets.includes(e.el)):undefined;
      if(unit){if(!unit.els.includes(el))unit.els.push(el);list=list.filter(e=>e===unit||!(e.legacy&&e.el===el));continue;}
      const at=list.findIndex(e=>e.els.includes(el)&&e.phase===phase);const entry=at>=0?list.splice(at,1)[0]:{el,els:[el],phase,order:0,pos:0,legacy:false};entry.legacy=false;list.push(entry);
    }
  }
  list=list.filter(e=>e.el.isConnected&&(e.legacy?e.el.hasAttribute('data-step')&&!e.el.hasAttribute('data-anim-in'):!!animationOf(e.el,e.phase)));
  list.forEach(e=>{if(!e.legacy)e.els=e.els.filter(el=>!!animationOf(el,e.phase));});
  if(patch.order!==undefined&&patch.effect!==null){
    const moving=list.filter(e=>e.els.some(el=>targets.includes(el))&&e.phase===phase);
    // data-step reveals (without a number) always play first: nothing moves before them.
    if(moving.length){const rest=list.filter(e=>!moving.includes(e)),fixed=rest.filter(e=>e.legacy).length,at=Math.max(fixed,Math.min(rest.length,Math.round(patch.order)-1));rest.splice(at,0,...moving);list=rest;}
  }
  renumber(list);
  const html=doc.body.innerHTML;
  return html===slide.html?slide:{...slide,html,staticHtml:''};
}
// Pasted objects keep their animations and go to the end of the target slide's sequence.
export function appendAnimations(doc:Document,added:Element[]){
  const list=entries(doc),pasted=new Set(added.flatMap(el=>[el,...el.querySelectorAll('*')]));
  const own=list.filter(e=>!pasted.has(e.el)),theirs=list.filter(e=>pasted.has(e.el));
  if(theirs.length)renumber([...own,...theirs]);
}

// ---------- Runtime (serialized into each slide document; no imports, no outer names) ----------
// The timeline: effects in order, grouped into steps (each click starts one; with/after join the step before them;
// effects before the first click play when the slide has entered). Animations use the Web Animations API on the
// object's own translate, rotate, scale and opacity, starting from its current values (moved, turned or faded objects
// keep their place); important inline values are lowered while the effect plays, so the animation can show.
export function motionRuntime(root:HTMLElement|null,opts:{reduced:boolean}){
  // els: the object, or every member of a group (data-group-id), which animate together as one effect.
  type Fx={els:HTMLElement[];phase:'in'|'out';type:string;dur:number;trigger:string;order:number;pos:number;legacy:boolean;delay:number};
  const types=['appear','fade','spin','dissolve','zoom','up','down','left','right'];
  const els=[...document.querySelectorAll<HTMLElement>('.slide *')].filter(el=>!el.closest('.esf-master'));
  const fx:Fx[]=[],units=new Map<string,Fx>();
  els.forEach((el,pos)=>{
    for(const phase of ['in','out'] as const){
      const type=el.getAttribute('data-anim-'+phase)||'';if(!types.includes(type))continue;
      const group=el.getAttribute('data-group-id'),unit=group?units.get(group+'|'+phase):undefined;
      if(unit){unit.els.push(el);continue;}
      const dur=Number(el.getAttribute(`data-anim-${phase}-dur`)),order=Number(el.getAttribute(`data-anim-${phase}-order`)),trigger=el.getAttribute(`data-anim-${phase}-trigger`)||'';
      const f:Fx={els:[el],phase,type,dur:type==='appear'?0:Number.isFinite(dur)&&dur>0?Math.min(10000,dur):500,trigger:['with','after'].includes(trigger)?trigger:'click',order:Number.isInteger(order)&&order>0?order:0,pos,legacy:false,delay:0};
      fx.push(f);if(group)units.set(group+'|'+phase,f);
    }
    if(el.hasAttribute('data-step')&&!el.hasAttribute('data-anim-in'))fx.push({els:[el],phase:'in',type:'legacy',dur:250,trigger:'click',order:0,pos,legacy:true,delay:0});
  });
  fx.sort((a,b)=>(a.order&&b.order?a.order-b.order:a.order?1:b.order?-1:0)||a.pos-b.pos||(a.phase==='in'?-1:1));
  // steps[0]: effects that play by themselves when the slide has entered; steps[n]: the n-th click.
  const steps:Fx[][]=[[]];
  for(const f of fx){
    if(f.trigger==='click')steps.push([]);
    const step=steps[steps.length-1],prev=step[step.length-1];
    f.delay=!prev?0:f.trigger==='with'?prev.delay:prev.delay+prev.dur;
    step.push(f);
  }
  const clicks=steps.length-1;
  let running:Animation[]=[];
  const hide=(el:HTMLElement,on:boolean)=>{if(on)el.setAttribute('data-esf-hidden','');else el.removeAttribute('data-esf-hidden');};
  // The state after `done` steps (0 = before the automatic effects, n+1 = after n clicks), without animating.
  function apply(done:number){
    const played=new Set(steps.slice(0,done).flat());
    for(const f of fx){if(f.legacy)f.els[0].classList.toggle('pending',!played.has(f));}
    for(const el of new Set(fx.filter(f=>!f.legacy).flatMap(f=>f.els))){
      const mine=fx.filter(f=>f.els.includes(el)&&!f.legacy),entry=mine.find(f=>f.phase==='in'),exit=mine.find(f=>f.phase==='out');
      hide(el,!!entry&&!played.has(entry)||!!exit&&played.has(exit));
    }
  }
  function finish(){const list=running;running=[];list.forEach(a=>{try{a.finish();}catch{try{a.cancel();}catch{}}});}
  // A noise mask in a few frames: the object appears (or goes) in scattered squares.
  let noise:string[]|null=null;
  function dissolveFrames(){
    if(noise)return noise;noise=[];
    const cols=48,rows=27,cell=6,c=document.createElement('canvas');c.width=cols*cell;c.height=rows*cell;const g=c.getContext('2d');
    if(!g)return noise;
    let seed=7;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    const values=Array.from({length:cols*rows},rand);
    for(let k=0;k<=10;k++){g.clearRect(0,0,c.width,c.height);g.fillStyle='#000';values.forEach((v,i)=>{if(v<k/10)g.fillRect((i%cols)*cell,Math.floor(i/cols)*cell,cell,cell);});noise.push(`url("${c.toDataURL()}")`);}
    return noise;
  }
  // Keyframes from the object's current look to hidden (exit) or from hidden to it (entrance). group: the screen box of
  // the whole group, when the object is one of its members: slides move by the group's distance and spin and zoom turn
  // around the group's center (members already turned, scaled or transformed keep their own center).
  function frames(el:HTMLElement,phase:'in'|'out',type:string,group?:{left:number;top:number;right:number;bottom:number}){
    const cs=getComputedStyle(el),opacity=Number(cs.opacity)||1;
    const t=(cs.translate&&cs.translate!=='none'?cs.translate:'0px 0px').split(/\s+/),tx=parseFloat(t[0])||0,ty=parseFloat(t[1]||'0')||0;
    const angle=cs.rotate&&cs.rotate!=='none'?parseFloat(cs.rotate.split(/\s+/).pop()!)||0:0,scale=cs.scale&&cs.scale!=='none'?parseFloat(cs.scale)||1:1;
    const shown:Keyframe={opacity:String(opacity),translate:`${tx}px ${ty}px`,rotate:`${angle}deg`,scale:String(scale)};
    let away:Keyframe={...shown};
    if(type==='appear')return phase==='in'?[{opacity:'0'},{opacity:'0',offset:.999},{opacity:String(opacity)}]:[{opacity:String(opacity)},{opacity:String(opacity),offset:.999},{opacity:'0'}];
    if(type==='fade'||type==='legacy')away={...shown,opacity:'0'};
    const s=root?root.getBoundingClientRect():{left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth},k=s.width/1600||1;
    if(type==='spin')away={...shown,opacity:'0',rotate:`${angle+(phase==='in'?-360:360)}deg`,scale:String(scale*.3)};
    if(type==='zoom')away={...shown,opacity:'0',scale:String(scale*.3)};
    if(group&&(type==='spin'||type==='zoom')&&!angle&&scale===1&&(!cs.transform||cs.transform==='none')){
      const r=el.getBoundingClientRect(),origin=`${((group.left+group.right)/2-r.left)/k}px ${((group.top+group.bottom)/2-r.top)/k}px`;
      shown.transformOrigin=origin;away.transformOrigin=origin;
    }
    if(['up','down','left','right'].includes(type)){
      // Out of the slide, beyond the edge it moves toward (exit) or comes from (entrance), in slide units.
      const box=group||el.getBoundingClientRect();
      const toward=phase==='out'?type:({up:'down',down:'up',left:'right',right:'left'} as Record<string,string>)[type];
      const dx=toward==='left'?-(box.right-s.left)/k:toward==='right'?(s.right-box.left)/k:0,dy=toward==='up'?-(box.bottom-s.top)/k:toward==='down'?(s.bottom-box.top)/k:0;
      away={...shown,translate:`${tx+dx}px ${ty+dy}px`};
    }
    if(type==='dissolve'){
      const list=dissolveFrames();if(!list.length)return phase==='in'?[{opacity:'0'},{opacity:String(opacity)}]:[{opacity:String(opacity)},{opacity:'0'}];
      const seq=(phase==='in'?list:[...list].reverse()).map((mask,i,a)=>({maskImage:mask,webkitMaskImage:mask,maskSize:'100% 100%',webkitMaskSize:'100% 100%',maskRepeat:'no-repeat',webkitMaskRepeat:'no-repeat',offset:i/(a.length-1),easing:'steps(1,end)'} as any));
      return seq;
    }
    return phase==='in'?[away,shown]:[shown,away];
  }
  const props=['opacity','translate','rotate','scale','mask-image','-webkit-mask-image'];
  function lower(el:HTMLElement){const saved:[string,string][]=[];for(const p of props){const v=el.style.getPropertyValue(p);if(v&&el.style.getPropertyPriority(p)==='important'){saved.push([p,v]);el.style.setProperty(p,v);}}return()=>saved.forEach(([p,v])=>el.style.setProperty(p,v,'important'));}
  function play(f:Fx,after?:()=>void){
    if(f.legacy){const el=f.els[0];setTimeout(()=>el.classList.remove('pending'),opts.reduced?0:f.delay);return;}
    if(opts.reduced){setTimeout(()=>{f.els.forEach(el=>hide(el,f.phase==='out'));after?.();},0);return;}
    // The group's box is measured with every member shown, before any of them moves.
    const restores=f.els.map(el=>{const restore=lower(el);if(f.phase==='in')hide(el,false);return restore;});
    let group:{left:number;top:number;right:number;bottom:number}|undefined;
    if(f.els.length>1){const boxes=f.els.map(el=>el.getBoundingClientRect());group={left:Math.min(...boxes.map(b=>b.left)),top:Math.min(...boxes.map(b=>b.top)),right:Math.max(...boxes.map(b=>b.right)),bottom:Math.max(...boxes.map(b=>b.bottom))};}
    let left=f.els.length;const one=()=>{if(--left===0)after?.();};
    f.els.forEach((el,i)=>{
      const restore=restores[i];let a:Animation;
      try{a=el.animate(frames(el,f.phase,f.type,group),{duration:Math.max(1,f.dur),delay:f.delay,fill:'backwards',easing:f.phase==='in'?'cubic-bezier(.2,.8,.2,1)':'cubic-bezier(.6,0,.8,.4)'});}
      catch{restore();hide(el,f.phase==='out');one();return;}
      running.push(a);
      a.finished.then(()=>{restore();if(f.phase==='out')hide(el,true);try{a.cancel();}catch{}one();},()=>{restore();});
    });
  }
  function playStep(n:number){finish();(steps[n]||[]).forEach(f=>play(f));}
  return{
    clicks,
    // Tells the slide where to start: done = steps already played.
    apply:(done:number)=>{finish();apply(done);},
    playStep,
    // Editor preview: one effect on the selected objects (each group as one), which end visible.
    preview(list:HTMLElement[],phase:'in'|'out',type:string,dur:number){
      if(!types.includes(type))return;finish();
      const byGroup=new Map<string,HTMLElement[]>();
      list.forEach((el,i)=>{const key=el.getAttribute('data-group-id')||'#'+i;byGroup.set(key,[...byGroup.get(key)||[],el]);});
      for(const members of byGroup.values())play({els:members,phase,type,dur:type==='appear'?0:dur,trigger:'click',order:0,pos:0,legacy:false,delay:0},()=>members.forEach(el=>hide(el,false)));
    }
  };
}
