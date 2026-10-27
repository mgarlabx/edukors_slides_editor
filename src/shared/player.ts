// Exported presentation player. Its controls follow the original reference deck player (hot-corner
// docks, dot track with previews, pen, highlight, text, lens, whiteboards and presenter panel)
// without the editing commands. Each slide still runs isolated in its own sandboxed frame; the
// overlays sit on top of it in the same 1600 × 900 coordinate space.
import {Deck,Language,safeJson,escapeHtml} from './model';
import {slideDocument,fill} from './render';
import {createPollController,normalizePollServer,pollEndpoint,pollWords} from './poll';
import {qrRuntimeSource} from './qr';

export const playerWords={
  pt:{credit:'Gerado pelo Edukors Slides Editor',creditAt:'em',motionNotice:'Este computador está configurado para reduzir movimentos. Deseja ativar as animações desta apresentação?',motionEnable:'Ativar animações',motionKeep:'Manter configuração atual',goto:'Ir para o slide',slides:'Slides',slide:'Slide',of:'de',step:'Etapa',penLabel:'Caneta',pen:'Caneta (P)',hlLabel:'Destaque',hl:'Destaque (H) · o traço some sozinho',textLabel:'Texto',text:'Texto (T) · clique no slide e digite; Enter fixa',eraseLabel:'Apagar tudo',erase:'Apagar tudo (E)',lensLabel:'Lente',lens:'Lente (L) · roda do mouse ajusta o zoom',boardLabel:'Lousa',board:'Lousa (W) · infinita: escreva, desenhe, apague, mova e role; fica salva neste navegador',presenterLabel:'Abrir painel do apresentador',presenter:'Abrir o painel em outra janela',fsLabel:'Alternar tela cheia',fs:'Tela cheia (F)',noteLabel:'Texto sobre o slide',wbNoteLabel:'Texto na lousa',homeLabel:'Voltar ao início',home:'Voltar ao início (Home) · role com o trackpad, a roda do mouse ou as setas, ou arraste com Espaço pressionado',moveLabel:'Mover',move:'Mover (M) · arraste o que foi escrito ou desenhado; arraste o vazio para rolar a lousa',wbPen:'Caneta (P)',wbText:'Texto (T) · clique para escrever, ou num texto para editá-lo',eraserLabel:'Borracha',eraser:'Borracha (E) · passe sobre o traço ou texto',shapesLabel:'Formas',shapes:'Formas (S) · escolha a forma, arraste para desenhar e escreva dentro',rect:'Retângulo',round:'Retângulo arredondado',ellipseLabel:'Círculo',ellipse:'Círculo / elipse (Shift: círculo perfeito)',diamond:'Losango',triangle:'Triângulo',arrowsLabel:'Setas',arrows:'Setas (A) · escolha a direção, arraste para desenhar e escreva dentro',arrowLeft:'Seta para a esquerda',arrowRight:'Seta para a direita',arrowUp:'Seta para cima',arrowDown:'Seta para baixo',colors:'Cores',color:'Cor',undoLabel:'Desfazer',undo:'Desfazer (⌘Z / Ctrl+Z)',wipe:'Apagar tudo',wipeTitle:'Apagar tudo o que está na lousa',confirmWipe:'Apagar tudo o que está na lousa? Isso não pode ser desfeito.',fsFallback:'Use o comando de tela cheia do navegador para apresentar.',popup:'O navegador bloqueou a janela do painel; ele foi aberto nesta janela. Permita pop-ups para usá-lo em outra janela.',panel:'Painel',previous:'← Anterior',next:'Próximo →',now:'AGORA',jump:'Ir para este slide',closed:'A janela da apresentação foi fechada.',close:'Fechar',error:'Erro no slide',restore:'A sessão anterior não pôde ser restaurada. O conteúdo foi aberto com uma nova sessão.'},
  en:{credit:'Made with Edukors Slides Editor',creditAt:'on',motionNotice:'This computer is set to reduce motion. Enable animations for this presentation?',motionEnable:'Enable animations',motionKeep:'Keep current setting',goto:'Go to slide',slides:'Slides',slide:'Slide',of:'of',step:'Step',penLabel:'Pen',pen:'Pen (P)',hlLabel:'Highlight',hl:'Highlight (H) · the stroke fades on its own',textLabel:'Text',text:'Text (T) · click the slide and type; Enter places it',eraseLabel:'Clear all',erase:'Clear all (E)',lensLabel:'Magnifier',lens:'Magnifier (L) · mouse wheel adjusts the zoom',boardLabel:'Whiteboard',board:'Whiteboard (W) · infinite: write, draw, erase, move and scroll; saved in this browser',presenterLabel:'Open presenter panel',presenter:'Open the panel in another window',fsLabel:'Toggle fullscreen',fs:'Fullscreen (F)',noteLabel:'Text on the slide',wbNoteLabel:'Text on the whiteboard',homeLabel:'Back to start',home:'Back to start (Home) · scroll with the trackpad, mouse wheel or arrow keys, or drag while holding Space',moveLabel:'Move',move:'Move (M) · drag what was written or drawn; drag empty space to scroll the whiteboard',wbPen:'Pen (P)',wbText:'Text (T) · click to write, or click a text to edit it',eraserLabel:'Eraser',eraser:'Eraser (E) · pass over a stroke or text',shapesLabel:'Shapes',shapes:'Shapes (S) · pick a shape, drag to draw and type inside',rect:'Rectangle',round:'Rounded rectangle',ellipseLabel:'Circle',ellipse:'Circle / ellipse (Shift: perfect circle)',diamond:'Diamond',triangle:'Triangle',arrowsLabel:'Arrows',arrows:'Arrows (A) · pick a direction, drag to draw and type inside',arrowLeft:'Left arrow',arrowRight:'Right arrow',arrowUp:'Up arrow',arrowDown:'Down arrow',colors:'Colors',color:'Color',undoLabel:'Undo',undo:'Undo (⌘Z / Ctrl+Z)',wipe:'Clear all',wipeTitle:'Clear everything on the whiteboard',confirmWipe:'Clear everything on the whiteboard? This cannot be undone.',fsFallback:'Use the browser’s fullscreen command to present.',popup:'The browser blocked the panel window, so it opened in this window. Allow pop-ups to use it in another window.',panel:'Panel',previous:'← Previous',next:'Next →',now:'NOW',jump:'Go to this slide',closed:'The presentation window was closed.',close:'Close',error:'Slide error',restore:'The previous session could not be restored. The content was opened with a new session.'},
  es:{credit:'Generado con Edukors Slides Editor',creditAt:'el',motionNotice:'Este equipo está configurado para reducir el movimiento. ¿Activar las animaciones de esta presentación?',motionEnable:'Activar animaciones',motionKeep:'Mantener configuración actual',goto:'Ir a la diapositiva',slides:'Diapositivas',slide:'Diapositiva',of:'de',step:'Paso',penLabel:'Lápiz',pen:'Lápiz (P)',hlLabel:'Resaltador',hl:'Resaltador (H) · el trazo desaparece solo',textLabel:'Texto',text:'Texto (T) · haz clic en la diapositiva y escribe; Enter lo fija',eraseLabel:'Borrar todo',erase:'Borrar todo (E)',lensLabel:'Lupa',lens:'Lupa (L) · la rueda del ratón ajusta el zoom',boardLabel:'Pizarra',board:'Pizarra (W) · infinita: escribe, dibuja, borra, mueve y desplázate; se guarda en este navegador',presenterLabel:'Abrir panel del presentador',presenter:'Abrir el panel en otra ventana',fsLabel:'Alternar pantalla completa',fs:'Pantalla completa (F)',noteLabel:'Texto sobre la diapositiva',wbNoteLabel:'Texto en la pizarra',homeLabel:'Volver al inicio',home:'Volver al inicio (Inicio) · desplázate con el trackpad, la rueda del ratón o las flechas, o arrastra con Espacio pulsado',moveLabel:'Mover',move:'Mover (M) · arrastra lo que se escribió o dibujó; arrastra el vacío para desplazar la pizarra',wbPen:'Lápiz (P)',wbText:'Texto (T) · haz clic para escribir, o en un texto para editarlo',eraserLabel:'Borrador',eraser:'Borrador (E) · pasa sobre el trazo o el texto',shapesLabel:'Formas',shapes:'Formas (S) · elige la forma, arrastra para dibujar y escribe dentro',rect:'Rectángulo',round:'Rectángulo redondeado',ellipseLabel:'Círculo',ellipse:'Círculo / elipse (Shift: círculo perfecto)',diamond:'Rombo',triangle:'Triángulo',arrowsLabel:'Flechas',arrows:'Flechas (A) · elige la dirección, arrastra para dibujar y escribe dentro',arrowLeft:'Flecha a la izquierda',arrowRight:'Flecha a la derecha',arrowUp:'Flecha hacia arriba',arrowDown:'Flecha hacia abajo',colors:'Colores',color:'Color',undoLabel:'Deshacer',undo:'Deshacer (⌘Z / Ctrl+Z)',wipe:'Borrar todo',wipeTitle:'Borrar todo lo que hay en la pizarra',confirmWipe:'¿Borrar todo lo que hay en la pizarra? No se puede deshacer.',fsFallback:'Usa el comando de pantalla completa del navegador para presentar.',popup:'El navegador bloqueó la ventana del panel, así que se abrió en esta ventana. Permite ventanas emergentes para usarlo en otra ventana.',panel:'Panel',previous:'← Anterior',next:'Siguiente →',now:'AHORA',jump:'Ir a esta diapositiva',closed:'Se cerró la ventana de la presentación.',close:'Cerrar',error:'Error en la diapositiva',restore:'No se pudo restaurar la sesión anterior. El contenido se abrió con una sesión nueva.'},
};
export type PlayerWords=typeof playerWords.pt;
// Initial step placeholder in each slide document, replaced when the slide is loaded.
const STEP_SENTINEL=987654321;
const FONT='-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

