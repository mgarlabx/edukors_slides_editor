import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';

// An .ESF is a standard ZIP: manifest.json at the root, the folders the app rebuilds from the deck on every save
// (managed) and the assistant's conversations; nothing else from the working folder is packed.
// Compression runs on the libuv thread pool (zlib async), so the main process keeps serving the UI.
export const packageVersion=1;
export const packageLimits={entries:20000,file:512*2**20,total:2*2**30};
// The presentation's system prompt is the one managed file inside ai/.
export const promptPath='ai/system-prompt.md';
export const managedPaths=['manifest.json','masters','layouts','slides','images','fonts',promptPath];
// .edukors/ is the app's working state; only the conversations go into the package.
export const conversationsPath='.edukors/ai/conversations.json';
export class PackageError extends Error {}
const inflate=promisify(zlib.inflateRaw),deflate=promisify(zlib.deflateRaw);
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
// Already compressed formats are stored as they are.
const stored=/\.(png|jpe?g|gif|webp|avif|woff2?|mp4|m4v|mov|webm|mp3|m4a|aac|ogg|zip|gz|pdf|pptx|docx|xlsx|esf)$/i;
function dosTime(d:Date){return{time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};}
// Writes a temporary package next to the target, checks it and only then replaces the target (rename is atomic on
// the same volume), so a failure never truncates the previous version.
export async function writePackage(target:string,entries:PackEntry[]){
  checkNames(entries.map(e=>e.name));
  if(entries.length>packageLimits.entries)throw new PackageError(`The package has more than ${packageLimits.entries} files.`);
  const temp=path.join(path.dirname(target),`.${path.basename(target)}.${randomUUID().slice(0,8)}.tmp`);
  const fh=await fs.open(temp,'wx'),{time,date}=dosTime(new Date()),central:Buffer[]=[];let offset=0,total=0,closed=false;
  try{
    for(const e of entries){
      const data=typeof e.data==='string'?Buffer.from(e.data):e.data??await fs.readFile(e.file!);
      if(data.length>packageLimits.file)throw new PackageError(`A file exceeds ${packageLimits.file/2**20} MB: ${e.name}`);
      if((total+=data.length)>packageLimits.total)throw new PackageError(`The presentation exceeds ${packageLimits.total/2**30} GB.`);
      let body=data,method=0;
      if(data.length>64&&!stored.test(e.name)){const z=await deflate(data,{level:6});if(z.length<data.length){body=z;method=8;}}
      const name=Buffer.from(e.name,'utf8'),crc=zlib.crc32(data),h=Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(method,8);h.writeUInt16LE(time,10);h.writeUInt16LE(date,12);
      h.writeUInt32LE(crc,14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
      const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(0x0314,4);h.copy(c,6,4,30);c.writeUInt32LE((0o100644<<16)>>>0,38);c.writeUInt32LE(offset,42);
      central.push(c,name);await fh.write(Buffer.concat([h,name]));await fh.write(body);offset+=30+name.length+body.length;
      if(offset>=0xffffffff)throw new PackageError('The presentation exceeds the supported size.');
    }
    const cd=Buffer.concat(central),end=Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
    await fh.write(Buffer.concat([cd,end]));await fh.sync();await fh.close();closed=true;
    const check=await openPackage(temp);
    try{if(check.entries.size!==entries.length)throw new PackageError('The written package is incomplete.');await readManifest(check);}finally{await check.close();}
    await fs.rename(temp,target);
  }catch(e){if(!closed)await fh.close().catch(()=>{});await fs.rm(temp,{force:true});throw e;}
}
export function fileHash(file:string){
  return new Promise<string>((resolve,reject)=>{const h=createHash('sha256');createReadStream(file).on('error',reject).on('data',b=>h.update(b)).on('end',()=>resolve(h.digest('hex')));});
}
