import {qrSvg} from './qr';
// The exported player owns transport. Slide frames only receive public snapshots.
// provider 'solverpoll' comes from files saved before the Edukors service; both run on the configured server.
export interface PollConfig {version:1;provider:'edukors'|'solverpoll';type:'quiz'|'tag'|'post';prompt:string;options?:string[]}
export function validPoll(p:unknown):p is PollConfig {
  const v=p as PollConfig;
  return !!v&&v.version===1&&(v.provider==='edukors'||v.provider==='solverpoll')&&['quiz','tag','post'].includes(v.type)&&typeof v.prompt==='string'&&!!v.prompt.trim()&&v.prompt.length<=2000
    &&Object.keys(v).every(k=>['version','provider','type','prompt','options'].includes(k))
    &&(v.type==='quiz'?Array.isArray(v.options)&&v.options.length>=2&&v.options.length<=5&&v.options.every(s=>typeof s==='string'&&!!s.trim()&&s.length<=500):v.options===undefined);
}
// Anyone can host the service (see the poll folder's README). There is no default server: the user sets one in
// Settings, and an export without it has interactive questions that say so instead of reaching the network.
export function normalizePollServer(value:unknown):string|null{
  if(typeof value!=='string'||!value.trim()||value.length>500||/\s/.test(value.trim()))return null;
  let u:URL;try{u=new URL(value.trim());}catch{return null;}
  const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if(!(u.protocol==='https:'||u.protocol==='http:'&&local)||u.username||u.password)return null;
  // The endpoint goes into the exported CSP, so only plain path characters are allowed.
  const path=u.pathname.replace(/\/+$/,'');if(!/^[\w\-.~%/]*$/.test(path))return null;
  return u.origin+path;
}
export const pollEndpoint=(server:string)=>server+'/q.php';
export const pollOptionColors=['#2481fb','#3ab086','#f5c42d','#e43d5f','#787992'] as const;
export const pollWords={
  pt:{keyTitle:'Chave do apresentador',keyHelp:'Digite a sua chave de apresentador. Ela vale por 12 horas neste navegador.',keyLabel:'Chave',keyConfirm:'Entrar',keyCancel:'Cancelar',keyInvalid:'Chave não reconhecida. Confira e tente novamente.',keyExpired:'A sessão expirou. Digite a chave novamente.',keyServer:'Servidor',server:'Servidor das respostas',csv:'Baixar respostas (CSV)',csvFailed:'Não foi possível baixar as respostas. Verifique a conexão e tente novamente.',csvTime:'Hora (UTC)',csvOption:'Alternativa',csvText:'Texto',csvResponse:'Resposta',keyShow:'Mostrar chave',keyHide:'Ocultar chave',keyPaste:'Colar chave',noServer:'Nenhum servidor de perguntas foi configurado. No editor, defina-o em Configurações → Perguntas interativas e exporte de novo.',noServerEditor:'nenhum (defina em Configurações → Perguntas interativas)',title:'Pergunta interativa',type:'Tipo de pergunta',quiz:'Múltipla escolha',tag:'Nuvem de palavras',post:'Resposta aberta',prompt:'Pergunta',options:'Alternativas',add:'Adicionar alternativa',remove:'Remover atividade',save:'Salvar',cancel:'Cancelar',invalid:'Informe a pergunta e de duas a cinco alternativas preenchidas.',help:'Os alunos respondem pelo celular. A atividade precisa de internet e de uma chave de apresentador no servidor abaixo, e ocupa a área do slide.',preview:'Clique no cadeado para iniciar.',start:'Iniciar',stop:'Encerrar',results:'Mostrar resultados',refresh:'Atualizar resultados',again:'Nova rodada',retry:'Tentar novamente',ready:'Pronta para iniciar',preparing:'Preparando atividade…',open:'Recebendo respostas',closing:'Encerrando…',closed:'Coleta encerrada',loading:'Carregando resultados…',responses:'Respostas',error:'Não foi possível confirmar a operação. Verifique a conexão e tente novamente.',stale:'Atualização pendente',empty:'Nenhuma resposta para exibir.',scan:'Aponte a câmera do celular',limit:'Até 50 termos distintos.',comments:'comentários exibidos (até 50; textos com até 3 caracteres não aparecem).',list:'Ver frequências',cloud:'Ver nuvem',leave:'Não foi possível confirmar o encerramento. Sair deste slide mesmo assim? A sala pode continuar aberta.',confirmAgain:'Iniciar outra rodada? Os alunos precisarão escanear o novo QR Code.',updated:'Atualizado às',internet:'Requer internet',copy:'Copiar link',copied:'Link copiado',unknown:'Estado da coleta não confirmado'},
  en:{keyTitle:'Presenter key',keyHelp:'Enter your presenter key. It stays valid for 12 hours in this browser.',keyLabel:'Key',keyConfirm:'Sign in',keyCancel:'Cancel',keyInvalid:'Key not recognized. Check it and try again.',keyExpired:'Your session expired. Enter the key again.',keyServer:'Server',server:'Responses server',csv:'Download responses (CSV)',csvFailed:'The responses could not be downloaded. Check your connection and try again.',csvTime:'Time (UTC)',csvOption:'Option',csvText:'Text',csvResponse:'Response',keyShow:'Show key',keyHide:'Hide key',keyPaste:'Paste key',noServer:'No interactive questions server is set. In the editor, set one in Settings → Interactive questions and export again.',noServerEditor:'none (set it in Settings → Interactive questions)',title:'Interactive question',type:'Question type',quiz:'Multiple choice',tag:'Word cloud',post:'Open response',prompt:'Question',options:'Options',add:'Add option',remove:'Remove activity',save:'Save',cancel:'Cancel',invalid:'Enter a question and two to five nonempty options.',help:'Students answer on their phones. This activity needs internet and a presenter key on the server below, and uses the slide area.',preview:'Click the lock to start.',start:'Start',stop:'Close responses',results:'Show results',refresh:'Refresh results',again:'New round',retry:'Try again',ready:'Ready to start',preparing:'Preparing activity…',open:'Receiving responses',closing:'Closing…',closed:'Responses closed',loading:'Loading results…',responses:'Responses',error:'The operation could not be confirmed. Check your connection and try again.',stale:'Update pending',empty:'No responses to display.',scan:'Scan with your phone camera',limit:'Up to 50 distinct terms.',comments:'comments shown (up to 50; texts of 3 characters or fewer are omitted).',list:'Show frequencies',cloud:'Show cloud',leave:'Closing could not be confirmed. Leave this slide anyway? The room may stay open.',confirmAgain:'Start another round? Students will need to scan the new QR code.',updated:'Updated at',internet:'Internet required',copy:'Copy link',copied:'Link copied',unknown:'Collection status unconfirmed'},
  es:{keyTitle:'Clave del presentador',keyHelp:'Introduce tu clave de presentador. Es válida durante 12 horas en este navegador.',keyLabel:'Clave',keyConfirm:'Entrar',keyCancel:'Cancelar',keyInvalid:'Clave no reconocida. Revísala e inténtalo de nuevo.',keyExpired:'La sesión expiró. Introduce la clave de nuevo.',keyServer:'Servidor',server:'Servidor de respuestas',csv:'Descargar respuestas (CSV)',csvFailed:'No se pudieron descargar las respuestas. Comprueba la conexión e inténtalo de nuevo.',csvTime:'Hora (UTC)',csvOption:'Opción',csvText:'Texto',csvResponse:'Respuesta',keyShow:'Mostrar clave',keyHide:'Ocultar clave',keyPaste:'Pegar clave',noServer:'No se configuró ningún servidor de preguntas. En el editor, configúralo en Configuración → Preguntas interactivas y exporta de nuevo.',noServerEditor:'ninguno (configúralo en Configuración → Preguntas interactivas)',title:'Pregunta interactiva',type:'Tipo de pregunta',quiz:'Opción múltiple',tag:'Nube de palabras',post:'Respuesta abierta',prompt:'Pregunta',options:'Opciones',add:'Añadir opción',remove:'Eliminar actividad',save:'Guardar',cancel:'Cancelar',invalid:'Introduce una pregunta y entre dos y cinco opciones completas.',help:'Los alumnos responden en su teléfono. La actividad necesita internet y una clave de presentador en el servidor indicado abajo, y ocupa el área de la diapositiva.',preview:'Haz clic en el candado para iniciar.',start:'Iniciar',stop:'Cerrar respuestas',results:'Mostrar resultados',refresh:'Actualizar resultados',again:'Nueva ronda',question:'Ver pregunta',retry:'Reintentar',ready:'Lista para iniciar',preparing:'Preparando actividad…',open:'Recibiendo respuestas',closing:'Cerrando…',closed:'Respuestas cerradas',loading:'Cargando resultados…',responses:'Respuestas',error:'No se pudo confirmar la operación. Comprueba la conexión y reintenta.',stale:'Actualización pendiente',empty:'No hay respuestas para mostrar.',scan:'Escanea con la cámara del teléfono',limit:'Hasta 50 términos distintos.',comments:'comentarios mostrados (hasta 50; se omiten textos de hasta 3 caracteres).',list:'Ver frecuencias',cloud:'Ver nube',leave:'No se pudo confirmar el cierre. ¿Salir de esta diapositiva? La sala puede seguir abierta.',confirmAgain:'¿Iniciar otra ronda? Los alumnos deberán escanear el nuevo código QR.',updated:'Actualizado a las',internet:'Requiere internet',copy:'Copiar enlace',copied:'Enlace copiado',unknown:'Estado de recepción sin confirmar'},
};
export type PollWords=typeof pollWords.en;
const previewQr=qrSvg('edukors:poll-preview');
const pollIconPaths={
  locked:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  unlocked:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14v3"/>',
  results:'<path d="M4 20h16M7 16v-5M12 16V4M17 16V8"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3a7 7 0 0 0 11.6-1"/>',
  question:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 12h6M9 16h4"/>',
  again:'<path d="M4 8V3m0 5h5M4 8a8 8 0 1 1-1 7M12 8v8M8 12h8"/>',
  retry:'<path d="M4 10a8 8 0 1 1 1 7M4 10V4m0 6h6"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r=".8"/><circle cx="4" cy="12" r=".8"/><circle cx="4" cy="18" r=".8"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  download:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  cloud:'<path d="M6 18a4 4 0 0 1-.5-8 6.5 6.5 0 0 1 12.4-1.5A4.8 4.8 0 0 1 18 18Z"/>',
};
function pollIcon(name:keyof typeof pollIconPaths,extra=''){return `<svg class="poll-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${pollIconPaths[name]}</svg>`;}
export const pollCss=`
.esf-poll{position:absolute;inset:0;z-index:5;box-sizing:border-box;padding:60px 85px 96px;background:var(--paper,#fff);color:var(--ink,#202535);font-family:inherit;display:flex;flex-direction:column;gap:28px;text-align:left}
.esf-poll *{box-sizing:border-box}.esf-poll [hidden]{display:none!important}.esf-poll h2{position:static;inset:auto;float:none;transform:none;translate:none;width:auto;max-width:none;margin:0;font-size:54px;line-height:1.15;letter-spacing:-1px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:190px;overflow:auto}
.poll-body{position:relative;flex:1;min-height:0;display:flex;container-type:size;--poll-side:min(600px,calc(100cqh - 30px))}.poll-content{flex:1;min-width:0;overflow:auto}
.poll-options{display:flex;flex-direction:column;justify-content:space-between;gap:20px;height:100%;max-height:calc(var(--n,5)*72px + (var(--n,5) - 1)*56px)}.poll-option{flex:none;display:grid;grid-template-columns:72px minmax(0,1fr) var(--poll-side);align-items:center;column-gap:28px;min-height:72px;font-size:36px;line-height:1.2;overflow-wrap:anywhere}
.poll-letter{display:grid;place-items:center;width:72px;height:72px;border-radius:4px;background:var(--poll-color);color:#fff;font-size:38px;font-weight:700}
${pollOptionColors.map((color,i)=>`.esf-poll .poll-option:nth-child(${i+1}){--poll-color:${color}}`).join('\n')}
.poll-bar{grid-column:3;display:flex;align-items:center;gap:16px;height:72px;font-size:30px;font-weight:700;white-space:nowrap}.poll-bar-fill{height:100%;background:var(--poll-color);display:flex;align-items:center;padding:0 20px;color:#fff;min-width:0}.poll-bar-fill:empty{padding:0}.poll-bar-label{display:flex;align-items:baseline;gap:12px}.poll-bar-label small{font-size:22px;font-weight:600;opacity:.85}.poll-bar-out{color:var(--ink,#202535)}
.poll-side{position:absolute;top:0;right:0;bottom:0;width:var(--poll-side);display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}.esf-poll:not([data-type=quiz]) .poll-side{left:0;margin-inline:auto}
/* Open and word-cloud questions: the prompt on the left, the QR code on the right; results go back to one column. */
.esf-poll:not([data-type=quiz]):not([data-view=results]){display:grid;grid-template-columns:minmax(0,1fr) 600px;grid-template-rows:minmax(0,1fr) auto auto;column-gap:56px;row-gap:28px}.esf-poll:not([data-type=quiz]):not([data-view=results]) h2{grid-column:1;grid-row:1;align-self:center;max-height:100%}.esf-poll:not([data-type=quiz]):not([data-view=results]) .poll-body{grid-column:2;grid-row:1}.esf-poll:not([data-type=quiz]):not([data-view=results]) :is(.poll-error,.poll-footer){grid-column:1/-1}.poll-code{position:relative;width:var(--poll-side);height:var(--poll-side);flex:none}.poll-qr{width:100%;height:100%;background:#fff;overflow:hidden}.poll-qr svg{display:block;width:100%;height:100%}.poll-qr.is-blurred svg{filter:blur(8px);opacity:.4}.poll-link{display:flex;align-items:center;justify-content:center;gap:6px;max-width:100%}.poll-url{font-size:16px;color:var(--muted,#657085);overflow-wrap:anywhere;min-width:0}.esf-poll .poll-copy{flex:none;display:grid;place-items:center;width:34px;height:34px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--muted,#657085)}.esf-poll .poll-copy:hover{background:#8491a41f;color:var(--ink,#202535)}.poll-copy .poll-icon{width:19px;height:19px}.poll-copy.is-copied{color:#2f9e6a}.poll-copy:not(.is-copied) .poll-copy-done,.poll-copy.is-copied .poll-copy-idle{display:none}
.poll-live{display:flex;align-items:center;gap:7px;height:30px}.poll-live i{width:11px;height:11px;border-radius:50%;background:var(--accent,#5265e8)}@media (prefers-reduced-motion:no-preference){.poll-live i{animation:poll-bounce 1.1s ease-in-out infinite}.poll-live i:nth-child(2){animation-delay:.15s}.poll-live i:nth-child(3){animation-delay:.3s}}@keyframes poll-bounce{0%,60%,100%{translate:0 5px;opacity:.55}30%{translate:0 -6px;opacity:1}}.poll-live:not([hidden])+.poll-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.poll-footer{display:flex;align-items:center;gap:12px 24px;flex-wrap:wrap;min-height:54px;font-size:22px}.poll-count{font-size:26px;font-weight:700}.poll-status{color:var(--muted,#657085)}.poll-actions{display:flex;gap:12px;margin-left:auto}.esf-poll button{font-family:inherit;font-weight:600;line-height:1.2;font-size:22px;cursor:pointer;border:1px solid #aab2c2;border-radius:10px;padding:13px 20px;background:var(--paper,#fff);color:var(--ink,#202535)}.esf-poll button:disabled{opacity:.5;cursor:wait}.esf-poll button:focus-visible{outline:4px solid var(--accent,#5265e8);outline-offset:3px}.poll-error{color:#b32e3a;font-size:20px}.poll-error:empty,.poll-status:empty{display:none}.poll-limit{font-size:18px;color:var(--muted,#657085)}
.esf-poll .poll-csv{width:40px;height:40px;padding:8px;margin-right:-8px;border-color:transparent;background:transparent;color:var(--muted,#657085)}.esf-poll .poll-csv:hover{color:var(--ink,#202535);border-color:#aab2c2}.esf-poll .poll-csv .poll-icon{width:22px;height:22px}.esf-poll .poll-csv[data-tip]::after{left:0;translate:0 4px}.esf-poll .poll-csv[data-tip]:is(:hover,:focus-visible)::after{translate:0 0}
.esf-poll .poll-icon-button{display:grid;place-items:center;padding:12px;width:54px;height:54px;flex:none}.poll-icon{display:block;width:28px;height:28px}.esf-poll .poll-lock{border-radius:50%;color:var(--ink,#202535)}.esf-poll .poll-code .poll-lock{position:absolute;left:50%;top:50%;translate:-50% -50%;width:132px;height:132px;border:none;background:var(--paper,#fff);box-shadow:0 10px 30px #20253540}.poll-code .poll-lock .poll-icon{width:64px;height:64px}.esf-poll .poll-lock[aria-pressed=true]{color:var(--accent,#5265e8);border-color:var(--accent,#5265e8);background:var(--paper,#fff)}.poll-lock[aria-pressed=false] .poll-lock-open,.poll-lock[aria-pressed=true] .poll-lock-closed,[data-poll=list][aria-pressed=false] .poll-mode-cloud,[data-poll=list][aria-pressed=true] .poll-mode-list{display:none}.esf-poll .poll-lock:disabled{opacity:.7;cursor:default}
.esf-poll [data-tip]{position:relative}.esf-poll [data-tip]::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 10px);left:50%;translate:-50% 4px;z-index:10;white-space:nowrap;padding:8px 14px;border-radius:8px;background:#202535;color:#fff;font-size:19px;font-weight:600;line-height:1.2;box-shadow:0 6px 18px #20253533;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .12s,translate .12s,visibility .12s}.esf-poll [data-tip]:is(:hover,:focus-visible)::after{opacity:1;visibility:visible;translate:-50% 0;transition-delay:.3s}.esf-poll .poll-code .poll-lock::after{bottom:auto;top:calc(100% + 12px)}
.poll-cloud{display:flex;align-items:center;justify-content:center;align-content:center;flex-wrap:wrap;gap:16px 25px;min-height:300px}.poll-word{color:var(--accent,#5265e8);line-height:1.2;overflow-wrap:anywhere;max-width:100%}.poll-comments{display:flex;flex-direction:column;gap:15px}.poll-comment{font-size:27px;line-height:1.35;padding:18px 22px;border-radius:12px;background:#8491a414;white-space:pre-wrap;overflow-wrap:anywhere}.poll-frequency{font-size:25px;padding:8px 0;border-bottom:1px solid #8491a433}.poll-empty{font-size:28px;padding:50px 10px}.poll-static .poll-footer,.poll-static .poll-error{display:none}.poll-static{pointer-events:none}
`;

