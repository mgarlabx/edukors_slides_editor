import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Deck} from '../shared/model';
import {encodeEslx,decodeEslx as decode} from '../shared/eslx';
export {encodeEslx};
export async function decodeEslx(bytes:Uint8Array){const result=await decode(bytes);return {deck:result.deck,conversations:result.conversations,history:result.history?Buffer.from(result.history):undefined};}
export async function readEslx(file:string){return decodeEslx(await fs.readFile(file));}
export async function writeEslx(file:string,deck:Deck,history?:Buffer,conversations:unknown[]=[]){
  if(path.extname(file).toLowerCase()!=='.eslx')throw Error('Presentations can only be saved as .eslx.');
  const bytes=await encodeEslx(deck,history,conversations),temp=path.join(path.dirname(file),`.${path.basename(file)}.${randomUUID()}.tmp`);
  try{
    const handle=await fs.open(temp,'wx');
    try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    await readEslx(temp);await fs.rename(temp,file);
  }finally{await fs.rm(temp,{force:true});}
}
