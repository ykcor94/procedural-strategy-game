import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const openLayers=page=>page.evaluate(()=>{const b=document.querySelector('.overlay-controls');if(b?.hidden)document.getElementById('show-map-overlays')?.click();});const openSettings=page=>page.evaluate(()=>document.querySelectorAll('#civ-settings details,#settings-form details').forEach(d=>d.open=true));
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.PW_EXECUTABLE_PATH?{executablePath:process.env.PW_EXECUTABLE_PATH}:{channel:'chrome'})});
const page=await browser.newPage({viewport:{width:1500,height:960},deviceScaleFactor:1});page.setDefaultTimeout(60000);const errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const ready=async()=>{await page.waitForTimeout(150);await page.waitForFunction(()=>{const r=atlas.renderer,s=r.detailStatus;return s?.global||s?.total>0&&s.ready===s.total&&!r.tiles.queue.length&&!r.tiles.inflight.size;},null,{timeout:180000});};
const generated=async()=>{await page.waitForFunction(()=>!!atlas.world&&!atlas.busy,null,{timeout:180000});await ready();};
await mkdir('test-output',{recursive:true});
try {
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173',{waitUntil:'domcontentloaded',timeout:180000});await generated();
  console.log('Initial load',await page.locator('#status').innerText(),await page.evaluate(()=>atlas.renderer.detailStatus));await page.screenshot({path:'test-output/v4-global.png'});
  assert.equal(await page.evaluate(()=>atlas.renderer.tiles.workers.length),0);
  // Target a range, allow the actual detail workers to finish, and then toggle
  // lighting. Both the picture and job counts must stay stable afterward.
  const timing=await page.evaluate(()=>{const r=atlas.renderer,l=atlas.world.layers,w=atlas.world.width;let index=0,best=-1;for(let i=0;i<l.elevation.length;i++)if(l.elevation[i]>best){best=l.elevation[i];index=i;}const c=r.camera;c.x=index%w+.5;c.y=Math.floor(index/w)+.5;c.zoom(512*2**4.7/w/c.scale);r.draw();return performance.now();});await ready();
  console.log('Regional ready',await page.evaluate(start=>({elapsedMs:performance.now()-start,...atlas.renderer.detailStatus}),timing));
  await page.screenshot({path:'test-output/v4-relief-normal.png'});
  const snapshot=()=>page.evaluate(()=>{const r=atlas.renderer,d=r.ctx.getImageData(0,0,r.canvas.width,r.canvas.height).data;let sum=0;for(let i=0;i<d.length;i+=16)sum=(sum+d[i]*3+d[i+1]*5+d[i+2]*7)>>>0;return {sum,completed:r.tiles.completed,generation:r.tiles.generation};});
  const normal=await snapshot();await openLayers(page).then(()=>page.check('#overlay-boldRelief'));await page.waitForTimeout(200);const bold=await snapshot();assert.notEqual(bold.sum,normal.sum);assert.equal(bold.completed,normal.completed);assert.equal(bold.generation,normal.generation);
  await page.waitForTimeout(1600);assert.deepEqual(await snapshot(),bold);await page.screenshot({path:'test-output/v4-relief-bold.png'});
  await openLayers(page).then(()=>page.uncheck('#overlay-shading'));await page.waitForTimeout(150);assert.equal((await snapshot()).completed,normal.completed);await openLayers(page).then(()=>page.check('#overlay-shading'));await openLayers(page).then(()=>page.uncheck('#overlay-boldRelief'));
  await page.selectOption('#preset','High Plateaus');await page.fill('[name=width]','384');await page.fill('[name=height]','192');await page.fill('[name=continentCount]','3');await page.click('#generate');await generated();
  assert.equal(await page.evaluate(()=>atlas.world.meta.continents.majorCount),3);assert.equal(await page.evaluate(()=>atlas.world.settings.highlandUplift),4300);
  await page.click('#camera-reset');await ready();await page.selectOption('#map-mode','elevation');await ready();await page.screenshot({path:'test-output/v4-high-plateaus-elevation.png'});await page.selectOption('#map-mode','physical');await ready();await page.screenshot({path:'test-output/v4-high-plateaus.png'});
  await page.selectOption('#preset','Chaotic Uplands');await page.fill('[name=width]','384');await page.fill('[name=height]','192');await page.fill('[name=continentCount]','10');await page.click('#generate');await generated();assert.equal(await page.evaluate(()=>atlas.world.meta.continents.majorCount),10);await page.screenshot({path:'test-output/v4-ten-continents.png'});
  const terrain=await page.evaluate(()=>{const l=atlas.world.layers,w=atlas.world.width;const index=l.elevation.findIndex((e,i)=>e>30&&e<2200&&l.soilMoisture[i]>.4&&l.warmestTemperature[i]>10);const c=atlas.renderer.camera;c.x=index%w+.5;c.y=Math.floor(index/w)+.5;c.zoom(c.maxScale/c.scale);atlas.renderer.draw();return performance.now();});await ready();
  console.log('L8 ready',await page.evaluate(start=>({elapsedMs:performance.now()-start,...atlas.renderer.detailStatus}),terrain));await page.screenshot({path:'test-output/v4-sprites-L8.png'});
  const before=await page.evaluate(()=>atlas.renderer.tiles.completed);await openLayers(page).then(()=>page.uncheck('#overlay-sprites'));await page.waitForTimeout(120);await openLayers(page).then(()=>page.check('#overlay-sprites'));await openLayers(page).then(()=>page.check('#overlay-boldRelief'));await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>atlas.renderer.tiles.completed),before);
  // Biome/elevation recolors should hit worker-side geography caches.
  await page.selectOption('#map-mode','biome');await ready();assert.ok(await page.evaluate(()=>atlas.renderer.tiles.geometryHits)>0);await page.selectOption('#map-mode','physical');await ready();
  assert.ok(await page.evaluate(()=>atlas.renderer.tiles.cache.bytes<=64*1024*1024));assert.deepEqual(errors,[]);await page.setViewportSize({width:390,height:840});await page.waitForTimeout(200);await page.screenshot({path:'test-output/v4-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('New terrain, 10 continents, persistent bold relief, image transfer, geometry cache and sprite browser checks passed.');
}finally{await browser.close();}