export function pollMarkup(p:PollConfig,w:PollWords,staticMode:boolean){
  const e=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const action=(name:string,label:string,icon:keyof typeof pollIconPaths)=>`<button class="poll-icon-button" data-poll="${name}" aria-label="${e(label)}" data-tip="${e(label)}" hidden>${pollIcon(icon,name==='list'?'poll-mode-list':'')}${name==='list'?pollIcon('cloud','poll-mode-cloud'):''}</button>`;
  return `<div class="esf-poll${staticMode?' poll-static':''}" data-type="${p.type}" data-view="question" data-esf-fixed data-interactive role="region" aria-label="${e(w.title)}"><h2>${e(p.prompt)}</h2><div class="poll-body"><div class="poll-content"><div class="poll-options" style="--n:${p.options?.length||0}">${(p.options||[]).map((s,i)=>`<div class="poll-option"><span class="poll-letter">${'ABCDE'[i]}</span><span>${e(s)}</span><div class="poll-bar" hidden></div></div>`).join('')}</div><div class="poll-results" hidden></div></div><aside class="poll-side"><div class="poll-code"><div class="poll-qr is-blurred" role="img" aria-label="QR Code">${previewQr}</div><button class="poll-lock poll-icon-button" data-poll="start" aria-pressed="false" aria-label="${e(w.start)}" data-tip="${e(w.start)}"${staticMode?' disabled':''}>${pollIcon('locked','poll-lock-closed')}${pollIcon('unlocked','poll-lock-open')}</button></div><div class="poll-link" hidden><span class="poll-url"></span><button class="poll-copy" data-poll="copy" aria-label="${e(w.copy)}" data-tip="${e(w.copy)}">${pollIcon('copy','poll-copy-idle')}${pollIcon('check','poll-copy-done')}</button></div></aside></div><div class="poll-error" role="alert"></div><div class="poll-footer"><button class="poll-icon-button poll-csv" data-poll="csv" aria-label="${e(w.csv)}" data-tip="${e(w.csv)}" hidden>${pollIcon('download')}</button><span class="poll-count">${e(w.responses)}: 0</span><span class="poll-live" aria-hidden="true" hidden><i></i><i></i><i></i></span><span class="poll-status" role="status">${e(w.ready)}</span><span class="poll-actions">${action('results',w.results,'results')}${action('refresh',w.refresh,'refresh')}${action('again',w.again,'again')}${action('retry',w.retry,'retry')}${action('list',w.list,'list')}</span></div></div>`;
}

