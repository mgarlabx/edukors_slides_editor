import {spawn,ChildProcess} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Profile} from '../shared/model';
import {providerOf} from '../shared/providers';
import {expandHome,ownedPaths} from './ai';
export const cliPath=()=>[path.join(os.homedir(),'.local/bin'),'/opt/homebrew/bin','/usr/local/bin',process.env.PATH||'/usr/bin:/bin'].join(path.delimiter);
export async function executablePath(executable:string){
  const file=expandHome(executable);if(file.includes(path.sep))return file;
  for(const dir of cliPath().split(path.delimiter)){const candidate=path.join(dir,file);try{await fs.access(candidate,1);return candidate;}catch{}}
  return file;
}
export function accountEnv(profile:Profile):Record<string,string>{
  const dir=expandHome(profile.configDir);if(!dir)return{};
  switch(providerOf(profile).id){
    case 'claude':return{CLAUDE_CONFIG_DIR:dir};
    case 'codex':return{CODEX_HOME:dir};
    case 'kimi':return{KIMI_SHARE_DIR:dir,KIMI_CODE_HOME:dir};
    case 'kiro':return{KIRO_HOME:dir};
    case 'opencode':return{XDG_CONFIG_HOME:path.join(dir,'config'),XDG_DATA_HOME:path.join(dir,'data'),XDG_STATE_HOME:path.join(dir,'state'),XDG_CACHE_HOME:path.join(dir,'cache')};
    case 'agy':return{GEMINI_HOME:dir,AGY_ACP_FORCE_FILE_STORAGE:'1'};
  }
}
export function providerEnv(profile:Profile):NodeJS.ProcessEnv{
  // Inherited credentials must not silently override the account selected in the editor.
  const env:NodeJS.ProcessEnv={};
  for(const k of ['PATH','HOME','USER','LOGNAME','SHELL','LANG','LC_ALL','TMPDIR','SYSTEMROOT','WINDIR','HTTPS_PROXY','HTTP_PROXY','NO_PROXY','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS'])if(process.env[k])env[k]=process.env[k];
  const browser=providerOf(profile).id==='agy'?{BROWSER:[quote(process.execPath),'-e',quote('process.stderr.write("EDUKORS_AUTH_URL="+JSON.stringify(process.argv[1])+"\\n")'),'--','%s'].join(' '),ELECTRON_RUN_AS_NODE:'1',PYTHONUNBUFFERED:'1'}:{};
  return{...env,...browser,PATH:cliPath(),...accountEnv(profile),NO_COLOR:'1',CLAUDE_CODE_DISABLE_AUTO_MEMORY:'1',KIMI_CLI_NO_AUTO_UPDATE:'1',AGY_CLI_DISABLE_AUTO_UPDATE:'1'};
}
const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
export function loginCommand(profile:Profile){
  const kind=providerOf(profile).id;if(kind==='agy')throw Error('Connect Antigravity from the app.');const args=kind==='claude'?['auth','login']:kind==='codex'||kind==='kiro'?['login']:kind==='opencode'?['auth','login']:[];
  // Kimi starts their own interactive sign-in when opened with a fresh account directory.
  return[...Object.entries(accountEnv(profile)).map(([k,v])=>k+'='+quote(v)),quote(profile.executable),...args.map(quote)].join(' ');
}
export function sandboxPolicy(root:string,accountDirs:string[],readDirs:string[],runtimeDirs:string[]){
  const sub=(p:string)=>`(subpath ${JSON.stringify(p)})`,literal=(p:string)=>`(literal ${JSON.stringify(p)})`;
  const readable=[root,...accountDirs,...readDirs,...runtimeDirs,'/System','/Library','/usr','/bin','/sbin','/opt','/dev','/private/etc','/private/var/db','/private/var/run'];
  const writable=[root,...accountDirs];
  // Listing "/" itself (names only) must stay readable: without it Node aborts at startup (SIGABRT).
  return `(version 1)\n(allow default)\n(deny appleevent-send)\n(deny file-read-data (require-all ${readable.map(p=>`(require-not ${sub(p)})`).join(' ')} (require-not ${literal('/')})))\n(deny file-write* (require-all ${writable.map(p=>`(require-not ${sub(p)})`).join(' ')} (require-not ${literal('/dev/null')}) (require-not ${literal('/dev/tty')})))\n(deny file-write* ${ownedPaths.map(p=>sub(path.join(root,p))).join(' ')})`;
}
export type Launch=(profile:Profile,args:string[],cwd:string,readDirs?:string[])=>Promise<ChildProcess>;
export const launchProvider:Launch=async(profile,args,cwd,readDirs=[])=>{
  if(process.platform!=='darwin')throw Error('This provider requires the macOS sandbox in this version.');
  if(providerOf(profile).id==='agy'&&!profile.configDir)throw Error('Choose a dedicated Antigravity account directory.');
  const executable=await executablePath(profile.executable),real=await fs.realpath(executable),root=await fs.realpath(cwd);
  const env=providerEnv(profile);if(providerOf(profile).id==='agy'){
    const harness=path.join(path.dirname(real),'localharness_external');await fs.access(harness,1);env.ANTIGRAVITY_HARNESS_PATH=harness;
    const dir=path.join(expandHome(profile.configDir),'antigravity-acp');await fs.mkdir(dir,{recursive:true,mode:0o700});
    try{await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify({auth:{type:'oauth-personal'}}),{flag:'wx',mode:0o600});}catch(e:any){if(e.code!=='EEXIST')throw e;}
  }
  const accountDirs=profile.configDir?[expandHome(profile.configDir)]:providerOf(profile).id==='opencode'?['.config/opencode','.local/share/opencode','.local/state/opencode','.cache/opencode'].map(p=>path.join(os.homedir(),p)):[];
  const runtime=path.join(root,'.provider-tmp');await fs.mkdir(runtime,{recursive:true});env.TMPDIR=runtime;env.TMP=runtime;env.TEMP=runtime;
  for(const dir of accountDirs)await fs.mkdir(dir,{recursive:true});
  const accounts=await Promise.all(accountDirs.map(p=>fs.realpath(p))),reads=await Promise.all(readDirs.map(p=>fs.realpath(p)));
  // Broad account roots would defeat isolation. A profile is always a dedicated subdirectory.
  if(accounts.some(p=>p==='/'||p===os.homedir()||root===p||root.startsWith(p+'/')))throw Error('Choose a dedicated account directory.');
  const runtimes=[path.dirname(process.execPath),path.dirname(executable),path.dirname(real),path.join(os.homedir(),'.local/share/uv'),path.join(os.homedir(),'.local/share/mise'),path.join(os.homedir(),'.nvm'),path.join(os.homedir(),'.bun')];
  return spawn('/usr/bin/sandbox-exec',['-p',sandboxPolicy(root,accounts,reads,runtimes),executable,...args],{cwd:root,env,shell:false,detached:true,stdio:['pipe','pipe','pipe']});
};
export function stopProcess(child:ChildProcess,signal:NodeJS.Signals='SIGTERM'){
  try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,signal);else child.kill(signal);}catch{try{child.kill(signal);}catch{}}
}
// Bounded JSONL reader shared by native CLIs and ACP. StringDecoder preserves split UTF-8 chunks.
export function readLines(child:ChildProcess,onLine:(value:any)=>void,onError:(error:Error)=>void,onPlain?:(line:string)=>boolean){
  let pending='',size=0;child.stdout!.setEncoding('utf8');
  const consume=(line:string)=>{if(!line.trim())return;try{if(onPlain?.(line))return;onLine(JSON.parse(line));}catch(e){onError(e as Error);}};
  child.stdout!.on('data',(s:string)=>{size+=Buffer.byteLength(s);if(size>20_000_000){onError(Error('CLI output exceeded limit.'));return;}pending+=s;let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);consume(line);}});
  child.stdout!.on('end',()=>{if(pending.trim())consume(pending);});
}
