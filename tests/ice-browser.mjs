import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.PW_EXECUTABLE_PATH?{executablePath:process.env.PW_EXECUTABLE_PATH}:{channel:'chrome'})});
const page=await browser.newPage({viewport:{width:1200,height:850},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);await mkdir('test-output',{recursive:true});
try {
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173',{waitUntil:'domcontentloaded',timeout:180000});await page.waitForFunction(()=>window.atlas?.busy||window.atlas?.world);
  await page.evaluate(async()=>{
    atlas.cancel();const [{createWorld},{generateIce}]=await Promise.all([import('/src/core/world.js'),import('/src/generation/ice.js')]);
    const world=createWorld({width:128,height:64,seed:'permanent-ice-fixture'}),l=world.layers,n=128*64;
    l.elevation=Float32Array.from({length:n},(_,i)=>350*Math.sin((i%128+.5)/128*Math.PI*2)+200*Math.cos((Math.floor(i/128)+.5)/64*Math.PI*2)-100);
    l.baseElevation=l.elevation.slice();l.filledElevation=Float32Array.from(l.elevation,e=>Math.max(0,e));
    l.temperature=new Float32Array(n*12).fill(-20);l.precipitation=new Float32Array(n*12).fill(20);
    l.annualTemperature=new Float32Array(n).fill(-20);l.annualPrecipitation=new Float32Array(n).fill(240);l.soilMoisture=Float32Array.from(l.elevation,e=>e>0?.4:1);
    l.biome=Uint8Array.from(l.elevation,e=>e>0?13:0);l.koppen=Uint8Array.from(l.elevation,e=>e>0?31:0);
    l.lake=new Uint8Array(n);l.river=new Uint8Array(n);l.flow=new Float32Array(n);l.flowTo=new Int32Array(n).fill(-1);l.basin=new Int32Array(n);l.riverDistance=new Float32Array(n).fill(10);l.tectonicUplift=new Float32Array(n);generateIce(world);
    const r=atlas.renderer;r.mode='physical';r.overlays.shading=false;r.overlays.grid=false;r.overlays.sprites=false;r.overlays.coasts=true;r.overlays.ice=true;r.setWorld(world,true);document.querySelector('#empty-state').hidden=true;
  });
  for(const level of [1,6]) {
    if(level===6)await page.evaluate(()=>{const r=atlas.renderer,w=r.world.width,h=r.world.height,l=r.world.layers;let best=Infinity,index=0;for(let i=Math.floor(w*h*.3);i<Math.floor(w*h*.7);i++){if(Math.abs(l.elevation[i])<best){best=Math.abs(l.elevation[i]);index=i;}}const c=r.camera;c.x=index%w+.5;c.y=Math.floor(index/w)+.5;c.zoom(512*2**5.8/w/c.scale);r.draw();});
    await page.waitForTimeout(200);await page.waitForFunction(()=>{const s=atlas.renderer.detailStatus;return s?.total>0&&s.ready===s.total;},null,{timeout:240000});
    const result=await page.evaluate(()=>{
      const r=atlas.renderer,c=r.camera,w=r.world.width,h=r.world.height,d=r.ctx.getImageData(0,0,r.canvas.width,r.canvas.height).data;let blue=0,dark=0,samples=0;
      for(let y=2;y<r.canvas.height-2;y++)for(let x=2;x<r.canvas.width-2;x++) {
        const p=c.toWorld(x,y);if(p.y<.1||p.y>h-.1)continue;const i=(y*r.canvas.width+x)*4;samples++;
        if(d[i]<210)dark++;if(d[i+2]-d[i]>15)blue++;
      }
      return {blue,dark,samples};
    });
    assert.ok(result.samples>1000);assert.equal(result.blue,0,'permanent ice must not have a blue coastal halo');assert.equal(result.dark,0,'frozen land and sea must share a bright surface');
    await page.locator('#map').screenshot({path:`test-output/v3-permanent-ice-L${level}.png`});console.log('Ice continuity',level,result);
  }
  assert.deepEqual(errors,[]);console.log('Permanent land/sea ice continuity browser checks passed.');
}finally{await browser.close();}
