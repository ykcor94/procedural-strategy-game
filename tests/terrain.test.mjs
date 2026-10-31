import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../src/core/world.js';
import {rowArea} from '../src/core/geo.js';
import {periodicNoise,fractalNoise} from '../src/generation/noise.js';
import {generateTerrain} from '../src/generation/terrain.js';

function make(settings={}) {const world=createWorld({width:192,height:96,...settings});generateTerrain(world);return world;}
function landShare(world) {
  let total=0,land=0;
  for(let y=0;y<world.height;y++){const a=rowArea(y,world.height);for(let x=0;x<world.width;x++){total+=a;if(world.layers.elevation[y*world.width+x]>0)land+=a;}}
  return land/total;
}
test('terrain is deterministic and independent of climate/hydrology settings',()=>{
  const a=make(),b=make({wetness:2,temperatureOffset:8,riverAbundance:.9});
  assert.deepEqual(a.layers.elevation,b.layers.elevation);
  assert.deepEqual(a.layers.plate,b.layers.plate);
  assert.notEqual(a.layers.elevation.buffer,a.layers.baseElevation.buffer);
  assert.deepEqual(a.layers.elevation,a.layers.baseElevation);
});
test('all continent styles accurately hit area-weighted land targets and bounds',()=>{
  for(const style of ['earthlike','supercontinent','archipelago','fragmented']) {
    const world=make({style,landCoverage:.37,minElevation:-9200,maxElevation:7800});
    assert.ok(Math.abs(landShare(world)-.37)<.00015,style);
    let minimum=Infinity,maximum=-Infinity;
    for(const z of world.layers.elevation){assert.ok(Number.isFinite(z));minimum=Math.min(minimum,z);maximum=Math.max(maximum,z);}
    assert.ok(Math.abs(minimum+9200)<.002);assert.ok(maximum<=7800.002&&maximum>100);
    assert.equal(world.layers.plate.length,world.width*world.height);
  }
});
test('mountain intensity changes relief without moving the coast',()=>{
  const low=make({mountainIntensity:0}),high=make({mountainIntensity:1});
  let changed=0,lowPeak=0,highPeak=0;
  for(let i=0;i<low.layers.elevation.length;i++) {
    const a=low.layers.elevation[i],b=high.layers.elevation[i];
    assert.equal(a>0,b>0);if(a!==b)changed++;lowPeak=Math.max(lowPeak,a);highPeak=Math.max(highPeak,b);
  }
  assert.ok(changed>low.layers.elevation.length*.05);
  assert.ok(highPeak>lowPeak*2);
});
test('periodic noise is seamless for negative coordinates and domain warps',()=>{
  for(const x of [-1.9,-.01,0,.13,.96])for(const y of [0,.21,.499]) {
    assert.ok(Math.abs(periodicNoise(x,y,12,123)-periodicNoise(x+1,y,12,123))<1e-12);
    assert.ok(Math.abs(fractalNoise(x,y,3,4,239)-fractalNoise(x+1,y,3,4,239))<1e-12);
  }
});
test('polar noise tapers and seam edges have normal neighbor continuity',()=>{
  const {layers,width:w,height:h}=make({width:384,height:192});
  const z=layers.elevation;let seam=0,interior=0;
  for(let y=1;y<h-1;y++){seam+=Math.abs(z[y*w]-z[y*w+w-1]);for(let x=0;x<w-1;x++)interior+=Math.abs(z[y*w+x]-z[y*w+x+1]);}
  assert.ok(seam/(h-2)<interior/((h-2)*(w-1))*4,'wrapped seam must not have a vertical terrain discontinuity');
});
