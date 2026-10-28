import path from 'node:path';
import type {ToolDefinition} from '@edukors/ai-cli';
import {BrowserWindow,session} from 'electron';
import {atomic,inside} from './projects';
import {ownedPaths} from './ai';

// Web tools the agent reaches through the AI library, for either provider. Each is bound to one presentation's
// working folder; files land only there, never in the paths the app owns.
const target={type:'string',description:'Path relative to the presentation folder, e.g. media/capture.png. Not inside '+ownedPaths.join(', ')+'.'};
const tools=[
  {name:'screenshot',description:'Opens a web page in a hidden browser window and saves a PNG capture in the presentation folder.',inputSchema:{type:'object',properties:{url:{type:'string'},path:target,width:{type:'integer',minimum:320,maximum:3840,default:1600},height:{type:'integer',minimum:240,maximum:2160,default:900},fullPage:{type:'boolean',default:false},delay:{type:'integer',minimum:0,maximum:15000,default:1500,description:'Milliseconds to wait after loading.'}},required:['url','path']}},
  {name:'download',description:'Downloads a file from the web (http/https, up to 50 MB) into the presentation folder.',inputSchema:{type:'object',properties:{url:{type:'string'},path:target},required:['url','path']}},
];
const webUrl=(u:unknown)=>{const url=new URL(String(u));if(!/^https?:$/.test(url.protocol))throw Error('Only http and https URLs.');return url.href;};
async function destination(root:string,rel:unknown,ext?:string){
  let p=String(rel||'').replace(/^\.\//,'');if(ext&&!p.toLowerCase().endsWith(ext))p+=ext;
  const first=p.split('/')[0];if(ownedPaths.includes(first))throw Error('That path belongs to the app; save in a folder of your own, such as media/.');
  return inside(root,p,true);
}
let captureSession=false;
async function screenshot(root:string,a:any){
  if(!captureSession){captureSession=true;session.fromPartition('esf-capture').on('will-download',e=>e.preventDefault());}
  const url=webUrl(a.url),file=await destination(root,a.path,'.png'),width=Math.min(3840,Math.max(320,Number(a.width)||1600)),height=Math.min(2160,Math.max(240,Number(a.height)||900));
  const win=new BrowserWindow({show:false,width,height,useContentSize:true,webPreferences:{partition:'esf-capture',nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  try{
    await Promise.race([win.loadURL(url),new Promise((_,r)=>setTimeout(()=>r(Error('Page did not load within 30 s.')),30000))]);
    await new Promise(r=>setTimeout(r,Math.min(15000,Math.max(0,a.delay??1500))));
    if(a.fullPage){const h=Number(await win.webContents.executeJavaScript('document.documentElement.scrollHeight').catch(()=>height));win.setContentSize(width,Math.min(16000,Math.max(height,h||height)));await new Promise(r=>setTimeout(r,500));}
    const png=(await win.webContents.capturePage()).toPNG();await atomic(file,png);
    return`Saved ${path.relative(root,file)} (${win.getContentSize().join('x')}, ${Math.round(png.length/1024)} KB) from ${win.webContents.getURL()}.`;
  }finally{win.destroy();}
}
async function download(root:string,a:any){
  const url=webUrl(a.url),file=await destination(root,a.path);
  const r=await fetch(url,{signal:AbortSignal.timeout(60000),redirect:'follow'});if(!r.ok)throw Error('HTTP '+r.status);
  if(Number(r.headers.get('content-length'))>50_000_000)throw Error('Resource exceeds 50 MB.');
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>50_000_000)throw Error('Resource exceeds 50 MB.');
  await atomic(file,bytes);return`Saved ${path.relative(root,file)} (${r.headers.get('content-type')||'unknown type'}, ${Math.round(bytes.length/1024)} KB).`;
}
export function webTools(root:string):ToolDefinition[]{
  const run:Record<string,(root:string,a:any)=>Promise<string>>={screenshot,download};
  return tools.map(t=>({...t,run:async(a:Record<string,unknown>)=>{try{return{content:await run[t.name](root,a)};}catch(e:any){return{content:String(e?.message||e),isError:true};}}}));
}