// Self contained: serialized into sandboxed slide documents, no fetch or imports.
export function pollViewRuntime(config:any,w:PollWords){
  if(config.staticMode||config.edit)return;
  const root=document.querySelector('.esf-poll');if(!root)return;
  const get=(s:string)=>root.querySelector(s) as HTMLElement;
  const initialQr=get('.poll-qr').innerHTML;
  let snapshot:any=null,frequencies=false;
  const send=(action:string)=>parent.postMessage({app:'esf-slide',type:'poll',token:config.token,id:config.id,action},'*');
  root.addEventListener('keydown',e=>{const key=(e as KeyboardEvent).key;if((key===' '||key==='Enter')&&(e.target as Element).closest('[data-poll]'))e.stopPropagation();});
  root.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('[data-poll]');if(!b||b.disabled)return;e.preventDefault();e.stopPropagation();if(b.dataset.poll==='list'){frequencies=!frequencies;draw();return;}if(b.dataset.poll==='copy'&&b.classList.contains('is-copied'))return;send(b.dataset.poll!);});
  function node(tag:string,cls:string,text=''){const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;}
  function draw(){
    const s=snapshot;if(!s)return;
    const status:any={ready:w.ready,preparing:w.preparing,open:w.open,closing:w.closing,closed:w.closed,loading:w.loading,results:w.closed,unknown:w.unknown};
    // Collecting is shown by the dots; a closed collection needs no caption (the screen reader still hears it).
    const live=s.phase==='open'&&!s.stale&&!s.error,quiet=(s.phase==='closed'||s.phase==='results')&&!s.stale&&!s.error;get('.poll-live').hidden=!live;
    get('.poll-status').textContent=quiet?'':(status[s.phase]||w.unknown)+(s.stale?' · '+w.stale:'');get('.poll-status').setAttribute('aria-label',quiet?status[s.phase]:'');get('.poll-error').textContent=s.noServer?w.noServer:s.error?w.error:'';
    get('.poll-count').textContent=w.responses+': '+s.count;
    const showing=s.view==='results',busy=!!s.busy;root!.setAttribute('data-view',showing?'results':'question');
    const visible:any={list:showing&&config.poll.type==='tag',results:!s.mayBeOpen&&s.prepared&&!showing,refresh:showing,again:s.prepared&&!s.mayBeOpen,retry:!!s.error&&!s.noServer};
    for(const b of root!.querySelectorAll<HTMLButtonElement>('.poll-actions [data-poll]:not(.poll-lock)')){b.hidden=!visible[b.dataset.poll!];b.disabled=busy;}
    const csv=get('.poll-csv') as HTMLButtonElement;csv.hidden=!s.prepared;csv.disabled=busy;
    const quiz=config.poll.type==='quiz';get('.poll-side').hidden=showing;get('.poll-options').hidden=showing&&!quiz;get('.poll-options').classList.toggle('poll-bars',showing&&quiz);get('.poll-results').hidden=!showing||quiz;
    for(const bar of root!.querySelectorAll<HTMLElement>('.poll-bar'))bar.hidden=!showing;
    const lock=get('.poll-lock') as HTMLButtonElement;
    lock.dataset.poll=s.mayBeOpen?'stop':'start';lock.setAttribute('aria-pressed',String(!!s.mayBeOpen));lock.setAttribute('aria-label',s.mayBeOpen?w.stop:s.prepared?w.closed:w.start);lock.dataset.tip=lock.getAttribute('aria-label')!;lock.disabled=busy||(s.prepared&&!s.mayBeOpen);
    // While collecting, the lock leaves the code so nothing covers it.
    const home=s.mayBeOpen?get('.poll-actions'):get('.poll-code');if(lock.parentElement!==home){const focused=document.activeElement===lock;home.prepend(lock);if(focused)lock.focus();}
    // A finished round has nothing to unlock: only the blurred code stays.
    const done=s.prepared&&!s.mayBeOpen;if(done&&!lock.hidden&&document.activeElement===lock)root!.querySelector<HTMLElement>('.poll-actions [data-poll]:not([hidden])')?.focus();lock.hidden=done;
    const qr=get('.poll-qr'),readable=!!s.url&&s.mayBeOpen;
    if(s.qr&&qr.dataset.url!==s.url){qr.innerHTML=s.qr;qr.dataset.url=s.url;}
    // New rounds restore the decorative QR; it never carries a live room identifier.
    if(!s.url&&qr.dataset.url){qr.innerHTML=initialQr;delete qr.dataset.url;}
    qr.classList.toggle('is-blurred',!readable);
    get('.poll-url').textContent=readable?s.url:'';get('.poll-link').hidden=!readable;
    const list=get('[data-poll="list"]');list.setAttribute('aria-label',frequencies?w.cloud:w.list);list.dataset.tip=frequencies?w.cloud:w.list;list.setAttribute('aria-pressed',String(frequencies));
    if(!showing)return;
    const result=get('.poll-results');result.replaceChildren();
    if(config.poll.type==='quiz'){
      const total=s.rows.reduce((n:number,r:any)=>n+r.responses,0);
      root!.querySelectorAll<HTMLElement>('.poll-bar').forEach((bar,i)=>{const count=s.rows.find((r:any)=>r.response===i)?.responses||0,share=total?count/total*100:0,fill=node('div','poll-bar-fill'),label=node('span','poll-bar-label'),percent=node('small','',Math.round(share)+'%');label.append(node('b','',String(count)),percent);fill.style.width=share+'%';
        // Narrow bars cannot hold the label, so it follows the bar.
        if(share>=25)fill.append(label);else label.classList.add('poll-bar-out');bar.replaceChildren(fill,...share>=25?[]:[label]);bar.setAttribute('aria-label',`${'ABCDE'[i]}: ${count} (${Math.round(share)}%)`);});
    }else if(config.poll.type==='tag'){
      result.append(node('div','poll-limit',w.limit));
      const cloud=node('div',frequencies?'':'poll-cloud'),max=Math.max(1,...s.rows.map((r:any)=>r.responses));
      for(const r of s.rows){const word=node('span',frequencies?'poll-frequency':'poll-word',frequencies?`${r.response} — ${r.responses}`:r.response);if(frequencies)word.style.display='block';else{word.style.fontSize=(22+58*Math.sqrt(r.responses/max))+'px';word.title=r.response+' — '+r.responses;word.setAttribute('aria-label',word.title);}cloud.append(word);}result.append(cloud);if(!s.rows.length)result.append(node('div','poll-empty',w.empty));
    }else{result.append(node('div','poll-limit',s.rows.length+' '+w.comments));const comments=node('div','poll-comments');for(const r of s.rows)comments.append(node('div','poll-comment',r.response));result.append(comments);if(!s.rows.length)result.append(node('div','poll-empty',w.empty));}
  }
  let copiedTimer:any=0;
  addEventListener('message',e=>{const m=e.data;if(e.source!==parent||m?.app!=='esf-player'||m.token!==config.token)return;
    if(m.type==='poll-copied'){const b=get('.poll-copy'),ok=!!m.ok;clearTimeout(copiedTimer);b.classList.toggle('is-copied',ok);b.dataset.tip=ok?w.copied:w.copy;if(ok)copiedTimer=setTimeout(()=>{b.classList.remove('is-copied');b.dataset.tip=w.copy;},1800);return;}
    if(m.type!=='poll-state')return;snapshot=m.state;draw();});
}

