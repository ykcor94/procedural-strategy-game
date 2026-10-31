import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../src/core/world.js';
import {DEFAULTS,validateSettings,PRESETS} from '../src/core/settings.js';
import {generateTerrain} from '../src/generation/terrain.js';
import {rowArea} from '../src/core/geo.js';
import {periodicNoise} from '../src/generation/noise.js';
import {cachedPeriodicNoise} from '../src/lod/cached-noise.js';
import {constrainContinents,continentAnchors} from '../src/generation/continents.js';
import {seededRandom} from '../src/core/random.js';
import {reliefField,reliefTone,reliefOpacity} from '../src/render/relief.js';
import {TileManager} from '../src/lod/tile-manager.js';
import {createTileSource,createTerrainSampler} from '../src/lod/terrain-sampler.js';
import {generateElevationTile,generateVisualTile} from '../src/lod/tile-generator.js';
import {tileBounds} from '../src/lod/quadtree.js';
import {runPipeline} from '../src/generation/pipeline.js';
import {resampleCoastalTerrain} from '../src/generation/coastal-resampling.js';
import {seaLevelThreshold} from '../src/generation/terrain.js';

const terrain=s=>{const world=createWorld({...DEFAULTS,width:192,height:96,seed:'Orogen-audit',...s});generateTerrain(world);return world;};
const coast=w=>Uint8Array.from(w.layers.elevation,e=>e>0);
function highArea(world,limit){let land=0,high=0;for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){const e=world.layers.elevation[y*world.width+x],a=rowArea(y,world.height);if(e>0){land+=a;if(e>limit)high+=a;}}return high/land;}

