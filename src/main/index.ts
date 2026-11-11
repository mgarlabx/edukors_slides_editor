// Main process: the shared Electron host of Edukors Common (window, files, Recent, AI, menu, terms, updates) plus what
// only Slides needs: the isolated slide frames (esf-frame:), the player, exports (HTML with fonts, PDF, PPTX images),
// templates, the system clipboard and the interactive question server. The page reaches these through window.slides
// (preload.cjs, added to the main window's session next to Common's own preload); every call is checked to come from it.
import {app,BrowserWindow,ipcMain,dialog,shell,clipboard,protocol,nativeImage,session} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startDesktopApp} from 'edukors-common-ux/desktop/host.mjs';
import {Deck,uid,validateDeck,slug} from '../shared/model';
import {atomic,exists,inside,readDeck,writeDeck} from './projects';
import {assertExportTarget} from './file-policy';
import {encodeEslx} from '../shared/eslx';
import {frameShell,frameShellCsp} from '../shared/render';
import {playerDocument} from '../shared/player';
import {normalizePollServer,pollEndpoint} from '../shared/poll';
import {minifyJs} from './minify';
import {captureSlide,captureSlides,createPdf,createEditablePptxFile} from './exports';
import {embedFonts,localFonts} from './fonts';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),page='dist/index.html';
const pageUrl=pathToFileURL(path.join(root,page)).href;
app.setName('Edukors Slides Editor');
// corsEnabled: fonts are always fetched in CORS mode (images are not); without it @font-face of the frames failed.
protocol.registerSchemesAsPrivileged([{scheme:'esf-frame',privileges:{standard:true,secure:true,corsEnabled:true}}]);
// ESF_DATA_DIR isolates a run (tests, a local test build). Packaged, the data folder of the earlier "Edukors Slides"
// keeps its templates and preferences; unpackaged runs use .local-data.
const localData=process.env.ESF_DATA_DIR||(!app.isPackaged?path.join(root,'.local-data'):undefined);
if(localData){app.setPath('userData',localData);app.setPath('sessionData',path.join(localData,'chromium'));}
else{const legacy=path.join(app.getPath('appData'),'Edukors Slides');if(existsSync(legacy))app.setPath('userData',legacy);}
// ESF_HIDDEN=1 (automated tests): Common's hidden mode (no window shown or focused, no Dock icon, full speed).
const hidden=process.env.ESF_HIDDEN==='1';
if(hidden)process.env.EDUKORS_HIDDEN='1';
const dataDir=app.getPath('userData'),tempDir=path.join(dataDir,'temp'),prefsPath=path.join(dataDir,'preferences.json'),templatesDir=path.join(dataDir,'templates');

// Only what Common does not keep: the question server and (once, to seed the
// shared interface language) the language of the earlier interface.
type Prefs={pollServer?:string;language?:string};
let prefs:Prefs={};
const prefsReady=loadPrefs();
async function loadPrefs(){try{const saved=JSON.parse(await fs.readFile(prefsPath,'utf8'));prefs={pollServer:normalizePollServer(saved.pollServer)||undefined,language:['pt','en','es'].includes(saved.language)?saved.language:undefined};}catch{prefs={};}}
const persist=async()=>{const old=await fs.readFile(prefsPath,'utf8').then(JSON.parse).catch(()=>({}));await atomic(prefsPath,JSON.stringify({...old,...prefs},null,2));};

const trusted=(event:Electron.IpcMainInvokeEvent)=>event.senderFrame===event.sender.mainFrame&&event.senderFrame?.url.split('#')[0]===pageUrl;
function handle(name:string,fn:(event:Electron.IpcMainInvokeEvent,...args:any[])=>any){
  ipcMain.handle('slides:'+name,async(event,...args)=>{if(!trusted(event))throw Error('Untrusted IPC sender.');await prefsReady;return fn(event,...args);});
}
const windowOf=(event:Electron.IpcMainInvokeEvent)=>BrowserWindow.fromWebContents(event.sender)||undefined;

