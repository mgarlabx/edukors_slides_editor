// Store screenshots: the editor on the system this runs on (the Microsoft Store wants Windows), in pt, en and es, with a
// sample class (scripts/store-sample.ts). The assistant uses the AI library's fake provider; no real account is used.
// Run after node scripts/build.mjs --no-bump. Output: test-results/store-screenshots/<lang>/*.png
import {_electron as electron} from 'playwright';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),[width,height]=[1920,1080];
const out=path.resolve('test-results/store-screenshots'),fake=path.resolve('node_modules/@edukors/ai-cli/fixtures/fake-ai.mjs');
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
await build({entryPoints:['scripts/store-sample.ts'],bundle:true,platform:'node',target:'node22',format:'esm',outfile:path.join(out,'sample.mjs'),external:['@edukors/ai-cli','electron'],logLevel:'warning'});
const sample=await import(pathToFileURL(path.join(out,'sample.mjs')).href);
const {createAiCli}=await import('@edukors/ai-cli'),{createFakeProvider}=await import('@edukors/ai-cli/testing');
const account={pt:'Minha conta',en:'My account',es:'Mi cuenta'};
const settle=page=>page.waitForTimeout(1500);
// Hidden windows paint on the Mac (and nobody wants them popping up there), but not on Windows or Linux.
const visible=process.platform!=='darwin';
for(const lang of ['pt','en','es']){
  const root=path.join(out,lang),data=path.join(root,'appdata');await fs.mkdir(data,{recursive:true});
  // An account of the fake provider, signed in, as the one in use.
  const ai=createAiCli({appId:'slides',dataDir:path.join(data,'edukors-ai'),providers:[createFakeProvider({command:{file:process.execPath,args:[fake]}})]});
  const acc=await ai.createAccount({providerId:'fake',label:account[lang]});await ai.connectAccount(acc.id);await ai.dispose();
  await fs.writeFile(path.join(data,'preferences.json'),JSON.stringify({language:lang,recent:[],aiAccount:acc.id}));
  const file=path.join(root,...sample.sampleFile(lang));await fs.mkdir(path.dirname(file),{recursive:true});const deck=await sample.writeSample(file,lang,acc.id);
  const env={...process.env,ESF_DATA_DIR:data,ESF_AI_FAKE:fake,ESF_HIDDEN:visible?'':'1',ESF_NO_UPDATES:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:require('electron'),args:['.',file],env,timeout:60000});
  try{
    const page=await app.firstWindow(),command=name=>app.evaluate(({BrowserWindow},name)=>BrowserWindow.getAllWindows()[0].webContents.send('command',name),name);
    // Windows keeps a window inside its work area (no taskbar, no frame): full screen gives the whole 1920×1080 display.
    await app.evaluate(({BrowserWindow},[w,h,full])=>{const win=BrowserWindow.getAllWindows()[0];if(full)win.setFullScreen(true);else{win.setContentSize(w,h);win.center();}},[width,height,visible]);await page.waitForTimeout(1500);
    const shot=async name=>{await settle(page);await page.screenshot({path:path.join(root,name)});const s=await page.evaluate(()=>[innerWidth,innerHeight]);console.log(`${lang}/${name}: ${s.join('×')}`);};
    const slide=async n=>{await page.locator('.slide-item button').nth(n).click();await page.locator('.slide-canvas iframe').waitFor();};
    await page.locator('.tab').first().waitFor();await page.locator('.chat-list').getByText(sample.sampleDeck(lang).title,{exact:false}).count();
    // 1. The assistant beside the slides it made, with the conversation that made them.
    await slide(1);await page.frameLocator('.slide-canvas iframe').locator('.card').first().waitFor();await page.locator('.chat-list .chat-notice, .chat-list p').last().waitFor();
    await shot('01-assistant.png');
    // 2. The editor on the cover, the assistant closed.
    await command('ai');await slide(0);await page.frameLocator('.slide-canvas iframe').locator('h1').waitFor();await shot('02-editor.png');
    // 3. The slide master: bases and layouts.
    await command('master');await page.locator('.slide-rail').waitFor();await shot('03-master.png');await command('master');
    // 4. An interactive question on its slide.
    await slide(3);await shot('04-question.png');
    // 5. The exported HTML, presenting the cards slide.
    const html=path.join(root,'presentation.html');await fs.writeFile(html,sample.exportedHtml(deck));
    const opened=app.waitForEvent('window');
    await app.evaluate(({BrowserWindow},[file,w,h,show])=>{const win=new BrowserWindow({useContentSize:true,width:w,height:h,show,fullscreen:show});win.loadFile(file);},[html,width,height,visible]);
    // The cards slide, with its three cards revealed (each is a step).
    const player=await opened;await player.waitForLoadState('load');await player.waitForTimeout(1000);for(let i=0;i<4;i++){await player.keyboard.press('ArrowRight');await player.waitForTimeout(500);}await player.waitForTimeout(2000);
    await player.screenshot({path:path.join(root,'05-presenting.png')});console.log(`${lang}/05-presenting.png: ${(await player.evaluate(()=>[innerWidth,innerHeight])).join('×')}`);
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
console.log('Store screenshots in',out);
