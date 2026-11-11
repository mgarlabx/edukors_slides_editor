// Exported player tools in headless Chrome (no window): laser pointer (S), presenter panel timer and speaker notes.
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('test-results/player-tools-'+Date.now());
await fs.mkdir(root,{recursive:true});
await build({entryPoints:['tests/player-tools-fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'fixture.mjs'),logLevel:'error'});
const {exported}=await import(pathToFileURL(path.join(root,'fixture.mjs')).href);
const file=path.join(root,'deck.html');await fs.writeFile(file,exported);
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  const active=()=>page.frameLocator('#stage > .frame.on');
  await active().locator('h1').filter({hasText:'Tools 1'}).waitFor();
  // The top bar shows each tool's key beside its icon.
  assert.deepEqual(await page.locator('#top-bar .key').allTextContents(),['Z','P','H','T','E','S','L','W','F']);
  // Laser: S turns it on; the dot follows the pointer; a click still goes to the next slide; S turns it off.
  await page.keyboard.press('s');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.tool),'laser');
  assert.equal(await page.locator('#laser-btn').getAttribute('aria-pressed'),'true');
  await page.mouse.move(900,400);await page.mouse.move(950,420);
  assert.ok(await page.locator('#laser').isVisible(),'the laser dot shows under the pointer');
  const dot=await page.locator('#laser').boundingBox();assert.ok(Math.abs(dot.x+dot.width/2-950)<4&&Math.abs(dot.y+dot.height/2-420)<4,'the dot is at the pointer');
  await page.mouse.click(950,420);await active().locator('h1').filter({hasText:'Tools 2'}).waitFor();
  await page.keyboard.press('s');assert.equal(await page.evaluate(()=>document.documentElement.dataset.tool),'');assert.ok(!await page.locator('#laser').isVisible());
  await page.keyboard.press('ArrowLeft');await active().locator('h1').filter({hasText:'Tools 1'}).waitFor();
  // Presenter panel: notes under their slide (as text), and the timer.
  // Z opens the presenter panel.
  const [panel]=await Promise.all([page.waitForEvent('popup'),page.keyboard.press('z')]);
  await panel.locator('.overview-card').first().waitFor();
  assert.equal(await panel.locator('.overview-card').nth(0).locator('.overview-notes').textContent(),'First note\nsecond line <b>not markup</b>');
  assert.equal(await panel.locator('.overview-card').nth(1).locator('.overview-notes').count(),0,'no notes, no note block');
  const time=panel.locator('.t-time');assert.equal(await time.textContent(),'00:00');
  await panel.locator('[data-t=run]').click();await panel.waitForTimeout(1300);
  assert.match(await time.textContent(),/^00:0[1-2]$/,'the stopwatch runs');
  await panel.locator('[data-t=run]').click();const paused=await time.textContent();await panel.waitForTimeout(600);assert.equal(await time.textContent(),paused,'pause stops it');
  await panel.locator('[data-t=reset]').click();assert.equal(await time.textContent(),'00:00','reset');
  assert.ok(await panel.locator('.t-min').isHidden(),'minutes only for the countdown');
  await panel.locator('[data-t=mode]').selectOption('down');await panel.locator('[data-t=minutes]').fill('2');await panel.locator('[data-t=minutes]').press('Enter');
  assert.equal(await time.textContent(),'02:00','time remaining starts at the minutes set');
  await panel.locator('[data-t=run]').click();await panel.waitForTimeout(1300);assert.match(await time.textContent(),/^01:5[89]$/,'it counts down');
  assert.deepEqual(errors,[]);
  console.log('Player tools passed: laser pointer (S), presenter notes, stopwatch and time remaining.');
}finally{await browser.close();}
