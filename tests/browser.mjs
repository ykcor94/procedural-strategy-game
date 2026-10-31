// Optional integration check: install Playwright or set NODE_PATH to its package directory.
import {createRequire} from 'node:module';
import {mkdir,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const browser=await chromium.launch({headless:true,...(process.env.PW_EXECUTABLE_PATH?{executablePath:process.env.PW_EXECUTABLE_PATH}:{channel:'chrome'})});
const page=await browser.newPage({viewport:{width:1500,height:960},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
await mkdir('test-output',{recursive:true});
try {
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173');
  await page.waitForFunction(()=>window.atlas?.world&&!window.atlas.busy,null,{timeout:120000});
  console.log(await page.evaluate(()=>({width:atlas.world.width,height:atlas.world.height,stats:atlas.world.meta.statistics,hydrology:{...atlas.world.meta.hydrology,lakes:undefined}})));
  await page.screenshot({path:'test-output/app-physical.png'});
  const canvas=page.locator('#map'),box=await canvas.boundingBox();
  await canvas.click({position:{x:box.width*.55,y:box.height*.52}});
  assert.ok(await page.locator('#inspect-panel').innerText().then(s=>s.toLowerCase().includes('annual climate')));
  for(const mode of ['biome','koppen','elevation','temperature','precipitation','hydrology']){
    await page.selectOption('#map-mode',mode);await page.waitForTimeout(180);
    if(mode==='temperature'||mode==='precipitation'){await page.selectOption('#month','6');await page.waitForTimeout(100);}
    if(['koppen','hydrology'].includes(mode))await page.screenshot({path:`test-output/app-${mode}.png`});
  }
  await page.selectOption('#map-mode','physical');await page.click('#tab-statistics');
  await page.screenshot({path:'test-output/app-statistics.png'});
  console.log('Modes and inspection passed.');
  // Cursor-centered zoom and wrap-aware panning.
  const initialScale=await page.evaluate(()=>atlas.renderer.camera.scale);await page.click('#zoom-in');
  assert.ok(await page.evaluate(()=>atlas.renderer.camera.scale)>initialScale);await page.click('#camera-reset');
  // Persistence must preserve the exact raster, including edits, through IndexedDB.
  await page.fill('#world-name','Integration world');await page.click('#save-world');
  await page.waitForFunction(()=>document.querySelector('#world-state').textContent==='Saved');
  await page.click('#open-saves');await page.waitForSelector('[data-load]');
  assert.ok((await page.locator('#save-list').innerText()).includes('Integration world'));
  await page.click('#close-saves');
  console.log('Initial save passed.');
  // Edit a stroke and wait for all dependencies, then undo and redo.
  await page.click('#toggle-edit');await page.click('[data-tool="raise"]');
  const before=await page.evaluate(()=>Array.from(atlas.world.layers.elevation));
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.54,box.y+box.height*.51,{steps:4});await page.mouse.up();
  await page.waitForFunction(()=>!atlas.busy,null,{timeout:120000});
  const after=await page.evaluate(()=>Array.from(atlas.world.layers.elevation));assert.notDeepEqual(after,before);
  await page.click('#undo');await page.waitForFunction(()=>!atlas.busy,null,{timeout:120000});assert.deepEqual(await page.evaluate(()=>Array.from(atlas.world.layers.elevation)),before);
  await page.click('#redo');await page.waitForFunction(()=>!atlas.busy,null,{timeout:120000});assert.deepEqual(await page.evaluate(()=>Array.from(atlas.world.layers.elevation)),after);
  console.log('Edit, undo, and redo passed.');
  // Export the edited complete world and current map, then restore through both
  // IndexedDB and file import. Native file transfers exercise the actual UI.
  await page.click('#file-menu');
  const worldDownload=page.waitForEvent('download');await page.click('#export-world');
  const worldFile=await worldDownload;await worldFile.saveAs('test-output/edited-world.atlas');
  assert.ok((await stat('test-output/edited-world.atlas')).size>100000);
  console.log('World file download passed.');
  await page.click('#file-menu');const pngDownload=page.waitForEvent('download');await page.click('#export-png');
  const pngFile=await pngDownload;await pngFile.saveAs('test-output/exported-map.png');
  assert.ok((await stat('test-output/exported-map.png')).size>1000);
  console.log('PNG download passed.');
  await page.click('#open-saves');await page.waitForSelector('[data-load]');await page.locator('[data-load]').first().click();
  await page.waitForFunction(()=>!document.querySelector('#save-manager').open);
  assert.deepEqual(await page.evaluate(()=>Array.from(atlas.world.layers.elevation)),before);
  console.log('IndexedDB load passed.');
  await page.setInputFiles('#file-input','test-output/edited-world.atlas');
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Imported'));
  assert.deepEqual(await page.evaluate(()=>Array.from(atlas.world.layers.elevation)),after);
  console.log('Edited world import passed.');
  // Cancelling must keep a valid finished world.
  await page.click('#generate');await page.waitForFunction(()=>atlas.busy);await page.click('#cancel');assert.equal(await page.evaluate(()=>atlas.busy),false);assert.ok(await page.evaluate(()=>!!atlas.world));
  await page.setViewportSize({width:780,height:900});await page.waitForTimeout(250);await page.screenshot({path:'test-output/app-compact.png'});
  assert.deepEqual(errors,[]);console.log('Browser integration checks passed.');
} finally {await browser.close();}
