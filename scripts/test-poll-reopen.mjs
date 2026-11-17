// Exported player in headless Chrome with the poll service mocked: a word-cloud round is started and closed, the
// page is reopened, and the remembered round still shows its results (the cloud) and the CSV button.
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('test-results/poll-reopen-'+Date.now());await fs.mkdir(root,{recursive:true});
await build({entryPoints:['tests/poll-reopen-fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'fixture.mjs'),logLevel:'error'});
const {exported}=await import(pathToFileURL(path.join(root,'fixture.mjs')).href),file=path.join(root,'deck.html');await fs.writeFile(file,exported);
const KEY='EDK-TEST-KEY1-2345',words=['aprendizagem','futuro','ética','personalização','criatividade','medo','ferramenta','autonomia','inovação','curiosidade','desafio','produtividade','plágio','tutoria','oportunidade','pensamento crítico','dados','privacidade','feedback','letramento','colaboração','avaliação','acesso','equidade','prompt','professor','curadoria','revolução','pesquisa','empatia'];
const room={id:'LXLCDU',status:0,rows:words.map((response,i)=>({response,responses:Math.max(1,Math.round(23/(1+i*.6)))}))},calls=[];
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const context=await browser.newContext({viewport:{width:1600,height:900}});
  await context.route('https://poll.example.org/q.php',async route=>{
    const cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'POST'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    const b=JSON.parse(route.request().postData());calls.push(b.proc);
    const data=b.proc==='auth'?(b.key===KEY?{token:'a'.repeat(64),expiresAt:Date.now()+12*3600e3}:null):b.proc==='prepare'?{room:room.id,url:'https://poll.example.org/r/?room='+room.id}
      :b.proc==='open'?(room.status=1,'ok'):b.proc==='close'?(room.status=0,'ok'):b.proc==='count'?{status:room.status,responses:196}:b.proc==='results'?room.rows
      :b.proc==='export'?{type:'tag',meta:0,rows:[{response:'futuro',at:'2026-11-17T14:31:02Z'}]}:null;
    await route.fulfill({status:data?200:401,headers:{...cors,'content-type':'application/json'},body:JSON.stringify(data?{data}:{error:'invalid_key'})});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const active=()=>page.frameLocator('#stage > .frame.on');
  await page.goto(pathToFileURL(file).href);await active().locator('h1').waitFor();await page.keyboard.press('ArrowRight');
  await active().locator('.poll-lock').click();await page.locator('#poll-key-input').fill(KEY);await page.locator('#poll-key-input').press('Enter');
  await active().locator('.poll-live:not([hidden])').waitFor();await active().locator('.poll-actions .poll-lock').dispatchEvent('click');
  await active().locator('[data-poll=results]:not([hidden])').waitFor();
  const kept=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('esf-poll-room:')).map(k=>JSON.parse(localStorage.getItem(k))));
  assert.equal(kept.length,1);assert.equal(kept[0].room,'LXLCDU');assert.ok(!JSON.stringify(kept).includes(KEY),'never the key');
  // Reopen: the slide comes back closed (no lock), with results and CSV, and draws the cloud.
  await page.reload();// the player itself comes back to the slide where it was
  await active().locator('.esf-poll').waitFor();
  await active().locator('[data-poll=results]:not([hidden])').waitFor();assert.ok(await active().locator('.poll-csv').isVisible(),'CSV after reopening');
  assert.equal(await active().locator('.poll-code .poll-lock').isVisible(),false,'a finished round has no lock');
  await active().locator('[data-poll=results]').dispatchEvent('click');await active().locator('.poll-cloud-svg text').first().waitFor();
  assert.equal(await active().locator('.poll-cloud-svg text').count(),words.length);await page.waitForTimeout(1600);
  // No word leaves the cloud area.
  const boxes=await active().locator('.poll-cloud').evaluate(c=>{const r=c.getBoundingClientRect();return{area:[r.left,r.top,r.right,r.bottom],words:[...c.querySelectorAll('text')].map(t=>{const b=t.getBoundingClientRect();return[b.left,b.top,b.right,b.bottom];})};});
  await page.screenshot({path:path.join(root,'cloud.png')});// SVG text boxes include the font's ascent and descent space, beyond the glyphs: allow a fifth of the box.
  for(const [l,t,r,b] of boxes.words){const m=Math.min(b-t,r-l)/5;assert.ok(l>=boxes.area[0]-m&&t>=boxes.area[1]-m&&r<=boxes.area[2]+m&&b<=boxes.area[3]+m,'inside the area '+JSON.stringify([boxes.area,[l,t,r,b]]));}
  const [download]=await Promise.all([page.waitForEvent('download'),active().locator('.poll-csv').dispatchEvent('click')]);assert.match(download.suggestedFilename(),/^responses-LXLCDU-/);
  assert.deepEqual(errors,[]);
  console.log('Poll reopen passed: round remembered, results and CSV after reopening, word cloud inside its area. '+path.join(root,'cloud.png'));
}finally{await browser.close();}
