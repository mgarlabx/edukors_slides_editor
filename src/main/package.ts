import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';

// An .ESF is a standard ZIP: manifest.json at the root, the folders the app rebuilds from the deck on every save
// (managed) and the assistant's conversations; nothing else from the working folder is packed.
// Compression runs on the libuv thread pool (zlib async), so the main process keeps serving the UI.
export const packageVersion=1;
export const packageLimits={entries:20000,file:512*2**20,total:2*2**30};
// The presentation's system prompt is the one managed file inside ai/.
export const promptPath='ai/system-prompt.md';
export const managedPaths=['manifest.json','masters','layouts','slides','images','fonts',promptPath];
// .edukors/ is the app's working state; only the conversations go into the package.
export const commonConversationsPath='.edukors/ai/common-conversations.json';
export const conversationsPath='.edukors/ai/conversations.json';
export class PackageError extends Error {}
const inflate=promisify(zlib.inflateRaw);
const invalid=()=>new PackageError('This file is not a valid ESF package.');
// Names must mean the same file on macOS, Windows and Linux: no drive letters, reserved characters or trailing dots/spaces.
export function validName(name:string){
  if(!name||name.length>1024||name.startsWith('/'))return false;
  return name.split('/').every(p=>p&&p!=='.'&&p!=='..'&&Buffer.byteLength(p)<=255&&!/[\x00-\x1f\x7f\\:*?"<>|]/.test(p)&&!/[. ]$/.test(p));
}
// Case and Unicode normalization differ between file systems; two names that fold together are ambiguous.
const fold=(name:string)=>name.normalize('NFC').toLowerCase();
function checkNames(names:string[]){
  const files=new Set<string>(),dirs=new Set<string>();
  for(const raw of names){
    const dir=raw.endsWith('/'),name=dir?raw.slice(0,-1):raw;if(!validName(name))throw new PackageError(`Invalid path in package: ${raw}`);
    const key=fold(name),parts=key.split('/');
    for(let i=1;i<parts.length;i++)dirs.add(parts.slice(0,i).join('/'));
    if(dir){dirs.add(key);continue;}
    if(files.has(key))throw new PackageError(`Duplicate path in package: ${raw}`);files.add(key);
  }
  for(const f of files)if(dirs.has(f))throw new PackageError(`Path is both a file and a folder: ${f}`);
}
interface Entry {name:string;raw:Buffer;dir:boolean;method:number;crc:number;csize:number;usize:number;offset:number}
export interface Package {entries:Map<string,Entry>;read(name:string):Promise<Buffer>;close():Promise<void>}
export async function openPackage(file:string):Promise<Package>{
  const fh=await fs.open(file,'r');
  try{
    const size=(await fh.stat()).size,at=async(pos:number,len:number)=>{const b=Buffer.alloc(len);const {bytesRead}=await fh.read(b,0,len,pos);if(bytesRead!==len)throw invalid();return b;};
    if(size<22||(await at(0,4)).readUInt32LE(0)!==0x04034b50)throw invalid();
    const tail=await at(Math.max(0,size-65557),Math.min(size,65557));let eocd=-1;
    for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){eocd=i;break;}
    if(eocd<0)throw invalid();
    const count=tail.readUInt16LE(eocd+10),cdSize=tail.readUInt32LE(eocd+12),cdOffset=tail.readUInt32LE(eocd+16);
    if(tail.readUInt16LE(eocd+4)||tail.readUInt16LE(eocd+6)||count!==tail.readUInt16LE(eocd+8))throw new PackageError('Multi-part ZIP files are not supported.');
    if(count===0xffff||cdOffset===0xffffffff||cdOffset+cdSize>size)throw new PackageError('The package exceeds the supported size.');
    if(count>packageLimits.entries)throw new PackageError(`The package has more than ${packageLimits.entries} files.`);
    const cd=await at(cdOffset,cdSize),entries=new Map<string,Entry>(),order:string[]=[];let p=0,total=0;
    for(let i=0;i<count;i++){
      if(p+46>cd.length||cd.readUInt32LE(p)!==0x02014b50)throw invalid();
      const flags=cd.readUInt16LE(p+8),method=cd.readUInt16LE(p+10),crc=cd.readUInt32LE(p+16),csize=cd.readUInt32LE(p+20),usize=cd.readUInt32LE(p+24);
      const n=cd.readUInt16LE(p+28),x=cd.readUInt16LE(p+30),c=cd.readUInt16LE(p+32),mode=cd.readUInt32LE(p+38)>>>16,offset=cd.readUInt32LE(p+42);
      const raw=cd.subarray(p+46,p+46+n),name=flags&0x800?raw.toString('utf8'):raw.toString('latin1');p+=46+n+x+c;
      if(flags&0x41)throw new PackageError('Encrypted packages are not supported.');
      if(method!==0&&method!==8)throw new PackageError('Unsupported compression in package.');
      if((mode&0o170000)===0o120000)throw new PackageError(`Symbolic links are not allowed in a package: ${name}`);
      if(csize===0xffffffff||usize===0xffffffff||offset===0xffffffff)throw new PackageError('The package exceeds the supported size.');
      if(usize>packageLimits.file)throw new PackageError(`A file in the package exceeds ${packageLimits.file/2**20} MB: ${name}`);
      if((total+=usize)>packageLimits.total)throw new PackageError(`The package exceeds ${packageLimits.total/2**30} GB uncompressed.`);
      const dir=name.endsWith('/');if(entries.has(name))throw new PackageError(`Duplicate path in package: ${name}`);
      entries.set(dir?name.slice(0,-1):name,{name,raw,dir,method,crc,csize,usize,offset});order.push(name);
    }
    checkNames(order);
    // The data is read through the local header, whose name must match the central directory.
    const read=async(name:string)=>{
      const e=entries.get(name);if(!e||e.dir)throw new PackageError(`Missing file in package: ${name}`);
      const h=await at(e.offset,30);if(h.readUInt32LE(0)!==0x04034b50)throw invalid();
      const n=h.readUInt16LE(26),x=h.readUInt16LE(28);if(!(await at(e.offset+30,n)).equals(e.raw))throw invalid();
      const body=await at(e.offset+30+n+x,e.csize);
      // maxOutputLength bounds the bytes actually produced, whatever the header claims.
      const data=e.method===0?body:await inflate(body,{maxOutputLength:Math.max(1,e.usize)}).catch(()=>{throw new PackageError(`Corrupted file in package: ${name}`);});
      if(data.length!==e.usize||zlib.crc32(data)!==e.crc)throw new PackageError(`Corrupted file in package: ${name}`);
      return data;
    };
    return{entries,read,close:()=>fh.close()};
  }catch(e){await fh.close();throw e;}
}
export async function readManifest(pkg:Package){
  const e=pkg.entries.get('manifest.json');if(!e||e.usize>50_000_000)throw invalid();
  let m:any;try{m=JSON.parse((await pkg.read('manifest.json')).toString('utf8'));}catch(err){if(err instanceof PackageError)throw err;throw invalid();}
  if(!m||m.format!=='edukors-slides')throw invalid();
  if(m.packageVersion!==packageVersion||m.schemaVersion!==3||m.runtimeVersion!==1)throw new PackageError('Unsupported ESF version. Original preserved.');
  return m;
}
// Extracts into dest (created here), counting the bytes really written.
export async function extractPackage(file:string,dest:string){
  const pkg=await openPackage(file);
  try{
    const manifest=await readManifest(pkg);let total=0;
    await fs.mkdir(dest,{recursive:true});
    for(const [name,e] of pkg.entries){
      const target=path.join(dest,...name.split('/'));
      if(e.dir){await fs.mkdir(target,{recursive:true});continue;}
      const data=await pkg.read(name);if((total+=data.length)>packageLimits.total)throw new PackageError(`The package exceeds ${packageLimits.total/2**30} GB uncompressed.`);
      await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data,{flag:'wx'});
    }
    return manifest;
  }finally{await pkg.close();}
}
export interface PackEntry {name:string;data?:Buffer|string;file?:string}
export function fileHash(file:string){
  return new Promise<string>((resolve,reject)=>{const h=createHash('sha256');createReadStream(file).on('error',reject).on('data',b=>h.update(b)).on('end',()=>resolve(h.digest('hex')));});
}
