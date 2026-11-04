import fs from 'node:fs/promises';
import path from 'node:path';

async function identity(file:string){
  const resolved=await fs.realpath(file).catch(async(error:NodeJS.ErrnoException)=>{
    if(error.code!=='ENOENT')throw error;
    return path.join(await fs.realpath(path.dirname(file)),path.basename(file));
  });
  const stat=await fs.stat(file).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error;});
  return {resolved,stat};
}
/** Export is separate from Save, but must never replace the native document or an imported source. */
export async function assertExportTarget(target:string,protectedFiles:(string|undefined)[]){
  const output=await identity(target);
  for(const file of protectedFiles){
    if(!file)continue;
    const protectedFile=await identity(file);
    if(output.resolved===protectedFile.resolved||output.stat&&protectedFile.stat&&output.stat.dev===protectedFile.stat.dev&&output.stat.ino===protectedFile.stat.ino){
      throw Error('Choose another export name: the document and imported source must remain unchanged.');
    }
  }
}
