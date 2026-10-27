import {Deck,Slide,safeJson,masterOf} from './model';
import {alignMovement,boxStyle,resizeImage,canvasGeometry} from './geometry';
import {editRuntime} from './canvas';
import {pollCss,pollMarkup,pollViewRuntime,pollWords} from './poll';

function slideRuntime(config:{token:string;staticMode:boolean;steps:number;id:string;edit:boolean}){
  const w=window as any;
  // Restore the original CSS declarations, including in older decks with animation:none!important.
  // CSSOM keeps nested rules and comma-separated queries intact. Impossible/always-true width
  // queries simulate no-preference for CSS without changing the browser or the stored deck.
  if(!config.staticMode&&!config.edit&&document.documentElement.dataset.esfMotion==='full'){
    const visit=(rules:CSSRuleList)=>{for(const rule of [...rules]){
      if(rule instanceof CSSMediaRule)rule.media.mediaText=rule.media.mediaText.replace(/\(\s*prefers-reduced-motion\s*(?::\s*(reduce|no-preference)\s*)?\)/gi,(_match,value)=>value?.toLowerCase()==='no-preference'?'(min-width: 0px)':'(max-width: -1px)');
      if('cssRules' in rule)visit((rule as CSSGroupingRule).cssRules);
    }};
    for(const sheet of [...document.styleSheets])visit(sheet.cssRules);
  }
  const root=document.querySelector('.slide') as HTMLElement;
  const items=document.querySelector('.esf-poll')?[]:[...document.querySelectorAll('[data-step]')];
  // steps<0 opens the slide with every step revealed (going back from the next slide).
  let step=config.staticMode||config.steps<0?items.length:Math.min(items.length,config.steps);
  const send=(type:string,extra:any={})=>parent.postMessage({app:'esf-slide',token:config.token,id:config.id,type,...extra},'*');
  const show=()=>items.forEach((el,i)=>el.classList.toggle('pending',i>=step));
  // Frames can run this before they have a size; a zero measure is skipped and the observer refits later.
  function fit(){const scale=Math.min(innerWidth/1600,innerHeight/900);if(root&&scale>0)root.style.transform=`translate(-50%,-50%) scale(${scale})`;}
  function report(e:any){send('error',{message:String(e?.message||e).slice(0,1000)});w.__slideError=String(e?.message||e);}
  const run=(name:string,...args:any[])=>{try{return w.slideBehavior?.[name]?.(...args);}catch(e){report(e);}};
  w.addEventListener('error',(e:ErrorEvent)=>report(e));
  w.addEventListener('unhandledrejection',(e:PromiseRejectionEvent)=>report(e.reason));
  addEventListener('message',e=>{
    const m=e.data;
    if(e.source!==parent||m?.app!=='esf-player'||m.token!==config.token)return;
    if(m.type==='step'){step=Math.max(0,Math.min(items.length,m.step));show();run('step',step);send('state',{step,total:items.length});}
    if(m.type==='dispose'){run('leave');run('dispose');}
  });
  // The editor canvas (edit mode) handles pointer and keys itself (editRuntime); slides never navigate there.
  if(!config.edit){addEventListener('keydown',e=>{
    if((e.target as Element)?.closest('input,textarea,select,[contenteditable]'))return;
    if(['ArrowRight','ArrowDown','PageDown',' ','ArrowLeft','ArrowUp','PageUp','Backspace','Home','End','Escape'].includes(e.key)||/^[fphtlwemvsad]$/i.test(e.key)||((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z')){e.preventDefault();send('key',{key:e.key,meta:e.metaKey||e.ctrlKey,alt:e.altKey});}
  });
  addEventListener('click',e=>{
    const a=(e.target as Element)?.closest('a');
    if(a){e.preventDefault();const href=a.getAttribute('href')||'';if(/^https?:|^mailto:/i.test(href))send('link',{href});return;}
    if((e.target as Element)?.closest('button,input,textarea,select,[contenteditable],[data-interactive]'))return;
    send('navigate',{direction:e.clientX>innerWidth/2?1:-1});
  });
  let startX:number|null=null;
  addEventListener('touchstart',e=>{if(!(e.target as Element)?.closest('a,button,input,[data-interactive]'))startX=e.touches[0].clientX;},{passive:true});
  addEventListener('touchend',e=>{if(startX!==null){const delta=e.changedTouches[0].clientX-startX;if(Math.abs(delta)>70)send('navigate',{direction:delta<0?1:-1});startX=null;}},{passive:true});}
  addEventListener('resize',fit);new ResizeObserver(fit).observe(document.documentElement);
  show();fit();
  Promise.all([document.fonts.ready,...[...document.images].filter(im=>im.hasAttribute('src')).map(im=>im.decode().catch(()=>report('Image could not be decoded.')))])
    .then(async()=>{
      await run('mount',root);
      if(config.staticMode){await run('renderStatic',root);items.forEach(el=>el.classList.remove('pending'));}
      else {await run('enter',root);run('step',step);}
      requestAnimationFrame(()=>requestAnimationFrame(()=>{w.__slideReady=true;document.documentElement.dataset.esfReady='true';dispatchEvent(new Event('esf-slide-ready'));send('ready',{total:items.length,step});}));
    }).catch(report);
  addEventListener('pagehide',()=>{run('leave');run('dispose');});
}
// Editor previews load this shell from the esf-frame: scheme (own CSP, own origin and
// renderer process) and write the slide document into it; srcdoc would inherit the editor CSP.
export const frameShellCsp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none';";
export const frameShell=`<!doctype html><html><head><meta charset="utf-8"></head><body><script>addEventListener('message',function(e){var m=e.data;if(e.source!==parent||!m||m.app!=='esf-shell'||typeof m.html!=='string')return;document.open();document.write(m.html);document.close();});parent.postMessage({app:'esf-shell',type:'loaded'},'*');</script></body></html>`;
// inline=false keeps asset:ID references (still checked) for the exported player, which resolves
// them from one shared catalog when a slide loads instead of repeating data in every document.
export function inlineAssets(text:string,deck:Deck,inline=true){
  return text.replace(/asset:([\w-]+)/g,(ref,id)=>{const a=deck.assets.find(x=>x.id===id);if(!a)throw Error(`Missing asset ${id}`);return inline?`data:${a.mime};base64,${a.data}`:ref;});
}
// Master objects are a layer inside the slide (slide coordinates), behind its content; the editor canvas never selects them.
export function withMaster(html:string,master:string){
  if(!master.trim())return html;const layer=`<div class="esf-master">${master}</div>`,m=html.match(/<[a-z][\w-]*\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["'][^>]*>/i);
  return m?html.slice(0,m.index!+m[0].length)+layer+html.slice(m.index!+m[0].length):layer+html;
}
// Minified code keeps placeholders for per-document data; filled textually (a function, so `$` in JSON is literal).
export function fill(code:string,values:Record<string,string>){return code.replace(/__ESF_[A-Z]+__/g,k=>values[k]??k);}
export function slideDocument(deck:Deck,slide:Slide,staticMode=false,token='',steps=0,inline=true,edit?:{select:number[];editing:boolean;range?:{start:number;end:number}|null},lang:'pt'|'en'|'es'='en',min?:(code:string)=>string){
  const master=masterOf(deck,slide);
  let html=inlineAssets(withMaster(staticMode&&slide.staticHtml?slide.staticHtml:slide.html,master.html),deck,inline);
  if(slide.poll){const block=pollMarkup(slide.poll,pollWords[lang],staticMode||!!edit),open=html.match(/<[a-z][\w-]*\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["'][^>]*>/i);html=open?html.slice(0,open.index!+open[0].length)+block+html.slice(open.index!+open[0].length):`<section class="slide">${block}</section>`;}
  const style=inlineAssets(master.css+'\n'+(deck.layouts.find(l=>l.id===slide.layoutId)?.css||'')+'\n'+slide.css,deck,inline).replace(/<\/style/gi,'<\\/style');
  const behavior=inlineAssets(slide.poll?'':min&&slide.script.trim()?min(slide.script):slide.script,deck,inline).replace(/<\/script/gi,'<\\/script');
  const config={token,staticMode,steps,id:slide.id,edit:!!edit,poll:slide.poll};
  const runtime=(edit||!min?`(${slideRuntime.toString()})(${safeJson(config)});`+(slide.poll?`\n(${pollViewRuntime.toString()})(${safeJson(config)},${safeJson(pollWords[lang])});`:''):fill(min(`(${slideRuntime.toString()})(__ESF_CONFIG__);`+(slide.poll?`\n(${pollViewRuntime.toString()})(__ESF_CONFIG__,__ESF_WORDS__);`:'')),{__ESF_CONFIG__:safeJson(config),__ESF_WORDS__:safeJson(pollWords[lang])}))+(edit&&!slide.poll?`\n(${editRuntime.toString()})(${safeJson(edit)},(${alignMovement.toString()}),(${resizeImage.toString()}),(${boxStyle.toString()}),(${canvasGeometry.toString()})());`:'');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none';"><style>${style}
html,body{width:100%;height:100%;overflow:hidden}.slide{position:absolute;top:50%;left:50%;transform-origin:center;transform:translate(-50%,-50%)}
.esf-master{position:absolute;inset:0;padding:inherit;z-index:-1;pointer-events:none}${edit?'':'.esf-master>*{pointer-events:auto}'}
${staticMode?'*{animation:none!important;transition:none!important}[data-step]{opacity:1!important;transform:none!important}':''}
${slide.poll?pollCss:''}
</style></head><body>${html}<script>${behavior}\n</script><script>${runtime.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
}