export interface PollSession {token:string;expiresAt:number}
// Kept by the player (localStorage); the controller never sees storage or the DOM. The key itself is never stored.
export interface PollSessionStore {load():PollSession|null;save(v:PollSession):void;clear():void;askKey(reason:'new'|'invalid'|'expired'):Promise<string|null>}

// Self contained: passed to playerRuntime as a function, never evaluated in slide frames.
export function createPollController(configs:(PollConfig|undefined)[],emit:(i:number,s:any)=>void,qr:(url:string)=>string,fetcher:typeof fetch|undefined,settings:{endpoint:string;interval?:number;timeout?:number},session:PollSessionStore){
  const endpoint=settings.endpoint,origin=endpoint?new URL(endpoint).origin:'',doFetch=fetcher||fetch;
  const states:any[]=configs.map(()=>null);let active=-1,hidden=false,disposed=false,signingIn:Promise<string|null>|null=null;
  const fresh=()=>({room:'',phase:'ready',count:0,rows:[],view:'question',prepared:false,mayBeOpen:false,busy:false,error:false,stale:false,updated:0,url:'',qr:'',attempt:0,timer:0,reading:false,failures:0,retry:'start'});
  function state(i:number){return states[i]||(states[i]=fresh());}
  function publish(i:number){const s=state(i);emit(i,{noServer:!endpoint,phase:s.phase,count:s.count,rows:s.rows,view:s.view,prepared:s.prepared,mayBeOpen:s.mayBeOpen,busy:s.busy,error:s.error,stale:s.stale,updated:s.updated,url:s.url,qr:s.qr});}
  function stop(s:any){clearTimeout(s.timer);s.timer=0;}
  const failure=(message:string,status=0)=>Object.assign(Error(message),{status});
  async function post(body:any){
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),settings.timeout??12000);
    try{const r=await doFetch(endpoint,{method:'POST',credentials:'omit',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});
      const v=await r.json().catch(()=>null);if(!r.ok||!v||typeof v!=='object'||!('data' in v))throw failure(v?.error||'HTTP',r.status);return v.data;}
    finally{clearTimeout(timer);}
  }
  // One sign-in at a time: overlapping actions wait for the same key dialog.
  function signIn(reason:'new'|'expired'){
    return signingIn||(signingIn=(async()=>{try{for(let why:'new'|'invalid'|'expired'=reason;;why='invalid'){
      const key=await session.askKey(why);if(key===null)return null;
      try{const d=await post({proc:'auth',key});if(!d||typeof d.token!=='string'||!/^[0-9a-f]{64}$/.test(d.token)||!Number.isFinite(d.expiresAt))throw failure('Invalid session');session.save({token:d.token,expiresAt:d.expiresAt});return d.token;}
      catch(e:any){if(e.status!==401)throw e;}
    }}finally{signingIn=null;}})());
  }
  function saved(){const v=session.load();return v&&v.expiresAt>Date.now()+60000?v.token:'';}
  // Interactive calls ask for the key when there is no live session; background reads never open the dialog.
  async function request(s:any,proc:string,extra:any={},interactive=true){
    let reason:'new'|'expired'='new';
    for(let attempt=0;attempt<2;attempt++){
      const token=saved()||(interactive?await signIn(reason):'');if(token===null)throw failure('cancelled');if(!token)throw failure('session_expired',401);
      try{return await post({proc,token,...s.room?{room:s.room}:{},...extra});}
      catch(e:any){if(e.status!==401)throw e;session.clear();reason='expired';if(!interactive)throw e;}
    }
    throw failure('session_expired',401);
  }
  const number=(v:any)=>{if(typeof v!=='number'&&typeof v!=='string'||typeof v==='string'&&!/^\d+$/.test(v))throw Error('Invalid number');const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid number');return n;};
  function countData(v:any){if(!v||typeof v!=='object')throw Error('Invalid count');const count=number(v.responses),status=number(v.status);if(status>1)throw Error('Invalid status');return{count,open:status===1};}
  function rowsData(v:any,p:PollConfig){if(!Array.isArray(v)||v.length>10000)throw Error('Invalid results');const seen=new Set();return v.map(r=>{
    if(!r||typeof r.response!=='string'&&typeof r.response!=='number')throw Error('Invalid row');
    if(p.type==='quiz'){const response=number(r.response);if(response>=(p.options?.length||0)||seen.has(response))throw Error('Invalid option');seen.add(response);return{response,responses:number(r.responses)};}
    if(typeof r.response!=='string'||r.response.length>100000)throw Error('Invalid text');return p.type==='tag'?{response:r.response,responses:number(r.responses)}:{response:r.response};
  }).slice(0,p.type==='quiz'?5:50);}
  // The student link must point at the configured server, so a QR code never sends the audience elsewhere.
  function roomData(v:any){if(!v||typeof v.room!=='string'||!/^[A-Z0-9]{6}$/.test(v.room)||typeof v.url!=='string')throw Error('Invalid room');const u=new URL(v.url);if(u.origin!==origin||!/^https?:$/.test(u.protocol))throw Error('Invalid link');return{room:v.room,url:u.href};}
  function schedule(i:number){const s=state(i);stop(s);if(disposed||hidden||active!==i||!s.mayBeOpen||s.busy||s.phase==='unknown')return;s.timer=setTimeout(()=>void read(i),Math.min(30000,(settings.interval??2000)*2**Math.min(4,s.failures)));}
  async function read(i:number){const s=state(i);if(s.reading||s.busy||!s.prepared)return;const attempt=s.attempt;s.reading=true;
    try{const v=countData(await request(s,'count',{},false));if(states[i]!==s||attempt!==s.attempt||s.busy)return;s.count=v.count;s.updated=Date.now();s.stale=false;s.failures=0;s.mayBeOpen=v.open;s.phase=v.open?'open':'closed';s.error=false;}
    catch{if(states[i]===s&&attempt===s.attempt&&!s.busy){s.stale=true;s.failures++;}}
    finally{s.reading=false;if(states[i]===s){publish(i);schedule(i);}}
  }
  async function action(i:number,op:string){if(disposed||!configs[i])return;let s=state(i);if(s.busy)return;
    if(!endpoint){s.error=true;publish(i);return;}
    if(op==='retry')op=s.retry;
    // The confirmation already says a new code is coming, so the new round opens right away.
    if(op==='again'){if(s.mayBeOpen||!s.prepared)return;stop(s);states[i]=fresh();publish(i);return action(i,'start');}
    if(!['start','stop','results','refresh'].includes(op))return;
    if(op==='start'&&s.prepared||op!=='start'&&!s.prepared)return;
    if((op==='results'||op==='refresh')&&s.mayBeOpen)return;
    stop(s);s.attempt++;s.busy=true;s.error=false;s.retry=op;s.phase=op==='start'?'preparing':op==='stop'?'closing':'loading';publish(i);
    try{
      if(op==='start'){
        const p=configs[i]!,room=roomData(await request(s,'prepare',{type:p.type,meta:p.type==='quiz'?p.options!.length:0}));s.room=room.room;s.prepared=true;s.mayBeOpen=true;
        // Once open is attempted, a timeout must be treated as potentially open, never as safe to replace.
        s.retry='stop';await request(s,'open');const v=countData(await request(s,'count'));s.count=v.count;s.mayBeOpen=v.open;if(!v.open)throw Error('Not open');
        s.url=room.url;s.qr=qr(s.url);s.phase='open';s.updated=Date.now();
      }else if(op==='stop'){
        s.mayBeOpen=true;await request(s,'close');const v=countData(await request(s,'count'));s.count=v.count;s.mayBeOpen=v.open;if(v.open)throw Error('Still open');s.phase='closed';s.updated=Date.now();
      }else{
        const v=countData(await request(s,'count'));s.count=v.count;s.mayBeOpen=v.open;if(v.open)throw Error('Still open');s.rows=rowsData(await request(s,'results'),configs[i]!);s.view='results';s.phase='results';s.updated=Date.now();
      }
      s.stale=false;s.failures=0;
    }catch(e:any){
      // Closing the key dialog before anything exists is not a failure: the activity is simply still ready.
      if(e?.message==='cancelled'&&!s.prepared){s.phase='ready';s.retry='start';}
      else{s.error=true;s.stale=true;s.phase=s.mayBeOpen?'unknown':s.prepared?'closed':'ready';}
    }
    finally{s.busy=false;publish(i);schedule(i);if(op==='start'&&active!==i&&s.mayBeOpen)void action(i,'stop');}
  }
  // Every answer of the room as CSV (UTF-8 with BOM for spreadsheets). Cells that a spreadsheet would run as a
  // formula are prefixed with an apostrophe, since the answers come from the audience.
  async function csv(i:number,w:any){
    const s=states[i],p=configs[i];if(!p||!s?.prepared||!endpoint)return null;
    const d=await request(s,'export');if(!d||!Array.isArray(d.rows))throw Error('Invalid export');
    const cell=(v:any)=>{let t=String(v??'');if(/^[=+\-@\t\r]/.test(t))t="'"+t;return /[",\r\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
    const head=p.type==='quiz'?[w.csvTime,w.csvOption,w.csvText]:[w.csvTime,w.csvResponse];
    const lines=d.rows.filter((r:any)=>r&&typeof r.response==='string'&&typeof r.at==='string').map((r:any)=>{
      if(p.type!=='quiz')return[r.at,r.response];const k=Number(r.response);return[r.at,'ABCDE'[k]||r.response,p.options?.[k]??''];});
    const stamp=new Date().toISOString().slice(0,16).replace(/[-:]/g,'').replace('T','-');
    return{name:`responses-${s.room}-${stamp}.csv`,text:'\ufeff'+[head,...lines].map(l=>l.map(cell).join(',')).join('\r\n')+'\r\n'};
  }
  return{action,publish,csv,link(i:number){const s=states[i];return configs[i]&&s?.mayBeOpen&&s.url?s.url:'';},activate(i:number){if(active>=0&&states[active])stop(state(active));active=i;if(configs[i]){publish(i);schedule(i);}},needsClose(i:number){return !!configs[i]&&!!states[i]&&(state(i).mayBeOpen||state(i).busy);},
    async leave(i:number){if(!configs[i]||!states[i])return true;const s=state(i);if(s.busy)return false;if(s.mayBeOpen)await action(i,'stop');return !s.mayBeOpen&&!s.busy;},
    visibility(value:boolean){hidden=value;if(active>=0&&configs[active]){stop(state(active));if(!hidden)void read(active);}},dispose(){disposed=true;for(const s of states)if(s)stop(s);}};
}
