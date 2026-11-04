// The Slides bridge of the desktop app (window.slides, src/main/preload.ts). In a browser (the headless tests and the
// preview page) a small stand-in keeps the clipboard in memory and has no templates or files.
type Bridge={invoke:(method:string,...args:any[])=>Promise<any>};
let memory:unknown=null;
const preview:Bridge={invoke:async(method,...args)=>{
  switch(method){
    case'preferences':return{pollServer:'',language:''};
    case'templates':return[];
    case'clipboardWrite':memory=structuredClone(args[0]);return;
    case'clipboardRead':return memory?structuredClone(memory):null;
    case'clipboardText':return'';
    case'clipboardImage':return null;
    case'nativeEdit':document.execCommand(String(args[0]));return;
    default:throw Error('Not available in this preview.');
  }
}};
export const api:Bridge={invoke:(method,...args)=>((globalThis as any).slides as Bridge|undefined||preview).invoke(method,...args)};
export const desktop=()=>!!(globalThis as any).slides;
