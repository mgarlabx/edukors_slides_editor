import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {createRasterPptx} from '../src/shared/pptx-raster';
import {importPptx} from '../src/shared/pptx-import';
import {validateDeck} from '../src/shared/model';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const fixture=()=>createRasterPptx([png],'PowerPoint fixture');
const shape=`<p:sp><p:nvSpPr><p:cNvPr id="3" name="Editable title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="5486400" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="2400" b="1" i="1"><a:solidFill><a:srgbClr val="123456"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>PowerPoint &amp; edits</a:t></a:r></a:p></p:txBody></p:sp>`;

test('PPTX importer keeps raster exports as images and does not modify the original package',async()=>{
  const original=fixture(),before=original.slice(),result=await importPptx(original,'Imported PowerPoint');
  validateDeck(result.deck);
  assert.equal(result.deck.slides.length,1);
  assert.equal(result.deck.assets.length,1);
  assert.deepEqual(Buffer.from(result.deck.assets[0].data,'base64'),Buffer.from(png));
  assert.match(result.deck.slides[0].html,/<img data-manual="image"/);
  assert.match(result.deck.slides[0].html,/data-pptx-slide-id="256"/);
  assert.deepEqual(original,before);
});

test('PPTX importer creates editable text with positions, rich styles and alignment',async()=>{
  const entries=unzipSync(fixture());
  entries['ppt/slides/slide1.xml']=strToU8(strFromU8(entries['ppt/slides/slide1.xml']).replace('</p:spTree>',shape+'</p:spTree>'));
  const result=await importPptx(zipSync(entries)),html=result.deck.slides[0].html;
  assert.match(html,/data-manual="text" data-pptx-id="3"/);
  assert.match(html,/left:100px;top:100px;/);
  assert.match(html,/PowerPoint &amp; edits/);
  assert.match(html,/font-weight:700/);assert.match(html,/font-style:italic/);
  assert.match(html,/color:#123456/);assert.match(html,/text-align:center/);
  assert.match(html,/font-size:33\.333px/);
});

test('PPTX unsupported objects are reported and their original XML is retained',async()=>{
  const entries=unzipSync(fixture());
  const group='<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="Unsupported group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/><a:chOff x="0" y="0"/><a:chExt cx="914400" cy="914400"/></a:xfrm></p:grpSpPr></p:grpSp>';
  entries['ppt/slides/slide1.xml']=strToU8(strFromU8(entries['ppt/slides/slide1.xml']).replace('</p:spTree>',group+'</p:spTree>'));
  const bytes=zipSync(entries),result=await importPptx(bytes);
  assert.ok(result.issues.some(issue=>issue.objectId==='5'&&issue.code==='unsupported-object'));
  assert.match(result.deck.slides[0].html,/data-pptx-unsupported="grpSp"/);
  assert.deepEqual(unzipSync(bytes)['ppt/slides/slide1.xml'],entries['ppt/slides/slide1.xml']);
});

test('PPTX linked images are never downloaded and remain explicitly unsupported',async()=>{
  const entries=unzipSync(fixture());
  entries['ppt/slides/_rels/slide1.xml.rels']=strToU8(strFromU8(entries['ppt/slides/_rels/slide1.xml.rels']).replace('Target="../media/image1.png"','Target="https://example.invalid/never-fetch.png" TargetMode="External"'));
  const result=await importPptx(zipSync(entries));
  assert.equal(result.deck.assets.length,0);
  assert.ok(result.issues.some(issue=>issue.code==='unsupported-image'));
  assert.match(result.deck.slides[0].html,/data-pptx-unsupported/);
});
