import React,{useState} from 'react';
import {PollConfig,pollWords,pollOptionColors,validPoll,normalizePollServer} from '../shared/poll';
import {Language,Preferences} from '../shared/model';
import type {T} from './i18n';

export function PollEditor({initial,lang,server,onSave,onCancel}:{initial?:PollConfig;lang:Language;server?:string;onSave:(p?:PollConfig)=>void;onCancel:()=>void}){
  const w=pollWords[lang],[type,setType]=useState<PollConfig['type']>(initial?.type||'quiz'),[prompt,setPrompt]=useState(initial?.prompt||''),[options,setOptions]=useState(initial?.options||['','']),[error,setError]=useState(false);
  const save=()=>{const p:PollConfig={version:1,provider:'edukors',type,prompt:prompt.trim(),...type==='quiz'?{options:options.map(s=>s.trim())}:{}};if(!validPoll(p)){setError(true);return;}onSave(p);};
  return <form className="poll-editor" onSubmit={e=>{e.preventDefault();save();}}>
    <p className="modal-subtitle">{w.help}</p>
    <label>{w.type}<select value={type} onChange={e=>setType(e.target.value as PollConfig['type'])}>{(['quiz','tag','post'] as const).map(k=><option key={k} value={k}>{w[k]}</option>)}</select></label>
    <label>{w.prompt}<textarea autoFocus rows={3} maxLength={2000} value={prompt} onChange={e=>setPrompt(e.target.value)}/></label>
    {type==='quiz'&&<fieldset><legend>{w.options}</legend>{options.map((s,i)=><label className="poll-editor-option" key={i}><span style={{backgroundColor:pollOptionColors[i]}}>{'ABCDE'[i]}</span><input aria-label={`${w.options} ${'ABCDE'[i]}`} maxLength={500} value={s} onChange={e=>setOptions(old=>old.map((v,k)=>k===i?e.target.value:v))}/>{options.length>2&&<button type="button" aria-label={`${w.remove} ${'ABCDE'[i]}`} onClick={()=>setOptions(old=>old.filter((_,k)=>k!==i))}>×</button>}</label>)}{options.length<5&&<button type="button" onClick={()=>setOptions(old=>[...old,''])}>{w.add}</button>}</fieldset>}
    {error&&<p role="alert" className="error">{w.invalid}</p>}
    <p className="poll-editor-server">{w.server}: {normalizePollServer(server)||w.noServerEditor}</p>
    <footer className="modal-actions">{initial&&<button type="button" className="danger" onClick={()=>onSave(undefined)}>{w.remove}</button>}<button type="button" onClick={onCancel}>{w.cancel}</button><button type="submit" className="primary">{w.save}</button></footer>
  </form>;
}

// Settings → Interactive questions. The field keeps what is typed; only a valid address reaches the preferences.
export function PollServerSettings({prefs,t,onChange}:{prefs:Preferences;t:T;onChange:(patch:Partial<Preferences>)=>void}){
  const [text,setText]=useState(prefs.pollServer||''),[test,setTest]=useState<''|'testing'|'ok'|'fail'>('');
  const valid=normalizePollServer(text),empty=!text.trim();
  const edit=(value:string)=>{setText(value);setTest('');const base=normalizePollServer(value);if(base||!value.trim())onChange({pollServer:base||undefined});};
  const check=async()=>{if(!valid)return;setTest('testing');const r=await (window as any).api.invoke('pollPing',valid).catch(()=>({ok:false}));setTest(r?.ok?'ok':'fail');};
  return <section><h2>{t('pollServer')}</h2><p>{t('pollServerHelp')}</p>
    <input className={'poll-server'+(valid||empty?'':' invalid')} type="url" spellCheck={false} aria-label={t('pollServer')} aria-invalid={!valid&&!empty} value={text} placeholder="https://example.org/poll" onChange={e=>edit(e.target.value)}/>
    {!valid&&!empty&&<p role="alert" className="error">{t('pollServerInvalid')}</p>}
    <div className="poll-server-actions"><button type="button" disabled={!valid||test==='testing'} onClick={()=>void check()}>{test==='testing'?t('pollServerTesting'):t('pollServerTest')}</button>{test==='ok'&&<span className="success" role="status">{t('pollServerOk')}</span>}{test==='fail'&&<span className="error" role="status">{t('pollServerFail')}</span>}</div>
  </section>;
}
