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
  const group='<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Unsupported table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"/></a:graphic></p:graphicFrame>';
  entries['ppt/slides/slide1.xml']=strToU8(strFromU8(entries['ppt/slides/slide1.xml']).replace('</p:spTree>',group+'</p:spTree>'));
  const bytes=zipSync(entries),result=await importPptx(bytes);
  assert.ok(result.issues.some(issue=>issue.objectId==='5'&&issue.code==='unsupported-object'));
  assert.match(result.deck.slides[0].html,/data-pptx-unsupported="graphicFrame"/);
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

test('PPTX backgrounds, master pictures, groups and preset shapes are imported; text is never clipped',async()=>{
  const entries=unzipSync(fixture()),slide='ppt/slides/slide1.xml',layout='ppt/slideLayouts/slideLayout1.xml',master='ppt/slideMasters/slideMaster1.xml';
  const edit=(name:string,fn:(x:string)=>string)=>{entries[name]=strToU8(fn(strFromU8(entries[name])));};
  edit(layout,x=>x.replace('<p:cSld name="Blank">','<p:cSld name="Blank"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="E6EAEB"/></a:solidFill></p:bgPr></p:bg>'));
  edit(master,x=>x.replace('<p:cSld>','<p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></p:bgPr></p:bg>').replace('</p:spTree>','<p:sp><p:nvSpPr><p:cNvPr id="9" name="Corner"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr></p:sp></p:spTree>'));
  const star='<p:sp><p:nvSpPr><p:cNvPr id="7" name="Star"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="irregularSeal1"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFF00"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:r><a:rPr sz="1200"/><a:t>11/Dez</a:t></a:r></a:p></p:txBody></p:sp>';
  const group=`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="6" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1828800" y="0"/><a:ext cx="1828800" cy="1828800"/><a:chOff x="0" y="0"/><a:chExt cx="914400" cy="914400"/></a:xfrm></p:grpSpPr>${star}</p:grpSp>`;
  edit(slide,x=>x.replace('<p:cSld>','<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="2E2640"/></a:solidFill></p:bgPr></p:bg>').replace('</p:spTree>',group+shape+'</p:spTree>'));
  const {deck}=await importPptx(zipSync(entries)),s=deck.slides[0];
  assert.equal(deck.masters.length,1);assert.match(deck.masters[0].css,/\.slide\{background:#FFFFFF\}/);
  assert.match(deck.masters[0].html,/data-manual="shape" data-shape="ellipse"/);
  assert.match(deck.layouts[0].css||'',/background:#E6EAEB/);assert.equal(s.layoutId,deck.layouts[0].id);
  assert.match(s.css,/background:#2E2640/);
  // The group doubles its child: the 100 px star becomes 200 px wide, placed at 200 px.
  assert.match(s.html,/data-shape="pptx" data-pptx-id="7" style="position:absolute;left:200px;top:0px;width:200px;height:200px;"><svg[^>]*><path data-shape-part d="M/);
  assert.match(s.html,/data-pptx-id="7-text"[^>]*>.*11\/Dez/);
  assert.doesNotMatch(s.html,/overflow:hidden/);
  assert.doesNotMatch(deck.masters[0].css,/line-height:1\.5/);
});
