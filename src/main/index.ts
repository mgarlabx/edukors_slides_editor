import {app,BrowserWindow,ipcMain,dialog,shell,Menu,clipboard,protocol,nativeImage,nativeTheme} from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Deck,Preferences,Profile,Project,newDeck,defaultNames,uid,validateDeck,masterOf,slug,aiModels,aiEfforts} from '../shared/model';
import {ProjectStore,ConflictError,atomic,exists,inside,readDeck,writeDeck} from './projects';
import {frameShell,frameShellCsp} from '../shared/render';
import {playerDocument} from '../shared/player';
import {normalizePollServer,pollEndpoint} from '../shared/poll';
import {minifyJs} from './minify';
import {captureSlides,checkSlides,createPdf,createPptx} from './exports';
import {embedFonts} from './fonts';
import {CancelledError,expandHome,SendOptions,liveUsage,Outcome,removedSlides} from './ai';
import {AgentTools} from './mcp';
import {AIProviders,probeProvider,connectAntigravity} from './providers';
import {providers,providerOf,normalizeProfiles} from '../shared/providers';
import {executablePath,loginCommand} from './provider-runtime';
import {readFileSync,existsSync} from 'node:fs';
app.setName('Edukors Slides Editor');
protocol.registerSchemesAsPrivileged([{scheme:'esf-frame',privileges:{standard:true,secure:true}}]);
const workspace=path.resolve(__dirname,'..');
const localData=process.env.ESF_DATA_DIR || (!app.isPackaged?path.join(workspace,'.local-data'):undefined);
if(localData){app.setPath('userData',localData);app.setPath('sessionData',path.join(localData,'chromium'));}
// The app was renamed from "Edukors Slides": keep its data folder (templates, prefs and workspaces, whose paths the CLI's --resume depends on).
else{const legacy=path.join(app.getPath('appData'),'Edukors Slides');if(existsSync(legacy))app.setPath('userData',legacy);}
const dataDir=app.getPath('userData'),tempDir=path.join(dataDir,'temp'),prefsPath=path.join(dataDir,'preferences.json');
const store=new ProjectStore(path.join(dataDir,'workspaces'));
// ESF_HIDDEN=1 (tests): every window stays off screen and the app never takes focus.
const hidden=process.env.ESF_HIDDEN==='1',hide={show:!hidden,backgroundThrottling:!hidden};
const reveal=()=>{if(!hidden){win?.show();win?.focus();}};
let win:BrowserWindow|null=null,ready=false,prefs:Preferences,allowQuit=false;
const pending:string[]=process.argv.filter(x=>/\.esf$/i.test(x)).map(x=>path.resolve(x));
const sessionsPath=path.join(dataDir,'ai-sessions.json');
const loadJson=(file:string)=>{try{const v=JSON.parse(readFileSync(file,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return{};}};
// Session IDs are stored per presentation+profile in userData, never in the .ESF.
const limitsPath=path.join(dataDir,'session-limits.json'),sessionLimits:Record<string,unknown>=loadJson(limitsPath);
const ai=new AIProviders(e=>{
  if(e.type==='limits'&&e.profileId){sessionLimits[e.profileId]=e.limits;void atomic(limitsPath,JSON.stringify(sessionLimits)).catch(()=>{});}
  win?.webContents.send('ai-event',e);
},loadJson(sessionsPath),s=>{void atomic(sessionsPath,JSON.stringify(s)).catch(()=>{});});
const aiStopped=new Set<string>(),aiProfiles=new Map<string,string>(),agentTools=new AgentTools();
const mainWords={
  pt:{fontsEmbedded:'Fontes incorporadas:',fontsMissing:'Fontes não encontradas neste computador (o HTML usará substitutas):',exported:'Exportado',openFile:'Abrir arquivo',showFolder:'Mostrar na pasta',cancelled:'Pedido interrompido. Nenhuma alteração foi aplicada.',profile:'Configure o executável e o diretório da conta em Configurações → Contas de IA.',retry:'A resposta não passou na validação; pedindo uma correção…',invalid:'As alterações não foram aplicadas porque a validação falhou:',cancel:'Cancelar',saveAs:'Salvar como…',reopen:'Reabrir a versão externa',changed:'O arquivo .ESF foi alterado fora do aplicativo.',missing:'O arquivo .ESF foi movido ou excluído.',conflict:'Suas alterações continuam abertas. Salve em outro local ou reabra a versão do disco (descarta as alterações desta aba).'},
  en:{fontsEmbedded:'Embedded fonts:',fontsMissing:'Fonts not found on this computer (the HTML will use fallbacks):',exported:'Exported',openFile:'Open file',showFolder:'Show in folder',cancelled:'Request stopped. No changes were applied.',profile:'Set the executable and account directory in Settings → AI accounts.',retry:'The answer failed validation; asking for a fix…',invalid:'The changes were not applied because validation failed:',cancel:'Cancel',saveAs:'Save As…',reopen:'Reopen the external version',changed:'The .ESF file was changed outside the app.',missing:'The .ESF file was moved or deleted.',conflict:'Your changes are still open. Save them elsewhere or reopen the version on disk (discards this tab’s changes).'},
  es:{fontsEmbedded:'Fuentes incorporadas:',fontsMissing:'Fuentes no encontradas en este equipo (el HTML usará sustitutas):',exported:'Exportado',openFile:'Abrir archivo',showFolder:'Mostrar en la carpeta',cancelled:'Solicitud interrumpida. No se aplicó ningún cambio.',profile:'Configura el ejecutable y el directorio de la cuenta en Configuración → Cuentas de IA.',retry:'La respuesta no pasó la validación; solicitando una corrección…',invalid:'Los cambios no se aplicaron porque la validación falló:',cancel:'Cancelar',saveAs:'Guardar como…',reopen:'Reabrir la versión externa',changed:'El archivo .ESF se modificó fuera de la aplicación.',missing:'El archivo .ESF se movió o se eliminó.',conflict:'Tus cambios siguen abiertos. Guárdalos en otra ubicación o reabre la versión del disco (descarta los cambios de esta pestaña).'},
};
const outputPaths=new Set<string>();
let exportBusy=false;
const defaultExecutable=process.platform==='win32'?'claude.exe':path.join(os.homedir(),'.local/bin/claude');
async function loadPreferences(){
  const defaults:Preferences={language:'pt',profiles:[{id:'default',name:'Claude',provider:'claude',model:'',effort:'',executable:defaultExecutable,configDir:path.join(os.homedir(),'.claude')}],activeProfile:'default',recent:[]};
  try{const saved=JSON.parse(await fs.readFile(prefsPath,'utf8'));return cleanPrefs({...defaults,...saved});}catch{return defaults;}
}
function cleanPrefs(p:Preferences):Preferences{
  if(!['pt','en','es'].includes(p.language)||!Array.isArray(p.profiles)||p.profiles.length>30)throw Error('Invalid preferences.');
  const profiles=normalizeProfiles(p,expandHome);
  if(p.systemPrompt!==undefined&&(typeof p.systemPrompt!=='string'||p.systemPrompt.length>20000))throw Error('Invalid system prompt.');
  return {language:p.language,attachDir:typeof p.attachDir==='string'&&p.attachDir.length<4096?p.attachDir:undefined,systemPrompt:p.systemPrompt||'',...normalizePollServer(p.pollServer)?{pollServer:normalizePollServer(p.pollServer)!}:{},profiles,activeProfile:profiles.some(x=>x.id===p.activeProfile)?p.activeProfile:'',recent:(p.recent||[]).filter(x=>typeof x==='string').slice(0,20)};
}
async function persist(){await atomic(prefsPath,JSON.stringify(prefs,null,2));}
async function remember(file:string){prefs.recent=[file,...prefs.recent.filter(x=>x!==file)].slice(0,20);await persist();}
async function openProject(file:string){const p=await store.open(file);await remember(p.path);return p;}
async function dispatchOpen(file:string){if(!ready){pending.push(file);return;}try{const p=await openProject(file);reveal();win?.webContents.send('open-project',p);}catch(e:any){dialog.showErrorBox('Edukors Slides Editor',e.message);}}
app.on('open-file',(e,file)=>{e.preventDefault();void dispatchOpen(file);});
if(!app.requestSingleInstanceLock()){app.quit();}
else app.on('second-instance',(_,argv)=>{for(const a of argv)if(/\.esf$/i.test(a))void dispatchOpen(path.resolve(a));reveal();});

const labels={pt:['Arquivo','Novo','Abrir…','Salvar','Salvar como…','Fechar aba','Editar','Desfazer','Refazer','Recortar','Copiar','Colar','Selecionar tudo','Visualizar','Configurações','Assistente de IA','Slides','Novo slide','Duplicar','Excluir','Apresentação','Apresentar','Exportar…','Recentes…','Slide mestre','Salvar como template…','Alterar layout…','Inserir','Texto','Colar imagem','Link','Forma','Mostrar no Finder','Lista de slides','Ampliar','Reduzir','Tamanho real','Janela','Ajuda','Site edukors.org','Aba'],en:['File','New','Open…','Save','Save As…','Close tab','Edit','Undo','Redo','Cut','Copy','Paste','Select all','View','Settings','AI assistant','Slides','New slide','Duplicate','Delete','Presentation','Present','Export…','Recent…','Slide Master','Save as Template…','Change Layout…','Insert','Text','Paste Image','Link','Shape','Show in Finder','Slide List','Zoom In','Zoom Out','Actual Size','Window','Help','edukors.org Website','Tab'],es:['Archivo','Nuevo','Abrir…','Guardar','Guardar como…','Cerrar pestaña','Editar','Deshacer','Rehacer','Cortar','Copiar','Pegar','Seleccionar todo','Ver','Configuración','Asistente de IA','Diapositivas','Nueva diapositiva','Duplicar','Eliminar','Presentación','Presentar','Exportar…','Recientes…','Patrón de diapositivas','Guardar como plantilla…','Cambiar diseño…','Insertar','Texto','Pegar imagen','Enlace','Forma','Mostrar en Finder','Lista de diapositivas','Acercar','Alejar','Tamaño real','Ventana','Ayuda','Sitio edukors.org','Pestaña']};
// Items that need an open presentation are disabled on the empty workspace; Edit stays on for text fields (settings, dialogs).
let deckOpen=false;
function menu(){
  const l=labels[prefs.language];const command=(name:string)=>()=>win?.webContents.send('command',name),enabled=deckOpen;
  // Same menus, order and names as the other EDUKORS apps (Manual de Estilo Visual): App, File, Edit, Insert, the domain menus, View, Window, Help.
  const sep={type:'separator' as const},darwin=process.platform==='darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(darwin?[{label:'Edukors Slides Editor',submenu:[{role:'about' as const},sep,{label:l[14]+'…',accelerator:'CmdOrCtrl+,',click:command('settings')},sep,{role:'quit' as const}]}]:[]),
    {label:l[0],submenu:[{label:l[1],accelerator:'CmdOrCtrl+N',click:command('new')},{label:l[2],accelerator:'CmdOrCtrl+O',click:command('open')},{label:l[23],click:command('recent')},sep,{label:l[3],accelerator:'CmdOrCtrl+S',click:command('save'),enabled},{label:l[4],accelerator:'CmdOrCtrl+Shift+S',click:command('saveAs'),enabled},{label:l[25],click:command('saveTemplate'),enabled},sep,{label:l[22],accelerator:'CmdOrCtrl+E',click:command('export'),enabled},{label:l[32],click:command('reveal'),enabled},sep,{label:l[5],accelerator:'CmdOrCtrl+W',click:command('close'),enabled},...(darwin?[]:[sep,{label:l[14]+'…',accelerator:'CmdOrCtrl+,',click:command('settings')},{role:'quit' as const}])]},
    {label:l[6],enabled,submenu:[{label:l[7],accelerator:'CmdOrCtrl+Z',click:command('undo'),enabled},{label:l[8],accelerator:'CmdOrCtrl+Shift+Z',click:command('redo'),enabled},sep,{label:l[9],accelerator:'CmdOrCtrl+X',click:command('cut'),enabled},{label:l[10],accelerator:'CmdOrCtrl+C',click:command('copy'),enabled},{label:l[11],accelerator:'CmdOrCtrl+V',click:command('paste'),enabled},{label:l[18],accelerator:'CmdOrCtrl+D',click:command('duplicate'),enabled},{label:l[19],click:command('delete'),enabled},sep,{label:l[12],accelerator:'CmdOrCtrl+A',click:command('selectAll'),enabled}]},
    {label:l[27],submenu:[{label:l[28],click:command('insertText'),enabled},{label:l[29],click:command('insertImage'),enabled},{label:l[30],click:command('insertLink'),enabled},{label:l[31],click:command('insertShape'),enabled},{label:({pt:'Pergunta interativa',en:'Interactive question',es:'Pregunta interactiva'})[prefs.language],click:command('insertPoll'),enabled}]},
    {label:l[16],submenu:[{label:l[17],accelerator:'CmdOrCtrl+Shift+N',click:command('newSlide'),enabled},{label:l[26],click:command('changeLayout'),enabled}]},
    {label:l[20],submenu:[{label:l[21],accelerator:'CmdOrCtrl+Enter',click:command('present'),enabled},sep,{label:l[24],click:command('master'),enabled}]},
    {label:l[13],submenu:[{label:l[33],accelerator:'Alt+CmdOrCtrl+0',click:command('slidePanel'),enabled},{label:l[15],accelerator:'Shift+CmdOrCtrl+A',click:command('ai'),enabled},sep,{label:l[34],accelerator:'CmdOrCtrl+=',click:command('zoomIn'),enabled},{label:l[35],accelerator:'CmdOrCtrl+-',click:command('zoomOut'),enabled},{label:l[36],accelerator:'CmdOrCtrl+0',click:command('zoomReset'),enabled},sep,{role:'togglefullscreen'},{role:'toggleDevTools'}]},
    {label:l[37],role:'windowMenu' as const,submenu:[{role:'minimize' as const},{role:'zoom' as const},sep,...Array.from({length:9},(_,i)=>({label:`${l[40]} ${i+1}`,accelerator:`CmdOrCtrl+${i+1}`,click:command('tab'+(i+1)),enabled}))]},
    {label:l[38],role:'help' as const,submenu:[{label:l[39],click:command('website')}]}
  ]));
}
function handle(channel:string,fn:(...args:any[])=>any){
  ipcMain.handle(channel,async(event,...args)=>{
    if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Untrusted IPC sender.');
    return fn(...args);
  });
}
// Attach and insert dialogs open in the last folder used; before the first pick, in the presentation's folder.
async function pickFiles(options:Electron.OpenDialogOptions,id=''){
  const file=id?store.location(id).file:'';
  const r=await dialog.showOpenDialog(win!,{...options,defaultPath:prefs.attachDir&&await exists(prefs.attachDir)?prefs.attachDir:file?path.dirname(file):undefined});
  if(!r.canceled&&r.filePaths.length){prefs.attachDir=path.dirname(r.filePaths[0]);await persist();}
  return r;
}
// Save As chooses the .ESF file itself; any number of presentations may share a folder. The extension is always lowercase.
async function chooseFile(defaultPath:string){
  const r=await dialog.showSaveDialog(win!,{defaultPath:defaultPath.replace(/\.esf$/i,'')+'.esf',filters:[{name:'Edukors Slides Editor',extensions:['esf']}],properties:['createDirectory']});
  if(r.canceled||!r.filePath)return null;return r.filePath.replace(/\.esf$/i,'')+'.esf';
}
// A presentation without a file yet is saved next to the last one used, named after its title.
const defaultFolder=()=>prefs.recent[0]?path.dirname(prefs.recent[0]):app.getPath('documents');
const fileOf=(deck:Deck)=>store.location(deck.id).file||path.join(defaultFolder(),slug(deck.title)+'.esf');
const templatesDir=path.join(dataDir,'templates');
async function customTemplates(){
  await fs.mkdir(templatesDir,{recursive:true});const list=[];
  for(const ent of await fs.readdir(templatesDir,{withFileTypes:true})){
    if(!ent.isDirectory()||ent.isSymbolicLink())continue;
    try{const meta=JSON.parse(await fs.readFile(await inside(templatesDir,ent.name+'/template.json'),'utf8'));await inside(templatesDir,ent.name+'/template.ESF');list.push({id:ent.name,title:String(meta.title)});}catch{}
  }return list;
}
// Blank is the only built-in template; the others are presentations the user saved as templates (File menu).
async function saveTemplate(deck:Deck){
  // A custom template is a package with the deck only (template.ESF) and its catalog entry (template.json).
  validateDeck(deck);const base=slug(deck.title);let id=base;for(let n=2;await exists(path.join(templatesDir,id));n++)id=base+'-'+n;
  // The system prompt describes one talk, not the design: it stays out of templates.
  const {systemPrompt,...design}=structuredClone(deck);
  await writeDeck(path.join(templatesDir,id,'template.ESF'),{...design,id:uid('deck'),revision:0});
  await atomic(path.join(templatesDir,id,'template.json'),JSON.stringify({title:deck.title}));
  return customTemplates();
}
handle('bootstrap',async()=>{
  // Presentations of the last session are not reopened; only files the system asked to open are.
  ready=true;
  const files=pending.splice(0);const projects=[];
  for(const file of [...new Set(files)])try{projects.push(await openProject(file));}catch{}
  return{preferences:prefs,projects,templates:await customTemplates(),platform:process.platform,limits:sessionLimits};
});
handle('menuState',(open:unknown)=>{if(deckOpen!==!!open){deckOpen=!!open;menu();}});
handle('preferences',async(p:Preferences)=>{
  const next=cleanPrefs(p);
  // A removed or re-pointed profile must not keep running or resume sessions of another account.
  for(const old of prefs.profiles){
    const now=next.profiles.find(x=>x.id===old.id);
    if(now&&providerOf(now).id===providerOf(old).id&&now.configDir===old.configDir&&now.executable===old.executable)continue;
    for(const [deckId,profileId] of aiProfiles)if(profileId===old.id){aiStopped.add(deckId);ai.cancel(deckId);}
    ai.forgetProfile(old.id);delete sessionLimits[old.id];
  }
  prefs={...next,attachDir:prefs.attachDir};await persist();menu();return prefs;
});
handle('open',async(file?:string)=>{
  if(file&&!prefs.recent.includes(file))throw Error('Choose this project using the file dialog.');
  if(!file){const r=await dialog.showOpenDialog(win!,{properties:['openFile'],filters:[{name:'Edukors Slides Editor',extensions:['esf','ESF']}]});if(r.canceled)return null;file=r.filePaths[0];}
  return openProject(file);
});
// New asks for nothing: the file is chosen on the first save.
handle('create',async(title:string,template:string)=>{
  if(typeof title!=='string'||!title.trim())throw Error('Title required.');
  let deck:Deck;
  if(template.startsWith('custom:'))deck={...await readDeck(await inside(templatesDir,template.slice(7)+'/template.ESF')),id:uid('deck'),title,revision:0};
  else if(template==='blank')deck=newDeck(title,defaultNames[prefs.language]);
  else throw Error('Unknown template.');
  return store.untitled(deck);
});
// A changed or missing .ESF is never overwritten: the user saves elsewhere or reopens the version on disk.
async function save(deck:Deck):Promise<Project|null>{
  if(!store.location(deck.id).file)return saveAs(deck);
  try{const {project}=await store.save(deck);await remember(project.path);return project;}
  catch(e){
    if(!(e instanceof ConflictError))throw e;
    const w=mainWords[prefs.language],file=store.location(deck.id).file;
    const r=await dialog.showMessageBox(win!,{type:'warning',message:e.reason==='missing'?w.missing:w.changed,detail:file+'\n\n'+w.conflict,buttons:e.reason==='missing'?[w.cancel,w.saveAs]:[w.cancel,w.saveAs,w.reopen],defaultId:1,cancelId:0});
    if(r.response===1)return saveAs(deck);
    if(r.response===2){await closeProject(deck.id);return openProject(file);}
    return null;
  }
}
// Save As writes an independent package (new ID) with the auxiliary files and conversations; the old file stays as last saved.
async function saveAs(deck:Deck){
  validateDeck(deck);const s=store.location(deck.id);
  if(aiProfiles.has(deck.id))throw Error('A request is already running.');
  const file=await chooseFile(fileOf(deck));if(!file)return null;
  // The name chosen on the first save becomes the presentation's title.
  if(!s.file){const p=await store.attach(deck.id,file,{...deck,title:path.basename(file).replace(/\.esf$/i,'')});await remember(p.path);return p;}
  if(path.join(await fs.realpath(path.dirname(file)),path.basename(file))===s.file){const {project}=await store.save(deck);return project;}
  const p=await store.create(file,{...structuredClone(deck),id:uid('deck'),revision:0},deck.id);
  await closeProject(deck.id);await remember(p.path);return p;
}
// Closing waits for a running assistant to stop before the working folder is removed.
async function closeProject(id:string){
  if(aiProfiles.has(id)){aiStopped.add(id);ai.cancel(id);for(let i=0;i<100&&aiProfiles.has(id);i++)await new Promise(r=>setTimeout(r,50));}
  await store.close(id);
}
handle('save',save);
handle('saveAs',saveAs);
handle('close',(id:string)=>closeProject(id));
handle('draft',(deck:Deck)=>store.draft(deck));
handle('discard',(id:string)=>store.discard(id));
handle('reload',async(id:string)=>{const file=store.location(id).file;await closeProject(id);return openProject(file);});
const assetMimes:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf'};
handle('importAsset',async(id:string)=>{
  store.location(id);
  const result=await pickFiles({properties:['openFile','multiSelections'],filters:[{name:'Images / fonts',extensions:['png','jpg','jpeg','webp','gif','svg','avif','woff','woff2','ttf','otf']}]},id);
  if(result.canceled)return[];
  return Promise.all(result.filePaths.map(async file=>{
    const stat=await fs.stat(file);if(stat.size>50_000_000)throw Error('Resource exceeds 50 MB.');
    const bytes=await fs.readFile(file);const ext=path.extname(file).slice(1).toLowerCase();
    const mime=assetMimes[ext];
    if(!mime)throw Error('Unsupported resource.');
    return{id:'asset-'+createHash('sha256').update(bytes).digest('hex'),name:path.basename(file),mime,data:bytes.toString('base64')};
  }));
});
handle('nativeEdit',(action:string)=>{if(action==='delete')win!.webContents.delete();else if(action==='copy')win!.webContents.copy();else if(action==='cut')win!.webContents.cut();else if(action==='paste')win!.webContents.paste();else if(action==='undo')win!.webContents.undo();else if(action==='redo')win!.webContents.redo();else if(action==='selectAll')win!.webContents.selectAll();else throw Error('Unknown edit.');});
handle('clipboardWrite',async(payload:any)=>{if(!payload||JSON.stringify(payload).length>50_000_000)throw Error('Clipboard limit.');await clipboard.writeText(JSON.stringify(payload));});
handle('clipboardRead',async()=>{try{const data=JSON.parse(await clipboard.readText());if(data.format!=='esf-slides'&&data.format!=='esf-objects')return null;return data;}catch{return null;}});
handle('clipboardText',async()=>clipboard.readText());
handle('clipboardImage',async()=>{const items=await clipboard.read(),item=items.find(x=>x.types.some(t=>t.startsWith('image/')));if(!item)return null;const type=['image/png','image/jpeg','image/webp','image/tiff'].find(t=>item.types.includes(t))||item.types.find(t=>t.startsWith('image/'))!;const blob=await item.getType(type) as Blob,bytes=Buffer.from(await blob.arrayBuffer());if(bytes.length>50_000_000)throw Error('Resource exceeds 50 MB.');const png=type==='image/png'?bytes:nativeImage.createFromBuffer(bytes).toPNG();if(!png.length||png.length>50_000_000)throw Error('Resource exceeds 50 MB.');return{id:'asset-'+createHash('sha256').update(png).digest('hex'),name:'clipboard.png',mime:'image/png',data:png.toString('base64')};});
handle('present',async(deck:Deck,start=0)=>{
  validateDeck(deck);store.location(deck.id);
  const file=path.join(tempDir,uid('present')+'.html');await atomic(file,playerDocument(deck,{tools:false,start:Number.isInteger(start)?start:0,lang:prefs.language,pollServer:prefs.pollServer}));
  const p=new BrowserWindow({width:1440,height:900,title:deck.title,backgroundColor:'#141b29',show:hide.show,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:hide.backgroundThrottling}});
  p.webContents.setWindowOpenHandler(({url})=>{
    if(url==='about:blank')return{action:'allow',overrideBrowserWindowOptions:{show:hide.show,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:hide.backgroundThrottling}}};
    if(/^https?:|^mailto:/i.test(url))void shell.openExternal(url);return{action:'deny'};
  });
  // The Edit menu acts on the editor window, so its shortcuts are applied here directly (e.g. pasting the presenter key).
  p.webContents.on('before-input-event',(e,i)=>{const act=i.type==='keyDown'&&(i.meta||i.control)&&!i.alt&&!i.shift?({x:'cut',c:'copy',v:'paste',a:'selectAll'} as any)[i.key.toLowerCase()]:undefined;if(act){e.preventDefault();(p.webContents as any)[act]();}});
  p.on('closed',()=>{void fs.rm(file,{force:true});});
  // Not awaited: closing the window while it loads would reject, and that is not an error.
  void p.loadFile(file).catch(()=>{});return true;
});
// Exports are named after the .ESF file by default and go where the user chooses (no copy inside the package, which
// keeps only the presentation); the HTML's <title> is the file name.
handle('export',async(deck:Deck,format:string)=>{
  if(!['html','pdf','pptx'].includes(format))throw Error('Unsupported export.');
  if(exportBusy)throw Error('An export is already running.');
  validateDeck(deck);
  // The default place is next to the .ESF: a new presentation is saved first.
  let project:Project|undefined;
  if(!store.location(deck.id).file){const p=await save(deck);if(!p)return null;deck=p.deck;project=p;}
  const s=store.location(deck.id);
  const r=await dialog.showSaveDialog(win!,{defaultPath:path.join(path.dirname(s.file),path.basename(s.file).replace(/\.esf$/i,'')+'.'+format),filters:[{name:format.toUpperCase(),extensions:[format]}],properties:['createDirectory']});
  if(r.canceled||!r.filePath)return null;
  const file=r.filePath.toLowerCase().endsWith('.'+format)?r.filePath:r.filePath+'.'+format;
  exportBusy=true;
  try{
    let bytes:Buffer|string,fonts={embedded:[] as string[],missing:[] as string[]};
    if(format==='html'){const r=await embedFonts(deck);fonts=r;bytes=playerDocument(r.deck,{title:path.basename(file),minify:minifyJs,pollServer:prefs.pollServer});}
    else {const images=await captureSlides(deck,tempDir);bytes=format==='pdf'?await createPdf(images,tempDir):createPptx(images,deck.title);}
    await atomic(file,bytes);outputPaths.add(file);
    // No alert when done: only fonts missing on this Mac are reported, in the editor.
    return{path:file,project,fonts,noPollServer:format==='html'&&deck.slides.some(s=>s.poll)&&!prefs.pollServer};
  }finally{exportBusy=false;}
});
// The CLI keeps the account's usage (fetched by interactive sessions) in <configDir>/.claude.json; it holds no
// credentials. Read every 30 s by the UI, it refreshes the 5-hour window between requests made here.
async function cachedUsage(profile:Profile){
  if(providerOf(profile).id!=='claude')return;
  try{
    const c=JSON.parse(await fs.readFile(path.join(expandHome(profile.configDir),'.claude.json'),'utf8')).cachedUsageUtilization,w=c?.utilization?.five_hour;
    const resetsAt=Date.parse(w?.resets_at);if(typeof w?.utilization!=='number'||!Number.isFinite(c.fetchedAtMs))return;
    const old=sessionLimits[profile.id] as {updated?:number}|undefined;if(old?.updated&&old.updated>=c.fetchedAtMs)return;
    sessionLimits[profile.id]={utilization:Math.max(0,w.utilization/100),resetsAt:Number.isFinite(resetsAt)?Math.floor(resetsAt/1000):undefined,status:'allowed',updated:c.fetchedAtMs};changed=true;
  }catch{}
}
let changed=false;
handle('limits',async()=>{
  changed=false;const active=prefs.profiles.find(p=>p.id===prefs.activeProfile);
  const live=active&&providerOf(active).id==='claude'?await liveUsage(active).catch(()=>null):null;if(live&&active){sessionLimits[active.id]=live;changed=true;}
  await Promise.all(prefs.profiles.filter(p=>!live||p!==active).map(cachedUsage));if(changed)void atomic(limitsPath,JSON.stringify(sessionLimits)).catch(()=>{});return sessionLimits;});
