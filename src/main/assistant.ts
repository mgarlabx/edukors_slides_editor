import fs from 'node:fs/promises';
import {createAiCli,parseMcpConfig,listSkills,type AiCli,type AiSession,type AiEvent as LibraryEvent,type ProviderAdapter,type ToolDefinition,type AccountStatus,type Detection,type ModelInfo,type Usage} from '@edukors/ai-cli';
import {AIEvent,Deck,SessionLimits,validateDeck} from '../shared/model';
import {agentContext,applySlideChanges,CancelledError,instruction,ownedPaths,sentKeys,writeContext} from './ai';
import {atomic} from './projects';

// The assistant through the shared EDUKORS AI library (@edukors/ai-cli): its accounts, Claude and Codex sessions in the
// presentation's working folder (a library workspace: the provider's own file, web and, where a sandbox confines them,
// command tools), the app's tools (apply_changes, screenshot, download) and questions. No Electron here, so it runs in tests.

export interface ProviderView {id:string;name:string;installUrl?:string;detection:Detection;workspace:boolean;shell:boolean}
export interface AccountView {id:string;providerId:string;label:string;status?:AccountStatus;error?:string}
export interface Attachment {name:string;path:string;assetId?:string;content?:string}
export interface AssistantRequest {
  deck:Deck;accountId:string;prompt:string;root:string;selected:string[];readDirs?:string[];attachments?:Attachment[];
  conversation?:string;scope?:string;language?:string;systemPrompt?:string;model?:string;effort?:string;mcp?:string;skillsDir?:string;
  // The app's own tools besides apply_changes (screenshot and download in the app).
  tools?:ToolDefinition[];
  // Imports the files the agent listed as assets and reviews the changed deck (structure, rendering); returns the problems.
  check?:(base:Deck,next:Deck,assets:{id:string;path:string;name?:string}[])=>Promise<string[]>;
}
export interface Outcome {message:string;deck?:Deck}
type Open={key:string;setup:string;session:AiSession;off:()=>void};
type Turn={deck:Deck;next?:Deck;message:string;text:string;stopped:boolean;requestId:string;session?:AiSession;check?:AssistantRequest['check']};