function playerRuntime(data:any,pollFactory:typeof createPollController,qr:(url:string)=>string){
  const W=data.words,tools=!!data.tools,$=(id:string):any=>document.getElementById(id);
  const N=data.slides.length,FONT=data.font;
  const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const doc=(i:number,kind:'html'|'static')=>(data.slides[i][kind] as string).replace(/asset:([\w-]+)/g,(ref:string,id:string)=>data.assets[id]||ref);
  let forceMotion=false;
  const live=(i:number,t:string,s:number)=>doc(i,'html').replace('<html ',forceMotion?'<html data-esf-motion="full" ':'<html ').split('__ESF_TOKEN__').join(t).replace('"steps":'+data.sentinel,'"steps":'+s);
  const stage=$('stage'),frames:any[]=[...document.querySelectorAll('#stage > .frame')];
  // Slide frames are sandboxed without clipboard access; the player copies on their behalf (the click's activation reaches it).
  const copyText=async(text:string)=>{if(!text)return false;try{await navigator.clipboard.writeText(text);return true;}catch{}const t=document.createElement('textarea');t.value=text;t.style.cssText='position:fixed;opacity:0';document.body.append(t);t.select();let ok=false;try{ok=document.execCommand('copy');}catch{}t.remove();return ok;};
  const post=(f:any,t:string,type:string,extra:any={})=>f?.contentWindow?.postMessage({app:'esf-player',token:t,type,...extra},'*');

  let noticeTimer:any;
  function notice(message:string){const m=$('message');m.textContent=message;m.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>m.hidden=true,9000);}

  // Session (current slide, step and the whiteboard) is kept in this browser, as in the reference player.
  const KEY='esf-session:v1:'+data.id;
  function validSession(v:any){
    if(!v||v.format!=='esf-session'||v.version!==2||v.deckId!==data.id)throw Error('session');
    if(!Number.isInteger(v.step)||v.step<0)throw Error('step');
    let points=0;const finite=(n:any)=>Number.isFinite(n)&&Math.abs(n)<1e7;
    const w=v.whiteboard;
    if(!w||!finite(w.x)||!finite(w.y))throw Error('board');
    if(!Array.isArray(w.items)||w.items.length>100000)throw Error('items');
    for(const item of w.items){
      if(!/^#[\da-f]{6}$/i.test(item.color))throw Error('color');
      if(item.type==='text'){if(typeof item.text!=='string'||item.text.length>10000||!finite(item.x)||!finite(item.y))throw Error('text');}
      else if(item.type==='stroke'){
        if(!finite(item.width)||item.width<=0||item.width>100||!Array.isArray(item.pts)||!item.pts.length)throw Error('stroke');
        points+=item.pts.length;if(points>1000000||!item.pts.every((p:any)=>Array.isArray(p)&&p.length===2&&p.every(finite)))throw Error('points');
      }else if(item.type==='shape'){
        if(!['rect','round','ellipse','diamond','triangle','arrow-left','arrow-right','arrow-up','arrow-down'].includes(item.kind)||typeof item.text!=='string'||item.text.length>10000||![item.x,item.y,item.w,item.h].every(finite)||item.w<0||item.h<0)throw Error('shape');
      }else throw Error('item');
    }
    return structuredClone(v);
  }
  let session:any=null;
  if(tools)try{const raw=localStorage.getItem(KEY);if(raw)session=validSession(JSON.parse(raw));}catch{setTimeout(()=>notice(W.restore));}

  // ---- Slides, steps and the dot track ----
  let cur=0,step=0,total=0,token='',ready=false,queued=0,front=0;
  // Presenter sign-in for interactive questions: the server returns a 12-hour token, kept per server in this
  // browser. The key typed in the dialog is sent once and never stored.
  const PW=data.pollWords,pollKey='esf-poll-session:v1:'+data.pollEndpoint,keyDialog=$('poll-key');
  const pollSession={
    load(){try{const v=JSON.parse(localStorage.getItem(pollKey)||'null');return v&&v.format==='esf-poll-session'&&v.version===1&&typeof v.token==='string'&&/^[0-9a-f]{64}$/.test(v.token)&&Number.isFinite(v.expiresAt)?{token:v.token,expiresAt:v.expiresAt}:null;}catch{return null;}},
    save(v:any){try{localStorage.setItem(pollKey,JSON.stringify({format:'esf-poll-session',version:1,token:v.token,expiresAt:v.expiresAt}));}catch{}},
    clear(){try{localStorage.removeItem(pollKey);}catch{}},
    askKey(reason:string){return new Promise<string|null>(resolve=>{
      const input=$('poll-key-input'),error=$('poll-key-error');input.value='';showKey(false);error.textContent=reason==='invalid'?PW.keyInvalid:reason==='expired'?PW.keyExpired:'';error.hidden=!error.textContent;
      const done=(value:string|null)=>{keyDialog.removeEventListener('close',closed);keyDialog.onsubmit=null;$('poll-key-cancel').onclick=null;if(keyDialog.open)keyDialog.close();window.focus();resolve(value);};
      const closed=()=>done(null);keyDialog.addEventListener('close',closed);
      keyDialog.onsubmit=(e:Event)=>{e.preventDefault();const key=input.value.trim();if(key)done(key);};
      $('poll-key-cancel').onclick=()=>done(null);
      keyDialog.showModal();input.focus();
    });},
  };
  const eye=$('poll-key-eye'),showKey=(on:boolean)=>{$('poll-key-input').type=on?'text':'password';eye.setAttribute('aria-pressed',String(on));eye.setAttribute('aria-label',on?PW.keyHide:PW.keyShow);eye.title=on?PW.keyHide:PW.keyShow;};
  eye.addEventListener('click',()=>{showKey($('poll-key-input').type==='password');$('poll-key-input').focus();});
  // Keys usually arrive by message or e-mail; reading the clipboard may be refused, and then ⌘V/Ctrl+V in the field still works.
  $('poll-key-paste').addEventListener('click',async()=>{const input=$('poll-key-input');try{const text=(await navigator.clipboard.readText()).trim();if(text)input.value=text.slice(0,200);}catch{}input.focus();});
  keyDialog.addEventListener('click',(e:Event)=>e.stopPropagation());keyDialog.addEventListener('keydown',(e:Event)=>e.stopPropagation());
  const polls=pollFactory(data.slides.map((s:any)=>s.poll),(i,s)=>{if(i===cur&&ready)post(frames[front],token,'poll-state',{state:s});},qr,undefined,{endpoint:data.pollEndpoint},pollSession);
  let pollNavigation=false;
  addEventListener('visibilitychange',()=>polls.visibility(document.hidden));
  addEventListener('pagehide',()=>polls.dispose());
  const track=$('track');
  const dots=data.slides.map((_:any,i:number)=>{
    const b=document.createElement('button');
    b.setAttribute('aria-label',`${W.goto} ${i+1}`);
    b.addEventListener('click',e=>{e.stopPropagation();go(i);});
    b.addEventListener('mouseenter',()=>showPreview(i));b.addEventListener('focus',()=>showPreview(i));
    b.addEventListener('mouseleave',hidePreview);b.addEventListener('blur',hidePreview);
    track.appendChild(b);return b;
  });
  // Previews: static copies of the slides with every step shown, created on first hover.
  const preview=$('preview'),previewFrame=preview.querySelector('.frame'),thumbs:any[]=[];
  function showPreview(i:number){
    if(!thumbs[i]){const f=document.createElement('iframe');f.sandbox.add('allow-scripts');f.tabIndex=-1;f.setAttribute('aria-hidden','true');f.srcdoc=doc(i,'static');thumbs[i]=f;previewFrame.append(f);}
    thumbs.forEach((f,k)=>f&&(f.hidden=k!==i));
    preview.querySelector('.num').textContent=i+1;
    const b=dots[i],x=track.offsetLeft+b.offsetLeft+b.offsetWidth/2;
    preview.style.left=Math.max(146,Math.min(1600-146,x))+'px';
    preview.classList.add('on');
  }
  function hidePreview(){preview.classList.remove('on');}

  function announce(){
    dots.forEach((d:any,i:number)=>{d.classList.toggle('here',i===cur);d.classList.toggle('done',i<cur);});
    // Exposed for automation and assistive tooling; not used by the player itself.
    document.body.dataset.slide=`${cur+1}/${N}`;document.body.dataset.step=`${step}/${total}`;
    panels.forEach(p=>p.update());
    persist();
  }
  // The next slide loads in the hidden frame and fades in once ready, like the reference transition.
  function go(n:number,atEnd=false,initial=0,skipPollClose=false){
    if(pollNavigation)return;
    if(n!==cur&&!skipPollClose&&polls.needsClose(cur)){
      pollNavigation=true;
      void polls.leave(cur).then(ok=>{pollNavigation=false;if(ok||confirm(data.pollWords.leave))go(n,atEnd,initial,true);});return;
    }
    const from=cur;cur=Math.max(0,Math.min(N-1,n));
    ready=false;polls.activate(cur);
    if(cur!==from&&tools)clearInk();
    token=random();ready=false;queued=0;step=atEnd?data.slides[cur].steps:initial;total=data.slides[cur].steps;
    const f=frames[1-front];f.dataset.token=token;f.srcdoc=live(cur,token,atEnd?-1:initial);
    announce();
  }
  function shown(f:any){
    if(f===frames[front])return;
    const old=frames[front],oldToken=old.dataset.token;front=frames.indexOf(f);
    f.classList.add('on');old.classList.remove('on');
    // Keyboard focus must not stay in the frame that is about to be emptied.
    if(document.activeElement===old){old.blur();window.focus();}
    setTimeout(()=>{if(old.dataset.token===oldToken&&old!==frames[front]){post(old,oldToken,'dispose');old.dataset.token='';old.srcdoc='';}},450);
  }
  function sendStep(){post(frames[front],token,'step',{step});refreshLens();announce();}
  function next(){if(!ready){queued++;return;}if(step<total){step++;sendStep();}else if(cur<N-1)go(cur+1);}
  function prev(){if(!ready){if(cur>0)go(cur-1,true);return;}if(step>0){step--;sendStep();}else if(cur>0)go(cur-1,true);}

  // ---- Docks: hot corners on mouse, tap to open on touch ----
  let dockJustClosed=false;
  const docks=[$('topdock'),$('dock')].filter(Boolean);
  docks.forEach((d:any)=>d.querySelectorAll('.corner').forEach((c:any)=>{
    c.addEventListener('pointerdown',(e:any)=>{
      if(e.pointerType==='mouse')return;e.stopPropagation();
      const open=!d.classList.contains('open');docks.forEach((o:any)=>o.classList.toggle('open',o===d&&open));
    });
    c.addEventListener('click',(e:any)=>e.stopPropagation());
  }));
  addEventListener('pointerdown',e=>{
    document.documentElement.classList.toggle('touch',e.pointerType!=='mouse');
    dockJustClosed=false;if(e.pointerType==='mouse')return;
    docks.forEach((d:any)=>{if(d.classList.contains('open')&&!d.contains(e.target)){d.classList.remove('open');dockJustClosed=true;}});
    if(dockJustClosed)e.stopPropagation();
  },true);
  addEventListener('pointermove',e=>{if(e.pointerType==='mouse')document.documentElement.classList.remove('touch');});
  $('dock-bar').addEventListener('click',(e:any)=>e.stopPropagation());
  // Clicks outside the slide frame (letterbox) also navigate by half of the window.
  addEventListener('click',e=>{
    if(dockJustClosed){dockJustClosed=false;return;}
    if((e.target as Element).closest('a,button,input,#wb,#top-bar,#dock-bar,.esf-panel'))return;
    e.clientX>innerWidth/2?next():prev();
  });

  function fit(){const s=Math.min(innerWidth/1600,innerHeight/900)*0.97;stage.style.transform=`translate(-50%, -50%) scale(${s})`;}
  function toggleFullscreen(){
    if(!document.documentElement.requestFullscreen){notice(W.fsFallback);return;}
    const action=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
    action?.catch(()=>notice(W.fsFallback));
  }
  $('fs-btn')?.addEventListener('click',(e:any)=>{e.currentTarget.blur();toggleFullscreen();});

  // ---- Keyboard (also forwarded from the slide frame) ----
  function handleKey(key:string,meta=false,alt=false){
    if($('motion-notice').open||$('poll-key').open)return false;
    if(wbOpen)return boardKey(key,meta,alt);
    if(meta||alt)return false;
    if(['ArrowRight','ArrowDown','PageDown',' '].includes(key))next();
    else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(key))prev();
    else if(key==='Home')go(0);
    else if(key==='End')go(N-1);
    else if(key==='f'||key==='F')toggleFullscreen();
    else if(!tools)return false;
    else if(key==='p'||key==='P')setTool('pen');
    else if(key==='h'||key==='H')setTool('hl');
    else if(key==='t'||key==='T')setTool('text');
    else if(key==='l'||key==='L')setTool('lens');
    else if(key==='w'||key==='W')toggleBoard();
    else if(key==='e'||key==='E')clearInk();
    else return false;
    return true;
  }
  addEventListener('keydown',e=>{
    if(tools&&(e.target===note||e.target===wbNote))return;
    if((e.target as Element).closest?.('.esf-panel'))return;
    if(handleKey(e.key,e.metaKey||e.ctrlKey,e.altKey))e.preventDefault();
  });

  // ---- Messages from slide frames ----
  addEventListener('message',e=>{
    const m=e.data,f=frames.find(x=>x.contentWindow===e.source);
    if(!f||m?.app!=='esf-slide'||!m.token||m.token!==f.dataset.token)return;
    if(m.token===token&&(m.type==='ready'||m.type==='state')){
      // The player owns the step; late 'state' replies must not undo key presses that followed.
      total=m.total;if(m.type==='ready')step=m.step;else step=Math.min(step,total);
      if(m.type==='ready'){
        ready=true;shown(f);if(data.slides[cur].poll)polls.publish(cur);const n=queued;queued=0;
        if(n>total&&cur<N-1){const carry=n-total-1;go(cur+1);queued=carry;return;}
        if(n){step=Math.min(total,n);post(f,token,'step',{step});}
      }
      refreshLens();announce();
    }
    if(m.type==='poll'&&m.token===token&&f===frames[front]&&m.id===data.slides[cur].id&&ready&&m.action==='csv'){
      // Sandboxed slides cannot download; the player saves the file on their behalf.
      polls.csv(cur,data.pollWords).then(file=>{if(!file)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([file.text],{type:'text/csv;charset=utf-8'}));a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000);},(e:any)=>{if(e?.message!=='cancelled')notice(data.pollWords.csvFailed);});return;}
    if(m.type==='poll'&&m.token===token&&f===frames[front]&&m.id===data.slides[cur].id&&ready&&m.action==='copy'){copyText(polls.link(cur)).then(ok=>post(f,token,'poll-copied',{ok}));return;}
    if(m.type==='poll'&&m.token===token&&f===frames[front]&&m.id===data.slides[cur].id&&ready&&typeof m.action==='string'&&(m.action!=='again'||confirm(data.pollWords.confirmAgain)))void polls.action(cur,m.action);
    if(m.type==='navigate'){if(dockJustClosed||(tools&&(wbOpen||(tool&&tool!=='lens'))))return;m.direction>0?next():prev();}
    if(m.type==='key')handleKey(m.key,!!m.meta,!!m.alt);
    if(m.type==='error')notice(W.error+': '+m.message);
    if(m.type==='link'&&/^https?:|^mailto:/i.test(m.href))window.open(m.href,'_blank','noopener,noreferrer');
  });

  // ---- Presenter tools (exported HTML only) ----
  let tool:string|null=null,wbOpen=false;
  const panels:{update:()=>void;closed:()=>void}[]=[];
  let clearInk=()=>{},refreshLens=()=>{},setTool=(_t:string)=>{},toggleBoard=()=>{},boardKey=(_k:string,_m:boolean,_a:boolean)=>false,persist=()=>{};
  let note:any=null,wbNote:any=null,wbState:any={items:[],x:0,y:0};
  if(tools){
    persist=()=>{try{localStorage.setItem(KEY,JSON.stringify({format:'esf-session',version:2,deckId:data.id,slideId:data.slides[cur].id,step,whiteboard:wbState}));}catch{}};
    const stagePoint=(e:any)=>{const r=stage.getBoundingClientRect();return[(e.clientX-r.left)/r.width*1600,(e.clientY-r.top)/r.height*900];};
    const ink=$('ink'),lens=$('lens'),lensView=lens.querySelector('.view'),lensFrame=$('lens-frame'),lensInk=document.createElement('canvas');
    const toolBtns:any={pen:$('pen-btn'),hl:$('hl-btn'),text:$('text-btn'),lens:$('lens-btn')};
    const LENS_R=180;let zoom=2.5,lensAt:any=null,last:any=null,lensToken='';
    ink.width=lensInk.width=3200;ink.height=lensInk.height=1800;lensView.append(lensInk);
    const pen=ink.getContext('2d');pen.scale(2,2);
    Object.assign(pen,{strokeStyle:'#FF3B5C',lineWidth:6,lineCap:'round',lineJoin:'round'});
    setTool=(t:string)=>{
      if(wbOpen)toggleBoard();
      commitNote();
      tool=tool===t?null:t;
      document.documentElement.dataset.tool=tool||'';
      Object.entries(toolBtns).forEach(([k,b]:any)=>{b.classList.toggle('on',k===tool);b.setAttribute('aria-pressed',String(k===tool));});
      if(tool==='lens'){refreshLens();placeLens();}else lens.classList.remove('on');
    };
    Object.entries(toolBtns).forEach(([k,b]:any)=>b.addEventListener('click',(e:any)=>{e.currentTarget.blur();setTool(k);}));
    $('erase-btn').addEventListener('click',(e:any)=>{e.currentTarget.blur();clearInk();});
    $('top-bar').addEventListener('click',(e:any)=>e.stopPropagation());
    clearInk=()=>{pen.clearRect(0,0,1600,900);marks.length=0;closeNote();};

    ink.addEventListener('pointerdown',(e:any)=>{
      if(e.button!==0||tool!=='pen')return;
      ink.setPointerCapture(e.pointerId);last=stagePoint(e);
      pen.beginPath();pen.arc(...last,pen.lineWidth/2,0,2*Math.PI);pen.fillStyle=pen.strokeStyle;pen.fill();
    });
    ink.addEventListener('pointermove',(e:any)=>{
      if(!last)return;const evs=e.getCoalescedEvents?.();
      for(const ev of evs?.length?evs:[e]){const p=stagePoint(ev);pen.beginPath();pen.moveTo(...last);pen.lineTo(...p);pen.stroke();last=p;}
    });
    ink.addEventListener('pointerup',()=>last=null);ink.addEventListener('pointercancel',()=>last=null);
    // With the pen or text tool, clicking draws instead of changing slides; the lens still navigates.
    ink.addEventListener('click',(e:any)=>{if(tool!=='lens')e.stopPropagation();if(tool==='text')openNote(stagePoint(e));});

    note=$('note');const NOTE_FONT='700 36px '+FONT;let noteAt:any=null;
    function openNote([x,y]:number[]){commitNote();noteAt=[x,y];note.value='';note.style.left=x-8+'px';note.style.top=y-26+'px';sizeNote();note.classList.add('on');note.focus();}
    function sizeNote(){pen.save();pen.font=NOTE_FONT;note.style.width=Math.ceil(pen.measureText(note.value).width)+20+'px';pen.restore();}
    function closeNote(){noteAt=null;note.classList.remove('on');note.blur();}
    function commitNote(){
      if(!noteAt)return;const text=note.value.trim();
      if(text){pen.save();Object.assign(pen,{font:NOTE_FONT,fillStyle:'#FF3B5C',textBaseline:'middle'});pen.fillText(text,noteAt[0],noteAt[1]);pen.restore();}
      closeNote();
    }
    note.addEventListener('input',sizeNote);
    note.addEventListener('keydown',(e:any)=>{if(e.key==='Enter')commitNote();if(e.key==='Escape')closeNote();});
    note.addEventListener('blur',commitNote);note.addEventListener('click',(e:any)=>e.stopPropagation());

    // Highlight: each stroke stays while drawn, waits a moment and fades out.
    const glow=$('glow');glow.width=3200;glow.height=1800;
    const hl=glow.getContext('2d');hl.scale(2,2);
    Object.assign(hl,{strokeStyle:'#FFB020',lineWidth:10,lineCap:'round',lineJoin:'round',shadowColor:'#FFB020',shadowBlur:18});
    const HL_HOLD=900,HL_FADE=900,marks:any[]=[];let mark:any=null,glowing=false;
    function drawGlow(){
      const now=performance.now();hl.clearRect(0,0,1600,900);
      for(let i=marks.length-1;i>=0;i--){
        const m=marks[i],a=m.end===null?1:1-(now-m.end-HL_HOLD)/HL_FADE;
        if(a<=0){marks.splice(i,1);continue;}
        hl.globalAlpha=Math.min(1,a);hl.beginPath();hl.moveTo(...m.pts[0]);m.pts.forEach((p:any)=>hl.lineTo(...p));hl.stroke();
      }
      glowing=marks.length>0;if(glowing)requestAnimationFrame(drawGlow);
    }
    const wakeGlow=()=>{if(!glowing){glowing=true;requestAnimationFrame(drawGlow);}};
    glow.addEventListener('pointerdown',(e:any)=>{if(e.button!==0)return;glow.setPointerCapture(e.pointerId);const p=stagePoint(e);mark={pts:[p,p],end:null};marks.push(mark);wakeGlow();});
    glow.addEventListener('pointermove',(e:any)=>{if(!mark)return;const evs=e.getCoalescedEvents?.();for(const ev of evs?.length?evs:[e])mark.pts.push(stagePoint(ev));});
    const endMark=()=>{if(mark)mark.end=performance.now();mark=null;};
    glow.addEventListener('pointerup',endMark);glow.addEventListener('pointercancel',endMark);glow.addEventListener('click',(e:any)=>e.stopPropagation());

    // Lens: a copy of the current slide at the current step, plus what was drawn.
    refreshLens=()=>{
      if(tool!=='lens')return;
      if(lensFrame.dataset.index!==String(cur)){lensToken=random();lensFrame.dataset.index=String(cur);lensFrame.srcdoc=live(cur,lensToken,step);}
      else post(lensFrame,lensToken,'step',{step});
      const ctx=lensInk.getContext('2d')!;ctx.clearRect(0,0,3200,1800);ctx.drawImage(ink,0,0);
    };
    function placeLens(){
      if(tool!=='lens'||!lensAt)return;const [x,y]=lensAt;
      lens.style.left=x-LENS_R+'px';lens.style.top=y-LENS_R+'px';
      lensView.style.transform=`translate(${LENS_R-x*zoom}px, ${LENS_R-y*zoom}px) scale(${zoom})`;lens.classList.add('on');
    }
    addEventListener('pointermove',e=>{lensAt=stagePoint(e);placeLens();});
    document.documentElement.addEventListener('pointerleave',()=>lens.classList.remove('on'));
    addEventListener('wheel',e=>{if(tool!=='lens')return;e.preventDefault();zoom=Math.max(1.5,Math.min(6,zoom*(e.deltaY<0?1.1:1/1.1)));placeLens();},{passive:false});

    // Whiteboard (W): one infinite board; every stroke, text and shape is an object that can be erased or dragged later.
    // Items are stored in board coordinates; wbState.x/y is the board point shown at the top left of the stage.
    const wb=$('wb'),wbCanvas=$('wb-canvas'),wbBtn=$('wb-btn');wbNote=$('wb-note');
    const WB_COLORS=['#1A1F36','#FF3B5C','#6C3BFF','#1E88E5','#12A174','#FFB020'];
    const WB_FONT='700 36px '+FONT,SHAPE_FONT='700 28px '+FONT,SHAPE_LINE=34;
    const undos:string[]=[];
    let wbTool='pen',wbColor=WB_COLORS[0],wbDrag:any=null,wbEdit:any=null,wbSpace=false,wbSaveTimer:any;
    const wbKind:any={shape:'rect',arrow:'arrow-right'};
    if(session)wbState=session.whiteboard;
    const boardPoint=(e:any)=>{const [x,y]=stagePoint(e);return[x+wbState.x,y+wbState.y];};
    wbCanvas.width=3200;wbCanvas.height=1800;
    const board=wbCanvas.getContext('2d');board.scale(2,2);
    Object.assign(board,{lineCap:'round',lineJoin:'round',textBaseline:'middle',font:WB_FONT});
    const saveBoards=()=>persist();
    const items=()=>wbState.items,round1=(v:number)=>Math.round(v*10)/10;
    function changed(before:string){
      if(JSON.stringify(items())===before)return;
      undos.push(before);if(undos.length>60)undos.shift();saveBoards();
    }
    function undoBoard(){commitWbNote();const prev=undos.pop();if(prev===undefined)return;wbState.items=JSON.parse(prev);renderBoard();saveBoards();}
    function arrowPts({kind,x,y,w,h}:any){
      const horiz=kind==='arrow-left'||kind==='arrow-right',back=kind==='arrow-left'||kind==='arrow-up';
      const L=horiz?w:h,T=horiz?h:w,hl=Math.min(L*.45,T*.8),s=T*.55;
      return [[0,(T-s)/2],[L-hl,(T-s)/2],[L-hl,0],[L,T/2],[L-hl,T],[L-hl,(T+s)/2],[0,(T+s)/2]].map(([a,b])=>(back&&(a=L-a),horiz?[x+a,y+b]:[x+b,y+a]));
    }
    function shapePath(it:any){
      const {kind,x,y,w,h}=it;board.beginPath();
      if(kind==='rect')board.rect(x,y,w,h);
      else if(kind==='round')board.roundRect(x,y,w,h,Math.min(24,w/2,h/2));
      else if(kind==='ellipse')board.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);
      else{
        const pts=kind==='diamond'?[[x+w/2,y],[x+w,y+h/2],[x+w/2,y+h],[x,y+h/2]]:kind==='triangle'?[[x+w/2,y],[x+w,y+h],[x,y+h]]:arrowPts(it);
        board.moveTo(...pts[0]);pts.forEach((p:any)=>board.lineTo(...p));board.closePath();
      }
    }
    function textBox({kind,x,y,w,h}:any){
      const horiz=kind==='arrow-left'||kind==='arrow-right',hl=Math.min((horiz?w:h)*.45,(horiz?h:w)*.8);
      if(kind==='arrow-right')return{cx:x+(w-hl*.5)/2,cy:y+h/2,tw:w-hl*.5-16};
      if(kind==='arrow-left')return{cx:x+w-(w-hl*.5)/2,cy:y+h/2,tw:w-hl*.5-16};
      if(kind==='arrow-down')return{cx:x+w/2,cy:y+(h-hl)/2,tw:w*.55-12};
      if(kind==='arrow-up')return{cx:x+w/2,cy:y+h-(h-hl)/2,tw:w*.55-12};
      if(kind==='triangle')return{cx:x+w/2,cy:y+h*.65,tw:w*.5};
      return{cx:x+w/2,cy:y+h/2,tw:kind==='ellipse'?w*.72:kind==='diamond'?w*.5:w-24};
    }
    function wrapLines(text:string,tw:number){
      const lines:string[]=[];
      for(const para of text.split('\n')){
        let line='';
        for(const word of para.split(/\s+/).filter(Boolean)){const t=line?line+' '+word:word;if(line&&board.measureText(t).width>tw){lines.push(line);line=word;}else line=t;}
        lines.push(line);
      }
      return lines;
    }
    function drawShape(it:any){
      shapePath(it);board.fillStyle=it.color+'1F';board.fill();board.lineWidth=4;board.stroke();
      if(!it.text||it===wbEdit?.orig)return;
      const {cx,cy,tw}=textBox(it);board.save();
      Object.assign(board,{font:SHAPE_FONT,textAlign:'center',fillStyle:it.color});
      const lines=wrapLines(it.text,Math.max(40,tw));
      const k=Math.max(.5,Math.min(1,Math.max(40,tw)/Math.max(...lines.map(l=>board.measureText(l).width))));
      if(k<1)board.font=SHAPE_FONT.replace('28px',Math.floor(28*k)+'px');
      lines.forEach((l,j)=>board.fillText(l,cx,cy+(j-(lines.length-1)/2)*SHAPE_LINE*k));
      board.restore();
    }
    function drawItem(it:any){
      board.strokeStyle=board.fillStyle=it.color;
      if(it.type==='text'){board.fillText(it.text,it.x,it.y);return;}
      if(it.type==='shape'){drawShape(it);return;}
      board.lineWidth=it.width;board.beginPath();board.moveTo(...it.pts[0]);it.pts.forEach((p:any)=>board.lineTo(...p));
      if(it.pts.length===1)board.lineTo(it.pts[0][0]+.01,it.pts[0][1]);board.stroke();
    }
    function bounds(it:any){
      if(it.type==='shape')return[it.x,it.y,it.x+it.w,it.y+it.h];
      if(it.type==='text')return[it.x,it.y-30,it.x+board.measureText(it.text).width,it.y+30];
      let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const [x,y] of it.pts){a=Math.min(a,x);b=Math.min(b,y);c=Math.max(c,x);d=Math.max(d,y);}
      return[a-it.width,b-it.width,c+it.width,d+it.width];
    }
    // Only what is in view is drawn; the dot grid moves with the board.
    function renderBoard(){
      const {x,y}=wbState;board.setTransform(1,0,0,1,0,0);board.clearRect(0,0,3200,1800);board.setTransform(2,0,0,2,-2*x,-2*y);
      items().forEach((it:any)=>{const [a,b,c,d]=bounds(it);if(c>=x&&a<=x+1600&&d>=y&&b<=y+900)drawItem(it);});
      drawHandles();wb.style.backgroundPosition=`${-x%32}px ${-y%32}px`;
    }
    function scrollBoard(dx:number,dy:number){
      if(!dx&&!dy)return;commitWbNote();
      wbState.x=round1(Math.max(-1e6,Math.min(1e6,wbState.x+dx)));wbState.y=round1(Math.max(-1e6,Math.min(1e6,wbState.y+dy)));
      renderBoard();clearTimeout(wbSaveTimer);wbSaveTimer=setTimeout(saveBoards,300);
    }
    function homeBoard(){scrollBoard(-wbState.x,-wbState.y);}
    wbCanvas.addEventListener('wheel',(e:any)=>{
      e.preventDefault();if(wbDrag)return;
      const k=1600/stage.getBoundingClientRect().width*(e.deltaMode===1?32:e.deltaMode===2?800:1);
      let dx=e.deltaX,dy=e.deltaY;if(e.shiftKey&&!dx){dx=dy;dy=0;}
      scrollBoard(dx*k,dy*k);
    },{passive:false});
    function segDist(x:number,y:number,[ax,ay]:number[],[bx,by]:number[]){
      const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l)):0;
      return Math.hypot(x-ax-t*dx,y-ay-t*dy);
    }
    function hitItem([x,y]:number[],r=8){
      const list=items();
      for(let i=list.length-1;i>=0;i--){
        const it=list[i];
        if(it.type==='text'){const w=board.measureText(it.text).width;if(x>=it.x-r&&x<=it.x+w+r&&Math.abs(y-it.y)<=22+r)return i;}
        else if(it.type==='shape'){if(x>=it.x-r&&x<=it.x+it.w+r&&y>=it.y-r&&y<=it.y+it.h+r)return i;}
        else if(it.pts.some((p:any,j:number)=>segDist(x,y,it.pts[Math.max(0,j-1)],p)<=it.width/2+r))return i;
      }
      return -1;
    }
    function eraseAt(p:number[],from=p){
      const n=Math.max(1,Math.ceil(Math.hypot(p[0]-from[0],p[1]-from[1])/6));let i,hit=false;
      for(let k=1;k<=n;k++){const q=[from[0]+(p[0]-from[0])*k/n,from[1]+(p[1]-from[1])*k/n];while((i=hitItem(q,10))>=0){items().splice(i,1);hit=true;}}
      if(hit)renderBoard();
    }
    const HANDLES:any={nw:[0,0],n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5]},MIN_SIZE=20;
    let wbHover:any=null;
    function handleAt(it:any,[x,y]:number[]){if(!it)return null;return Object.keys(HANDLES).find(h=>Math.abs(x-it.x-HANDLES[h][0]*it.w)<=10&&Math.abs(y-it.y-HANDLES[h][1]*it.h)<=10)||null;}
    function drawHandles(){
      const it=wbHover;if(!it||!items().includes(it)||wbDrag?.start)return;
      board.save();Object.assign(board,{strokeStyle:'#6C3BFF',lineWidth:1.5,fillStyle:'#fff'});
      board.setLineDash([6,4]);board.strokeRect(it.x,it.y,it.w,it.h);board.setLineDash([]);
      Object.values(HANDLES).forEach(([u,v]:any)=>{board.fillRect(it.x+u*it.w-5,it.y+v*it.h-5,10,10);board.strokeRect(it.x+u*it.w-5,it.y+v*it.h-5,10,10);});
      board.restore();
    }
    function hoverAt(p:number[]){
      let it=null,h=null;
      if(wbTool!=='erase'){h=handleAt(wbHover,p);const i=hitItem(p,0);it=h?wbHover:items()[i]?.type==='shape'?items()[i]:null;}
      wbCanvas.style.cursor=h?h+'-resize':it?'move':'';
      if(it!==wbHover){wbHover=it;renderBoard();}
      return h;
    }
    wbCanvas.addEventListener('pointerdown',(e:any)=>{
      if(e.button===1||(e.button===0&&wbSpace)){e.preventDefault();commitWbNote();wbDrag={pan:stagePoint(e)};wb.dataset.panning='';wbCanvas.setPointerCapture(e.pointerId);return;}
      if(e.button!==0)return;commitWbNote();
      const p=boardPoint(e).map(round1),before=JSON.stringify(items());
      const h=hoverAt(p);
      if(wbHover){
        const it=wbHover;items().splice(items().indexOf(it),1);items().push(it);
        wbDrag=h?{before,it,resize:h,from:p,box:{x:it.x,y:it.y,w:it.w,h:it.h}}:{before,it,from:p,tap:true};
        wbCanvas.setPointerCapture(e.pointerId);return;
      }
      if(wbTool==='text')return;
      if(wbTool==='pen'){const it={type:'stroke',color:wbColor,width:5,pts:[p]};items().push(it);drawItem(it);wbDrag={before,it};}
      else if(wbTool==='erase'){wbDrag={before,erase:p};eraseAt(p);}
      else if(wbTool==='shape'||wbTool==='arrow'){const it={type:'shape',kind:wbKind[wbTool],color:wbColor,x:p[0],y:p[1],w:0,h:0,text:''};items().push(it);wbDrag={before,it,start:p};}
      else{const i=hitItem(p);if(i<0){wbDrag={pan:stagePoint(e)};wb.dataset.panning='';}else{const it=items().splice(i,1)[0];items().push(it);wbDrag={before,it,from:p};}}
      wbCanvas.setPointerCapture(e.pointerId);
    });
    wbCanvas.addEventListener('mousedown',(e:any)=>{if(e.button===1)e.preventDefault();});
    wbCanvas.addEventListener('pointerleave',()=>{if(!wbDrag&&wbHover){wbHover=null;renderBoard();}});
    wbCanvas.addEventListener('pointermove',(e:any)=>{
      if(!wbDrag)return hoverAt(boardPoint(e));
      if(wbDrag.pan){const p=stagePoint(e),[x,y]=wbDrag.pan;wbDrag.pan=p;scrollBoard(x-p[0],y-p[1]);return;}
      const evs=e.getCoalescedEvents?.();
      for(const ev of evs?.length?evs:[e]){
        const p=boardPoint(ev).map(round1);
        if(wbDrag.erase){eraseAt(p,wbDrag.erase);wbDrag.erase=p;}
        else if(wbDrag.start){
          const [sx,sy]=wbDrag.start,it=wbDrag.it;let w=p[0]-sx,h=p[1]-sy;
          if(ev.shiftKey){const m=Math.max(Math.abs(w),Math.abs(h));w=Math.sign(w||1)*m;h=Math.sign(h||1)*m;}
          Object.assign(it,{x:round1(Math.min(sx,sx+w)),y:round1(Math.min(sy,sy+h)),w:round1(Math.abs(w)),h:round1(Math.abs(h))});
        }
        else if(wbDrag.resize){
          const {resize:r,box,it}=wbDrag,dx=p[0]-wbDrag.from[0],dy=p[1]-wbDrag.from[1];let {x,y,w,h}=box;
          if(r.includes('w')){w=Math.max(MIN_SIZE,box.w-dx);x=box.x+box.w-w;}
          if(r.includes('e'))w=Math.max(MIN_SIZE,box.w+dx);
          if(r.includes('n')){h=Math.max(MIN_SIZE,box.h-dy);y=box.y+box.h-h;}
          if(r.includes('s'))h=Math.max(MIN_SIZE,box.h+dy);
          Object.assign(it,{x:round1(x),y:round1(y),w:round1(w),h:round1(h)});
        }
        else if(wbDrag.from){
          const dx=p[0]-wbDrag.from[0],dy=p[1]-wbDrag.from[1],it=wbDrag.it;if(dx||dy)wbDrag.tap=false;
          if(it.type==='text'||it.type==='shape'){it.x=round1(it.x+dx);it.y=round1(it.y+dy);}
          else it.pts=it.pts.map(([x,y]:number[])=>[round1(x+dx),round1(y+dy)]);
          wbDrag.from=p;
        }
        else{
          const pts=wbDrag.it.pts,q=pts[pts.length-1];pts.push(p);
          Object.assign(board,{strokeStyle:wbDrag.it.color,lineWidth:wbDrag.it.width});board.beginPath();board.moveTo(...q);board.lineTo(...p);board.stroke();
        }
      }
      if(wbDrag.from||wbDrag.start)renderBoard();
    });
    // Shapes only appear when dragged; on release the text inside them opens for typing.
    function endWbDrag(e:any){
      if(!wbDrag)return;const {before,it,start,tap,pan}=wbDrag;wbDrag=null;
      if(pan){delete wb.dataset.panning;return;}
      if(tap)return editShape(items().indexOf(it),before);
      if(start&&it.w<12&&it.h<12){items().splice(items().indexOf(it),1);renderBoard();return;}
      if(!start){changed(before);if(e?.type==='pointerup')hoverAt(boardPoint(e));return;}
      wbHover=it;renderBoard();editShape(items().indexOf(it),before);
    }
    wbCanvas.addEventListener('pointerup',endWbDrag);wbCanvas.addEventListener('pointercancel',endWbDrag);
    wbCanvas.addEventListener('click',(e:any)=>{if(wbTool==='text'&&!wbEdit&&!wbSpace)openWbNote(boardPoint(e));});
    wbCanvas.addEventListener('dblclick',(e:any)=>{if(wbTool==='move')openWbNote(boardPoint(e));});
    // Space held: dragging scrolls the board, as in other whiteboards.
    const spaceUp=()=>{wbSpace=false;delete wb.dataset.space;};
    addEventListener('keyup',(e:any)=>{if(e.key===' ')spaceUp();});addEventListener('blur',spaceUp);
    wb.addEventListener('click',(e:any)=>e.stopPropagation());
    function openWbNote(p:number[]){
      commitWbNote();const before=JSON.stringify(items()),i=hitItem(p,4);
      if(i>=0&&items()[i].type==='shape')return editShape(i,before);
      const orig=i>=0&&items()[i].type==='text'?items().splice(i,1)[0]:null;
      if(!orig&&wbTool!=='text')return;
      const [x,y]=orig?[orig.x,orig.y]:p.map(round1);
      wbEdit={before,i,orig,x,y,color:orig?orig.color:wbColor};
      if(orig)renderBoard();
      wbNote.value=orig?orig.text:'';
      Object.assign(wbNote.style,{left:x-wbState.x-8+'px',top:y-wbState.y-26+'px',color:wbEdit.color,caretColor:wbEdit.color,borderColor:wbEdit.color,font:'',height:'',textAlign:''});
      sizeWbNote();wbNote.classList.add('on');wbNote.focus();
    }
    function editShape(i:number,before=JSON.stringify(items())){
      commitWbNote();const orig=items()[i],{cx,cy,tw}=textBox(orig);
      wbEdit={before,orig,shape:true,cx:cx-wbState.x,tw:Math.max(120,tw)};renderBoard();
      wbNote.value=orig.text;
      Object.assign(wbNote.style,{top:cy-wbState.y-21+'px',color:orig.color,caretColor:orig.color,borderColor:orig.color,font:'700 28px/38px '+FONT,height:'42px',textAlign:'center'});
      sizeWbNote();wbNote.classList.add('on');wbNote.focus();wbNote.select();
    }
    function sizeWbNote(){
      if(!wbEdit?.shape){wbNote.style.width=Math.ceil(board.measureText(wbNote.value).width)+20+'px';return;}
      board.save();board.font=SHAPE_FONT;const w=Math.max(wbEdit.tw,Math.ceil(board.measureText(wbNote.value).width)+24);board.restore();
      Object.assign(wbNote.style,{width:w+'px',left:wbEdit.cx-w/2+'px'});
    }
    function commitWbNote(cancel=false){
      if(!wbEdit)return;const {before,i,orig,x,y,color,shape}=wbEdit,text=wbNote.value.trim();
      wbEdit=null;wbNote.classList.remove('on');wbNote.blur();
      if(shape){if(!cancel)orig.text=text;renderBoard();changed(before);return;}
      const at=orig?i:items().length;
      if(cancel){if(orig)items().splice(at,0,orig);}else if(text)items().splice(at,0,{type:'text',color,x,y,text});
      renderBoard();changed(before);
    }
    wbNote.addEventListener('input',sizeWbNote);
    wbNote.addEventListener('keydown',(e:any)=>{if(e.key==='Enter'){commitWbNote();setWbTool('move');}if(e.key==='Escape')commitWbNote(true);});
    wbNote.addEventListener('blur',()=>commitWbNote());
    const closeWbPops=()=>wb.querySelectorAll('.wb-pop.open').forEach((p:any)=>p.classList.remove('open'));
    function setWbTool(t:string){
      commitWbNote();closeWbPops();wbTool=wb.dataset.tool=t;
      wb.querySelectorAll('[data-wbtool]').forEach((b:any)=>{b.classList.toggle('on',b.dataset.wbtool===t);b.setAttribute('aria-pressed',String(b.dataset.wbtool===t));});
    }
    wb.querySelectorAll('[data-wbtool]').forEach((b:any)=>b.addEventListener('click',(e:any)=>{
      e.currentTarget.blur();const pop=b.closest('.wb-menu')?.querySelector('.wb-pop'),wasOpen=pop?.classList.contains('open');
      setWbTool(b.dataset.wbtool);if(pop&&!wasOpen)pop.classList.add('open');
    }));
    wb.querySelectorAll('.wb-menu').forEach((menu:any)=>{
      const main=menu.querySelector('[data-wbtool]'),t=main.dataset.wbtool,opts=[...menu.querySelectorAll('[data-kind]')] as any[];
      const pick=(b:any)=>{wbKind[t]=b.dataset.kind;opts.forEach(o=>{o.classList.toggle('on',o===b);o.setAttribute('aria-checked',String(o===b));});main.querySelector('svg').replaceWith(b.querySelector('svg').cloneNode(true));};
      opts.forEach(b=>{b.setAttribute('role','menuitemradio');b.addEventListener('click',(e:any)=>{e.currentTarget.blur();pick(b);setWbTool(t);});});
      pick(opts.find(o=>o.dataset.kind===wbKind[t]));
    });
    wb.addEventListener('pointerdown',(e:any)=>{if(!e.target.closest('.wb-menu'))closeWbPops();});
    const swatches=WB_COLORS.map(c=>{
      const b=document.createElement('button');b.className='swatch';b.style.setProperty('--c',c);b.setAttribute('aria-label',`${W.color} ${c}`);
      b.addEventListener('click',(e:any)=>{e.currentTarget.blur();wbColor=c;swatches.forEach(s=>s.classList.toggle('on',s===b));if(wbTool!=='text'&&wbTool!=='shape'&&wbTool!=='arrow')setWbTool('pen');});
      $('wb-colors').appendChild(b);return b;
    });
    swatches[0].classList.add('on');
    $('wb-home').addEventListener('click',(e:any)=>{e.currentTarget.blur();homeBoard();});
    $('wb-undo').addEventListener('click',(e:any)=>{e.currentTarget.blur();undoBoard();});
    $('wb-wipe').addEventListener('click',(e:any)=>{
      e.currentTarget.blur();commitWbNote();if(!items().length||!confirm(W.confirmWipe))return;
      const before=JSON.stringify(items());wbState.items=[];wbState.x=wbState.y=0;renderBoard();changed(before);
    });
    toggleBoard=()=>{
      if(!wbOpen&&tool)setTool(tool);
      commitWbNote();wbOpen=!wbOpen;
      document.documentElement.toggleAttribute('data-wb',wbOpen);
      wbBtn.classList.toggle('on',wbOpen);wbBtn.setAttribute('aria-pressed',String(wbOpen));
      if(wbOpen)renderBoard();else spaceUp();
      panels.forEach(p=>p.update());
    };
    wbBtn.addEventListener('click',(e:any)=>{e.currentTarget.blur();toggleBoard();});
    // With the board open, keys drive the board instead of the slides.
    boardKey=(key:string,meta:boolean,alt:boolean)=>{
      const k=key.toLowerCase();
      if(meta&&k==='z'){undoBoard();return true;}
      if(meta||alt)return false;
      const pan:any={arrowleft:[-1,0],arrowright:[1,0],arrowup:[0,-1],arrowdown:[0,1],pageup:[0,-8],pagedown:[0,8]};
      if(pan[k]){scrollBoard(pan[k][0]*100,pan[k][1]*100);return true;}
      if(k===' '){if(!wbDrag){wbSpace=true;wb.dataset.space='';}return true;}
      if(k==='home')homeBoard();else if(k==='w')toggleBoard();else if(k==='f')toggleFullscreen();else if(k==='p')setWbTool('pen');else if(k==='t')setWbTool('text');
      else if(k==='e')setWbTool('erase');else if(k==='m'||k==='v')setWbTool('move');else if(k==='s')setWbTool('shape');else if(k==='a')setWbTool('arrow');
      else if(k==='escape')closeWbPops();else return false;
      return true;
    };
    setWbTool('pen');
    document.fonts.ready.then(()=>renderBoard());

    // Presenter panel: overview of every slide in another window (or in this one if pop-ups are blocked).
    let popup:Window|null=null,popupPanel:any=null,inlinePanel:any=null;
    function buildPanel(d:Document,root:HTMLElement,onClose?:()=>void){
      const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as any)[c]);
      root.innerHTML=`<div class="p-toolbar"><button data-p="prev">${esc(W.previous)}</button><button data-p="next" class="primary">${esc(W.next)}</button><button data-p="board">${esc(W.boardLabel)}</button>${onClose?`<button data-p="close">${esc(W.close)}</button>`:''}</div><div class="p-status" role="status"></div><div class="overview-list">${data.slides.map((s:any,i:number)=>`<article class="overview-card"><div class="overview-label"><span>${i+1}. ${esc(s.title)}</span><span class="now">${esc(W.now)}</span></div><div class="mini-frame"><button class="jump" aria-label="${esc(W.goto)} ${i+1}: ${esc(s.title)}">${esc(W.jump)}</button></div></article>`).join('')}</div>`;
      const cards=[...root.querySelectorAll('.overview-card')] as HTMLElement[];
      cards.forEach((card,i)=>{
        const f=d.createElement('iframe');f.setAttribute('sandbox','allow-scripts');f.tabIndex=-1;f.setAttribute('aria-hidden','true');f.srcdoc=doc(i,'static');
        card.querySelector('.mini-frame')!.prepend(f);
        card.querySelector('.jump')!.addEventListener('click',()=>{if(wbOpen)toggleBoard();go(i);});
      });
      const act:any={prev:()=>{if(wbOpen)toggleBoard();prev();},next:()=>{if(wbOpen)toggleBoard();next();},board:()=>toggleBoard(),close:()=>onClose?.()};
      root.querySelectorAll('[data-p]').forEach((b:any)=>b.addEventListener('click',(e:any)=>{e.stopPropagation();act[b.dataset.p]();}));
      const fitCards=()=>cards.forEach(c=>{const m=c.querySelector('.mini-frame') as HTMLElement,f=m.querySelector('iframe') as HTMLElement;f.style.transform=`scale(${m.clientWidth/1600})`;});
      d.defaultView?.addEventListener('resize',fitCards);fitCards();
      root.addEventListener('keydown',(e:any)=>{
        if(e.target.closest('button'))return;
        if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();act.next();}
        if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();act.prev();}
      });
      let shownAt=-1;
      return{
        root,fit:fitCards,
        update(){
          const s=data.slides[cur];
          (root.querySelector('.p-status') as HTMLElement).textContent=`${W.slide} ${cur+1} ${W.of} ${N} · ${s.title} · ${W.step} ${step} ${W.of} ${total}`;
          cards.forEach((c,i)=>{c.classList.toggle('here',i===cur);c.classList.toggle('past',i<cur);c.querySelector('.jump')!.setAttribute('aria-current',i===cur?'true':'false');});
          if(shownAt!==cur)cards[cur]?.scrollIntoView({block:'nearest',behavior:'smooth'});shownAt=cur;
        },
        closed(){(root.querySelector('.p-status') as HTMLElement).textContent=W.closed;root.querySelectorAll('button').forEach((b:any)=>b.disabled=true);},
      };
    }
    const forget=(p:any)=>{const i=panels.indexOf(p);if(i>=0)panels.splice(i,1);};
    function openInline(){
      if(inlinePanel)return;
      const root=document.createElement('div');root.className='esf-panel inline';root.tabIndex=-1;document.body.append(root);
      inlinePanel=buildPanel(document,root,()=>{root.remove();forget(inlinePanel);inlinePanel=null;});
      panels.push(inlinePanel);inlinePanel.update();root.focus();
    }
    function openPresenter(){
      if(popup&&!popup.closed){popup.focus();return;}
      popup=window.open('','esf-presenter-'+data.id,'popup,width=377,height=1277');
      if(!popup){notice(W.popup);openInline();return;}
      try{
        const d=popup.document;
        d.open();d.write(`<!doctype html><html lang="${data.lang}"><head><meta charset="utf-8"><title></title><style>${data.panelCss}</style></head><body class="esf-panel-page"><div class="esf-panel" tabindex="-1"></div></body></html>`);d.close();
        d.title=data.title+' · '+W.panel;
        if(popupPanel)forget(popupPanel);
        popupPanel=buildPanel(d,d.querySelector('.esf-panel') as HTMLElement);panels.push(popupPanel);popupPanel.update();
        setTimeout(()=>popupPanel?.fit(),50);
        popup.addEventListener('beforeunload',()=>{forget(popupPanel);popupPanel=null;});
      }catch{popup.close();popup=null;notice(W.popup);openInline();}
    }
    $('presenter-btn').addEventListener('click',(e:any)=>{e.currentTarget.blur();openPresenter();});
    addEventListener('beforeunload',()=>popupPanel?.closed());
  }

  addEventListener('resize',fit);fit();
  let start=Math.max(0,Math.min(N-1,data.start||0)),startStep=0;
  if(session){const i=data.slides.findIndex((s:any)=>s.id===session.slideId);if(i>=0){start=i;startStep=session.step;}}
  go(start,false,startStep);

  // Ask once per opening, only when the browser requests reduced motion. The choice stays local
  // to this player; live() carries it into every sandboxed slide and the magnifier, never thumbnails.
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)'),motionDialog=$('motion-notice');
  let motionChosen=false;
  function motionPrompt(){
    if(motionQuery.matches&&!motionChosen){if(!motionDialog.open)motionDialog.showModal();}
    else if(motionDialog.open)motionDialog.close();
  }
  function chooseMotion(enable:boolean){
    motionChosen=true;forceMotion=enable;motionDialog.close();
    if(enable){document.documentElement.dataset.esfMotion='full';go(cur,false,step);}
  }
  motionDialog.addEventListener('click',(e:Event)=>e.stopPropagation());
  motionDialog.addEventListener('cancel',(e:Event)=>{e.preventDefault();chooseMotion(false);});
  $('motion-enable').addEventListener('click',()=>chooseMotion(true));
  $('motion-keep').addEventListener('click',()=>chooseMotion(false));
  motionQuery.addEventListener('change',motionPrompt);motionPrompt();
}

