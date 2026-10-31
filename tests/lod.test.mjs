import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline} from '../src/generation/pipeline.js';
import {createWorld,transferables,WORLD_VERSION} from '../src/core/world.js';
import {DEFAULTS} from '../src/core/settings.js';
import {createTileSource,createTerrainSampler} from '../src/lod/terrain-sampler.js';
import {generateElevationTile,generateVisualTile} from '../src/lod/tile-generator.js';
import {visibleTiles,parentTile,tileBounds,intersectsBounds,MAX_LOD} from '../src/lod/quadtree.js';
import {TileCache} from '../src/lod/cache.js';
import {DetailEditor} from '../src/editor/detail-editor.js';
import {editBounds,validateDetail} from '../src/lod/detail-edits.js';
import {serializeWorld,deserializeWorld} from '../src/persistence/world-file.js';
import {worldToBlob,readWorld} from '../src/persistence/binary-world.js';
import {generateIce} from '../src/generation/ice.js';
import {createTectonics,sampleTectonics} from '../src/generation/tectonics.js';
import {buildRiverGeometry} from '../src/render/river-geometry.js';
import {Camera} from '../src/render/camera.js';
import {KOPPEN_BY_CODE} from '../src/data/climates.js';
import {sampleBicubic} from '../src/core/sampling.js';

let fixture;
async function generated(){fixture??=await runPipeline({settings:{...DEFAULTS,width:128,height:64,seed:'lod-system-test'}});return structuredClone(fixture);}

