// Serves the built page (dist/index.html, with Common from node_modules) to headless Chrome, and the slide frames'
// shell from a second origin, as the esf-frame: scheme does in the app. Nothing opens a window.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
export async function startServers(){
  await fs.mkdir('test-results',{recursive:true});
  const out=path.resolve('test-results/frame-shell.mjs');
  await build({entryPoints:['src/shared/render.ts'],bundle:true,platform:'node',format:'esm',outfile:out,loader:{'.md':'text'}});
  const {frameShell,frameShellCsp}=await import(pathToFileURL(out).href+'?'+Date.now());
  const root=path.resolve('.');let frameOrigin='';
  const app=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://x'),file=path.join(root,decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!/^\/(dist|test-results|node_modules\/edukors-common-ux)\//.test(url.pathname)){res.writeHead(404);res.end();return;}
    try{let data=await fs.readFile(file);if(url.pathname==='/dist/index.html')data=String(data).replace('frame-src esf-frame:','frame-src esf-frame: '+frameOrigin);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
  });
  const frames=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':frameShellCsp,'cache-control':'no-store'});res.end(frameShell);});
  // The page's CSP allows only esf-frame: frames; the test page also allows the frames' origin.
  const framePort=await listen(frames);frameOrigin=`http://127.0.0.1:${framePort}`;const appPort=await listen(app);
  return {page:`http://127.0.0.1:${appPort}/dist/index.html`,frame:`http://127.0.0.1:${framePort}/`,close:()=>{app.close();frames.close();}};
}
// Before the page's scripts: the frame address, the terms already accepted, and the interface language.
export const prepare=(frame,lang='en')=>{
  globalThis.__esfFrameUrl=frame;
  try{if(!localStorage.getItem('edukors.common.preferences'))localStorage.setItem('edukors.common.preferences',JSON.stringify({language:lang,appearance:'light',fontSize:100}));}catch{}
};