const icon=(paths:string,width='2.2',extra='')=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}>${paths}</svg>`;
const I={
  home:icon('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  move:icon('<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  pen:icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  text:icon('<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>'),
  textBold:icon('<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>','2.4'),
  erase:icon('<path d="M7 21h13"/><path d="M5.5 15.5l9.6-9.6a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 19H8.5z"/><path d="M10 11l5 5"/>'),
  shapes:icon('<rect x="3" y="3" width="10" height="10" rx="1.5"/><circle cx="16" cy="16" r="5"/>'),
  rect:icon('<rect x="3" y="6" width="18" height="12" rx="1"/>'),round:icon('<rect x="3" y="6" width="18" height="12" rx="5"/>'),
  ellipse:icon('<circle cx="12" cy="12" r="8.5"/>'),diamond:icon('<path d="M12 3l9 9-9 9-9-9z"/>'),triangle:icon('<path d="M12 4l9 16H3z"/>'),
  arrowRight:icon('<path d="M3 9h10V5l8 7-8 7v-4H3z"/>'),arrowLeft:icon('<path d="M21 9H11V5l-8 7 8 7v-4h10z"/>'),
  arrowUp:icon('<path d="M9 21V11H5l7-8 7 8h-4v10z"/>'),arrowDown:icon('<path d="M9 3v10H5l7 8 7-8h-4V3z"/>'),
  undo:icon('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  presenter:icon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M9 4v16M12 8h7M12 12h7M12 16h4"/>','2.2',' aria-hidden="true"'),
  hl:icon('<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'),
  lens:icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.6-4.6M11 8v6M8 11h6"/>','2.4'),
  board:icon('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 2v2M8 21l2-5M16 21l-2-5M7 12l3-3 2 2 4-4"/>'),
};
const fsIcons=`<svg class="enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><svg class="exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>`;
const penCursor=(fill:string)=>`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' stroke='%23fff' stroke-width='4'/%3E%3Cpath d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' fill='%23${fill}' stroke='%230F1222' stroke-width='1.6'/%3E%3C/svg%3E") 3 24, crosshair`;

