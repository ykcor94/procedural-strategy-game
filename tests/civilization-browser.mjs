import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(180000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
await mkdir('test-output',{recursive:true});
async function ready(){await page.waitForFunction(()=>window.atlas?.world&&!atlas.busy);}
async function clickCell(cell){const p=await page.evaluate(i=>{const w=atlas.world,c=atlas.renderer.camera;return c.toScreen(i%w.width+.5,Math.floor(i/w.width)+.5);},cell);const box=await page.locator('#map').boundingBox();await page.mouse.click(box.x+p.x,box.y+p.y);}
try{
  if(process.argv.includes('--local-files')){const root=resolve('.');await page.context().route('http://127.0.0.1:4173/**',async route=>{try{const url=new URL(route.request().url()),file=resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(file!==root&&!file.startsWith(root+sep))return route.abort();const body=await readFile(file);await route.fulfill({status:200,body,contentType:({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json'})[extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:'Not found'});}});}
  console.log('Opening game');await page.goto('http://127.0.0.1:4173');
  if(process.argv.includes('--quick')){await page.waitForFunction(()=>!!window.atlas);await page.evaluate(()=>{atlas.cancel();document.querySelector('[name=width]').value=256;document.querySelector('[name=height]').value=128;atlas.generate();});}
  await ready();console.log('Physical world ready');
  await page.click('#next-civilization');
  assert.equal(await page.locator('#civilization-controls').isVisible(),true);
  await page.fill('#civ-settings [name=nationCount]','45');await page.fill('#civ-settings [name=cultureCount]','35');await page.fill('#civ-settings [name=cityCount]','450');
  const before=await page.evaluate(()=>Array.from(atlas.world.layers.elevation));
  await page.click('#generate-civilization');await page.waitForFunction(()=>!!atlas.world.meta.civilization&&!atlas.busy);
  assert.deepEqual(await page.evaluate(()=>Array.from(atlas.world.layers.elevation)),before);
  assert.equal(await page.evaluate(()=>atlas.world.meta.civilization.nations.length),45);
  await page.waitForTimeout(400);await page.screenshot({path:'test-output/civilization-political.png'});
  console.log('Independent civilization generation passed');
  const country=await page.evaluate(()=>atlas.world.meta.civilization.nations.reduce((a,b)=>a.area>b.area?a:b).id);
  await page.locator(`[data-nation="${country}"]`).first().click();
  await page.click(`[data-edit-nation="${country}"]`);
  await page.fill('#civ-entity-form [name=name]','The Meridian Isles');
  await page.fill('#civ-entity-form [name=officialName]','Federation of the Meridian Isles');
  await page.locator('#civ-entity-form [name=color]').evaluate(el=>{el.value='#ceae73';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('#civ-entity-form [type=submit]');
  assert.equal(await page.evaluate(id=>atlas.world.meta.civilization.nations.find(n=>n.id===id).name,country),'The Meridian Isles');
  await page.screenshot({path:'test-output/civilization-country.png'});
  const flag=await page.evaluate(id=>JSON.stringify(atlas.world.meta.civilization.nations.find(n=>n.id===id).flag),country);
  await page.click(`[data-flag="${country}"]`);
  assert.notEqual(await page.evaluate(id=>JSON.stringify(atlas.world.meta.civilization.nations.find(n=>n.id===id).flag),country),flag);
  await page.click(`[data-paint-nation="${country}"]`);
  const target=await page.evaluate(id=>{const w=atlas.world,c=atlas.renderer.camera;for(let i=0;i<w.width*w.height;i++){if(w.layers.ownership[i]&&w.layers.ownership[i]!==id&&w.layers.habitability[i]>.15){const p=c.toScreen(i%w.width,Math.floor(i/w.width));if(p.x>280&&p.x<c.width-60&&p.y>100&&p.y<c.height-300)return {cell:i,old:w.layers.ownership[i]};}}},country);
  assert.ok(target,'visible territory target');await page.locator('#civ-brush-size').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});await clickCell(target.cell);
  assert.equal(await page.evaluate(i=>atlas.world.layers.ownership[i],target.cell),country);
  await page.click('#civ-undo');assert.equal(await page.evaluate(i=>atlas.world.layers.ownership[i],target.cell),target.old);
  await page.click('#civ-redo');assert.equal(await page.evaluate(i=>atlas.world.layers.ownership[i],target.cell),country);
  await page.click('#close-civ-editor');console.log('Nation identity, flag, territory paint, undo and redo passed');
  const a=await page.evaluate(()=>atlas.world.meta.civilization.cities.find(c=>c.population>1e6));
  await page.click('[data-directory]');await page.selectOption('#civ-directory-kind','cities');await page.fill('#civ-search',a.name);await page.locator(`[data-city="${a.id}"]`).first().click();
  await page.click(`[data-edit-city="${a.id}"]`);await page.fill('#civ-entity-form [name=name]','Custom Harbor');await page.fill('#civ-entity-form [name=population]','1234567');await page.click('#civ-entity-form [type=submit]');
  assert.equal(await page.evaluate(id=>atlas.world.meta.civilization.cities.find(c=>c.id===id).name,a.id),'Custom Harbor');
  await page.click(`[data-focus-city="${a.id}"]`);await page.waitForTimeout(400);await page.screenshot({path:'test-output/civilization-city.png'});
  console.log('Settlement editing passed');
  const positions=await page.evaluate(()=>atlas.world.meta.civilization.cities.map(c=>[c.id,c.x,c.y]));const ownership=await page.evaluate(()=>Array.from(atlas.world.layers.ownership));
  await page.click('#stage-civilization');await page.selectOption('#civ-scope','cultures');await page.click('#reroll-civilization');await ready();
  assert.deepEqual(await page.evaluate(()=>atlas.world.meta.civilization.cities.map(c=>[c.id,c.x,c.y])),positions);
  assert.deepEqual(await page.evaluate(()=>Array.from(atlas.world.layers.ownership)),ownership);
  assert.equal(await page.evaluate(id=>atlas.world.meta.civilization.cities.find(c=>c.id===id).name,a.id),'Custom Harbor');
  assert.deepEqual(await page.evaluate(()=>Array.from(atlas.world.layers.elevation)),before);
  console.log('Culture reroll preserves cities, custom names, borders, geography');
  for(const mode of ['cultural','linguistic','population','habitability','ideology']){await page.selectOption('#map-mode',mode);await page.waitForTimeout(80);}await page.click('#camera-reset');await page.selectOption('#map-mode','cultural');await page.waitForTimeout(200);await page.screenshot({path:'test-output/civilization-cultures.png'});
  const roundtrip=await page.evaluate(async()=>{const {worldToBlob,readWorld}=await import('/src/persistence/binary-world.js');const w=atlas.world,b=worldToBlob(w),r=await readWorld(b);return {same:Array.from(w.layers.ownership).every((v,i)=>v===r.layers.ownership[i]),cities:r.meta.civilization.cities.length,nations:r.meta.civilization.nations.length};});assert.equal(roundtrip.same,true);assert.equal(roundtrip.nations,45);
  console.log('Civilization binary save/load passed');
  const cancelled=await page.evaluate(()=>{const old=atlas.world.meta.civilization,geography=atlas.world.layers.elevation;atlas.civilization.generate('nations');atlas.generate();atlas.cancel();return {same:old===atlas.world.meta.civilization,intact:geography.byteLength>0,busy:atlas.busy};});assert.deepEqual(cancelled,{same:true,intact:true,busy:false});console.log('Cancellation preserves civilization and authoritative geographic buffers');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:'test-output/civilization-mobile.png'});
  const mobileCell=await page.evaluate(()=>{const w=atlas.world,r=atlas.renderer,city=w.meta.civilization.cities[0];r.camera.x=city.x;r.camera.y=city.y;r.draw();return city.cell;});await clickCell(mobileCell);assert.equal(await page.locator('.workspace').evaluate(el=>el.classList.contains('mobile-info')),true);await page.screenshot({path:'test-output/civilization-mobile-inspector.png'});
  await page.click('#civ-close-mobile');assert.equal(await page.locator('.workspace').evaluate(el=>el.classList.contains('mobile-info')),false);await page.click('#toggle-settings');await page.click('#civ-close-settings');assert.equal(await page.locator('.workspace').evaluate(el=>el.classList.contains('mobile-settings')),false);
  assert.deepEqual(errors,[]);console.log('All civilization browser checks passed');
}finally{await browser.close();}
