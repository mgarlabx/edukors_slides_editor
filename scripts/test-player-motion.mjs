// Transitions and animations in headless Chrome (no window): the exported player (transitions, click / with / after,
// exits, going back, data-step reveals) and the editing operations of motion.ts.
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('test-results/player-motion-'+Date.now());
await fs.mkdir(root,{recursive:true});
await build({entryPoints:['tests/player-motion-fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'fixture.mjs'),logLevel:'error',external:['edukors-common-ux','edukors-common-ux/*']});
await build({entryPoints:['tests/motion-browser.ts'],bundle:true,platform:'browser',format:'iife',outfile:path.join(root,'motion.js'),logLevel:'error'});
const {exported,minified,grouped}=await import(pathToFileURL(path.join(root,'fixture.mjs')).href);
const file=path.join(root,'deck.html');await fs.writeFile(file,exported);
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  const frame=()=>page.frameLocator('#stage > .frame.on');
  const hidden=async id=>frame().locator('#'+id).evaluate(el=>el.hasAttribute('data-esf-hidden'));
  const settle=ms=>page.waitForTimeout(ms);
  await frame().locator('h1').filter({hasText:'Motion 1'}).waitFor();
  assert.equal(await page.evaluate(()=>document.body.dataset.step),'0/2','two clicks: the first entrance and the exit');
  assert.ok(await hidden('a')&&await hidden('b')&&await hidden('c'),'entrances wait for their click');
  await settle(1100);
  assert.ok(!await hidden('auto'),'the effect before the first click plays by itself');
  assert.equal(await frame().locator('#auto').evaluate(el=>getComputedStyle(el).opacity),'0.8','its own (important) opacity is back');
  await page.keyboard.press('ArrowRight');
  await settle(60);
  assert.ok(!await hidden('a')&&!await hidden('b')&&!await hidden('c'),'click, with and after start together in one step');
  const during=await frame().locator('#c').evaluate(el=>el.getBoundingClientRect().top);
  await settle(900);
  const box=await frame().locator('#c').evaluate(el=>({top:el.getBoundingClientRect().top,translate:getComputedStyle(el).translate,anims:el.getAnimations().length}));
  assert.ok(during>box.top+50,'"after" waits below the slide before sliding up');
  assert.equal(box.translate,'10px 20px','the object ends where it was moved');assert.equal(box.anims,0);
  assert.equal(await page.evaluate(()=>document.body.dataset.step),'1/2');
  await page.keyboard.press('ArrowRight');await settle(700);
  assert.ok(await hidden('d'),'the exit hides the object at the end');
  await page.keyboard.press('ArrowLeft');await settle(200);
  assert.ok(!await hidden('d')&&!await hidden('a'),'going back one step shows it again');
  // Forward to slide 2: its split transition plays on the incoming frame.
  await page.keyboard.press('ArrowRight');await settle(400);await page.keyboard.press('ArrowRight');
  await frame().locator('h1').filter({hasText:'Motion 2'}).waitFor();
  const moving=await page.evaluate(()=>[...document.querySelectorAll('#stage > .frame')].map(f=>({on:f.classList.contains('on'),anims:f.getAnimations().map(a=>a.effect.getKeyframes().map(k=>k.clipPath||'').join('|'))})));
  assert.ok(moving.some(f=>f.anims.some(a=>/inset\(0(px)? 50%/.test(a))),'the split transition animates the slide coming in: '+JSON.stringify(moving));
  await settle(800);
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#stage > .frame')].map(f=>getComputedStyle(f).opacity).sort()),['0','1'],'the previous slide leaves when the transition ends');
  // Slide 3: data-step reveals stay as they were (class .pending), and Appear's opposite hides at once.
  await page.keyboard.press('ArrowRight');await frame().locator('h1').filter({hasText:'Motion 3'}).waitFor();await settle(500);
  assert.ok(await frame().locator('#legacy').evaluate(el=>el.classList.contains('pending')));
  await page.keyboard.press('ArrowRight');await settle(100);
  assert.ok(!await frame().locator('#legacy').evaluate(el=>el.classList.contains('pending')),'the data-step reveal comes first');
  await page.keyboard.press('ArrowRight');await settle(150);assert.ok(await hidden('x'),'Disappear');
  // Back to slide 2 then 1: slide 1 opens at its end (every step done).
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await frame().locator('h1').filter({hasText:'Motion 2'}).waitFor();
  await page.keyboard.press('ArrowLeft');await frame().locator('h1').filter({hasText:'Motion 1'}).waitFor();await settle(300);
  assert.equal(await page.evaluate(()=>document.body.dataset.step),'2/2');assert.ok(await hidden('d')&&!await hidden('a'));
  assert.deepEqual(errors,[]);
  // The exported file (minified scripts) plays the same sequence (the session saved above is cleared first).
  await page.evaluate(()=>localStorage.clear());
  const small=path.join(root,'deck.min.html');await fs.writeFile(small,minified);
  await page.goto(pathToFileURL(small).href);await frame().locator('h1').filter({hasText:'Motion 1'}).waitFor();await settle(1100);
  assert.ok(!await hidden('auto')&&await hidden('a'));await page.keyboard.press('ArrowRight');await settle(900);assert.ok(!await hidden('c'));
  assert.deepEqual(errors,[]);

  // A group animates as one effect: one click for both members, zooming around the group's center.
  await page.evaluate(()=>localStorage.clear());
  const groupFile=path.join(root,'group.html');await fs.writeFile(groupFile,grouped);
  await page.goto(pathToFileURL(groupFile).href);await frame().locator('h1').filter({hasText:'Group'}).waitFor();await settle(1100);
  assert.equal(await page.evaluate(()=>document.body.dataset.step),'0/2','the group is one click, the other object another');
  await page.keyboard.press('ArrowRight');await settle(100);
  const members=await frame().locator('[data-group-id]').evaluateAll(list=>list.map(el=>({hidden:el.hasAttribute('data-esf-hidden'),origin:el.getAnimations()[0]?.effect.getKeyframes()[0].transformOrigin})));
  assert.ok(members.every(m=>!m.hidden),'both members enter on the same click');
  assert.deepEqual(members.map(m=>m.origin),['300px 100px','-100px 100px'],'they zoom around the group\'s center');
  assert.ok(await hidden('solo'),'the next object waits for its own click');
  assert.deepEqual(errors,[]);

  // Editing operations (browser DOMParser).
  const editor=await browser.newPage();await editor.goto('about:blank');await editor.addScriptTag({path:path.join(root,'motion.js')});
  const r=await editor.evaluate(()=>{
    const {setAnimation,animationsAt,appendAnimations}=motion;
    let s={id:'s-1',title:'',layoutId:'l',html:'<section class="slide"><p data-step>old</p><div>A</div><div>B</div><div data-from-layout=""><span>L</span></div></section>',css:'',script:'',staticHtml:'x',notes:''};
    const out={};
    const idx=t=>[...new DOMParser().parseFromString(s.html,'text/html').body.querySelectorAll('*')].findIndex(e=>e.textContent===t&&e.tagName!=='SECTION');
    s=setAnimation(s,[idx('A')],'in',{effect:'zoom'});out.first=animationsAt(s,[idx('A')]);out.static=s.staticHtml;
    s=setAnimation(s,[idx('B')],'out',{effect:'left',trigger:'after',duration:50});out.second=animationsAt(s,[idx('B')]);
    s=setAnimation(s,[idx('B')],'out',{order:1});out.moved=[animationsAt(s,[idx('B')]).out.order,animationsAt(s,[idx('A')]).in.order];
    out.layout=setAnimation(s,[idx('L')],'in',{effect:'fade'})===s;
    s=setAnimation(s,[idx('A')],'in',{effect:null});out.removed=[animationsAt(s,[idx('A')]).in,animationsAt(s,[idx('B')]).out.order,animationsAt(s,[idx('B')]).total];
    out.legacy=animationsAt(s,[idx('old')]).in;
    const doc=new DOMParser().parseFromString(s.html,'text/html'),copy=doc.querySelector('[data-anim-out]').cloneNode(true);doc.querySelector('.slide').append(copy);appendAnimations(doc,[copy]);
    out.pasted=[...doc.querySelectorAll('[data-anim-out-order]')].map(e=>e.getAttribute('data-anim-out-order'));
    out.html=s.html;
    // Grouped objects: one member stands for the group, which takes one place in the sequence.
    let g={...s,html:'<section class="slide"><div data-group-id="g">G1</div><div data-group-id="g">G2</div><div>C</div></section>'};
    const gi=t=>[...new DOMParser().parseFromString(g.html,'text/html').body.querySelectorAll('*')].findIndex(e=>e.textContent===t&&e.tagName!=='SECTION');
    g=setAnimation(g,[gi('G2')],'in',{effect:'spin',duration:800});
    g=setAnimation(g,[gi('C')],'in',{effect:'fade'});
    out.group=[animationsAt(g,[gi('G1')]).in,animationsAt(g,[gi('C')]).in.order,animationsAt(g,[gi('C')]).total];
    g=setAnimation(g,[gi('C')],'in',{order:1});out.groupMoved=[animationsAt(g,[gi('G1')]).in.order,animationsAt(g,[gi('G2')]).in.order];
    g=setAnimation(g,[gi('G1')],'in',{effect:null});out.groupRemoved=!/data-anim-in="spin"/.test(g.html);
    return out;
  });
  assert.deepEqual(r.first.in,{effect:'zoom',duration:500,trigger:'click',order:2},'a new animation goes after the data-step reveal');assert.equal(r.static,'');
  assert.deepEqual(r.second.out,{effect:'left',duration:100,trigger:'after',order:3},'durations are clamped');
  assert.deepEqual(r.moved,[2,3],'nothing moves before a data-step reveal; the others shift');
  assert.ok(r.layout,'layout objects take no animation');
  assert.deepEqual(r.removed,[null,2,2],'removing renumbers the sequence');
  assert.equal(r.legacy.legacy,true);
  assert.deepEqual(r.pasted,['2','3'],'pasted objects go to the end of the sequence');
  assert.deepEqual(r.group,[{effect:'spin',duration:800,trigger:'click',order:1},2,2],'a group is one entry of the sequence, with the animation on every member');
  assert.deepEqual(r.groupMoved,[2,2],'the group moves in the sequence as one');
  assert.ok(r.groupRemoved,'removing from one member removes it from the group');
  console.log('Motion passed: transitions, click / with / after, exits, going back, data-step reveals and the editing operations.');
}finally{await browser.close();}