handle('preferences',()=>({pollServer:prefs.pollServer||'',language:prefs.language||''}));
handle('setPollServer',async(_e,value:unknown)=>{const server=value===''?undefined:normalizePollServer(value);if(value!==''&&!server)throw Error('Invalid server address.');prefs.pollServer=server||undefined;await persist();return prefs.pollServer||'';});
// Settings → Interactive questions → Test: the service answers ping without a key.
handle('pollPing',async(_e,server:unknown)=>{
  const base=normalizePollServer(server);if(!base)return{ok:false,error:'invalid'};
  try{const r=await fetch(pollEndpoint(base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proc:'ping'}),signal:AbortSignal.timeout(10000)});const v=await r.json().catch(()=>null);
    return v?.data?.service==='edukors-poll'?{ok:true}:{ok:false,error:'service'};}catch{return{ok:false,error:'network'};}
});

// Resources (images, fonts) enter a presentation under the hash of their bytes.
const assetMimes:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf'};
const asset=(bytes:Buffer,name:string,mime:string)=>({id:'asset-'+createHash('sha256').update(bytes).digest('hex'),name,mime,data:bytes.toString('base64')});
// The assistant's image tool: only https, only images, at most 50 MB; the image enters the presentation as a resource.
handle('downloadImage',async(_e,url:unknown)=>{
  let u:URL;try{u=new URL(String(url));}catch{throw Error('Invalid address.');}
  if(u.protocol!=='https:')throw Error('Only https addresses are accepted.');
  const r=await fetch(u,{signal:AbortSignal.timeout(30000),redirect:'follow'});if(!r.ok)throw Error('Download failed: HTTP '+r.status);
  const mime=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(!/^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/.test(mime))throw Error('The address is not a supported image.');
  if(Number(r.headers.get('content-length')||0)>50_000_000)throw Error('Resource exceeds 50 MB.');
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>50_000_000)throw Error('Resource exceeds 50 MB.');
  return asset(bytes,path.basename(u.pathname)||'image',mime);
});

