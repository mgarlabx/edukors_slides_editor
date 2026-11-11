import {createRasterPptx} from '../shared/pptx-raster';
import {createEditablePptx,EditableSlide} from '../shared/pptx-writer';
import {extractSlideObjects,hideExtractedObjects,PptxSlideObjects} from '../shared/pptx-extract';
import {BrowserWindow} from 'electron';
import {Deck,Slide} from '../shared/model';
import {slideDocument} from '../shared/render';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Loads each slide's static state in an isolated hidden window; capture=false only checks
// readiness and script errors (used to validate AI changes before applying them).
async function renderSlides(deck:Deck,slides:Slide[],tempRoot:string,capture:boolean,editable=false){
  const win=new BrowserWindow({show:false,width:1600,height:900,useContentSize:true,enableLargerThanScreen:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  win.setContentSize(1600,900); // Windows and Linux clamp a new window to the screen; the capture must still be 1600 × 900.
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  const folder=path.join(tempRoot,'capture-'+randomUUID());await fs.mkdir(folder,{recursive:true});
  const images:Buffer[]=[],errors:{id:string;title:string;message:string}[]=[],objects:PptxSlideObjects[]=[];
  try{
    for(const slide of slides){
      const file=path.join(folder,'slide.html');await fs.writeFile(file,slideDocument(deck,slide,true));
      // A script stuck in a loop never lets the load finish; the timeout below still fires.
      void win.loadFile(file).catch(()=>{});
      const start=Date.now();let ready=false,error='';
      while(Date.now()-start<8000){
        const state=await Promise.race([win.webContents.executeJavaScript('[Boolean(window.__slideReady),window.__slideError||""]').catch(()=>[false,'']),new Promise(r=>setTimeout(()=>r([false,'']),1000))]) as [boolean,string];
        [ready,error]=state;if(ready||error)break;
        await new Promise(r=>setTimeout(r,40));
      }
      if(!ready||error){
        errors.push({id:slide.id,title:slide.title,message:error||'Slide did not become ready within 8 s (script loop or missing resource?).'});
        if(capture)throw Error(slide.title+': '+errors.at(-1)!.message);
        if(!ready){win.webContents.forcefullyCrashRenderer();await new Promise(r=>setTimeout(r,200));}
        continue;
      }
      // Editable PowerPoint: the native objects first, then the picture of what remains (the background).
      if(capture&&editable){objects.push(await win.webContents.executeJavaScript(`(${extractSlideObjects.toString()})()`));await win.webContents.executeJavaScript(`(${hideExtractedObjects.toString()})();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);}
      if(capture)images.push((await win.webContents.capturePage()).toPNG());
    }
    return {images,errors,objects};
  }finally{win.destroy();await fs.rm(folder,{recursive:true,force:true});}
}
export async function captureSlides(deck:Deck,tempRoot:string){return (await renderSlides(deck,deck.slides,tempRoot,true)).images;}
export async function captureSlide(deck:Deck,id:string,tempRoot:string){const slide=deck.slides.find(s=>s.id===id);if(!slide)throw Error(`There is no slide ${id}.`);return (await renderSlides(deck,[slide],tempRoot,true)).images[0];}
export async function checkSlides(deck:Deck,ids:string[],tempRoot:string){return (await renderSlides(deck,deck.slides.filter(s=>ids.includes(s.id)),tempRoot,false)).errors;}
export async function createPdf(images:Buffer[],tempRoot:string){
  const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const file=path.join(tempRoot,randomUUID()+'.html');
  try{
    await fs.writeFile(file,`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:16in 9in;margin:0}*{box-sizing:border-box}body{margin:0}img{display:block;width:16in;height:9in;break-after:page}img:last-child{break-after:auto}</style></head><body>${images.map(b=>`<img src="data:image/png;base64,${b.toString('base64')}">`).join('')}</body></html>`);
    await win.loadFile(file);
    await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode()))');
    return await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,margins:{top:0,bottom:0,left:0,right:0}});
  }finally{win.destroy();await fs.rm(file,{force:true});}
}
export function createPptx(images:Buffer[],title:string){return Buffer.from(createRasterPptx(images,title));}
// PowerPoint with native, editable texts, pictures and shapes over a picture background of each slide.
export async function createEditablePptxFile(deck:Deck,tempRoot:string){
  const {images,objects}=await renderSlides(deck,deck.slides,tempRoot,true,true);
  const slides:EditableSlide[]=images.map((background,i)=>({background:new Uint8Array(background),objects:objects[i],notes:deck.slides[i].notes}));
  return Buffer.from(createEditablePptx(slides,deck.title));
}
