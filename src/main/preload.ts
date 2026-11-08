// The Slides bridge (window.slides), next to Common's EdukorsDesktop. Added to every page of the main session, it is
// exposed only on the app's own page; the main process checks the sender again on every call.
import {contextBridge,ipcRenderer} from 'electron';
const methods=['preferences','setPollServer','pollPing','downloadImage','nativeEdit','clipboardWrite','clipboardRead','clipboardText','clipboardImage','present','presentClose','export','openOutput','revealOutput','registerAssets','draftPack','templates','templateDeck','templatePreview','renameTemplate','deleteTemplate','saveTemplate','website'];
if(location.protocol==='file:'&&/\/dist\/index\.html$/.test(location.pathname)&&window===window.top)contextBridge.exposeInMainWorld('slides',{
  invoke:(method:string,...args:unknown[])=>methods.includes(method)?ipcRenderer.invoke('slides:'+method,...args):Promise.reject(Error('Unknown method'))
});