test('spherical plate fields wrap and remain continuous across nearest-plate boundaries',()=>{
  const model=createTectonics('fault-test');
  for(const plate of model.plates)assert.ok(Math.abs(plate.position.reduce((sum,v,k)=>sum+v*plate.velocity[k],0))<1e-12);
  for(const v of [.01,.2,.5,.8,.99]) {
    const a={...sampleTectonics(model,0,v)},b={...sampleTectonics(model,1,v)};assert.ok(Math.abs(a.uplift-b.uplift)<1e-9);
    let prev={...sampleTectonics(model,0,v)};
    for(let x=1;x<300;x++) {
      const u=x/300,current={...sampleTectonics(model,u,v)};
      if(current.plate!==prev.plate){let low=(x-1)/300,high=u;for(let j=0;j<30;j++){const mid=(low+high)/2;if(sampleTectonics(model,mid,v).plate===prev.plate)low=mid;else high=mid;}const left={...sampleTectonics(model,low-1e-8,v)},right=sampleTectonics(model,high+1e-8,v);assert.ok(Math.abs(left.uplift-right.uplift)<1e-4);}
      prev=current;
    }
  }
});
test('tile halos share identical elevation samples across horizontal, vertical, and world seams',async()=>{
  const world=await generated(),source=createTileSource(world),sample=createTerrainSampler(source),options={size:32,valleys:true};
  const a=generateElevationTile(source,sample,{level:3,x:3,y:2},options),b=generateElevationTile(source,sample,{level:3,x:4,y:2},options),c=generateElevationTile(source,sample,{level:3,x:3,y:3},options);
  for(let j=0;j<34;j++){assert.equal(a.height[j*34+33],b.height[j*34+1]);assert.equal(a.height[j*34+32],b.height[j*34]);assert.equal(a.height[33*34+j],c.height[34+j]);}
  const west=generateElevationTile(source,sample,{level:3,x:15,y:2},options),east=generateElevationTile(source,sample,{level:3,x:0,y:2},options);
  for(let j=0;j<34;j++)assert.equal(west.height[j*34+33],east.height[j*34+1]);
});
test('fine terrain anchors to the coarse world, is order independent, and preserves interior land/ocean',async()=>{
  const world=await generated(),source=createTileSource(world),a=createTerrainSampler(source),b=createTerrainSampler(source);
  for(let i=0;i<world.width*world.height;i+=47) {
    const u=(i%world.width+.5)/world.width,v=(Math.floor(i/world.width)+.5)/world.height;
    assert.ok(Math.abs(a(u,v,{valleys:false})-world.layers.elevation[i])<.0002);
    const e=world.layers.elevation[i];if(Math.abs(e)>250)assert.equal(Math.sign(a(u+.0001,v+.0001)),Math.sign(e));
    assert.equal(a(u,v),b(u+1,v));
  }
  for(const v of [0,1])for(const u of [-1,0,.3,1,2])assert.ok(Number.isFinite(a(u,v)));
});
test('fine noise and local relief edits cannot displace a major channel or lake core',()=>{
  const world=createWorld({...DEFAULTS,width:128,height:64}),n=128*64,l=world.layers;
  l.elevation=new Float32Array(n).fill(500);l.riverDistance=new Float32Array(n).fill(10);l.lake=new Uint8Array(n);
  for(let x=0;x<128;x++)l.riverDistance[30*128+x]=0;
  const u=40.3/128,v=30.5/64;world.meta.detail.edits=[{operation:'raise',radius:.02,strength:800,points:[[u,v]]}];
  const sample=createTerrainSampler(createTileSource(world));assert.equal(sample(u,v,{valleys:false}),500);
  l.lake.fill(1);l.riverDistance.fill(10);assert.equal(createTerrainSampler(createTileSource(world))(u,v,{valleys:false}),500);
});
test('visual tiles are deterministic and do not mutate simulation layers',async()=>{
  const world=await generated(),before=world.layers.elevation.slice(),source=createTileSource(world),tile={level:2,x:3,y:1},options={size:24,mode:'physical',shading:true,coasts:true,ice:true};
  const a=generateVisualTile(source,createTerrainSampler(source),tile,options),b=generateVisualTile(source,createTerrainSampler(source),tile,options);
  assert.deepEqual(a,b);assert.deepEqual(world.layers.elevation,before);assert.equal(a.pixels.length,24*24*4);assert.ok(a.pixels.some(v=>v>0));
});
test('quadtree selection, wrapped bounds, hierarchy, and maximum zoom are bounded',()=>{
  const camera=new Camera();camera.resize(1000,700);camera.fit(640,320);camera.x=1;camera.zoom(1e9);
  assert.equal(camera.scale,camera.maxScale);const tiles=visibleTiles(camera,640,320);assert.ok(tiles.length<40);assert.ok(tiles.every(t=>t.level===MAX_LOD&&t.x>=0&&t.x<2**(MAX_LOD+1)));
  const t={level:3,x:5,y:2},p=parentTile(t),b=tileBounds(t),pb=tileBounds(p);assert.ok(b.u>=pb.u&&b.v>=pb.v&&b.u+b.du<=pb.u+pb.du);
  assert.ok(intersectsBounds({level:2,x:7,y:1},{u0:-.04,u1:.02,v0:.1,v1:.6}));
  assert.ok(camera.width/camera.scale/640*40075>100);
});
test('tile cache enforces its byte budget and releases evicted image resources',()=>{
  let closed=0;const cache=new TileCache(30),item=()=>({bytes:16,bitmap:{close(){closed++;}}});
  cache.set('a',item());cache.set('b',item());assert.equal(cache.bytes,16);assert.equal(closed,1);assert.equal(cache.get('a'),null);cache.clear();assert.equal(cache.bytes,0);assert.equal(closed,2);
});
test('monotone ground interpolation preserves samples and smooths grid-boundary slopes',()=>{
  const w=16,h=8,values=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)values[y*w+x]=x*x*15+y*10;
  const v=3.5/h,u=6.5/w,step=1e-7,center=sampleBicubic(values,u,v,w,h),left=(center-sampleBicubic(values,u-step,v,w,h))/step,right=(sampleBicubic(values,u+step,v,w,h)-center)/step;
  assert.equal(center,values[3*w+6]);assert.ok(Math.abs(left-right)/Math.max(1,Math.abs(left))<1e-5);
  for(let x=4.5;x<=5.5;x+=.03){const value=sampleBicubic(values,x/w,v,w,h);assert.ok(value>=values[3*w+4]&&value<=values[3*w+5]);}
  const camera=new Camera();camera.resize(12000,4000);camera.fit(640,320);camera.zoom(20);assert.ok(visibleTiles(camera,640,320).length<=128);
});
test('sparse visual edits persist, reproduce, invalidate wrapped bounds, and undo after cloning',async()=>{
  const world=await generated(),e=world.layers.elevation,before=e.slice();let index=e.findIndex((z,i)=>z>300&&world.layers.riverDistance[i]>3);
  assert.ok(index>=0);const u=(index%world.width+.5)/world.width,v=(Math.floor(index/world.width)+.5)/world.height;
  let changes=0;const editor=new DetailEditor(()=>changes++);editor.begin(world,'raise',.005,400);editor.dab(u,v);editor.end();validateDetail(world.meta.detail);
  const height=createTerrainSampler(createTileSource(world))(u,v),restored=deserializeWorld(serializeWorld(world));
  assert.equal(height,createTerrainSampler(createTileSource(restored))(u,v));assert.ok(height>e[index]+300);assert.deepEqual(e,before);
  editor.undo(restored);assert.equal(restored.meta.detail.edits.length,0);editor.redo(restored);assert.equal(restored.meta.detail.edits.length,1);assert.equal(changes,3);
  const bounds=editBounds({radius:.02,points:[[.999,.5],[.001,.5]]});assert.ok(bounds.u1-bounds.u0<.05);
  assert.throws(()=>validateDetail({version:1,algorithm:'anchored-fbm-v1',edits:[{operation:'raise',radius:0,strength:1,points:[]}]}));
});
test('v1 saves migrate without regenerating terrain, climate, or drainage',async()=>{
  const world=await generated(),doc=JSON.parse(serializeWorld(world));doc.version=1;delete doc.meta.detail;
  for(const key of ['seaIce','annualIce','permanentIce','warmestTemperature','riverDistance'])delete doc.layers[key];
  const restored=deserializeWorld(JSON.stringify(doc));assert.equal(restored.version,WORLD_VERSION);assert.deepEqual(restored.layers.elevation,world.layers.elevation);assert.deepEqual(restored.layers.flowTo,world.layers.flowTo);assert.deepEqual(restored.layers.temperature,world.layers.temperature);assert.ok(restored.layers.seaIce.length===128*64*12);
});
test('pack ice distinguishes permanent, absent, and seasonal ocean ice without changing land',()=>{
  const world=createWorld({...DEFAULTS,width:128,height:64}),n=128*64;world.layers.elevation=new Float32Array(n);world.layers.temperature=new Float32Array(n*12);world.layers.elevation[3]=100;
  for(let m=0;m<12;m++){world.layers.temperature[m*n]=-20;world.layers.temperature[m*n+1]=12;world.layers.temperature[m*n+2]=-3+18*Math.cos(m*Math.PI/6);world.layers.temperature[m*n+3]=-30;}
  generateIce(world);assert.equal(world.layers.permanentIce[0],255);assert.equal(world.layers.annualIce[1],0);assert.ok(world.layers.annualIce[2]>0&&world.layers.permanentIce[2]===0);assert.equal(world.layers.annualIce[3],0);
});
test('river reaches preserve confluences/endpoints and curve straight raster runs within their corridor',()=>{
  const w=24,h=12,n=w*h,world={width:w,height:h,seed:'curves',layers:{river:new Uint8Array(n),flowTo:new Int32Array(n).fill(-1),flow:new Float32Array(n).fill(1000),elevation:new Float32Array(n).fill(100),lake:new Uint8Array(n),basin:new Int32Array(n)}};
  for(let x=2;x<20;x++){const i=6*w+x;world.layers.river[i]=1;world.layers.flowTo[i]=i+1;world.layers.elevation[i]=120-x;}
  world.layers.elevation[6*w+20]=-1;const paths=buildRiverGeometry(world);assert.equal(paths.length,1);const p=paths[0].points;assert.deepEqual(Array.from(p.slice(0,2)),[2.5,6.5]);assert.equal(p.at(-2),20.5);assert.equal(paths[0].end,6*w+20);assert.ok(world.layers.elevation[paths[0].end]<=0,'the geometry retains the real outlet so the renderer can trim to its current refined shoreline');let curved=false;
  for(let j=1;j<p.length;j+=2){if(Math.abs(p[j]-6.5)>.01)curved=true;assert.ok(Math.abs(p[j]-6.5)<.5);}assert.ok(curved);
});
test('Köppen registry uses the requested Wikipedia legend without changing class IDs',()=>{
  assert.equal(KOPPEN_BY_CODE.Af.color,'#0000FE');assert.equal(KOPPEN_BY_CODE.Dfb.color,'#38C7FF');assert.equal(KOPPEN_BY_CODE.EF.color,'#686868');assert.equal(KOPPEN_BY_CODE.Af.id,1);
});
test('binary worlds round-trip every typed layer and sparse edit without base64',async()=>{
  const world=await generated();world.meta.detail.edits=[{id:'saved-detail',operation:'raise',radius:.005,strength:200,points:[[.4,.5]]}];
  const blob=worldToBlob(world),restored=await readWorld(blob);
  assert.ok(blob.size<Object.values(world.layers).reduce((sum,a)=>sum+a.byteLength,0)+100000);
  for(const [name,a]of Object.entries(world.layers))assert.deepEqual(restored.layers[name],a,name);
  assert.deepEqual(restored.meta.detail,world.meta.detail);assert.equal(new Set(Object.values(restored.layers).map(a=>a.buffer)).size,1);
  const bytes=new Uint8Array(await blob.arrayBuffer());new DataView(bytes.buffer).setUint32(8,0xffffffff,true);await assert.rejects(readWorld(bytes),/manifest size/);
  const oldBuffer=restored.layers.baseElevation.buffer;
  await runPipeline({world:restored,products:['climate']});transferables(restored);
  assert.notEqual(restored.layers.baseElevation.buffer,oldBuffer);
  assert.deepEqual(restored.layers.baseElevation,world.layers.baseElevation);
});