const playerCss=`:root{--ink:#1A1F36;--ai:#6C3BFF;--quiz:#FFB020}
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#0F1222;overflow:hidden}html{touch-action:manipulation}
body{font-family:${FONT};color:var(--ink);-webkit-font-smoothing:antialiased}
#stage{position:absolute;top:50%;left:50%;width:1600px;height:900px;border-radius:10px;overflow:hidden;background:#0F1222;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#stage>.frame{position:absolute;inset:0;width:1600px;height:900px;border:0;opacity:0;transition:opacity .4s ease;pointer-events:none}#stage>.frame.on{opacity:1;pointer-events:auto;z-index:1}
#note,#wb-note{-webkit-user-select:text;user-select:text}
#dock{position:absolute;left:0;right:0;bottom:0;height:0;z-index:5;pointer-events:none}
#dock-bar,#top-bar,.corner{pointer-events:auto}.corner{position:absolute;width:40px;height:40px;z-index:1}.corner.l{left:0}.corner.r{right:0}#topdock .corner{top:0}#dock .corner{bottom:0}
#dock-bar{position:absolute;left:0;right:0;bottom:0;height:76px;background:rgba(15,18,34,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transform:translateY(100%);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
:root:not(.touch) #dock:hover #dock-bar,#dock:focus-within #dock-bar,#dock.open #dock-bar{transform:none}
#track{position:absolute;left:120px;right:120px;top:0;bottom:0;display:flex;align-items:center;justify-content:space-between}
#track::before{content:"";position:absolute;left:7px;right:7px;top:50%;height:2px;background:rgba(255,255,255,.35)}
#track button{position:relative;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.55);background:#232843;cursor:pointer;padding:0;transition:background .3s,border-color .3s,width .3s,height .3s,margin .3s}
#track button.done{background:rgba(255,255,255,.55);border-color:transparent}#track button.here{background:var(--ai);border-color:var(--ai);width:24px;height:24px;margin:-4px}#track button:hover{border-color:#fff}
#track button:focus-visible{outline:3px solid var(--quiz);outline-offset:3px}
#dock-bar:has(#credit) #track{right:200px}#credit{position:absolute;right:16px;top:50%;transform:translateY(-50%);white-space:nowrap;font:11px/1.3 system-ui,sans-serif;text-align:right;color:rgba(255,255,255,.7);text-decoration:none}#credit:hover,#credit:focus-visible{color:#fff;text-decoration:underline}
#preview{position:absolute;bottom:calc(100% + 14px);width:272px;translate:-50% 8px;opacity:0;pointer-events:none;transition:opacity .18s,translate .18s}#preview.on{opacity:1;translate:-50% 0}
#preview .frame{position:relative;width:272px;height:153px;border-radius:10px;overflow:hidden;box-shadow:0 0 0 2px rgba(255,255,255,.85),0 12px 32px rgba(0,0,0,.35);background:#fff}
#preview .frame iframe{position:absolute;left:0;top:0;width:1600px;height:900px;border:0;transform:scale(.17);transform-origin:0 0}
#preview .num{position:absolute;left:8px;bottom:8px;padding:4px 9px;border-radius:7px;font:700 15px/1 ${FONT};background:var(--ink);color:#fff}
#topdock{position:absolute;left:0;right:0;top:0;height:0;z-index:5;pointer-events:none}
#top-bar{position:absolute;left:0;right:0;top:0;height:76px;display:flex;align-items:center;justify-content:center;gap:14px;background:rgba(15,18,34,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transform:translateY(-100%);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
:root:not(.touch) #topdock:hover #top-bar,#topdock:focus-within #top-bar,#topdock.open #top-bar{transform:none}
#top-bar button{width:50px;height:50px;border-radius:14px;border:0;cursor:pointer;display:grid;place-items:center;color:#fff;background:rgba(255,255,255,.12);transition:background .2s,color .2s}
#top-bar button:hover{background:var(--ai)}#top-bar button.on{background:var(--quiz);color:var(--ink)}#top-bar button:focus-visible{outline:3px solid var(--quiz);outline-offset:3px}
#top-bar svg{width:24px;height:24px}#top-bar .sep{width:2px;height:30px;background:rgba(255,255,255,.25);margin:0 6px}
#fs-btn .exit,:fullscreen #fs-btn .enter{display:none}:fullscreen #fs-btn .exit{display:block}
#ink{position:absolute;inset:0;width:1600px;height:900px;z-index:4;pointer-events:none}
[data-tool="pen"] #ink{pointer-events:auto;touch-action:none;cursor:${penCursor('FF3B5C')}}
[data-tool="text"] #ink{pointer-events:auto;cursor:text}[data-tool="lens"] #ink{pointer-events:auto;cursor:none}
#note{position:absolute;z-index:5;display:none;height:48px;min-width:40px;padding:0 6px;margin:0;font:700 36px/48px ${FONT};color:#FF3B5C;caret-color:#FF3B5C;background:rgba(255,255,255,.6);border:2px dashed #FF3B5C;border-radius:8px;outline:none}#note.on{display:block}
#wb{position:absolute;inset:0;z-index:5;display:none;background-color:#FBFBF7;background-image:radial-gradient(circle,#D3D8E2 1.5px,transparent 1.6px);background-size:32px 32px}
[data-wb] #wb{display:block}[data-wb] #dock{display:none}
#wb-canvas{position:absolute;inset:0;width:1600px;height:900px;touch-action:none}
#wb[data-tool="pen"] #wb-canvas{cursor:${penCursor('1A1F36')}}#wb[data-tool="text"] #wb-canvas{cursor:text}#wb[data-tool="move"] #wb-canvas{cursor:move}
#wb[data-tool="shape"] #wb-canvas,#wb[data-tool="arrow"] #wb-canvas{cursor:crosshair}
#wb[data-space] #wb-canvas{cursor:grab}#wb[data-panning] #wb-canvas{cursor:grabbing}
#wb[data-tool="erase"] #wb-canvas{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='10' fill='rgba(255,255,255,.7)' stroke='%231A1F36' stroke-width='2'/%3E%3C/svg%3E") 12 12,cell}
#wb-note{position:absolute;z-index:1;display:none;height:48px;min-width:40px;padding:0 6px;margin:0;font:700 36px/48px ${FONT};background:rgba(255,255,255,.8);border:2px dashed;border-radius:8px;outline:none}#wb-note.on{display:block}
#wb-bar{position:absolute;left:50%;bottom:22px;translate:-50% 0;z-index:2;display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:18px;background:rgba(15,18,34,.92);box-shadow:0 12px 32px rgba(15,18,34,.25)}
#wb-bar button{min-width:44px;height:44px;padding:0 10px;border-radius:12px;border:0;cursor:pointer;display:grid;place-items:center;color:#fff;background:rgba(255,255,255,.12);font:700 17px/1 ${FONT};transition:background .2s,color .2s}
#wb-bar button:hover{background:var(--ai)}#wb-bar button.on{background:var(--quiz);color:var(--ink)}#wb-bar button:focus-visible{outline:3px solid var(--quiz);outline-offset:2px}
#wb-bar svg{width:22px;height:22px}#wb-bar .sep{width:2px;height:28px;background:rgba(255,255,255,.25);margin:0 4px}#wb-bar .wb-menu{position:relative}
#wb-bar .wb-pop{position:absolute;left:50%;bottom:calc(100% + 18px);translate:-50% 0;display:none;gap:6px;padding:8px;border-radius:14px;background:rgba(15,18,34,.92);box-shadow:0 12px 32px rgba(15,18,34,.25)}
#wb-bar .wb-pop.open{display:flex}#wb-bar .wb-pop button.on{background:#fff;color:var(--ink)}
#wb-bar .swatch{min-width:0;width:30px;height:30px;padding:0;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 2px rgba(255,255,255,.35)}
#wb-bar .swatch:hover{background:var(--c);transform:scale(1.12)}#wb-bar .swatch.on{background:var(--c);box-shadow:0 0 0 3px #0F1222,0 0 0 5px #fff}
#wb-bar #wb-wipe{padding:0 14px;font-size:15px;white-space:nowrap;color:#FFB3C0}#wb-bar #wb-wipe:hover{background:#FF3B5C;color:#fff}
#glow{position:absolute;inset:0;width:1600px;height:900px;z-index:4;pointer-events:none}
[data-tool="hl"] #glow{pointer-events:auto;touch-action:none;cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4z' stroke='%23fff' stroke-width='4'/%3E%3Cpath d='M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4z' fill='%23FFB020' stroke='%230F1222' stroke-width='1.6'/%3E%3C/svg%3E") 3 24,crosshair}
#lens{position:absolute;width:360px;height:360px;border-radius:50%;overflow:hidden;z-index:4;pointer-events:none;display:none;background:#fff;box-shadow:0 0 0 4px #fff,0 0 0 6px rgba(15,18,34,.5),0 18px 48px rgba(0,0,0,.4)}
#lens.on{display:block}#lens .view{position:absolute;left:0;top:0;width:1600px;height:900px;transform-origin:0 0}
#lens .view iframe,#lens .view canvas{position:absolute;inset:0;width:1600px;height:900px;border:0}
#message{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:30;max-width:min(640px,90vw);padding:14px 20px;border:1px solid #686182;border-radius:12px;background:#29233d;color:#fff;font:14px ${FONT};box-shadow:0 10px 40px #0007}
#motion-notice{position:fixed;inset:0;margin:auto;width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:26px;border:1px solid #686182;border-radius:16px;background:#20253b;color:#fff;font:16px/1.5 ${FONT};box-shadow:0 20px 80px #0008}
#motion-notice::backdrop{background:#080b18b3}
#motion-notice .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
#motion-notice button{padding:11px 16px;border:1px solid #686182;border-radius:9px;background:#303650;color:#fff;font:600 14px ${FONT};cursor:pointer}
#motion-notice #motion-enable{background:#b7a1ff;border-color:#b7a1ff;color:#17102e}
#motion-notice button:focus-visible{outline:3px solid #ffc14d;outline-offset:3px}
#poll-key{position:fixed;inset:0;margin:auto;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:26px;border:1px solid #686182;border-radius:16px;background:#20253b;color:#fff;font:16px/1.5 ${FONT};box-shadow:0 20px 80px #0008}
#poll-key::backdrop{background:#080b18b3}#poll-key h2{margin:0 0 8px;font-size:20px}#poll-key p{margin:0 0 14px;color:#d6d3e4}#poll-key label{display:block;margin-bottom:6px;font-weight:600}
#poll-key .key-row{display:flex;gap:8px}#poll-key .key-row input{flex:1;min-width:0}#poll-key .key-icon{display:grid;place-items:center;flex:none;width:46px;padding:0}#poll-key .key-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}#poll-key-eye[aria-pressed=false] .eye-hide,#poll-key-eye[aria-pressed=true] .eye-show{display:none}
#poll-key input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #686182;border-radius:9px;background:#141829;color:#fff;font:16px ${FONT}}#poll-key input:focus-visible{outline:3px solid #ffc14d;outline-offset:2px}
#poll-key #poll-key-error{margin:10px 0 0;color:#ff9aa8}#poll-key .server{margin:12px 0 0;font-size:13px;color:#a9a4bf;overflow-wrap:anywhere}
#poll-key .actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}#poll-key button{padding:11px 16px;border:1px solid #686182;border-radius:9px;background:#303650;color:#fff;font:600 14px ${FONT};cursor:pointer}
#poll-key #poll-key-ok{background:#b7a1ff;border-color:#b7a1ff;color:#17102e}#poll-key button:focus-visible{outline:3px solid #ffc14d;outline-offset:3px}
[hidden]{display:none!important}
.esf-panel.inline{position:fixed;inset:0;z-index:20;overflow:auto;background:#101425}
@media(prefers-reduced-motion:reduce){:root:not([data-esf-motion="full"]),:root:not([data-esf-motion="full"]) *,:root:not([data-esf-motion="full"]) *::before,:root:not([data-esf-motion="full"]) *::after{animation:none!important;transition:none!important}}`;
// Presenter panel, used in the pop-up and in the same-window fallback.
const panelCss=`*{box-sizing:border-box;margin:0;padding:0}.esf-panel-page{background:#101425;margin:0;color:#eef0f8;font-family:${FONT}}
.esf-panel{color-scheme:dark;color:#eef0f8;font-family:${FONT};padding:132px 24px 24px;outline:none}
.esf-panel button{font:inherit;cursor:pointer;border:1px solid #3c425d;background:#22283e;color:inherit;border-radius:10px;padding:10px 15px;font-size:13px;font-weight:650}
.esf-panel button:hover{background:#343b58}.esf-panel button:focus-visible{outline:3px solid #c7b5ff;outline-offset:3px}.esf-panel button:disabled{opacity:.4;cursor:default}
.esf-panel .primary{background:#b7a1ff;color:#17102e;border-color:#b7a1ff}.esf-panel .primary:hover{background:#d0c0ff}
.p-toolbar{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:8px;padding:8px;border-radius:16px;background:#14182be6;box-shadow:0 5px 20px #0008;white-space:nowrap}
.p-status{position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:20;max-width:calc(100vw - 28px);padding:9px 16px;border-radius:999px;background:#14182be6;box-shadow:0 4px 18px #0006;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.overview-list{max-width:900px;margin:auto;display:grid;gap:26px}.overview-card{position:relative}
.overview-label{font:600 14px ${FONT};color:#abb3cf;margin:0 0 9px;display:flex;justify-content:space-between}.overview-card.here .overview-label{color:#ffc14d}
.now{visibility:hidden}.here .now{visibility:visible}
.mini-frame{width:100%;aspect-ratio:16/9;overflow:hidden;position:relative;border-radius:10px;outline:2px solid #343c58;background:#fff}.here .mini-frame{outline:4px solid #ffc14d}.past .mini-frame{opacity:.6}
.mini-frame iframe{position:absolute;top:0;left:0;width:1600px;height:900px;border:0;transform-origin:0 0;pointer-events:none}
.esf-panel .jump{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:0;background:#ffc14d;color:#191326;padding:9px 16px;border-radius:30px;font:700 13px ${FONT};opacity:0;transition:opacity .12s}
.esf-panel .jump:hover{background:#ffd47f}.mini-frame:hover .jump,.esf-panel .jump:focus-visible{opacity:1}.esf-panel .jump:focus-visible{outline:4px solid #c7b5ff;outline-offset:3px}
@media(max-width:600px){.esf-panel{padding:120px 14px 14px}.p-toolbar{gap:6px;padding:6px}.p-toolbar button{padding:8px 10px;font-size:12px}.p-status{font-size:11px}.overview-list{gap:18px}}`;

