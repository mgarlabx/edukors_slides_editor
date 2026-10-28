import {contextBridge,ipcRenderer} from 'electron';
const methods=['bootstrap','preferences','menuState','open','create','save','saveAs','close','draft','discard','reload','importAsset','nativeEdit','clipboardWrite','clipboardRead','clipboardText','clipboardImage','present','export','reveal','openOutput','limits','aiProviders','aiAccounts','aiAccountCreate','aiAccountConnect','aiAccountCode','aiAccountCancel','aiAccountLogout','aiAccountRename','aiAccountRemove','aiModels','aiSkills','aiSkillsFolder','aiSend','aiAttach','aiCancel','aiAnswer','conversationLoad','conversationSave','templates','templatePreview','renameTemplate','deleteTemplate','saveTemplate','website','pollPing','installUpdate','quit'];
contextBridge.exposeInMainWorld('api',{
  invoke:(method:string,...args:unknown[])=>{if(!methods.includes(method))return Promise.reject(Error('Unknown method'));return ipcRenderer.invoke(method,...args);},
  subscribe:(channel:string,callback:(data:any)=>void)=>{
    if(!['ai-event','command','open-project','update'].includes(channel))throw Error('Unknown event');
    const handler=(_:unknown,data:any)=>callback(data);ipcRenderer.on(channel,handler);
    return()=>ipcRenderer.removeListener(channel,handler);
  }
});
