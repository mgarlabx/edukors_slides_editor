import React,{ReactNode,useEffect,useState} from 'react';
import {AssistantAccounts,AdvancedSettings,uiText} from '@edukors/ai-ui';
import '@edukors/ai-ui/style.css';
import {parseMcpConfig} from '@edukors/ai-cli/settings';
import type {AccountView,ProviderView} from '../main/assistant';
import {Preferences} from '../shared/model';
import {T} from './i18n';

// Settings → AI assistant, laid out as in every EDUKORS editor: the accounts first (made and signed in through the shared
// EDUKORS AI library), then, under Advanced, the instructions for the agent, the user's MCP servers and the skills.
export interface Login {url:string;acceptsCode:boolean}
type Skill={name:string;description?:string;folder:string};

export function AccountPicker({accounts,providers,value,disabled,label,t,onChange}:{accounts:AccountView[];providers:ProviderView[];value:string;disabled?:boolean;label:string;t:T;onChange:(id:string)=>void}){
  return <select aria-label={label} value={accounts.some(a=>a.id===value)?value:''} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">{t('selectAccount')}</option>
    {providers.map(p=>{const list=accounts.filter(a=>a.providerId===p.id);return list.length?<optgroup key={p.id} label={p.name}>{list.map(a=><option value={a.id} key={a.id}>{a.label}</option>)}</optgroup>:null;})}</select>;
}

export function AssistantSettings({prefs,t,accounts,providers,logins,instructions,onAccounts,onChange,onPrefs,onError,onGuard}:{onGuard:(guard:(()=>boolean)|null)=>void;prefs:Preferences;t:T;accounts:AccountView[];providers:ProviderView[];logins:Record<string,Login>;instructions:(draft:Partial<Preferences>,change:(patch:Partial<Preferences>)=>void)=>ReactNode;onAccounts:()=>Promise<void>;onChange:(p:Partial<Preferences>)=>void;onPrefs:(p:Preferences)=>void;onError:(message:string)=>void}){
  const [skills,setSkills]=useState<Skill[]|null>(null),[signing,setSigning]=useState<string|null>(null);
  const [draft,setDraft]=useState({aiMcp:prefs.aiMcp||'',systemPrompt:prefs.systemPrompt||''});
  const dirty=draft.aiMcp!==(prefs.aiMcp||'')||draft.systemPrompt!==(prefs.systemPrompt||'');
  const problems=parseMcpConfig(draft.aiMcp).problems;
  useEffect(()=>{onGuard(()=>{if(!dirty)return true;if(confirm(uiText(prefs.language,'dirty'))){if(problems.length){onError(t('mcpProblem'));return false;}onChange(draft);return true;}return confirm(uiText(prefs.language,'discard')+'?');});return()=>onGuard(null);},[dirty,draft,prefs.language,problems.length]);
  useEffect(()=>()=>{if(signing)void window.api.invoke('aiAccountCancel',signing);},[signing]);
  const connect=async(id:string)=>{setSigning(id);try{await window.api.invoke('aiAccountConnect',id);}finally{setSigning(null);await onAccounts();}};
  const loadSkills=()=>window.api.invoke('aiSkills').then(setSkills).catch((e:unknown)=>onError(String(e)));
  return <>
    <AssistantAccounts lang={prefs.language} accounts={accounts} providers={providers.map(p=>({id:p.id,name:p.name,status:p.detection.status,supported:p.workspace}))} value={prefs.aiAccount||''}
      onSelect={id=>onChange({aiAccount:id})} onCreate={async(provider,label)=>{const a=await window.api.invoke('aiAccountCreate',provider,label);await onAccounts();if(!prefs.aiAccount)onChange({aiAccount:a.id});return a.id;}}
      onConnect={connect} onLogout={async id=>{await window.api.invoke('aiAccountLogout',id);await onAccounts();}}
      onRename={async(id,label)=>{await window.api.invoke('aiAccountRename',id,label);await onAccounts();}}
      onRemove={async(id,message)=>{if(confirm(message)){onPrefs(await window.api.invoke('aiAccountRemove',id));await onAccounts();}}}
      onVerify={async()=>{await window.api.invoke('aiProviders',true);await onAccounts();}}
      onOpen={url=>window.api.invoke('website',url)} login={signing?{accountId:signing,...(logins[signing]||{acceptsCode:false})}:null}
      onCode={code=>window.api.invoke('aiAccountCode',signing,code)} onCancel={()=>window.api.invoke('aiAccountCancel',signing)}/>
    <AdvancedSettings lang={prefs.language} dirty={dirty} error={problems.length?t('mcpProblem'):undefined} onSave={()=>onChange(draft)} onDiscard={()=>setDraft({aiMcp:prefs.aiMcp||'',systemPrompt:prefs.systemPrompt||''})}>
      <section><h3>{t('instructionsTitle')}</h3>{instructions(draft,patch=>setDraft(d=>({...d,...patch})))}</section>
      <section><h3>{t('mcpServers')}</h3><p>{t('mcpHelp')}</p><textarea className="code" aria-label={t('mcpServers')} rows={8} spellCheck={false} placeholder={'{\n  "mcpServers": {\n    "name": {"command": "npx", "args": ["…"]}\n  }\n}'} value={draft.aiMcp} onChange={e=>setDraft(d=>({...d,aiMcp:e.target.value}))}/>
        {problems.length>0&&<ul className="mcp-problems" role="alert">{problems.map((p,i)=><li key={i}>{t('mcpProblem')}: {p.code}{p.server?' ('+p.server+')':''}{p.detail?' — '+p.detail:''}</li>)}</ul>}</section>
      <section><h3>{t('skills')}</h3><p>{t('skillsHelp')}</p>{skills===null?<button onClick={()=>void loadSkills()}>{t('refresh')}</button>:skills.length?<ul className="skill-list">{skills.map(s=><li key={s.folder}><strong>{s.name}</strong>{s.description?' — '+s.description:''}</li>)}</ul>:<p>{t('skillsEmpty')}</p>}
        <div className="account-actions"><button onClick={()=>void window.api.invoke('aiSkillsFolder')}>{t('openSkillsFolder')}</button><button onClick={()=>void loadSkills()}>{t('refresh')}</button></div></section>
    </AdvancedSettings>
  </>;
}