handle('reveal',(file:string)=>{if(!outputPaths.has(file)&&![...store.projects.values()].some(p=>p.file===file))throw Error('Unknown path.');shell.showItemInFolder(file);});
handle('openOutput',async(file:string)=>{if(!outputPaths.has(file))throw Error('Unknown export.');const error=await shell.openPath(file);if(error)throw Error(error);});
handle('probe',(id:string,auth=false)=>{const p=prefs.profiles.find(x=>x.id===id);if(!p)throw Error('Profile missing.');return probeProvider(p,path.join(tempDir,'probe-'+p.id),auth);});
handle('createProfile',async(provider:string,name:string)=>{
  const type=providers.find(p=>p.id===provider);if(!type||typeof name!=='string'||!name.trim()||name.length>100)throw Error('Invalid account.');
  const existing=prefs.profiles.filter(p=>providerOf(p).id===provider),id=uid('profile');
  return{id,name:name.trim(),provider:type.id,executable:existing[0]?.executable||await executablePath(type.executable),configDir:existing.length||type.id==='agy'?path.join(dataDir,'accounts',id):expandHome(type.configDir),model:'',effort:''};
});
handle('accountConnect',async(id:string)=>{const p=prefs.profiles.find(x=>x.id===id);if(!p)throw Error('Profile missing.');return connectAntigravity(p,path.join(tempDir,'connect-'+p.id),url=>{void shell.openExternal(url);});});
handle('accountLogin',async(id:string,copy=false)=>{const p=prefs.profiles.find(x=>x.id===id);if(!p)throw Error('Profile missing.');const command=loginCommand(p);if(copy)await clipboard.writeText(command);return command;});
handle('pickExecutable',async()=>{const r=await dialog.showOpenDialog(win!,{properties:['openFile']});return r.canceled?null:r.filePaths[0];});
async function reviewChanges(base:Deck,next:Deck){
  const removed=removedSlides(base,next);
  if(removed.length)return[`Deleting slides is not allowed; only the user deletes slides. Keep every existing slide in slideOrder. Missing: ${removed.map(s=>`${s.title||'untitled'} (${s.id})`).join(', ')}`];
  try{validateDeck(next);}catch(e:any){return[String(e.message)];}
  // Sample each affected inherited look, including inactive masters used by imported layouts.
  const samples=new Map<string,number>();
  const changed=next.slides.filter(s=>{const o=base.slides.find(x=>x.id===s.id);if(!o||o.layoutId!==s.layoutId||(['html','css','script','staticHtml'] as const).some(k=>o[k]!==s[k]))return true;
    const before=masterOf(base,o),after=masterOf(next,s),oldLayout=base.layouts.find(l=>l.id===o.layoutId),layout=next.layouts.find(l=>l.id===s.layoutId);
    const look=before.css!==after.css||before.html!==after.html||oldLayout?.html!==layout?.html||oldLayout?.css!==layout?.css;
    const key=after.id+':'+s.layoutId,n=samples.get(key)||0;if(look)samples.set(key,n+1);return look&&n<12;}).map(s=>s.id);
  return changed.length?(await checkSlides(next,changed,tempDir)).map(e=>`${e.title} (${e.id}): ${e.message}`):[];
}
// Images and fonts the agent saved in the folder become deck assets under the IDs it chose.
async function importAgentAssets(root:string,base:Deck,out:Outcome){
  const next=out.deck!,problems:string[]=[];
  for(const a of out.assets||[]){
    try{
      const file=await inside(root,String(a.path).replace(/^\.\//,'')),mime=assetMimes[path.extname(file).slice(1).toLowerCase()];
      if(!mime)throw Error('Unsupported resource.');if((await fs.stat(file)).size>50_000_000)throw Error('Resource exceeds 50 MB.');
      const data=(await fs.readFile(file)).toString('base64'),old=next.assets.find(x=>x.id===a.id);
      if(old&&old.data!==data)throw Error(`ID ${a.id} is already used by another resource.`);
      if(!old)next.assets.push({id:a.id,name:String(a.name||path.basename(file)),mime,data});
    }catch(e:any){problems.push(`Asset ${a.id} (${a.path}): ${e.message}`);}
  }
  // New files that no slide references are not added to the deck.
  const used=JSON.stringify([next.slides,next.masters,next.layouts]);next.assets=next.assets.filter(x=>base.assets.some(b=>b.id===x.id)||used.includes('asset:'+x.id));
  return problems;
}
async function runAI(deck:Deck,profile:Profile,prompt:string,root:string,selected:string[],options:SendOptions={},cleanup?:string){
  const emit=(e:Record<string,unknown>)=>win?.webContents.send('ai-event',{projectId:deck.id,...e});
  const w=mainWords[prefs.language];aiStopped.delete(deck.id);aiProfiles.set(deck.id,profile.id);store.aiStart(deck.id);emit({type:'status',text:'running'});
  const grant=await agentTools.grant(root).catch(()=>null);if(grant)options={...options,mcp:{url:grant.url,token:grant.token}};
  try{
    let request=prompt;
    for(let attempt=0;;attempt++){
      const executable=await executablePath(profile.executable);if(aiStopped.has(deck.id))throw new CancelledError();
      const out=await ai.send(deck,{...profile,executable},request,root,selected,options);
      if(aiStopped.has(deck.id))throw new CancelledError();
      // An answer or a question without slide changes leaves the presentation as it is.
      if(!out.deck){emit({type:'done',text:out.message,questions:out.questions,sessionId:out.sessionId});return;}
      emit({type:'activity',kind:'validating'});
      const problems=[...await importAgentAssets(root,deck,out),...await reviewChanges(deck,out.deck)];
      if(aiStopped.has(deck.id))throw new CancelledError();
      if(!problems.length){emit({type:'done',deck:out.deck,text:out.message,questions:out.questions,sessionId:out.sessionId});return;}
      if(attempt>=1)throw Error(w.invalid+'\n'+problems.join('\n'));
      emit({type:'activity',kind:'fixing',body:problems.join('\n')});
      request=`The app rejected your previous answer. Fix these problems and return the corrected slideUpdates (and slideOrder/assets when needed) relative to the current project state. Include all changes needed for the original request; the previous proposal was not applied:\n${problems.join('\n')}\n\nOriginal request: ${prompt}`;
    }
  }catch(e:any){emit({type:'error',text:e instanceof CancelledError?w.cancelled:String(e?.message||e)});}
  finally{grant?.revoke();store.aiEnd(deck.id);aiProfiles.delete(deck.id);emit({type:'status',text:'idle'});if(cleanup)void fs.rm(cleanup,{recursive:true,force:true});}
}
// Only files picked in the attach dialog can be sent to the agent.
const attachable=new Set<string>();
handle('aiAttach',async(id:string)=>{
  const r=await pickFiles({properties:['openFile','multiSelections']},typeof id==='string'?id:'');if(r.canceled)return[];
  return Promise.all(r.filePaths.map(async file=>{const stat=await fs.stat(file);if(stat.size>50_000_000)throw Error('Resource exceeds 50 MB.');attachable.add(file);return{path:file,name:path.basename(file),size:stat.size};}));
});
handle('aiSend',async(deck:Deck,profileId:string,prompt:string,selected:string[],files:string[]=[],conversation='')=>{
  if(typeof conversation!=='string'||conversation.length>100)throw Error('Invalid conversation.');
  const p=prefs.profiles.find(x=>x.id===profileId);if(!p||!p.executable.trim())throw Error(mainWords[prefs.language].profile);
  if(aiProfiles.has(deck.id))throw Error('A request is already running.');
  validateDeck(deck);const session=store.location(deck.id),root=session.workspace;
  if(!Array.isArray(files)||files.some(f=>typeof f!=='string'||!attachable.has(f)))throw Error('Unknown attachment.');
  // Files inside the working folder are read in place; others are copied to a temporary folder the agent may read.
  const attachments:NonNullable<SendOptions['attachments']>=[];let copyDir:string|undefined;
  deck=structuredClone(deck);
  for(const file of files){
    const rel=path.relative(root,file);let target=file;
    if(rel.startsWith('..')||path.isAbsolute(rel)){
      copyDir??=path.join(tempDir,uid('attach'));await fs.mkdir(copyDir,{recursive:true});
      target=path.join(copyDir,attachments.length+'-'+path.basename(file));await fs.copyFile(file,target);
    }
    const mime=assetMimes[path.extname(file).slice(1).toLowerCase()];let assetId:string|undefined;
    if(mime?.startsWith('image/')){
      const bytes=await fs.readFile(file);assetId='asset-'+createHash('sha256').update(bytes).digest('hex');
      if(!deck.assets.some(a=>a.id===assetId))deck.assets.push({id:assetId,name:path.basename(file),mime,data:bytes.toString('base64')});
    }
    // Text goes inline: reading it with a tool would cost a whole extra turn over the full context.
    let content:string|undefined;
    if(!mime&&(await fs.stat(file)).size<=300_000){const bytes=await fs.readFile(file),text=bytes.toString('utf8');if(!bytes.includes(0)&&!text.includes('\uFFFD'))content=text;}
    attachments.push({name:path.basename(file),path:target,assetId,...content!==undefined?{content}:{}});
  }
  void runAI(deck,p,prompt,root,selected,{language:prefs.language,conversation,systemPrompt:prefs.systemPrompt,model:p.model,effort:p.effort,attachments,addDirs:copyDir?[copyDir]:[],scope:path.basename(session.dir)},copyDir);return true;
});
handle('aiCancel',(id:string)=>{if(aiProfiles.has(id))aiStopped.add(id);ai.cancel(id);});
// Conversations go into the package (.edukors/ai/conversations.json), with no account data; the UI marks the
// presentation as modified when it saves one.
const projectConversation=(id:string)=>inside(store.location(id).workspace,'.edukors/ai/conversations.json',true);
handle('conversationLoad',async(id:string)=>{try{return JSON.parse(await fs.readFile(await projectConversation(id),'utf8'));}catch{return null;}});
handle('conversationSave',async(id:string,data:unknown)=>{
  const text=JSON.stringify(data);if(text.length>5_000_000)throw Error('Conversation too large.');
  await atomic(await projectConversation(id),text);
});
handle('templates',customTemplates);
const templateMeta=async(id:string)=>{if(typeof id!=='string'||!/^[\w.-]+$/.test(id))throw Error('Invalid template.');return inside(templatesDir,id+'/template.json');};
// The gallery card shows the template's first slide: the deck with that slide only and the assets it can reference.
handle('templatePreview',async(id:string)=>{
  await templateMeta(id);const deck=await readDeck(await inside(templatesDir,id+'/template.ESF')),slides=deck.slides.slice(0,1);
  const text=JSON.stringify([slides,deck.masters,deck.layouts]);return{...deck,slides,assets:deck.assets.filter(a=>text.includes(a.id))};
});
handle('renameTemplate',async(id:string,title:string)=>{
  if(typeof title!=='string'||!title.trim()||title.length>200)throw Error('Title required.');
  const file=await templateMeta(id),meta=JSON.parse(await fs.readFile(file,'utf8'));await atomic(file,JSON.stringify({...meta,title:title.trim()}));return customTemplates();
});
handle('deleteTemplate',async(id:string)=>{await templateMeta(id);await fs.rm(await inside(templatesDir,id),{recursive:true,force:true});return customTemplates();});
handle('saveTemplate',saveTemplate);
// The logo in the window header opens the Edukors site in the default browser (ESF_EXTERNAL_LOG: tests record it instead).
// Settings → Interactive questions → Test: the service answers ping without a key.
handle('pollPing',async(server:unknown)=>{
  const base=normalizePollServer(server);if(!base)return{ok:false,error:'invalid'};
  try{const r=await fetch(pollEndpoint(base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proc:'ping'}),signal:AbortSignal.timeout(10000)});const v=await r.json().catch(()=>null);
    return v?.data?.service==='edukors-poll'?{ok:true}:{ok:false,error:'service'};}catch{return{ok:false,error:'network'};}
});
handle('website',()=>process.env.ESF_EXTERNAL_LOG?fs.appendFile(process.env.ESF_EXTERNAL_LOG,'https://edukors.org\n'):shell.openExternal('https://edukors.org'));
handle('quit',()=>{allowQuit=true;app.quit();});
app.on('before-quit',e=>{if(!allowQuit&&win&&!win.isDestroyed()){e.preventDefault();win.webContents.send('command','quit');}else{ai.dispose();agentTools.dispose();}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.whenReady().then(async()=>{
  // The app is always light, whatever the system appearance (native controls, menus and dialogs included).
  nativeTheme.themeSource='light';
  if(hidden)app.dock?.hide();await fs.mkdir(tempDir,{recursive:true});await store.cleanup();prefs=await loadPreferences();menu();
  protocol.handle('esf-frame',()=>new Response(frameShell,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':frameShellCsp,'cache-control':'no-store'}}));
  win=new BrowserWindow({width:1500,height:970,minWidth:960,minHeight:600,title:'Edukors Slides Editor',backgroundColor:'#f6f7fb',show:hide.show,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:hide.backgroundThrottling}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  // With no deck the Edit menu is disabled, so its shortcuts no longer reach text fields (Settings, dialogs) through it.
  win.webContents.on('before-input-event',(e,i)=>{const k=i.key.toLowerCase(),act=i.type==='keyDown'&&!deckOpen&&(i.meta||i.control)&&!i.alt?k==='z'?i.shift?'redo':'undo':!i.shift?{x:'cut',c:'copy',v:'paste',a:'selectAll'}[k]:undefined:undefined;if(act){e.preventDefault();(win!.webContents as any)[act]();}});
  win.on('close',e=>{if(!allowQuit){e.preventDefault();win?.webContents.send('command','quit');}});
  await win.loadFile(path.join(__dirname,'index.html'));
  app.on('activate',reveal);
});