const string={type:'string'};
const slideFields=Object.fromEntries(['title','layoutId','html','css','script','staticHtml','notes'].map(k=>[k,string]));
const applySchema={type:'object',additionalProperties:false,properties:{
  message:{type:'string',description:'Optional short summary of the change for the user.'},
  systemPrompt:{type:'string',maxLength:20000},
  slideUpdates:{type:'array',maxItems:300,items:{type:'object',additionalProperties:false,properties:{id:string,...slideFields},required:['id']}},
  slideOrder:{type:'array',minItems:1,maxItems:300,items:string},
  masterUpdates:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^[\\w-]+$'},name:string,css:string,html:string},required:['id']}},
  activeMaster:string,
  layoutUpdates:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^[\\w-]+$'},name:string,html:string,css:string},required:['id']}},
  assets:{type:'array',maxItems:200,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^asset-[\\w-]+$'},path:string,name:string},required:['id','path']}}}};

// The 5-hour window, as the composer shows it (fraction used, reset in epoch seconds).
export function fiveHour(usage:Usage):SessionLimits|null{
  const w=usage.windows?.find(x=>x.name==='five_hour');if(!w||!Number.isFinite(w.used))return null;
  const reset=w.resetsAt?Date.parse(w.resetsAt):NaN;
  return{utilization:Math.max(0,w.used),resetsAt:Number.isFinite(reset)?Math.floor(reset/1000):undefined,status:'allowed',updated:Date.now()};
}

// The app's rules, then the person's standing instructions, then this presentation's own: current at every request.
export function instructionsFor(language:string,shell:boolean,global?:string,own?:string){
  const extra=global?.trim(),deck=own?.trim();
  return instruction(language,shell)+(extra?'\n\nAdditional instructions from the user:\n'+extra:'')+(deck?'\n\nPresentation system prompt (ai/system-prompt.md):\n'+deck:'');
}

export class Assistant {
  readonly ai:AiCli;
  private open=new Map<string,Open>();private turns=new Map<string,Turn>();private resume:Record<string,string>;private sent=new Map<string,Map<string,string>>();
  private asks=new Map<string,{deckId:string;resolve:(answer:string|null)=>void}>();
  constructor(private o:{providers:ProviderAdapter[];dataDir?:string;emit:(e:AIEvent)=>void;sessionsFile:string;resume?:Record<string,string>;words?:{allow:string;deny:string;mcpCall:(server:string,tool:string)=>string}}){
    this.ai=createAiCli({appId:'slides',providers:o.providers,...o.dataDir?{dataDir:o.dataDir}:{}});this.resume={...o.resume};
  }
  private emit(e:Omit<AIEvent,'projectId'>&{projectId?:string}){this.o.emit({projectId:'',...e} as AIEvent);}
  private persist(){void atomic(this.o.sessionsFile,JSON.stringify(this.resume)).catch(()=>{});}

  // Settings: the providers this app offers (a provider must confine a workspace here) and the accounts of those providers.
  async providers():Promise<ProviderView[]>{
    const out:ProviderView[]=[];
    for(const p of this.o.providers){const detection=await this.ai.detect(p.id),c=p.capabilities(detection);if(!c.workspace)continue;out.push({id:p.id,name:p.displayName,...p.installUrl?{installUrl:p.installUrl}:{},detection,workspace:c.workspace,shell:c.workspaceShell});}
    return out;
  }
  async accounts(withStatus=true):Promise<AccountView[]>{
    const offered=new Set((await this.providers()).map(p=>p.id));
    return Promise.all((await this.ai.listAccounts()).filter(a=>offered.has(a.providerId)).map(async a=>{
      const view:AccountView={id:a.id,providerId:a.providerId,label:a.label};if(!withStatus)return view;
      try{view.status=await this.ai.accountStatus(a.id);}catch(e:any){view.error=e?.code||String(e?.message||e);}return view;}));
  }
  createAccount(providerId:string,label:string){return this.ai.createAccount({providerId,label});}
  connect(id:string,signal?:AbortSignal){return this.ai.connectAccount(id,{onLogin:p=>this.emit({type:'login',accountId:id,url:p.url,acceptsCode:p.acceptsCode}),...signal?{signal}:{}});}
  submitCode(id:string,code:string){return this.ai.submitLoginCode(id,code);}
  logout(id:string){return this.ai.logoutAccount(id);}
  async removeAccount(id:string){await this.forgetAccount(id);await this.ai.removeAccount(id);}
  renameAccount(id:string,label:string){return this.ai.renameAccount(id,label);}
  models(id:string):Promise<ModelInfo[]>{return this.ai.listModels(id);}
  async usage(id:string){const u=await this.ai.readUsage(id).catch(()=>null);return u?fiveHour(u):null;}
  skills(dir:string){return fs.mkdir(dir,{recursive:true}).then(()=>listSkills(dir));}
  busy(deckId:string){return this.turns.has(deckId);}

  // A conversation keeps one provider session per presentation copy, conversation and account, resumed across requests
  // and app restarts. A new setup (system prompts, model, effort, MCP servers, skills, attachment folders) reopens it on the
  // same conversation.
  private async session(r:AssistantRequest,key:string,instructions:string,tools:ToolDefinition[]):Promise<AiSession>{
    const deckId=r.deck.id,current=this.open.get(deckId),setup=JSON.stringify([instructions,r.model||'',r.effort||'',r.mcp||'',r.skillsDir||'',r.readDirs||[]]);
    if(current&&current.key===key&&current.setup===setup&&current.session.state!=='closed'){this.emit({projectId:deckId,type:'activity',kind:'resume'});return current.session;}
    if(current){current.off();this.open.delete(deckId);await current.session.close().catch(()=>{});}
    const {servers}=parseMcpConfig(r.mcp||'');
    const session=await this.ai.openSession({accountId:r.accountId,documentId:deckId,instructions,tools,
      options:{...r.model?{model:r.model}:{},...r.effort?{effort:r.effort}:{}},...this.resume[key]?{resumeId:this.resume[key]}:{},
      ...Object.keys(servers).length?{mcpServers:servers,authorize:a=>this.ask(deckId,this.o.words?.mcpCall(a.server,a.tool)||`Allow ${a.server}: ${a.tool}?`,[this.o.words?.allow||'Allow',this.o.words?.deny||'Deny'],a.signal).then(x=>x===(this.o.words?.allow||'Allow')?{allow:true as const}:{allow:false as const,message:'The user declined.'})}:{},
      ...r.skillsDir?{skillsDir:r.skillsDir}:{},
      workspace:{dir:r.root,readDirs:r.readDirs||[],protect:ownedPaths,web:true,shell:true}});
    const off=session.on(e=>this.relay(deckId,e));this.open.set(deckId,{key,setup,session,off});
    const provider=this.o.providers.find(p=>p.id===session.providerId)?.displayName;
    this.emit({projectId:deckId,type:'activity',kind:this.resume[key]?'resume':'start',...provider?{detail:provider}:{}});
    if(session.resumeId&&this.resume[key]!==session.resumeId){this.resume[key]=session.resumeId;this.persist();}
    return session;
  }
  // Library events become the sidebar's: streamed text, activity rows, questions, tokens and the 5-hour window.
  private relay(deckId:string,e:LibraryEvent){
    const turn=this.turns.get(deckId);if(!turn||turn.stopped||e.requestId&&e.requestId!==turn.requestId)return;
    const emit=(x:Omit<AIEvent,'projectId'>)=>this.emit({projectId:deckId,...x});
    switch(e.type){
      case 'textDelta':turn.text+=e.text;emit({type:'text',text:e.text});break;
      case 'activity':if(e.phase==='thinking')emit({type:'activity',kind:'thinking'});else if(e.phase==='reading')emit({type:'activity',kind:'tool',tool:'Read',...e.detail?{detail:e.detail}:{}});else if(e.phase==='researching')emit({type:'activity',kind:'tool',tool:'WebSearch',...e.detail?{detail:e.detail}:{}});break;
      case 'toolStarted':if(e.tool!=='apply_changes')emit({type:'activity',kind:'tool',tool:e.tool.replace(/^mcp__edukors__/,'')});break;
      case 'question':emit({type:'question',questionId:e.questionId,text:e.prompt,...e.options?{options:e.options}:{}});break;
      case 'usageUpdated':{const u=e.usage;if(u.inputTokens!==undefined||u.outputTokens!==undefined)emit({type:'usage',input:u.inputTokens,output:u.outputTokens,cache:u.cachedInputTokens,cost:u.costUsd});
        const limits=fiveHour(u);if(limits)this.emit({projectId:deckId,type:'limits',accountId:e.accountId,limits});break;}
    }
  }
  // A question of the app's own (allowing a call to the user's MCP server), answered like the agent's.
  private ask(deckId:string,text:string,options:string[],signal?:AbortSignal):Promise<string|null>{
    const questionId='app-'+crypto.randomUUID();
    return new Promise(resolve=>{this.asks.set(questionId,{deckId,resolve});signal?.addEventListener('abort',()=>{this.asks.delete(questionId);resolve(null);});this.emit({projectId:deckId,type:'question',questionId,text,options});});
  }
  answer(deckId:string,questionId:string,answer:string){
    const own=this.asks.get(questionId);if(own){if(own.deckId!==deckId)throw Error('Unknown question.');this.asks.delete(questionId);own.resolve(answer);return;}
    const open=this.open.get(deckId);if(!open)throw Error('Unknown question.');open.session.answer(questionId,answer);
  }
  cancel(deckId:string){
    const turn=this.turns.get(deckId);if(!turn)return;turn.stopped=true;void turn.session?.interrupt().catch(()=>{});
    for(const [id,a] of this.asks)if(a.deckId===deckId){this.asks.delete(id);a.resolve(null);}
  }

  async send(r:AssistantRequest):Promise<Outcome>{
    if(this.turns.has(r.deck.id))throw Error('A request is already running.');
    if(r.prompt.length>40000)throw Error('Prompt is too long.');validateDeck(r.deck);
    const turn:Turn={deck:r.deck,message:'',text:'',stopped:false,requestId:crypto.randomUUID(),check:r.check};this.turns.set(r.deck.id,turn);
    const key=[r.scope||'',r.deck.id,r.conversation||'',r.accountId].join(':');
    try{
      await writeContext(r.root,r.deck);
      const providers=await this.providers(),account=(await this.ai.listAccounts()).find(a=>a.id===r.accountId),shell=!!providers.find(p=>p.id===account?.providerId)?.shell;
      const instructions=instructionsFor(r.language||'pt',shell,r.systemPrompt,r.deck.systemPrompt);
      const session=await this.session(r,key,instructions,[this.applyTool(r.deck.id),...r.tools||[]]);turn.session=session;
      if(turn.stopped)throw new CancelledError();
      // Context first, the person's words last: the request reads as what they asked.
      const previous=this.sent.get(key),context=JSON.stringify({selected:r.selected,attachments:r.attachments||[],...agentContext(r.deck,r.selected,previous)});
      const result=await session.send(`<presentation>\n${context}\n</presentation>\n\n${r.prompt}`,{requestId:turn.requestId});
      if(session.resumeId&&this.resume[key]!==session.resumeId){this.resume[key]=session.resumeId;this.persist();}
      if(turn.stopped||result.status==='cancelled')throw new CancelledError();
      if(result.status==='failed'){this.sent.delete(key);const err=Object.assign(Error(result.error?.message||'The provider failed.'),{code:result.error?.code});throw err;}
      this.sent.set(key,sentKeys(turn.next||r.deck));
      return{message:turn.text.trim()||turn.message,...turn.next?{deck:turn.next}:{}};
    }catch(e){this.sent.delete(key);throw e;}
    finally{this.turns.delete(r.deck.id);}
  }

  // The session outlives a request, so its tool works on whichever request of the presentation is running.
  private applyTool(deckId:string):ToolDefinition{
    const fixing=(problems:string)=>{this.emit({projectId:deckId,type:'activity',kind:'fixing',body:problems});return{content:'Not applied. Fix these problems and call apply_changes again:\n'+problems,isError:true};};
    return{name:'apply_changes',description:'Changes the presentation: new or modified slides (only the fields that change), slide order, masters, layouts, assets saved in the folder and the presentation\'s system prompt. Validates and renders the changes; reports the problems to fix, or that they will be applied when your turn ends.',inputSchema:applySchema,
      run:async args=>{
        const turn=this.turns.get(deckId);if(!turn||turn.stopped)return{content:'No request is running.',isError:true};
        this.emit({projectId:deckId,type:'activity',kind:'validating'});
        let next:Deck|undefined;try{next=applySlideChanges(turn.next||turn.deck,args);}catch(e:any){return fixing(String(e?.message||e));}
        if(!next)return{content:'Nothing to change.'};
        const problems=turn.check?await turn.check(turn.next||turn.deck,next,Array.isArray(args.assets)?args.assets as any:[]):[];
        if(problems.length)return fixing(problems.join('\n'));
        if(turn.stopped||this.turns.get(deckId)!==turn)return{content:'The request was stopped.',isError:true};
        turn.next=next;if(typeof args.message==='string')turn.message=args.message;
        return{content:'Accepted. The changes will be applied when your turn ends.'};
      }};
  }
  // A presentation closes (or its account is removed): its session ends; the conversation stays resumable.
  async closeDeck(deckId:string){this.cancel(deckId);const open=this.open.get(deckId);if(!open)return;open.off();this.open.delete(deckId);await open.session.close().catch(()=>{});}
  async forgetAccount(accountId:string){
    for(const [deckId,open] of [...this.open])if(open.key.endsWith(':'+accountId))await this.closeDeck(deckId);
    let changed=false;for(const key of Object.keys(this.resume))if(key.endsWith(':'+accountId)){delete this.resume[key];changed=true;}
    for(const key of [...this.sent.keys()])if(key.endsWith(':'+accountId))this.sent.delete(key);
    if(changed)this.persist();
  }
  async dispose(){for(const id of [...this.turns.keys()])this.cancel(id);await this.ai.dispose();}
}
