import {Profile,Preferences,aiModels,aiEfforts} from './model';
export const providers=[
  {id:'claude',name:'Claude Code',executable:'claude',configDir:'~/.claude',transport:'claude'},
  {id:'codex',name:'Codex',executable:'codex',configDir:'~/.codex',transport:'codex'},
  {id:'kimi',name:'Kimi',executable:'kimi',configDir:'~/.kimi',transport:'acp'},
  {id:'kiro',name:'Kiro',executable:'kiro-cli',configDir:'~/.kiro',transport:'acp'},
  {id:'opencode',name:'OpenCode',executable:'opencode',configDir:'',transport:'acp'},
  {id:'agy',name:'Antigravity',executable:'agy_acp_server.par',configDir:'',transport:'acp'},
] as const;
export type ProviderId=typeof providers[number]['id'];
export const providerOf=(p?:Profile)=>providers.find(x=>x.id===(p?.provider||'claude'))||providers[0];
export interface ProviderStatus {detail:string;version?:string;authenticated?:boolean;models?:{id:string;name:string}[]}
export const modelsFor=(p?:Profile)=>p?.provider&&p.provider!=='claude'?[{id:'',name:''}]:[...aiModels];
export const effortsFor=(p?:Profile):readonly string[]=>providerOf(p).transport==='acp'?[]:providerOf(p).id==='codex'?['','low','medium','high','xhigh']:aiEfforts;
// One-time migration: the previous global model belongs to the existing Claude accounts.
export function normalizeProfiles(p:Preferences,expand:(s:string)=>string=s=>s):Profile[]{
  if(!Array.isArray(p.profiles)||p.profiles.length>30)throw Error('Invalid CLI profiles.');
  const ids=new Set<string>();
  return p.profiles.map(x=>{
    if(!x||['id','name','executable','configDir'].some(k=>typeof (x as any)[k]!=='string'||(x as any)[k].length>4096)||!x.id||ids.has(x.id))throw Error('Invalid CLI profile.');
    ids.add(x.id);const provider=x.provider||'claude';if(!providers.some(v=>v.id===provider))throw Error('Unknown provider.');
    const model=x.model??(provider==='claude'?p.aiModel:'')??'',effort=x.effort??(provider==='claude'?p.aiEffort:'')??'';
    if(typeof model!=='string'||model.length>200||/[\r\n\0]/.test(model)||typeof effort!=='string'||effort&&!effortsFor({...x,provider}).includes(effort))throw Error('Invalid model options.');
    if(x.configDir&&!(x.configDir.startsWith('~/')||x.configDir.startsWith('/')||/^[A-Za-z]:[\\/]/.test(x.configDir)))throw Error('Use an absolute account directory.');
    return{id:x.id,name:x.name,provider,executable:expand(x.executable),configDir:expand(x.configDir),model,effort};
  });
}
