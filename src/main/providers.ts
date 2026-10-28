import {spawn,ChildProcess} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {AIEvent,Deck,Profile,validateDeck} from '../shared/model';
import {providerOf,ProviderStatus} from '../shared/providers';
import {ClaudeProvider,CancelledError,SendOptions,Outcome,probe as probeClaude,expandHome,outputSchema,instruction,agentContext,writeContext,applySlideChanges} from './ai';
import {launchProvider,Launch,providerEnv,executablePath,readLines,stopProcess} from './provider-runtime';
import {ACPConnection,initializeACP,acpModels} from './acp';
// The other agent CLIs need a sandbox confined to the presentation folder, which native Windows lacks;
// Claude Code runs there without a shell (toolsFor in ai.ts).
export const windowsAI='On Windows, the AI assistant works only with Claude Code in this version.';
const refused=(profile:Profile)=>process.platform==='win32'&&providerOf(profile).id!=='claude';
export function parseAnswer(deck:Deck,text:unknown):Outcome{
  let out=text;if(typeof out==='string'){const value=out.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');out=JSON.parse(value);}
  if(!out||typeof out!=='object'||Array.isArray(out)||typeof (out as any).message!=='string')throw Error('The provider returned no valid structured answer.');
  const v=out as any,questions=Array.isArray(v.questions)?v.questions.filter((q:any)=>typeof q?.question==='string').slice(0,4).map((q:any)=>({question:q.question,options:Array.isArray(q.options)?q.options.filter((x:any)=>typeof x==='string').slice(0,6):[],multiSelect:!!q.multiSelect})):undefined;
  return{message:v.message,deck:applySlideChanges(deck,v),assets:Array.isArray(v.assets)?v.assets:undefined,questions};
}
export function codexArgs(profile:Profile,schema:string,session?:string,options:SendOptions={}){
  const args=['exec',...(session?['resume',session]:[]),'--json','--skip-git-repo-check','--ignore-user-config','--ignore-rules','--output-schema',schema,'-c','approval_policy="never"','-c','sandbox_mode="workspace-write"','-c','sandbox_workspace_write.network_access=false'];
  if(options.model)args.push('--model',options.model);if(options.effort)args.push('-c','model_reasoning_effort='+JSON.stringify(options.effort));
  if(options.mcp)args.push('-c','mcp_servers.edukors.url='+JSON.stringify(options.mcp.url),'-c','mcp_servers.edukors.http_headers={ Authorization = '+JSON.stringify('Bearer '+options.mcp.token)+' }');
  args.push('-');return args;
}
// Codex's strict schema requires every property to be required; null denotes an omitted patch.
export function strictSchema(schema:any):any{
  if(schema.type==='object')return{...schema,properties:Object.fromEntries(Object.entries(schema.properties).map(([k,v])=>[k,(schema.required||[]).includes(k)?strictSchema(v):{anyOf:[strictSchema(v),{type:'null'}]}])),required:Object.keys(schema.properties)};
  if(schema.type==='array')return{...schema,items:strictSchema(schema.items)};return schema;
}
const omitNull=(v:any):any=>Array.isArray(v)?v.map(omitNull):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null).map(([k,x])=>[k,omitNull(x)])):v;
type Run={stopped:boolean;child?:ChildProcess;rpc?:ACPConnection;session?:string};
export class AIProviders {
  private claude:ClaudeProvider;private runs=new Map<string,Run>();sessions:Map<string,string>;
  constructor(private emit:(e:AIEvent)=>void,sessions:Record<string,string>={},private save:(s:Record<string,string>)=>void=()=>{},private launch:Launch=launchProvider){
    this.sessions=new Map(Object.entries(sessions));this.claude=new ClaudeProvider(emit,Object.fromEntries(Object.entries(sessions).filter(([k])=>!k.startsWith('native:'))),s=>{for(const [k,v] of Object.entries(s))this.sessions.set(k,v);this.persist();});
  }
  private persist(){this.save(Object.fromEntries(this.sessions));}
  busy(id:string){return this.claude.busy(id)||this.runs.has(id);}
  cancel(id:string){this.claude.cancel(id);const run=this.runs.get(id);if(!run)return;run.stopped=true;if(run.rpc&&run.session)run.rpc.notify('session/cancel',{sessionId:run.session});if(run.child){stopProcess(run.child,'SIGTERM');const child=run.child;setTimeout(()=>stopProcess(child,'SIGKILL'),2500).unref();}run.rpc?.fail(new CancelledError());}
  forgetProfile(id:string){this.claude.forgetProfile(id);for(const key of [...this.sessions.keys()])if(key.endsWith(':'+id))this.sessions.delete(key);this.persist();}
  dispose(){this.claude.dispose();for(const id of this.runs.keys())this.cancel(id);}
  async send(deck:Deck,profile:Profile,prompt:string,cwd:string,selected:string[],options:SendOptions={}):Promise<Outcome>{
    if(refused(profile))throw Error(windowsAI);
    if(this.busy(deck.id))throw Error('A request is already running.');
    // A Finder/Explorer-launched app may lack the CLI's folder on its PATH.
    if(providerOf(profile).id==='claude')return this.claude.send(deck,{...profile,executable:await executablePath(profile.executable)},prompt,cwd,selected,options);
    if(prompt.length>40000)throw Error('Prompt is too long.');validateDeck(deck);
    const run:Run={stopped:false};this.runs.set(deck.id,run);
    const key='native:'+providerOf(profile).id+':'+(options.scope?options.scope+':':'')+deck.id+':'+(options.conversation?options.conversation+':':'')+profile.id,session=this.sessions.get(key),kind=providerOf(profile).transport;
    const emit=(e:Omit<AIEvent,'projectId'>)=>{if(!run.stopped)this.emit({projectId:deck.id,...e});};
    try{
      await writeContext(cwd,deck);
      const base=instruction(options.language||'pt').replace(/You have the Claude Code tools:[\s\S]*?Save files you create/,'Use the tools available from your provider. The process is confined to this presentation, apart from its own account runtime. Save files you create');
      const text=base+'\n\nReturn a JSON object matching this schema (no markdown):\n'+JSON.stringify(outputSchema)+'\n\n'+(options.systemPrompt||'')+'\n'+(deck.systemPrompt||'')+'\n\n'+JSON.stringify({request:prompt,selected,attachments:options.attachments||[],...agentContext(deck,selected)});
      let args:string[];
      if(kind==='codex'){const schema=path.join(cwd,'.edukors/ai/output.schema.json');await fs.writeFile(schema,JSON.stringify(strictSchema(outputSchema)));args=codexArgs(profile,schema,session,options);}
      else args=providerOf(profile).id==='agy'?[]:['acp'];
      if(run.stopped)throw new CancelledError();run.child=await this.launch(profile,args,cwd,options.addDirs);if(run.stopped){stopProcess(run.child);throw new CancelledError();}
      emit({type:'activity',kind:session?'resume':'start',detail:providerOf(profile).name});
      let out:Outcome;
      if(kind==='acp')out=await this.acp(run,deck,text,cwd,session,options,emit,profile);
      else out=await this.native(run,deck,text,emit);
      if(run.stopped)throw new CancelledError();if(out.sessionId){this.sessions.set(key,out.sessionId);this.persist();}return out;
    }catch(e){if(run.stopped)throw new CancelledError();throw e;}
    finally{run.rpc?.close();if(run.child)stopProcess(run.child);if(this.runs.get(deck.id)===run)this.runs.delete(deck.id);}
  }
  private native(run:Run,deck:Deck,text:string,emit:(e:Omit<AIEvent,'projectId'>)=>void):Promise<Outcome>{
    return new Promise((resolve,reject)=>{
      const child=run.child!;let stderr='',answer:unknown,sessionId='',failure:Error|undefined,settled=false;
      const finish=(error?:Error)=>{if(settled)return;settled=true;if(run.stopped){reject(new CancelledError());return;}if(error){reject(error);return;}try{resolve({...parseAnswer(deck,omitNull(typeof answer==='string'?JSON.parse(answer):answer)),sessionId});}catch(e){reject(e);}};
      readLines(child,e=>{
          if(e.type==='thread.started')sessionId=e.thread_id;
          if(e.type==='item.completed'&&e.item?.type==='agent_message')answer=e.item.text;
          if(e.type==='item.started'&&e.item)emit({type:'activity',kind:e.item.type==='reasoning'?'thinking':'tool',tool:e.item.type,detail:String(e.item.command||e.item.name||'').slice(0,200)});
          if(e.type==='turn.completed'){const u=e.usage||{};emit({type:'usage',input:u.input_tokens,output:u.output_tokens,cache:u.cached_input_tokens});}
          if(e.type==='turn.failed'||e.type==='error')failure=Error(e.error?.message||e.message||'Codex failed.');
      },e=>{finish(e);stopProcess(child);});
      child.stderr!.on('data',b=>stderr=(stderr+b.toString()).slice(-6000));child.on('error',finish);child.on('close',code=>finish(failure||(code!==0?Error(stderr.trim()||'CLI exited with code '+code):undefined)));
      child.stdin!.on('error',()=>{});child.stdin!.end(text);
    });
  }
  private async acp(run:Run,deck:Deck,text:string,cwd:string,session:string|undefined,options:SendOptions,emit:(e:Omit<AIEvent,'projectId'>)=>void,profile:Profile){
    let answer='',prompting=false;
    const rpc=new ACPConnection(run.child!,await fs.realpath(cwd),await Promise.all((options.addDirs||[]).map(p=>fs.realpath(p))),p=>{
      if(!prompting||p.sessionId!==run.session)return;const u=p.update||{};
      if(u.sessionUpdate==='agent_message_chunk'&&u.content?.type==='text'){answer+=u.content.text;emit({type:'progress',bytes:Buffer.byteLength(answer)});}
      if(u.sessionUpdate==='tool_call')emit({type:'activity',kind:'tool',tool:u.kind||'tool',detail:u.title});
      if(u.sessionUpdate==='agent_thought_chunk')emit({type:'activity',kind:'thinking'});
    });run.rpc=rpc;
    const init=await initializeACP(rpc);if(init.protocolVersion!==1)throw Error('This agent requires an unsupported ACP protocol version.');
    if(providerOf(profile).id==='agy')await rpc.request('authenticate',{methodId:'oauth-personal'});
    const mcpServers=options.mcp&&init.agentCapabilities?.mcpCapabilities?.http?[{type:'http',name:'edukors',url:options.mcp.url,headers:[{name:'Authorization',value:'Bearer '+options.mcp.token}]}]:[];
    const state=session&&init.agentCapabilities?.loadSession?await rpc.request(providerOf(profile).id==='agy'?'session/resume':'session/load',{sessionId:session,cwd,mcpServers}):await rpc.request('session/new',{cwd,mcpServers});
    run.session=state.sessionId||session;if(!run.session)throw Error('ACP did not return a session.');
    if(options.model){const config=state.configOptions?.find((o:any)=>o.category==='model'||o.id==='model');if(config)await rpc.request('session/set_config_option',{sessionId:run.session,configId:config.id,value:options.model});else await rpc.request('session/set_model',{sessionId:run.session,modelId:options.model});}
    prompting=true;const result=await rpc.request('session/prompt',{sessionId:run.session,prompt:[{type:'text',text}]},0);
    if(result.stopReason!=='end_turn')throw Error('ACP stopped: '+result.stopReason);
    return{...parseAnswer(deck,answer),sessionId:run.session};
  }
}
export async function cachedModels(profile:Profile):Promise<{id:string;name:string}[]>{
  if(providerOf(profile).id!=='codex')return[];
  try{const data=JSON.parse(await fs.readFile(path.join(expandHome(profile.configDir),'models_cache.json'),'utf8'));
    return Array.isArray(data.models)?data.models.filter((m:any)=>typeof m.slug==='string'&&m.visibility!=='hide').map((m:any)=>({id:m.slug,name:typeof m.display_name==='string'?m.display_name:m.slug})):[];
  }catch{return[];}
}
export async function probeProvider(profile:Profile,cwd:string,auth=false,launch:Launch=launchProvider):Promise<ProviderStatus>{
  if(refused(profile))throw Error(windowsAI);
  const kind=providerOf(profile);
  if(kind.id==='claude')return probeClaude({...profile,executable:await executablePath(profile.executable)},auth);
  if((auth||kind.id==='agy')&&kind.transport==='acp'){
    await fs.mkdir(cwd,{recursive:true});const child=await launch(profile,kind.id==='agy'?[]:['acp'],cwd),rpc=new ACPConnection(child,await fs.realpath(cwd),[],()=>{});let stderr='';child.stderr!.on('data',b=>stderr=(stderr+b).slice(-2000));
    try{const init=await initializeACP(rpc);if(kind.id==='agy')await rpc.request('authenticate',{methodId:'oauth-personal'});const state=await rpc.request('session/new',{cwd,mcpServers:[]});return{version:init.agentInfo?.version,detail:'ACP ready',models:acpModels(state)};}catch(e:any){return{authenticated:false,detail:e.message};}finally{rpc.close();}
  }
  // No model request is used to test an account.
  return new Promise(async(resolve,reject)=>{
    let executable:string;try{executable=await executablePath(profile.executable);}catch(e){reject(e);return;}
    const child=spawn(executable,auth?['login','status']:['--version'],{env:providerEnv(profile),shell:false,stdio:['ignore','pipe','pipe']});let text='';
    const timer=setTimeout(()=>{child.kill();reject(Error('CLI timeout.'));},10000),collect=(b:Buffer)=>text=(text+b.toString()).slice(-6000);
    child.stdout!.on('data',collect);child.stderr!.on('data',collect);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',async code=>{clearTimeout(timer);resolve({detail:text.trim(),models:await cachedModels(profile),...(auth?{authenticated:code===0}:{version:code===0?text.trim():undefined})});});
  });
}

export async function connectAntigravity(profile:Profile,cwd:string,onAuth:(url:string)=>void,launch:Launch=launchProvider):Promise<ProviderStatus>{
  if(providerOf(profile).id!=='agy')throw Error('Unsupported browser sign-in.');await fs.mkdir(cwd,{recursive:true});
  const child=await launch(profile,[],cwd),rpc=new ACPConnection(child,await fs.realpath(cwd),[],()=>{},onAuth);
  try{const init=await initializeACP(rpc);await rpc.request('authenticate',{methodId:'oauth-personal'},5*60_000);const session=await rpc.request('session/new',{cwd,mcpServers:[]});return{authenticated:true,version:init.agentInfo?.version,detail:'ACP ready',models:acpModels(session)};}finally{rpc.close();}
}
