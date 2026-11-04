// Real Electron IPC round trip, with isolated app data and no real AI account.
import { _electron as electron } from 'playwright';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
const require=createRequire(import.meta.url),root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'slides-eslx-')));
const env={...process.env,ESF_DATA_DIR:path.join(root,'data'),ESF_ACCEPT_TERMS:'1',ESF_HIDDEN:'1',ESF_NO_UPDATES:'1'};delete env.ELECTRON_RUN_AS_NODE;
if(process.env.EDUKORS_ALLOW_VISIBLE_TESTS!=='1')throw Error('Interactive Electron tests disabled. Set EDUKORS_ALLOW_VISIBLE_TESTS=1 only during an agreed visual test window.');
const app=await electron.launch({executablePath:require('electron'),args:['.'],env});
try{
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.api);
 const target=path.join(root,'presentation.eslx');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},target);
 const created=await page.evaluate(()=>window.api.invoke('create','ESLX smoke','blank'));
 const saved=await page.evaluate(deck=>window.api.invoke('saveAs',deck),created.deck);
 assert.equal(saved.path,target);assert.ok(unzipSync(await fs.readFile(target))['[Content_Types].xml']);
 await page.evaluate(id=>window.api.invoke('close',id),saved.deck.id);
 const opened=await page.evaluate(file=>window.api.invoke('open',file),target);
 assert.equal(opened.deck.title,'presentation');
 const edited=await page.evaluate(async deck=>{deck.title='Edited through Electron';return window.api.invoke('save',deck);},opened.deck);
 assert.equal(edited.deck.title,'Edited through Electron');
 await page.evaluate(id=>window.api.invoke('close',id),edited.deck.id);
 const reopened=await page.evaluate(file=>window.api.invoke('open',file),target);
 assert.equal(reopened.deck.title,'Edited through Electron');
 await page.evaluate(id=>window.api.invoke('close',id),reopened.deck.id);
 console.log('ESLX Electron smoke passed: save as, OPC package, open, edit, save, reopen.');
}finally{await app.close();await fs.rm(root,{recursive:true,force:true});}
