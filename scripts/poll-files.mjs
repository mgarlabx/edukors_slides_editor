// Lists how a deployed copy of the poll server differs from server/poll (the source of truth).
// Credentials kept beside the code (poll.config.php) and macOS cruft are never compared, copied or deleted.
import fs from 'node:fs/promises';
import path from 'node:path';
export const pollSource=path.resolve('server/poll');
export const ignored=name=>name==='.DS_Store'||name==='poll.config.php';
export async function pollFiles(dir,base=dir){
  const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){if(ignored(e.name))continue;const full=path.join(dir,e.name);
    if(e.isDirectory())out.push(...await pollFiles(full,base));else if(e.isFile())out.push(path.relative(base,full));}
  return out.sort();
}
export async function pollDiff(source,target){
  const a=await pollFiles(source),b=await pollFiles(target).catch(()=>[]),changed=[];
  for(const f of a){if(!b.includes(f)){changed.push({file:f,state:'missing'});continue;}if(!(await fs.readFile(path.join(source,f))).equals(await fs.readFile(path.join(target,f))))changed.push({file:f,state:'different'});}
  for(const f of b)if(!a.includes(f))changed.push({file:f,state:'extra'});
  return changed;
}
