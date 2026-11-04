import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

import {prepare} from './headless-server.mjs';
export async function verifyImportedSave(browser,servers){
  await mkdir('test-results',{recursive:true});
  const fixturePath=path.resolve('test-results/import-save-fixture.mjs');
  await build({entryPoints:['tests/import-save-fixture.ts'],outfile:fixturePath,bundle:true,platform:'node',format:'esm',external:['edukors-common-ux/*']});
  const {importFixtures}=await import(pathToFileURL(fixturePath).href);
  for(const fixture of importFixtures()){
    const context=await browser.newContext();
    try{
      await context.addInitScript(({format,bytes})=>{
        const input={path:'/virtual/Original.'+format,name:'Original',folder:'/virtual',file:'Original.'+format,bytes:Uint8Array.from(bytes)};
        globalThis.__importInput=input;globalThis.__importWrites=[];
        const saved=new Map();
        globalThis.EdukorsDesktop={files:{
          info:async()=>({documents:'/virtual',home:'/virtual',platform:'linux'}),
          open:async()=>({file:input}),recent:async()=>({recent:[]}),forgetRecent:async()=>({}),
          chooseFolder:async()=>({folder:'/virtual'}),reveal:async()=>({}),setDirty:()=>{},onOpened:()=>{},
          save:async(request)=>{
            if(request.extension!=='.eslx')throw Error('A save attempted to write a non-native format.');
            const target=request.folder+'/'+request.name+request.extension;
            if(target===input.path)throw Error('A save attempted to overwrite the input.');
            if(saved.has(target)&&!request.replace)return {exists:true};
            saved.set(target,Array.from(request.bytes));
            globalThis.__importWrites.push({path:target,extension:request.extension,bytes:Array.from(request.bytes)});
            return {path:target,folder:request.folder,file:request.name+request.extension};
          }
        }};
      },fixture);
      await context.addInitScript(prepare,servers.frame);
      const page=await context.newPage();page.setDefaultTimeout(10000);
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(servers.page);
      await page.waitForFunction(()=>!!globalThis.EdukorsAppDocument);
      await page.locator('[data-command="open"]').click();
      await page.waitForFunction(()=>EdukorsDocuments.list().length===1);
      const imported=await page.evaluate(()=>{
        const doc=EdukorsDocuments.active();
        return {saved:doc.saved,path:doc.path,origin:doc.origin,originalSave:doc.originFormat};
      });
      assert.equal(imported.saved,false);assert.ok(!imported.path);
      assert.equal(imported.origin,'/virtual/Original.'+fixture.format);
      assert.ok(!imported.originalSave);
      if(fixture.format==='PPTX'){
        await page.locator('[data-import-report]').waitFor();
        // The notices can be removed (one undo step) and come back with Undo.
        await page.locator('[data-import-dismiss]').click();await page.locator('[data-import-report]').waitFor({state:'detached'});
        await page.locator('#edit-actions [data-command="undo"]').click();await page.locator('[data-import-report]').waitFor();
      }
      await page.locator('[data-command="save"]').click();
      const dialog=page.locator('dialog[open]');
      assert.match(await dialog.innerText(),/\.eslx/);
      await dialog.locator('input[id^="file-name-"]').fill('Converted '+fixture.format);
      await dialog.locator('button.primary:visible').click();
      await dialog.waitFor({state:'detached'});
      const first=await page.evaluate(()=>({path:EdukorsDocuments.active().path,writes:__importWrites.length}));
      assert.equal(first.path,'/virtual/Converted '+fixture.format+'.eslx');assert.equal(first.writes,1);
      await page.locator('[data-command="save"]').click();
      await page.waitForFunction(()=>__importWrites.length===2);
      await page.keyboard.press(process.platform==='darwin'?'Meta+Shift+s':'Control+Shift+s');
      await dialog.waitFor();
      assert.match(await dialog.innerText(),/\.eslx/);
      await dialog.locator('input[id^="file-name-"]').fill('Copy '+fixture.format);
      await dialog.locator('button.primary:visible').click();await dialog.waitFor({state:'detached'});
      const result=await page.evaluate(async()=>({
        path:EdukorsDocuments.active().path,
        input:Array.from(__importInput.bytes),
        formats:__importWrites.map(write=>write.extension),
        content:await EdukorsAppDocument.fromBytes(Uint8Array.from(__importWrites.at(-1).bytes))
      }));
      assert.equal(result.path,'/virtual/Copy '+fixture.format+'.eslx');
      assert.deepEqual(result.formats,['.eslx','.eslx','.eslx']);
      assert.deepEqual(result.input,fixture.bytes);
      assert.equal(result.content.deck.format,'edukors-slides');
      if(fixture.format==='PPTX')assert.equal(result.content.deck.importReport.format,'pptx');
      assert.deepEqual(errors,[]);
      console.log(`Headless ${fixture.format}: Open → Save → Save → Save As writes ESLX only; source unchanged.`);
    }finally{await context.close();}
  }
}
