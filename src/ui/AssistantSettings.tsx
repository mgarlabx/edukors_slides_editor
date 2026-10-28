import React,{ReactNode,useEffect,useState} from 'react';
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

const stateKey={connected:'accountConnected',disconnected:'accountDisconnected',expired:'accountExpired',unknown:'notChecked'} as const;

export function AssistantSettings({prefs,t,accounts,providers,logins,instructions,onAccounts,onChange,onPrefs,onError}:{prefs:Preferences;t:T;accounts:AccountView[];providers:ProviderView[];logins:Record<string,Login>;instructions:ReactNode;onAccounts:()=>Promise<void>;onChange:(p:Partial<Preferences>)=>void;onPrefs:(p:Preferences)=>void;onError:(message:string)=>void}){
  const [open,setOpen]=useState<Record<string,boolean>>({}),[adding,setAdding]=useState(false),[type,setType]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(''),[codes,setCodes]=useState<Record<string,string>>({}),[skills,setSkills]=useState<Skill[]|null>(null);
  const task=async(id:string,fn:()=>Promise<unknown>)=>{setBusy(id);try{await fn();}catch(e:any){onError(e?.message||String(e));}finally{setBusy('');}};
  const ready=providers.filter(p=>p.detection.status==='ready'),problems=parseMcpConfig(prefs.aiMcp||'').problems;
  const connect=(id:string)=>task(id,async()=>{try{await window.api.invoke('aiAccountConnect',id);}finally{setCodes(c=>({...c,[id]:''}));await onAccounts();}});
  const loadSkills=()=>window.api.invoke('aiSkills').then(setSkills).catch(()=>setSkills([]));
  useEffect(()=>{if(!type&&ready[0])setType(ready[0].id);},[providers]);
  const status=(a:AccountView)=>busy===a.id?t('processing'):a.error?t('accountError')+' ('+a.error+')':a.status?t(stateKey[a.status.state])+(a.status.identity?' · '+a.status.identity:''):t('notChecked');
  return <>
    <section><h2>{t('accountsTitle')}</h2><p className="lead-text">{t('providerHelp')}</p>
    <label className="active-account">{t('activeAccount')}<AccountPicker accounts={accounts} providers={providers} value={prefs.aiAccount||''} label={t('activeAccount')} t={t} onChange={id=>onChange({aiAccount:id})}/><small>{t('activeAccountHelp')}</small></label>
    {accounts.map(a=>{const provider=providers.find(p=>p.id===a.providerId),login=logins[a.id],signedIn=a.status?.state==='connected';
      return <section className={'account-card'+(open[a.id]?' open':'')} key={a.id}>
      <div className="account-heading"><button type="button" className="account-toggle" aria-expanded={!!open[a.id]} onClick={()=>setOpen(s=>({...s,[a.id]:!s[a.id]}))}><span aria-hidden="true">{open[a.id]?'⌄':'›'}</span><span><strong>{a.label}</strong><small className="provider-label">{provider?.name||a.providerId}</small></span></button><span className="provider-status">{status(a)}</span></div>
      {open[a.id]&&<>
        <label>{t('accountName')}<input key={a.id+a.label} defaultValue={a.label} maxLength={80} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==a.label)void task(a.id,async()=>{await window.api.invoke('aiAccountRename',a.id,v);await onAccounts();});}}/></label>
        <div className="account-actions">
          {busy===a.id&&login?<button onClick={()=>void window.api.invoke('aiAccountCancel',a.id)}>{t('cancel')}</button>:<button disabled={!!busy} onClick={()=>void connect(a.id)}>{signedIn?t('signInAgain'):t('connectAccount')}</button>}
          {signedIn&&<button disabled={!!busy} onClick={()=>void task(a.id,async()=>{await window.api.invoke('aiAccountLogout',a.id);await onAccounts();})}>{t('signOut')}</button>}
        </div>
        {busy===a.id&&login&&<div className="account-login" role="status"><p>{t('signInWaiting')}</p><input readOnly aria-label={t('signInLink')} value={login.url} onFocus={e=>e.target.select()}/>
          {login.acceptsCode&&<form onSubmit={e=>{e.preventDefault();const code=(codes[a.id]||'').trim();if(code)void window.api.invoke('aiAccountCode',a.id,code).catch((x:any)=>onError(x?.message||String(x)));}}><label>{t('signInCode')}<input value={codes[a.id]||''} onChange={e=>setCodes(c=>({...c,[a.id]:e.target.value}))}/></label><small>{t('signInCodeHelp')}</small><button className="primary" disabled={!(codes[a.id]||'').trim()}>{t('submitCode')}</button></form>}</div>}
        <button className="danger" disabled={!!busy} onClick={()=>{if(confirm(t('removeAccountConfirm')))void task(a.id,async()=>{onPrefs(await window.api.invoke('aiAccountRemove',a.id));await onAccounts();});}}>{t('removeAccount')}</button>
      </>}
    </section>;})}
    {providers.filter(p=>p.detection.status!=='ready').map(p=><p className="account-result" key={p.id}>{(p.detection.status==='missing'?t('cliNotInstalled'):t('cliUnusable')).replace('{name}',p.name)+(p.installUrl?' '+p.installUrl:'')}</p>)}
    {adding?<form className="provider-create" onSubmit={e=>{e.preventDefault();let created='';void task('create',async()=>{created=(await window.api.invoke('aiAccountCreate',type,name)).id;await onAccounts();if(!prefs.aiAccount)onChange({aiAccount:created});setOpen(s=>({...s,[created]:true}));setAdding(false);setName('');}).then(()=>{if(created)void connect(created);});}}>
      <h2>{t('addAccount')}</h2><div className="provider-grid" role="radiogroup" aria-label={t('provider')}>{ready.map(p=><button type="button" role="radio" aria-checked={type===p.id} className={type===p.id?'selected':''} key={p.id} onClick={()=>{setType(p.id);if(!name||providers.some(x=>x.name===name))setName(p.name);}}>{p.name}</button>)}</div>
      <label>{t('accountName')}<input autoFocus value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label>
      <div className="account-actions"><button type="button" onClick={()=>setAdding(false)}>{t('cancel')}</button><button className="primary" disabled={!name.trim()||!type||!!busy}>{t('createAccount')}</button></div></form>
    :<button disabled={!ready.length} onClick={()=>{setAdding(true);setType(ready[0]?.id||'');setName(ready[0]?.name||'');}}>{t('addAccount')}</button>}
    </section>
    <details className="assistant-advanced" onToggle={e=>{if((e.target as HTMLDetailsElement).open&&!skills)void loadSkills();}}><summary>{t('advanced')}</summary>
      <section><h3>{t('instructionsTitle')}</h3>{instructions}</section>
      <section><h3>{t('mcpServers')}</h3><p>{t('mcpHelp')}</p><textarea className="code" aria-label={t('mcpServers')} rows={8} spellCheck={false} placeholder={'{\n  "mcpServers": {\n    "name": {"command": "npx", "args": ["…"]}\n  }\n}'} value={prefs.aiMcp||''} onChange={e=>onChange({aiMcp:e.target.value})}/>
        {problems.length>0&&<ul className="mcp-problems" role="alert">{problems.map((p,i)=><li key={i}>{t('mcpProblem')}: {p.code}{p.server?' ('+p.server+')':''}{p.detail?' — '+p.detail:''}</li>)}</ul>}</section>
      <section><h3>{t('skills')}</h3><p>{t('skillsHelp')}</p>{skills===null?<p>{t('processing')}</p>:skills.length?<ul className="skill-list">{skills.map(s=><li key={s.folder}><strong>{s.name}</strong>{s.description?' — '+s.description:''}</li>)}</ul>:<p>{t('skillsEmpty')}</p>}
        <div className="account-actions"><button onClick={()=>void window.api.invoke('aiSkillsFolder')}>{t('openSkillsFolder')}</button><button onClick={()=>void loadSkills()}>{t('refresh')}</button></div></section>
    </details>
  </>;
}