test('cached gradient noise exactly matches the original after cache eviction and across wrapping',()=>{
  for(const frequency of [32,256,1024,16384]) {
    const sample=cachedPeriodicNoise(frequency,359,2);
    for(let i=0;i<150;i++){const u=Math.sin(i*1.7)*2,v=Math.cos(i*.73)*.52;assert.equal(sample(u,v),periodicNoise(u,v,frequency,359));assert.ok(Math.abs(sample(u,v)-sample(u+1,v))<1e-10);}
  }
});
test('ten targeted continents preserve weighted area, finite buffers, and no numerical ocean-trench sentinels',()=>{
  for(const [count,coverage,seed]of [[3,.31,'shore-cuts'],[10,.15,'ten-isles'],[10,.55,'ten-continents'],[10,.85,'ten-crowded']]) {
    const w=terrain({width:256,height:128,continentCount:count,landCoverage:coverage,seed});assert.equal(w.meta.continents.majorCount,count,seed);
    let sum=0,land=0;for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++){const a=rowArea(y,w.height);sum+=a;if(w.layers.elevation[y*w.width+x]>0)land+=a;}assert.ok(Math.abs(land/sum-coverage)<.00012,seed);
  }
  const w=128,h=64,raw=Float32Array.from({length:w*h},(_,i)=>periodicNoise((i%w+.5)/w,(Math.floor(i/w)+.5)/h*.5,4,312)),anchors=continentAnchors(seededRandom('coast'),4),scores=constrainContinents(raw,w,h,anchors,.35,0);
  assert.ok(scores.every(Number.isFinite));assert.ok(Math.min(...scores)>-100);assert.equal(validateSettings({continentCount:10}).continentCount,10);assert.throws(()=>validateSettings({continentCount:11}));
});
test('coastal refinement preserves a shallow separating strait between high coastal ranges',()=>{
  const w=16,h=8,e=new Float32Array(w*h).fill(1800),distance=new Float32Array(w*h).fill(2);
  for(let y=0;y<h;y++){e[y*w+8]=-12;distance[y*w+8]=0;distance[y*w+7]=0;distance[y*w+9]=0;}
  const out=resampleCoastalTerrain(e,distance,w,h,w*2,h*2,15/16,seaLevelThreshold,732).elevation;
  for(let y=0;y<h*2;y++){assert.ok(out[y*w*2+16]<0);assert.ok(out[y*w*2+17]<0);assert.ok(out[y*w*2+13]>0);}
});
test('mountain morphologies, chaos and spread alter relief without moving continents',()=>{
  const base=terrain({highlandExtent:0}),kinds=[];
  for(const mountainStyle of ['cordillera','folded','massif','broken']){const w=terrain({mountainStyle,highlandExtent:0});assert.deepEqual(coast(w),coast(base));assert.notDeepEqual(w.layers.elevation,base.layers.elevation);assert.ok(w.layers.mountainUplift.some(e=>e>1000));kinds.push(w.meta.terrain.orogens[0].kind);}
  assert.deepEqual(kinds,['cordillera','folded','massif','broken']);
  const spread=terrain({mountainSpread:1,terrainChaos:1});assert.ok(spread.meta.terrain.orogens.length>base.meta.terrain.orogens.length);assert.deepEqual(coast(spread),coast(base));
  const narrow=terrain({mountainSpread:0}),wide=terrain({mountainSpread:1});assert.deepEqual(narrow.layers.highlandUplift,wide.layers.highlandUplift);
});
test('broad high plateaus raise substantial contiguous areas and orogen geometry varies between seeds',()=>{
  const low=terrain({highlandExtent:0,highlandUplift:0,mountainIntensity:.4}),high=terrain({...PRESETS['High Plateaus'],highlandExtent:1,highlandUplift:5500});
  assert.deepEqual(coast(low),coast(high));assert.ok(highArea(high,3000)>highArea(low,3000)+.1);assert.ok(high.layers.highlandUplift.some(e=>e>4000));
  const other=terrain({seed:'Another-crust'});assert.notDeepEqual(other.meta.terrain.orogens.map(f=>[f.kind,f.length,f.width]),high.meta.terrain.orogens.map(f=>[f.kind,f.length,f.width]));
  for(const f of high.meta.terrain.orogens)for(const p of f.points)assert.ok(p.u>=0&&p.u<1&&p.v>=0&&p.v<=1);
});
test('lighting overlays share a macro field, variants ignore visual toggles, and cached tile geometry is reusable',async()=>{
  const world=await runPipeline({settings:{...DEFAULTS,width:128,height:64,seed:'lighting'}}),source=createTileSource(world),sampler=createTerrainSampler(source),tile={level:4,x:17,y:7},options={size:32,mode:'physical',ice:true,month:-1};
  const geo=generateElevationTile(source,sampler,tile,options),a=generateVisualTile(source,sampler,tile,{...options,geometry:geo}),b=generateVisualTile(source,sampler,tile,{...options,geometry:geo});assert.deepEqual(a,b);assert.equal(geo.shadePixels,b.shadePixels);
  for(const resolution of [192,512,1024,8192,131072])assert.equal(sampler(.371,.492,{samplingResolution:resolution}),sampler(.371,.492));
  for(const t of [{level:0,x:0,y:0},{level:5,x:63,y:0},{level:8,x:511,y:255}]){const bounds=tileBounds(t),noiseContext=sampler.prepareTile(bounds,32);for(const p of [-.01,.2,.8,1.01]){const u=bounds.u+p*bounds.du,v=bounds.v+p*bounds.dv;assert.ok(Math.abs(sampler(u,v,{noiseContext})-sampler(u,v))<1e-9);}}
  const field=reliefField(world);assert.ok(field.some(v=>Math.abs(v)>.01));assert.ok(Math.abs(reliefTone(.2)*reliefOpacity(false)-.2)<1e-12);assert.ok(reliefTone(.2)*reliefOpacity(true)>.2);
  const manager=new TileManager(()=>{});assert.equal(manager.variant(options),manager.variant({...options,shading:false,boldRelief:true,coasts:false}));assert.ok(a.coastLines instanceof Float32Array);assert.equal(a.shadePixels.length,32*32*4);
  const peak=field.findIndex(v=>Math.abs(v)>.01);world.layers.lake=world.layers.lake.slice();world.layers.lake[peak]=1;assert.equal(reliefField(world)[peak],0);
});
