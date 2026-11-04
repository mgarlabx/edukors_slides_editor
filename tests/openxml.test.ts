import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8} from 'fflate';
import {createRasterPptx} from '../src/shared/pptx-raster';
import {readPresentationPackage,serializeOfficeXml,OFFICE_REL} from '../src/shared/openxml';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const fixture=()=>createRasterPptx([png],'OOXML preservation');

test('PPTX package reading resolves presentation/slides/media and preserves unknown XML parts',async()=>{
  const original=await readPresentationPackage(fixture());
  assert.equal(original.main,'ppt/presentation.xml');
  assert.ok(original.relationships(original.main).some(relation=>relation.type===OFFICE_REL+'/slide'));
  assert.deepEqual(original.parts.get('ppt/media/image1.png'),png);
  const opaque=strToU8('<custom xmlns="urn:opaque">Untouched extension payload</custom>');
  const parts=new Map(original.parts);parts.set('customXml/opaque.xml',opaque);
  const encoded=zipSync(Object.fromEntries(parts)),reopened=await readPresentationPackage(encoded);
  assert.deepEqual(reopened.parts.get('customXml/opaque.xml'),opaque);
  assert.deepEqual(reopened.parts.get('ppt/media/image1.png'),png);
});

test('PPTX external relationships remain inert data',async()=>{
  const original=await readPresentationPackage(fixture()),parts=new Map(original.parts);
  const relationships=original.xml('_rels/.rels').cloneNode(true) as Document;
  const external=relationships.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships','Relationship');
  external.setAttribute('Id','rExternal');external.setAttribute('Type',OFFICE_REL+'/hyperlink');
  external.setAttribute('Target','https://example.invalid/not-fetched');external.setAttribute('TargetMode','External');
  relationships.documentElement.appendChild(external);parts.set('_rels/.rels',serializeOfficeXml(relationships));
  const reopened=await readPresentationPackage(zipSync(Object.fromEntries(parts)));
  assert.deepEqual(reopened.relationships('').find(relation=>relation.id==='rExternal'),{id:'rExternal',type:OFFICE_REL+'/hyperlink',target:'https://example.invalid/not-fetched',external:true});
});

test('PPTX package reading rejects entity declarations, missing targets and macro presentations',async()=>{
  const entries=unzipSync(fixture()),decoder=new TextDecoder();
  const badXml={...entries,'ppt/presentation.xml':strToU8('<!DOCTYPE p:presentation [<!ENTITY x SYSTEM "file:///private-data">]><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')};
  await assert.rejects(()=>readPresentationPackage(zipSync(badXml)),/DTD and entities/);
  const missing={...entries};delete missing['ppt/media/image1.png'];
  await assert.rejects(()=>readPresentationPackage(zipSync(missing)),/Missing relationship target/);
  const macro={...entries,'[Content_Types].xml':strToU8(decoder.decode(entries['[Content_Types].xml']).replace('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml','application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml'))};
  await assert.rejects(()=>readPresentationPackage(zipSync(macro)),/non-macro/);
});