// tools=false is the in-app "Present" window: navigation only, no annotation tools or panel.
// Exported HTML always uses English; lang only controls the in-app Present window.
// pollServer: base URL of the interactive questions service; each exported file keeps the one set at export time.
export function playerDocument(deck:Deck,options:{tools?:boolean;start?:number;title?:string;lang?:Language;minify?:(code:string)=>string;pollServer?:string}={}){
  const tools=options.tools!==false,lang=(!tools&&['pt','en','es'].includes(options.lang as string)?options.lang:'en') as Language;
  const W=playerWords[lang];
  const slides=deck.slides.map(s=>({id:s.id,title:s.title,steps:s.poll?0:(s.html.match(/\sdata-step\b/g)||[]).length,poll:s.poll,html:slideDocument(deck,s,false,'__ESF_TOKEN__',STEP_SENTINEL,false,undefined,lang,options.minify),static:slideDocument(deck,s,true,'',0,false,undefined,lang,options.minify)}));
  const used=slides.map(s=>s.html+s.static).join('\n');
  const assets=Object.fromEntries(deck.assets.filter(a=>used.includes('asset:'+a.id)).map(a=>[a.id,`data:${a.mime};base64,${a.data}`]));
  const server=normalizePollServer(options.pollServer),endpoint=server?pollEndpoint(server):'',hasPoll=deck.slides.some(s=>s.poll);
  const data={id:deck.id,title:deck.title,lang,words:W,pollWords:pollWords[lang],pollEndpoint:endpoint,tools,start:options.start||0,sentinel:STEP_SENTINEL,font:FONT,panelCss,slides,assets};
  const e=escapeHtml,made=new Date().toLocaleString({pt:'pt-BR',en:'en-US',es:'es-ES'}[lang],{dateStyle:'short',timeStyle:'short'}),credit=`${W.credit} ${W.creditAt} ${made}`;
  const btn=(id:string,label:string,title:string,svg:string,pressed=true)=>`<button id="${id}" aria-label="${e(label)}"${pressed?' aria-pressed="false"':''} title="${e(title)}">${svg}</button>`;
  const wbBtn=(tool:string,label:string,title:string,svg:string,extra='')=>`<button data-wbtool="${tool}" aria-label="${e(label)}" title="${e(title)}"${extra}>${svg}</button>`;
  const kind=(k:string,label:string,title:string,svg:string)=>`<button data-kind="${k}" title="${e(title)}" aria-label="${e(label)}">${svg}</button>`;
  const chrome=tools?`<canvas id="ink"></canvas><canvas id="glow"></canvas><input id="note" type="text" autocomplete="off" spellcheck="false" aria-label="${e(W.noteLabel)}">
<div id="wb" data-tool="pen"><canvas id="wb-canvas"></canvas><input id="wb-note" type="text" autocomplete="off" spellcheck="false" aria-label="${e(W.wbNoteLabel)}">
<div id="wb-bar"><button id="wb-home" aria-label="${e(W.homeLabel)}" title="${e(W.home)}">${I.home}</button><span class="sep"></span>
${wbBtn('move',W.moveLabel,W.move,I.move)}${wbBtn('pen',W.penLabel,W.wbPen,I.pen)}${wbBtn('text',W.textLabel,W.wbText,I.text)}${wbBtn('erase',W.eraserLabel,W.eraser,I.erase)}
<div class="wb-menu">${wbBtn('shape',W.shapesLabel,W.shapes,I.shapes,' aria-haspopup="menu"')}<div class="wb-pop" role="menu" aria-label="${e(W.shapesLabel)}">${kind('rect',W.rect,W.rect,I.rect)}${kind('round',W.round,W.round,I.round)}${kind('ellipse',W.ellipseLabel,W.ellipse,I.ellipse)}${kind('diamond',W.diamond,W.diamond,I.diamond)}${kind('triangle',W.triangle,W.triangle,I.triangle)}</div></div>
<div class="wb-menu">${wbBtn('arrow',W.arrowsLabel,W.arrows,I.arrowRight,' aria-haspopup="menu"')}<div class="wb-pop" role="menu" aria-label="${e(W.arrowsLabel)}">${kind('arrow-left',W.arrowLeft,W.arrowLeft,I.arrowLeft)}${kind('arrow-right',W.arrowRight,W.arrowRight,I.arrowRight)}${kind('arrow-up',W.arrowUp,W.arrowUp,I.arrowUp)}${kind('arrow-down',W.arrowDown,W.arrowDown,I.arrowDown)}</div></div>
<span class="sep"></span><div id="wb-colors" style="display:flex;gap:8px" role="group" aria-label="${e(W.colors)}"></div><span class="sep"></span>
<button id="wb-undo" aria-label="${e(W.undoLabel)}" title="${e(W.undo)}">${I.undo}</button><button id="wb-wipe" title="${e(W.wipeTitle)}">${e(W.wipe)}</button></div></div>
<div id="topdock"><div class="corner l"></div><div class="corner r"></div><div id="top-bar">
${btn('presenter-btn',W.presenterLabel,W.presenter,I.presenter,false)}${btn('pen-btn',W.penLabel,W.pen,I.pen)}${btn('hl-btn',W.hlLabel,W.hl,I.hl)}${btn('text-btn',W.textLabel,W.text,I.textBold)}${btn('erase-btn',W.eraseLabel,W.erase,I.erase,false)}${btn('lens-btn',W.lensLabel,W.lens,I.lens)}${btn('wb-btn',W.boardLabel,W.board,I.board)}<span class="sep"></span>${btn('fs-btn',W.fsLabel,W.fs,fsIcons,false)}
</div></div><div id="lens" aria-hidden="true"><div class="view"><iframe id="lens-frame" sandbox="allow-scripts" tabindex="-1" title=""></iframe></div></div>`:'';
  return `<!doctype html>
<!-- ${e(credit)} — https://edukors.org -->
<html lang="${lang}"><head><meta charset="utf-8"><meta name="generator" content="Edukors Slides Editor"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; frame-src about: blob:; font-src data:; connect-src ${hasPoll&&endpoint?endpoint:"'none'"}; base-uri 'none';"><title>${e(options.title??deck.title)}</title><style>${playerCss}</style></head><body>
<main><div id="stage"><iframe class="frame" sandbox="allow-scripts" title="${e(deck.title)}"></iframe><iframe class="frame" sandbox="allow-scripts" title="${e(deck.title)}"></iframe>${chrome}
<div id="dock"><div class="corner l"></div><div class="corner r"></div><div id="dock-bar"><div id="preview" aria-hidden="true" inert><div class="frame"></div><span class="num"></span></div><nav id="track" aria-label="${e(W.slides)}"></nav>${tools?`<a id="credit" href="https://edukors.org" target="_blank" rel="noopener">${e(W.credit)}<br>${e(W.creditAt)} ${e(made)}</a>`:''}</div></div></div></main>
<div id="message" role="alert" hidden></div>
<dialog id="poll-key" aria-labelledby="poll-key-title"><form method="dialog"><h2 id="poll-key-title">${e(pollWords[lang].keyTitle)}</h2><p>${e(pollWords[lang].keyHelp)}</p><label for="poll-key-input">${e(pollWords[lang].keyLabel)}</label><div class="key-row"><input id="poll-key-input" type="password" autocomplete="off" spellcheck="false" maxlength="200" required><button id="poll-key-paste" type="button" class="key-icon" aria-label="${e(pollWords[lang].keyPaste)}" title="${e(pollWords[lang].keyPaste)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/></svg></button><button id="poll-key-eye" type="button" class="key-icon" aria-pressed="false" aria-label="${e(pollWords[lang].keyShow)}" title="${e(pollWords[lang].keyShow)}"><svg class="eye-show" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-hide" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg></button></div><p id="poll-key-error" role="alert" hidden></p><p class="server">${e(pollWords[lang].keyServer)}: ${e(endpoint?new URL(endpoint).host:'')}</p><div class="actions"><button id="poll-key-cancel" type="button">${e(pollWords[lang].keyCancel)}</button><button id="poll-key-ok" type="submit">${e(pollWords[lang].keyConfirm)}</button></div></form></dialog>
<dialog id="motion-notice" aria-labelledby="motion-description"><p id="motion-description">${e(W.motionNotice)}</p><div class="actions"><button id="motion-enable" type="button">${e(W.motionEnable)}</button><button id="motion-keep" type="button" autofocus>${e(W.motionKeep)}</button></div></dialog>
<script>${fill((options.minify||(c=>c))(`(${playerRuntime.toString()})(__ESF_DATA__,(${createPollController.toString()}),${qrRuntimeSource()});`),{__ESF_DATA__:safeJson(data)})}</script></body></html>`;
}
