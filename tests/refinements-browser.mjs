import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const openLayers=page=>page.evaluate(()=>{const b=document.querySelector('.overlay-controls');if(b?.hidden)document.getElementById('show-map-overlays')?.click();});const openSettings=page=>page.evaluate(()=>document.querySelectorAll('#civ-settings details,#settings-form details').forEach(d=>d.open=true));
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.PW_EXECUTABLE_PATH?{executablePath:process.env.PW_EXECUTABLE_PATH}:{channel:'chrome'})});
const page=await browser.newPage({viewport:{width:1500,height:960},deviceScaleFactor:1});page.setDefaultTimeout(60000);
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('requestfailed',r=>console.log('Request failed',r.url(),r.failure()?.errorText));
const ready=async()=>{await page.waitForTimeout(200);await page.waitForFunction(()=>{const s=atlas.renderer.detailStatus;return s?.global||s?.total>0&&s.ready===s.total;},null,{timeout:240000});};
await mkdir('test-output',{recursive:true});
try {
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173',{waitUntil:'domcontentloaded',timeout:180000});console.log('Document loaded');await page.waitForFunction(()=>window.atlas?.world&&!atlas.busy,null,{timeout:240000});console.log('World generated');await ready();
  console.log('Default ready',await page.locator('#status').innerText());await page.screenshot({path:'test-output/v3-global.png'});
  const before=await page.evaluate(()=>({settings:JSON.stringify(atlas.world.settings),sample:Array.from(atlas.world.layers.elevation.subarray(0,100))}));
  await page.click('#open-general');await page.selectOption('#unit-system','imperial');
  assert.equal(await page.locator('[name=maxElevation]').inputValue(),'21325');await page.screenshot({path:'test-output/v3-general-imperial.png'});await page.click('#close-general');
  assert.ok(await page.locator('#statistics-panel').innerText().then(s=>s.includes('°F')&&s.includes('ft')&&s.includes('in/yr')));
  assert.equal(await page.locator('#apply-settings').isVisible(),false);
  const box=await page.locator('#map').boundingBox();await page.locator('#map').click({position:{x:box.width*.5,y:box.height*.5}});
  assert.ok(await page.locator('#inspect-panel').innerText().then(s=>s.includes('°F')&&s.includes('ft')));
  assert.ok(await page.locator('#inspect-panel svg').innerHTML().then(s=>s.includes('°F')&&s.includes('>in<')));
  await page.selectOption('#map-mode','temperature');assert.ok(await page.locator('#mode-description').innerText().then(s=>s.includes('°F')));
  await page.click('#open-general');await page.selectOption('#unit-system','metric');await page.click('#close-general');
  assert.equal(await page.locator('[name=maxElevation]').inputValue(),'6500');assert.equal(await page.locator('#apply-settings').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>({settings:JSON.stringify(atlas.world.settings),sample:Array.from(atlas.world.layers.elevation.subarray(0,100))})),before);
  // Convert a manually changed elevation without rounding drift.
  await page.fill('[name=maxElevation]','7777');await page.click('#open-general');await page.selectOption('#unit-system','imperial');await page.selectOption('#unit-system','metric');await page.click('#close-general');assert.equal(await page.locator('[name=maxElevation]').inputValue(),'7777');await page.fill('[name=maxElevation]','6500');
  await page.fill('[name=continentCount]','3');await page.fill('[name=width]','384');await page.fill('[name=height]','192');await page.selectOption('[name=landformProfile]','plateaus');await page.selectOption('#map-mode','physical');await page.click('#generate');await page.waitForFunction(()=>!atlas.busy,null,{timeout:240000});await ready();
  assert.equal(await page.evaluate(()=>atlas.world.meta.continents.majorCount),3);await page.click('#tab-statistics');await page.screenshot({path:'test-output/v3-three-continents.png'});
  console.log('Unit controls, chart, no drift and targeted generation passed');
  async function focus(kind,level) {
    const target=await page.evaluate(({kind,level})=>{
      const r=atlas.renderer,l=atlas.world.layers,w=atlas.world.width,h=atlas.world.height;let best=-Infinity,index=-1;
      for(let i=0;i<w*h;i++) {
        const e=l.elevation[i],t=l.annualTemperature[i],m=l.naturalMoisture[i],x=i%w,y=Math.floor(i/w);
        let score=-Infinity;
        if(kind==='forest'&&e>100&&e<1600&&t>10&&m>.45&&l.riverDistance[i]>2)score=m-e*.0001;
        if(kind==='desert'&&e>1&&e<400&&t>12&&m<.12)score=-m-e*.0001;
        if(kind==='delta'&&e>0&&e<100&&l.alluvium[i]>.1)score=l.alluvium[i];
        if(kind==='ice'&&e>0&&l.warmestTemperature[i]<0&&x>1&&x<w-2&&y>1&&y<h-2)score=(l.elevation[i+1]<=0||l.elevation[i-1]<=0||l.elevation[i+w]<=0||l.elevation[i-w]<=0)?-l.warmestTemperature[i]:-Infinity;
        if(score>best){best=score;index=i;}
      }
      if(index<0)return null;
      const c=r.camera;c.x=index%w+.5;c.y=Math.floor(index/w)+.5;const scale=512*2**(level-.2)/w;c.zoom(scale/c.scale);r.draw();return {index,e:l.elevation[index],moist:l.naturalMoisture[index],biome:l.biome[index]};
    },{kind,level});if(target)await ready();return target;
  }
  assert.ok(await focus('forest',7));
  assert.equal(await page.evaluate(()=>atlas.renderer.detailStatus.level),7);
  const generation=await page.evaluate(()=>atlas.renderer.tiles.generation),cacheBytes=await page.evaluate(()=>atlas.renderer.tiles.cache.bytes);
  assert.ok(cacheBytes<=64*1024*1024);
  const symbols=await page.evaluate(()=>{const r=atlas.renderer,p=r.features.getContext('2d').getImageData(0,0,r.features.width,r.features.height).data;return p.filter((_,i)=>i%4===3).reduce((a,v)=>a+(v>0),0);});assert.ok(symbols>500);
  await page.screenshot({path:'test-output/v3-forest-L7.png'});await openLayers(page).then(()=>page.uncheck('#overlay-sprites'));await page.waitForTimeout(200);await page.screenshot({path:'test-output/v3-forest-no-sprites.png'});assert.equal(await page.evaluate(()=>atlas.renderer.tiles.generation),generation);await openLayers(page).then(()=>page.check('#overlay-sprites'));
  await focus('forest',8);await page.screenshot({path:'test-output/v3-forest-L8.png'});
  await focus('desert',8);await page.screenshot({path:'test-output/v3-desert-L8.png'});
  if(await focus('delta',7))await page.screenshot({path:'test-output/v3-delta-L7.png'});
  if(await focus('ice',5))await page.screenshot({path:'test-output/v3-ice-coast.png'});
  const leak=await page.evaluate(()=>{const r=atlas.renderer,p=r.features.getContext('2d').getImageData(0,0,r.features.width,r.features.height).data,m=r.landClip.getContext('2d').getImageData(0,0,r.landClip.width,r.landClip.height).data;let count=0;for(let i=3;i<p.length;i+=4)if(m[i]===0&&p[i]>0)count++;return count;});assert.equal(leak,0);
  console.log('L7/L8 sprites, toggles, cache limit and ocean clipping passed');
  await page.click('#camera-reset');await ready();await page.setViewportSize({width:390,height:840});await page.waitForTimeout(200);await page.screenshot({path:'test-output/v3-mobile.png'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  await page.click('#open-general');assert.ok(await page.locator('#unit-system').isVisible());await page.click('#close-general');assert.deepEqual(errors,[]);
  console.log('Refinements browser checks passed');
}finally{await browser.close();}
