import {DOMParser as XmlParser,XMLSerializer} from '@xmldom/xmldom';
import 'edukors-common-ux/src/package/package.js';

const packageLayer=(globalThis as any).EdukorsPackage;
const decoder=new TextDecoder('utf-8',{fatal:true});
const encoder=new TextEncoder();
const PACKAGE_REL='http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES='http://schemas.openxmlformats.org/package/2006/content-types';
export const OFFICE_REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const STRICT_OFFICE_REL='http://purl.oclc.org/ooxml/officeDocument/relationships';
export const PRESENTATION_NS='http://schemas.openxmlformats.org/presentationml/2006/main';
export const DRAWING_NS='http://schemas.openxmlformats.org/drawingml/2006/main';
const MAIN_TYPE='application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
const MAX_XML_BYTES=16*2**20;

export interface OfficeRelationship {id:string;type:string;target:string;external:boolean}
export interface PresentationPackage {
  parts:Map<string,Uint8Array>;
  main:string;
  contentTypes:Map<string,string>;
  xml(name:string):Document;
  relationships(owner:string):readonly OfficeRelationship[];
}
export const children=(node:Node,localName?:string):Element[]=>Array.from(node.childNodes)
  .filter((child):child is Element=>child.nodeType===1)
  .filter(child=>!localName||child.localName===localName);
export function descendants(node:Element|Document,localName:string,namespace?:string):Element[]{
  return Array.from(node.getElementsByTagName('*')).filter(element=>element.localName===localName&&(!namespace||element.namespaceURI===namespace));
}
export function parseOfficeXml(bytes:Uint8Array,name='XML part'):Document{
  if(bytes.byteLength>MAX_XML_BYTES)throw Error(`XML part is too large: ${name}`);
  const text=decoder.decode(bytes);
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text))throw Error(`DTD and entities are not allowed: ${name}`);
  let invalid=false;
  const document=new XmlParser({errorHandler:()=>{invalid=true;}}).parseFromString(text,'application/xml');
  if(invalid||!document?.documentElement||document.getElementsByTagName('parsererror').length)throw Error(`Malformed XML: ${name}`);
  return document;
}
export const serializeOfficeXml=(document:Node)=>encoder.encode(new XMLSerializer().serializeToString(document));
const directory=(name:string)=>name.includes('/')?name.slice(0,name.lastIndexOf('/')):'';
const relationshipPart=(owner:string)=>owner?`${directory(owner)?directory(owner)+'/':''}_rels/${owner.slice(owner.lastIndexOf('/')+1)}.rels`:'_rels/.rels';
const ownerOf=(name:string)=>name==='_rels/.rels'?'':name.replace(/(^|\/)\_rels\//,'$1').slice(0,-5);

function resolveTarget(owner:string,target:string){
  if(/%(?:2f|5c)/i.test(target))throw Error('Encoded separators are not allowed in package relationships.');
  let decoded:string;
  try{decoded=decodeURIComponent(target);}catch{throw Error('Invalid relationship target encoding.');}
  return packageLayer.resolveTarget(directory(owner),decoded);
}

/** Reads PPTX as data only. External relationships are recorded, never fetched or executed. */
export async function readPresentationPackage(bytes:Uint8Array):Promise<PresentationPackage>{
  const entries=await packageLayer.unzip(bytes);
  const parts=new Map<string,Uint8Array>(entries.map((entry:any)=>[entry.name,entry.bytes]));
  const xmlCache=new Map<string,Document>();
  const xml=(name:string)=>{
    let document=xmlCache.get(name);
    if(!document){const data=parts.get(name);if(!data)throw Error(`Missing PPTX part: ${name}`);document=parseOfficeXml(data,name);xmlCache.set(name,document);}
    return document;
  };
  const root=xml('[Content_Types].xml').documentElement;
  if(root.localName!=='Types'||root.namespaceURI!==TYPES)throw Error('Invalid PPTX content types.');
  const defaults=new Map<string,string>(),overrides=new Map<string,string>();
  for(const element of children(root)){
    if(element.namespaceURI!==TYPES)throw Error('Invalid PPTX content type namespace.');
    const type=element.getAttribute('ContentType');
    if(!type)throw Error('A PPTX part has no content type.');
    if(element.localName==='Default'){
      const extension=(element.getAttribute('Extension')||'').toLowerCase();
      if(!extension||defaults.has(extension))throw Error('Duplicate or missing PPTX default content type.');
      defaults.set(extension,type);
    }else if(element.localName==='Override'){
      const name=element.getAttribute('PartName')||'';
      if(!name.startsWith('/'))throw Error('Invalid PPTX content type part name.');
      const target=resolveTarget('',name);
      if(overrides.has(target)||!parts.has(target))throw Error('Duplicate or missing PPTX content type part.');
      overrides.set(target,type);
    }else throw Error('Unknown PPTX content type declaration.');
  }
  const contentTypes=new Map<string,string>();
  for(const name of parts.keys()){
    if(name==='[Content_Types].xml')continue;
    const type=overrides.get(name)||defaults.get(name.slice(name.lastIndexOf('.')+1).toLowerCase());
    if(!type)throw Error(`Missing content type for PPTX part: ${name}`);
    contentTypes.set(name,type);
  }
  const relCache=new Map<string,readonly OfficeRelationship[]>();
  const relationships=(owner:string):readonly OfficeRelationship[]=>{
    let list=relCache.get(owner);
    if(list)return list;
    const name=relationshipPart(owner);
    if(!parts.has(name))return [];
    const root=xml(name).documentElement;
    if(root.localName!=='Relationships'||root.namespaceURI!==PACKAGE_REL)throw Error(`Invalid PPTX relationships: ${name}`);
    const seen=new Set<string>();
    list=children(root).map(element=>{
      const id=element.getAttribute('Id'),type=element.getAttribute('Type'),raw=element.getAttribute('Target'),mode=element.getAttribute('TargetMode');
      if(element.localName!=='Relationship'||element.namespaceURI!==PACKAGE_REL||!id||!type||!raw||seen.has(id)||mode&&mode!=='External'&&mode!=='Internal')throw Error(`Invalid or duplicate PPTX relationship: ${name}`);
      seen.add(id);
      const external=mode==='External',target=external?raw:resolveTarget(owner,raw);
      if(!external&&!parts.has(target))throw Error(`Missing relationship target: ${target}`);
      return Object.freeze({id,type,target,external});
    });
    Object.freeze(list);relCache.set(owner,list);
    return list;
  };
  for(const name of parts.keys())if(/(^|\/)\_rels\/[^/]+\.rels$/.test(name))relationships(ownerOf(name));
  const mainRelations=relationships('').filter(relation=>[OFFICE_REL+'/officeDocument',STRICT_OFFICE_REL+'/officeDocument'].includes(relation.type));
  if(mainRelations.length!==1||mainRelations[0].external)throw Error('PPTX must have one internal presentation part.');
  const main=mainRelations[0].target;
  if(contentTypes.get(main)!==MAIN_TYPE)throw Error('Only non-macro PPTX presentations are supported.');
  const presentation=xml(main).documentElement;
  if(presentation.localName!=='presentation'||![PRESENTATION_NS,'http://purl.oclc.org/ooxml/presentationml/main'].includes(presentation.namespaceURI||''))throw Error('Invalid PPTX presentation part.');
  return {parts,main,contentTypes,xml,relationships};
}

