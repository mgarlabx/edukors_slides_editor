import {ChildProcess} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {readLines,stopProcess} from './provider-runtime';
import {ownedPaths} from './ai';
export class ACPConnection {
  private seq=0;private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer?:NodeJS.Timeout}>();
  private error?:Error;private stderr='';
  constructor(readonly child:ChildProcess,private root:string,private readDirs:string[],private update:(p:any)=>void,private onAuth?:(url:string)=>void){
    let stderrLine='';child.stderr!.on('data',b=>{stderrLine+=b.toString();const lines=stderrLine.split('\n');stderrLine=lines.pop()!.slice(-20000);for(const line of lines)try{if(!this.authorization(line))this.stderr=(this.stderr+line+'\n').slice(-4000);}catch(e){this.fail(e as Error);}});
    readLines(child,m=>{void this.message(m).catch(e=>this.fail(e));},e=>this.fail(e),line=>this.authorization(line));
    child.on('error',e=>this.fail(e));child.on('close',code=>this.fail(Error(this.stderr.trim()||'ACP disconnected ('+code+').')));child.stdin!.on('error',e=>this.fail(e));
  }
  private authUrls=new Set<string>();
  private authorization(line:string){
    let value:string;if(line.startsWith('EDUKORS_AUTH_URL='))value=JSON.parse(line.slice(17));else if(line.startsWith('Open the following link to authenticate the ACP server: '))value=line.slice('Open the following link to authenticate the ACP server: '.length).trim();else return false;
    const url=googleAuthorizationUrl(value);if(!this.onAuth)throw Error('Connect this Antigravity account in Settings first.');
    if(!this.authUrls.has(url)){this.authUrls.add(url);this.onAuth(url);}return true;
  }
  private write(m:object){if(!this.error)this.child.stdin!.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');}
  request(method:string,params:object,timeout=30000):Promise<any>{
    if(this.error)return Promise.reject(this.error);const id=++this.seq;
    return new Promise((resolve,reject)=>{const timer=timeout>0?setTimeout(()=>{this.pending.delete(id);reject(Error(method+' timed out.'));},timeout):undefined;this.pending.set(id,{resolve,reject,timer});this.write({id,method,params});});
  }
  notify(method:string,params:object){this.write({method,params});}
  fail(error:Error){if(this.error)return;this.error=error;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();stopProcess(this.child);}
  close(){this.fail(Error('ACP connection closed.'));}
  private async file(file:unknown,write=false){
    if(typeof file!=='string'||!path.isAbsolute(file))throw Error('An absolute file path is required.');
    const target=write?path.join(await fs.realpath(path.dirname(file)),path.basename(file)):await fs.realpath(file);
    const roots=write?[this.root]:[this.root,...this.readDirs];
    if(!roots.some(r=>target===r||target.startsWith(r+path.sep)))throw Error('Path outside the presentation.');
    if(write){const rel=path.relative(this.root,target);if(ownedPaths.some(p=>rel===p||rel.startsWith(p+'/')))throw Error('The editor owns this file.');try{if((await fs.lstat(target)).isSymbolicLink())throw Error('Symbolic links are not allowed.');}catch(e:any){if(e.code!=='ENOENT')throw e;}}
    return target;
  }
  private async message(m:any){
    if(!m.method){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(Object.assign(Error(String(m.error.message||'ACP error')),{code:m.error.code}));else p.resolve(m.result);}return;}
    if(m.method==='session/update'){this.update(m.params);return;}
    if(m.id===undefined)return;
    let result:any;try{
      const p=m.params||{};
      if(m.method==='session/request_permission'){
        // The process and all its child tools are already confined by the OS sandbox.
        const option=p.options?.find((o:any)=>o.kind==='allow_once');result={outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}};
      }else if(m.method==='fs/read_text_file'){
        const file=await this.file(p.path);if((await fs.stat(file)).size>2_000_000)throw Error('File exceeds text limit.');let content=await fs.readFile(file,'utf8');
        if(p.line!==undefined||p.limit!==undefined){if(p.line!==undefined&&(!Number.isInteger(p.line)||p.line<1)||p.limit!==undefined&&(!Number.isInteger(p.limit)||p.limit<0))throw Error('Invalid line range.');content=content.split('\n').slice((p.line||1)-1,p.limit===undefined?undefined:(p.line||1)-1+p.limit).join('\n');}result={content};
      }else if(m.method==='fs/write_text_file'){
        if(typeof p.content!=='string'||Buffer.byteLength(p.content)>5_000_000)throw Error('Invalid file content.');await fs.writeFile(await this.file(p.path,true),p.content);result={};
      }else{this.write({id:m.id,error:{code:-32601,message:'Client method not supported.'}});return;}
      this.write({id:m.id,result});
    }catch(e:any){this.write({id:m.id,error:{code:-32602,message:String(e.message)}});}
  }
}
export const initializeACP=(rpc:ACPConnection)=>rpc.request('initialize',{protocolVersion:1,clientInfo:{name:'edukors-slides-editor',version:'1'},clientCapabilities:{fs:{readTextFile:true,writeTextFile:true},terminal:false}});
export function acpModels(session:any):{id:string;name:string}[]{
  const options=session.configOptions?.find((o:any)=>o.category==='model'||o.id==='model')?.options;
  const flatten=(list:any[]):any[]=>list.flatMap(x=>Array.isArray(x.options)?flatten(x.options):[x]);
  return Array.isArray(options)?flatten(options).filter(x=>typeof x.value==='string').map(x=>({id:x.value,name:x.name||x.value})):Array.isArray(session.models?.availableModels)?session.models.availableModels.map((x:any)=>({id:x.modelId,name:x.name||x.modelId})):[];
}

export function googleAuthorizationUrl(value:string){
  if(typeof value!=='string'||value.length>16384)throw Error('Invalid sign-in URL.');const url=new URL(value),redirect=url.searchParams.get('redirect_uri');
  if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||url.username||url.password||url.hash||url.searchParams.getAll('state').length!==1||!url.searchParams.get('state')||url.searchParams.getAll('redirect_uri').length!==1||url.searchParams.get('response_type')!=='code'||!redirect||!/^http:\/\/127\.0\.0\.1:[0-9]{4,5}\/$/.test(redirect)||Number(new URL(redirect).port)<1024)throw Error('Invalid sign-in URL.');return url.href;
}
