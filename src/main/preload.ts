import {contextBridge,ipcRenderer} from 'electron';
const methods=['bootstrap','preferences','menuState','open','create','save','saveAs','close','draft','discard','reload','importAsset','nativeEdit','clipboardWrite','clipboardRead','clipboardText','clipboardImage','present','export','reveal','openOutput','limits','probe','pickExecutable','createProfile','accountLogin','accountConnect','aiSend','aiAttach','aiCancel','conversationLoad','conversationSave','templates','templatePreview','renameTemplate','deleteTemplate','saveTemplate','website','pollPing','quit'];
contextBridge.exposeInMainWorld('api',{
  invoke:(method:string,...args:unknown[])=>{if(!methods.includes(method))return Promise.reject(Error('Unknown method'));return ipcRenderer.invoke(method,...args);},
  subscribe:(channel:string,callback:(data:any)=>void)=>{
    if(!['ai-event','command','open-project'].includes(channel))throw Error('Unknown event');
    const handler=(_:unknown,data:any)=>callback(data);ipcRenderer.on(channel,handler);
    return()=>ipcRenderer.removeListener(channel,handler);
  }
});