// The assistant's page capture: its own commands run in a sandbox without network, so a web page is captured here, in a
// hidden window of its own (in-memory session, no preload, no pop-ups, downloads or permissions). Optional: a preferred
// language (Accept-Language), a script run in the page first (to open a menu, pick a language…), the whole page height.
let pageShots=Promise.resolve();
handle('capturePage',async(_e,raw:any)=>{
  let u:URL;try{u=new URL(String(raw?.url||''));}catch{throw Error('Invalid address.');}
  if(!/^https?:$/.test(u.protocol))throw Error('Only http and https addresses are accepted.');
  const width=Math.round(Math.min(2400,Math.max(320,Number(raw?.width)||1280))),full=raw?.fullPage!==false,wait=Math.min(15000,Math.max(0,Number(raw?.wait)||1500));
  const language=typeof raw?.language==='string'&&/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(raw.language)?raw.language:'';
  const script=typeof raw?.script==='string'?raw.script.slice(0,20000):'';
  const run=pageShots.then(async()=>{
    const ses=session.fromPartition('esf-capture');
    ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.removeAllListeners('will-download');ses.on('will-download',(_ev,item)=>item.cancel());
    ses.webRequest.onBeforeSendHeaders((d,cb)=>{if(language)d.requestHeaders['Accept-Language']=`${language},${language.split('-')[0]};q=0.9,en;q=0.5`;cb({requestHeaders:d.requestHeaders});});
    const win=new BrowserWindow({show:false,width,height:900,useContentSize:true,enableLargerThanScreen:true,paintWhenInitiallyHidden:true,webPreferences:{partition:'esf-capture',sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
    const settle=async()=>{for(let i=0;i<40&&win.webContents.isLoading();i++)await pause(250);};
    try{
      win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      await Promise.race([win.loadURL(u.href),pause(30000).then(()=>{throw Error('The page took too long to load.');})]);
      await pause(wait);
      if(script){
        try{await Promise.race([win.webContents.executeJavaScript(`(async()=>{${script}\n})()`,true),pause(15000)]);}catch(e:any){throw Error('The script failed in the page: '+String(e?.message||e).slice(0,300));}
        await pause(800);await settle();await pause(wait);
      }
      const js=(code:string)=>win.webContents.executeJavaScript(code,true);
      let height=900;
      if(full){
        // Scrolled through once, so images that load on scroll are there; then the window is as tall as the page.
        height=Math.min(15000,Math.max(300,Number(await js('Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)'))||900));
        await js(`(async()=>{for(let y=0;y<${height};y+=700){scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}scrollTo(0,0);})()`);
        height=Math.min(15000,Math.max(300,Number(await js('Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)'))||900));
        win.setContentSize(width,height);await pause(900);
      }
      let image=await win.webContents.capturePage();
      if(image.isEmpty())throw Error('The page could not be captured.');
      const png=image.toPNG(),size=image.getSize(),title=await js('document.title').catch(()=>'');
      // What the model sees: at most 1568 px wide and 7000 px tall.
      const k=Math.min(1,1568/size.width,7000/size.height);if(k<1)image=image.resize({width:Math.round(size.width*k),height:Math.round(size.height*k),quality:'best'});
      const shown=image.getSize(),name=(u.hostname+(u.pathname.length>1?u.pathname.replace(/\/+/g,'-'):'')).replace(/[^\w.-]+/g,'-').slice(0,80)+'.png';
      return{asset:asset(png,name,'image/png'),width:size.width,height:size.height,title:String(title).slice(0,300),url:win.webContents.getURL(),preview:{mimeType:'image/png',data:image.toPNG().toString('base64'),width:shown.width,height:shown.height}};
    }finally{win.destroy();}
  });
  pageShots=run.then(()=>{},()=>{});return run;
});

// Clipboard: slides and canvas objects travel as JSON text, so they also move between windows and presentations.
handle('nativeEdit',(event,action:string)=>{const w=event.sender;if(action==='delete')w.delete();else if(action==='copy')w.copy();else if(action==='cut')w.cut();else if(action==='paste')w.paste();else if(action==='undo')w.undo();else if(action==='redo')w.redo();else if(action==='selectAll')w.selectAll();else throw Error('Unknown edit.');});
handle('clipboardWrite',async(_e,payload:any)=>{if(!payload||JSON.stringify(payload).length>50_000_000)throw Error('Clipboard limit.');await clipboard.writeText(JSON.stringify(payload));});
handle('clipboardRead',async()=>{try{const data=JSON.parse(await clipboard.readText());return data?.format==='esf-slides'||data?.format==='esf-objects'?data:null;}catch{return null;}});
handle('clipboardText',async()=>clipboard.readText());
// An image on the clipboard: a copied image file first (Finder, Explorer: the file itself, not its icon), else the image data.
const imageTypes:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',svg:'image/svg+xml'};
handle('clipboardImage',async()=>{
  const items=await clipboard.read(),fileType=process.platform==='darwin'?'electron application/osclipboard;format="public.file-url"':'text/uri-list';
  let file='';
  for(const item of items){const blob=await item.getType(fileType).catch(()=>null) as Blob|null;if(!blob)continue;
    const url=(await blob.text()).split(/\r?\n/).map(l=>l.replace(/\0/g,'').trim()).find(l=>l.startsWith('file:'));if(url){try{file=fileURLToPath(url);}catch{}break;}}
  const ext=path.extname(file).slice(1).toLowerCase();
  if(file&&/^(png|jpe?g|gif|webp|avif|svg|tiff?|bmp|heic)$/.test(ext)){
    const stat=await fs.stat(file).catch(()=>null);
    if(stat?.isFile()){if(stat.size>50_000_000)throw Error('Resource exceeds 50 MB.');
      if(imageTypes[ext])return asset(await fs.readFile(file),path.basename(file),imageTypes[ext]);
      const png=nativeImage.createFromPath(file).toPNG();if(png.length&&png.length<=50_000_000)return asset(png,path.basename(file,path.extname(file))+'.png','image/png');}
  }
  const item=items.find(x=>x.types.some(t=>t.startsWith('image/')));if(!item)return null;
  const type=['image/png','image/jpeg','image/webp','image/tiff'].find(t=>item.types.includes(t))||item.types.find(t=>t.startsWith('image/'))!;
  const bytes=Buffer.from(await (await item.getType(type) as Blob).arrayBuffer());if(bytes.length>50_000_000)throw Error('Resource exceeds 50 MB.');
  const png=type==='image/png'?bytes:nativeImage.createFromBuffer(bytes).toPNG();if(!png.length||png.length>50_000_000)throw Error('Resource exceeds 50 MB.');
  return asset(png,'clipboard.png','image/png');
});


// Present: the player in its own window, from the selected slide, in the interface language. Its tools (pen, lens,
// presenter view…) stay in the exported HTML. One player window at a time: presenting again replaces it; it closes with
// its presentation's tab, with the window that opened it and when the app quits.
let player:{win:BrowserWindow;owner:number;doc:unknown}|null=null;
const closePlayer=()=>{const p=player;player=null;if(p&&!p.win.isDestroyed())p.win.close();};
handle('presentClose',(event,doc:unknown)=>{if(player&&player.owner===event.sender.id&&(doc===undefined||player.doc===doc))closePlayer();return true;});
app.on('will-quit',closePlayer);
handle('present',async(event,deck:Deck,start:unknown,lang:unknown,doc:unknown)=>{
  validateDeck(deck);
  const file=path.join(tempDir,uid('present')+'.html');
  await atomic(file,playerDocument(deck,{tools:false,start:Number.isInteger(start)?start as number:0,lang:['pt','en','es'].includes(lang as string)?lang as any:'en',pollServer:prefs.pollServer}));
  closePlayer();
  const p=new BrowserWindow({width:1440,height:900,title:deck.title,backgroundColor:'#141b29',show:!hidden,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const owner=event.sender,gone=()=>{if(player?.win===p)closePlayer();};player={win:p,owner:owner.id,doc};owner.once('destroyed',gone);
  p.webContents.on('did-create-window',w=>p.once('closed',()=>{if(!w.isDestroyed())w.close();}));
  p.webContents.setWindowOpenHandler(({url})=>{
    if(url==='about:blank')return{action:'allow',overrideBrowserWindowOptions:{show:!hidden,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}};
    if(/^https?:|^mailto:/i.test(url))void shell.openExternal(url);return{action:'deny'};
  });
  // Without an Edit menu of its own, the editing shortcuts are applied here (e.g. pasting the presenter key).
  p.webContents.on('before-input-event',(e,i)=>{const act=i.type==='keyDown'&&(i.meta||i.control)&&!i.alt&&!i.shift?({x:'cut',c:'copy',v:'paste',a:'selectAll'} as any)[i.key.toLowerCase()]:undefined;if(act){e.preventDefault();(p.webContents as any)[act]();}});
  p.on('closed',()=>{if(player?.win===p)player=null;if(!owner.isDestroyed())owner.removeListener('destroyed',gone);void fs.rm(file,{force:true});});
  void p.loadFile(file).catch(()=>{});return true;
});

// Exports: named after the document and placed next to it by default. Never over the .eslx or an imported source.
let exportBusy=false;const outputs=new Set<string>();
handle('export',async(event,deck:Deck,format:string,where:{folder?:string;name?:string;protect?:string[]})=>{
  if(!['html','pdf','pptx'].includes(format))throw Error('Unsupported export.');
  if(exportBusy)throw Error('An export is already running.');
  validateDeck(deck);
  if(format==='html'&&deck.slides.some(s=>s.poll)&&!prefs.pollServer)return{noPollServer:true};
  const name=(typeof where?.name==='string'&&where.name.trim()?where.name.trim():slug(deck.title)).replace(/[\\/:*?"<>|]/g,'-');
  const folder=typeof where?.folder==='string'&&await exists(where.folder)?where.folder:app.getPath('documents');
  // direct: Common's export screen chose the place (next to the document, with its name); otherwise the system dialog.
  let file:string;
  if((where as any)?.direct===true){if(!path.isAbsolute(folder)||!/^[^\\/:*?"<>|\u0000-\u001f]{1,120}$/.test(name))throw Error('Invalid export name.');file=path.join(folder,name+'.'+format);
    // An existing file is replaced only after the export screen asked (replace).
    if((where as any)?.replace!==true&&await exists(file))return{exists:true};}
  else{
    const r=await dialog.showSaveDialog(windowOf(event)!,{defaultPath:path.join(folder,name+'.'+format),filters:[{name:format.toUpperCase(),extensions:[format]}],properties:['createDirectory']});
    if(r.canceled||!r.filePath)return null;
    file=r.filePath.toLowerCase().endsWith('.'+format)?r.filePath:r.filePath+'.'+format;
  }
  await assertExportTarget(file,(Array.isArray(where?.protect)?where.protect:[]).filter((p):p is string=>typeof p==='string'&&!!p));
  exportBusy=true;
  try{
    let bytes:Buffer|string,fonts={embedded:[] as string[],missing:[] as string[]};
    if(format==='html'){const e=await embedFonts(deck);fonts=e;bytes=playerDocument(e.deck,{title:path.basename(file),minify:minifyJs,pollServer:prefs.pollServer});}
    else if(format==='pdf')bytes=await createPdf(await captureSlides(deck,tempDir),tempDir);
    else bytes=await createEditablePptxFile(deck,tempDir);
    await atomic(file,bytes);outputs.add(file);
    return{path:file,fonts};
  }finally{exportBusy=false;}
});
// The assistant's view_slide: the slide as exported (static state, base and layout), at most 1568 px wide for the model.
let slideShots=Promise.resolve();
handle('slideImage',async(_e,deck:Deck,id:unknown)=>{
  validateDeck(deck);
  const run=slideShots.then(async()=>{
    let image=nativeImage.createFromBuffer(await captureSlide(deck,String(id),tempDir));
    if(image.getSize().width>1568)image=image.resize({width:1568,quality:'best'});
    const{width,height}=image.getSize();return{mimeType:'image/png',data:image.toPNG().toString('base64'),width,height};
  });
  slideShots=run.then(()=>{},()=>{});return run;
});
handle('openOutput',async(_e,file:string)=>{if(!outputs.has(file))throw Error('Unknown export.');const error=await shell.openPath(file);if(error)throw Error(error);});
handle('revealOutput',async(_e,file:string)=>{if(!outputs.has(file))throw Error('Unknown export.');shell.showItemInFolder(file);});

// Imported PowerPoint files name fonts (Aptos, the Office default, among them) that may exist only on this computer,
// some only inside Office itself: the page receives their faces to keep in the presentation (CSS text in, files out).
handle('localFonts',async(_e,css:string,known:string[])=>{if(typeof css!=='string'||css.length>50_000_000)throw Error('Invalid text.');return localFonts(css,new Set(Array.isArray(known)?known.filter(x=>typeof x==='string'):[]));});

// Drafts of unsaved presentations are Common's; Slides only packs them here, so typing and dragging never wait for the
// compression of large images in the page.
// Resources the page already registered for the frames arrive without data and are taken from that registry.
handle('draftPack',async(_e,content:{deck:Deck;history?:Uint8Array;conversations?:unknown[]})=>{
  const deck=content?.deck;validateDeck(deck);
  const bytesOf=(asset:Deck['assets'][number])=>{if(asset.data)return;const found=served.get(deck.id+'/'+asset.id);if(!found||found.mime!==asset.mime)throw Error('Missing resource: '+asset.id);return new Uint8Array(found.bytes.buffer,found.bytes.byteOffset,found.bytes.byteLength);};
  return encodeEslx(deck,content.history instanceof Uint8Array?content.history:undefined,Array.isArray(content.conversations)?content.conversations:[],bytesOf);
});

// Templates: Blank is built in; the others are presentations saved as templates (template.eslx + template.json), kept
// in the data folder. Templates of earlier versions (template.ESF) are still read.
const templateFile=async(id:string)=>{const native=await inside(templatesDir,id+'/template.eslx',true);return await exists(native)?inside(templatesDir,id+'/template.eslx'):inside(templatesDir,id+'/template.ESF');};
const templateMeta=async(id:string)=>{if(typeof id!=='string'||!/^[\w.-]+$/.test(id))throw Error('Invalid template.');return inside(templatesDir,id+'/template.json');};
async function customTemplates(){
  await fs.mkdir(templatesDir,{recursive:true});const list=[];
  for(const ent of await fs.readdir(templatesDir,{withFileTypes:true})){
    if(!ent.isDirectory()||ent.isSymbolicLink())continue;
    try{const meta=JSON.parse(await fs.readFile(await inside(templatesDir,ent.name+'/template.json'),'utf8'));await templateFile(ent.name);list.push({id:ent.name,title:String(meta.title)});}catch{}
  }return list;
}
handle('templates',customTemplates);
handle('templateDeck',async(_e,id:string)=>{await templateMeta(id);return{...await readDeck(await templateFile(id)),id:uid('deck'),revision:0};});
// The gallery card shows the template's first slide: the deck with that slide only and the assets it can reference.
handle('templatePreview',async(_e,id:string)=>{
  await templateMeta(id);const deck=await readDeck(await templateFile(id)),slides=deck.slides.slice(0,1);
  const text=JSON.stringify([slides,deck.masters,deck.layouts]);return{...deck,slides,assets:deck.assets.filter(a=>text.includes(a.id))};
});
handle('renameTemplate',async(_e,id:string,title:string)=>{
  if(typeof title!=='string'||!title.trim()||title.length>200)throw Error('Title required.');
  const file=await templateMeta(id),meta=JSON.parse(await fs.readFile(file,'utf8'));await atomic(file,JSON.stringify({...meta,title:title.trim()}));return customTemplates();
});
handle('deleteTemplate',async(_e,id:string)=>{await templateMeta(id);await fs.rm(await inside(templatesDir,id),{recursive:true,force:true});return customTemplates();});
handle('saveTemplate',async(_e,deck:Deck)=>{
  validateDeck(deck);const base=slug(deck.title);let id=base;for(let n=2;await exists(path.join(templatesDir,id));n++)id=base+'-'+n;
  // The presentation's instructions describe one talk, not the design: they stay out of templates.
  const {systemPrompt,...design}=structuredClone(deck);
  await writeDeck(path.join(templatesDir,id,'template.eslx'),{...design,id:uid('deck'),revision:0});
  await atomic(path.join(templatesDir,id,'template.json'),JSON.stringify({title:deck.title}));
  return customTemplates();
});
// Links of the help texts and the player: only https, only these hosts (ESF_EXTERNAL_LOG: tests record them instead).
const helpHosts=['edukors.org','github.com','apps.microsoft.com','claude.com','developers.openai.com'];
handle('website',(_e,page?:unknown)=>{let url='https://edukors.org';try{const u=new URL(String(page));if(page&&u.protocol==='https:'&&helpHosts.includes(u.hostname))url=u.href;}catch{}return process.env.ESF_EXTERNAL_LOG?fs.appendFile(process.env.ESF_EXTERNAL_LOG,url+'\n'):shell.openExternal(url);});

// Resources of the slide frames (canvas and thumbnails): the page registers each presentation's images and fonts once;
// the frames load them from esf-frame://preview/asset/<deck>/<asset>, cached, instead of base64 in every document.
const served=new Map<string,{mime:string;bytes:Buffer}>(),waiting=new Map<string,((ok:boolean)=>void)[]>();
async function servedAsset(key:string){
  if(!served.has(key))await new Promise<boolean>(resolve=>{const list=waiting.get(key)||[];list.push(resolve);waiting.set(key,list);setTimeout(()=>resolve(false),10000);});
  return served.get(key);
}
handle('registerAssets',(_e,deckId:unknown,list:unknown)=>{
  if(typeof deckId!=='string'||!/^[\w-]{1,120}$/.test(deckId)||!Array.isArray(list))throw Error('Invalid resources.');
  for(const a of list.slice(0,5000)){
    if(!a||typeof a.id!=='string'||!/^[\w-]{1,200}$/.test(a.id)||typeof a.mime!=='string'||!/^(image|font)\/[\w.+-]+$/.test(a.mime)||typeof a.data!=='string')continue;
    const key=deckId+'/'+a.id;if(!served.has(key))served.set(key,{mime:a.mime,bytes:Buffer.from(a.data,'base64')});
    for(const resolve of waiting.get(key)||[])resolve(true);waiting.delete(key);
  }
});

// Before Common's own ready handler (registered below) creates the window: the slide frames' scheme and the bridge.
app.whenReady().then(async()=>{
  await fs.mkdir(tempDir,{recursive:true});
  protocol.handle('esf-frame',async request=>{
    const m=/^\/asset\/([\w-]{1,120})\/([\w-]{1,200})$/.exec(new URL(request.url).pathname);
    if(m){const asset=await servedAsset(m[1]+'/'+m[2]);return asset?new Response(new Uint8Array(asset.bytes),{headers:{'content-type':asset.mime,'cache-control':'max-age=31536000, immutable','access-control-allow-origin':'*'}}):new Response('',{status:404});}
    return new Response(frameShell,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':frameShellCsp,'cache-control':'no-store'}});
  });
  session.defaultSession.registerPreloadScript({type:'frame',id:'edukors-slides',filePath:path.join(here,'preload.cjs')});
});
startDesktopApp({
  appId:'slides',name:'Edukors Slides Editor',root,page,
  documentExtensions:['.eslx'],
  // ESF (earlier versions) and PowerPoint open as presentations without a file: Save always asks for an .eslx.
  openExtensions:['.esf','.pptx'],
  // Large PowerPoint decks (and earlier .esf packages) open too, up to the package limits.
  maxOpenBytes:2**30,
  exportFormats:[],
});
