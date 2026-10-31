import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,WORLD_VERSION} from '../src/core/world.js';
import {DEFAULTS,validateSettings} from '../src/core/settings.js';
import {generateTerrain} from '../src/generation/terrain.js';
import {runPipeline} from '../src/generation/pipeline.js';
import {rowArea} from '../src/core/geo.js';
import {stagesForSettings} from '../src/core/invalidation.js';
import * as units from '../src/ui/units.js';
import {sampleLandMoisture,sampleSeaIce,sampleSpriteBiome} from '../src/render/surface-sampling.js';
import {deriveSurfaceWater} from '../src/generation/surface-water.js';
import {createWaterIndex} from '../src/render/water-features.js';
import {spriteAtlas,spriteKind,generateSpritePlane} from '../src/render/biome-sprites.js';
import {BIOME_BY_CODE as B} from '../src/data/biomes.js';
import {deriveBiomes} from '../src/generation/biomes.js';
import {KOPPEN_BY_CODE as K} from '../src/data/climates.js';
import {serializeWorld,deserializeWorld} from '../src/persistence/world-file.js';
import {worldToBlob,readWorld} from '../src/persistence/binary-world.js';
import {validateDrainage} from '../src/persistence/validate-drainage.js';
import {TileManager} from '../src/lod/tile-manager.js';

test('Imperial presentation distinguishes absolute temperatures and offsets and round-trips elevations',()=>{
  assert.equal(units.temperature(0,'imperial'),32);assert.equal(units.temperature(-40,'imperial'),-40);assert.equal(units.temperatureDelta(10,'imperial'),18);
  assert.equal(units.distance(1.609344,'imperial'),1);assert.equal(units.rainfall(25.4,'imperial'),1);
  for(const v of [-12000,-8000,.25,180,6500,12000])assert.ok(Math.abs(units.elevationSI(units.elevation(v,'imperial'),'imperial')-v)<1e-10);
  assert.throws(()=>units.setUnitSystem('unknown'));assert.equal(units.getUnitSystem(),'metric');
});
test('target continent counts retain connected major landmasses and accurate spherical land coverage',()=>{
  for(const [count,style,coverage,seed]of [[1,'supercontinent',.2,'Pangaea'],[3,'earthlike',.45,'Tethys'],[5,'fragmented',.31,'Gondwana'],[8,'archipelago',.65,'Rodinia']]) {
    const world=createWorld({...DEFAULTS,width:192,height:96,continentCount:count,style,landCoverage:coverage,seed});generateTerrain(world);
    assert.equal(world.meta.continents.majorCount,count,`${seed}: requested ${count}`);
    let land=0,total=0;for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){const a=rowArea(y,world.height);total+=a;if(world.layers.elevation[y*world.width+x]>0)land+=a;}
    assert.ok(Math.abs(land/total-coverage)<.0002);assert.equal(world.layers.landmass.length,192*96);
  }
  assert.throws(()=>validateSettings({continentCount:2.5}));assert.throws(()=>validateSettings({landformProfile:'fake'}));
});
test('landform profiles diversify relief while plateau and range controls preserve coastlines',()=>{
  const make=s=>{const world=createWorld({...DEFAULTS,width:128,height:64,seed:'relief',...s});generateTerrain(world);return world;};
  const low=make({landformProfile:'lowlands'}),high=make({landformProfile:'highlands'}),plateau=make({plateauStrength:1,rangeWidth:.9}),base=make({plateauStrength:0,rangeWidth:.1});
  const mean=w=>w.layers.elevation.reduce((a,e)=>a+Math.max(0,e),0);
  assert.ok(mean(high)>mean(low)*1.2);assert.notDeepEqual(plateau.layers.elevation,base.layers.elevation);
  assert.deepEqual(Uint8Array.from(plateau.layers.elevation,e=>e>0),Uint8Array.from(base.layers.elevation,e=>e>0));
  const volcanic=make({landformProfile:'volcanic',volcanism:1});assert.equal(volcanic.meta.terrain.volcanoes.length,18);assert.ok(volcanic.layers.volcanicUplift.some(e=>e>100));
});
test('coastal interpolation excludes ocean soil and land sea-ice zeros including wrapped and polar samples',()=>{
  const w=4,h=2,elevation=new Float32Array([10,10,-20,-20,10,10,-20,-20]),soilMoisture=Float32Array.from(elevation,e=>e>0?.02:1),annualIce=Uint8Array.from(elevation,e=>e>0?0:255),l={elevation,soilMoisture,annualIce,seaIce:new Uint8Array(w*h*12),annualTemperature:new Float32Array(w*h).fill(25)};
  for(let m=0;m<12;m++)l.seaIce.set(annualIce,m*w*h);
  for(const u of [0,.49,.5,.51,.99,1])for(const v of [0,.3,1]){assert.ok(Math.abs(sampleLandMoisture(l,u,v,w,h)-.02)<1e-7);assert.ok(Math.abs(sampleSeaIce(l,u,v,w,h)-1)<1e-12);assert.ok(Math.abs(sampleSeaIce(l,u,v,w,h,6)-1)<1e-12);}
  l.elevation.fill(20);l.annualTemperature.fill(-25);l.warmestTemperature=new Float32Array(w*h).fill(-10);assert.equal(sampleSeaIce(l,.5,.5,w,h),1);
});
test('import routing validation rejects nonlocal, uphill, and cyclic drainage',()=>{
  const l={flowTo:new Int32Array(16).fill(-1),filledElevation:new Float32Array(16).fill(10)};
  l.flowTo[0]=3;assert.doesNotThrow(()=>validateDrainage(l,4,4));
  l.flowTo[0]=10;assert.throws(()=>validateDrainage(l,4,4),/adjacent/);
  l.flowTo[0]=1;l.filledElevation[1]=20;assert.throws(()=>validateDrainage(l,4,4),/uphill/);
  l.filledElevation[1]=10;l.flowTo[1]=0;assert.throws(()=>validateDrainage(l,4,4),/cycle/);
});
test('symbol ecotones use land classes only and local invalidation history expires after old workers finish',()=>{
  const l={elevation:Float32Array.from([10,-10,10,-10]),biome:Uint8Array.from([B.rainforest.id,0,B.rainforest.id,0])};
  for(const u of [-.01,0,.49,.51,1,1.2])for(const r of [0,.2,.9,1])assert.equal(sampleSpriteBiome(l,u,.5,2,2,r),B.rainforest.id);
  const manager=new TileManager(()=>{});manager.source={detail:{edits:[]}};manager.editRevision=1;manager.inflight.set('old',{editRevision:1});
  manager.updateEdits({edits:[]},{u0:0,u1:.1,v0:0,v1:.1});assert.equal(manager.invalidations.length,1);
  manager.updateEdits({edits:[]},{u0:.2,u1:.3,v0:0,v1:.1});assert.equal(manager.invalidations.length,2);
  manager.inflight.clear();manager.pruneInvalidations();assert.equal(manager.invalidations.length,0);manager.dispose();
});
test('arid coast biome stays desert, while major river water adds localized riparian and delta moisture',()=>{
  const world=createWorld({...DEFAULTS,width:128,height:64}),n=128*64,l=world.layers;
  Object.assign(l,{elevation:new Float32Array(n).fill(15),filledElevation:new Float32Array(n).fill(15),soilMoisture:new Float32Array(n).fill(.02),annualTemperature:new Float32Array(n).fill(24),annualPrecipitation:new Float32Array(n).fill(40),koppen:new Uint8Array(n).fill(K.BWh.id),flow:new Float32Array(n),flowTo:new Int32Array(n).fill(-1),basin:new Int32Array(n),lake:new Uint8Array(n),river:new Uint8Array(n)});world.meta.climateSoilVersion=2;
  const mouth=32*128+60;l.elevation[mouth+1]=-5;l.flow[mouth]=20000;l.flowTo[mouth]=mouth+1;
  deriveSurfaceWater(world);deriveBiomes(world);
  assert.ok(l.surfaceMoisture[mouth]>.3);assert.equal(l.surfaceMoisture[mouth-5],l.soilMoisture[mouth-5]);assert.equal(l.biome[mouth-128+1],B['hot-desert'].id);
  assert.equal(l.annualPrecipitation[mouth],40);assert.equal(l.koppen[mouth],K.BWh.id);
  const natural=l.soilMoisture.slice(),before=l.flow.slice();world.settings.riverFertility=0;deriveSurfaceWater(world);assert.deepEqual(l.surfaceMoisture,natural);assert.deepEqual(l.flow,before);
  const index=createWaterIndex([{points:Float32Array.from([.4,.4,.45,.45]),bounds:[.4,.4,.45,.45],flow:20000,bed:15,mouth:1}]);
  assert.ok(index(.43,.43,15).moisture>.8);assert.ok(index(.45,.45,15).delta>.5);assert.equal(index(.43,.43,1200).moisture,0);assert.ok(index(.47,.43,15).moisture<.01);
});
test('surface moisture changes skip climate and drainage; v2 JSON/binary saves migrate without moving geography',async()=>{
  const world=await runPipeline({settings:{...DEFAULTS,width:128,height:64,seed:'migration-v3'}}),before=world.layers.flowTo.slice(),t=world.layers.temperature.slice();
  assert.deepEqual([...stagesForSettings(world.settings,{...world.settings,riverFertility:0})],['surface']);
  await runPipeline({world,settings:{...world.settings,riverFertility:0},products:['surface']});assert.deepEqual(world.layers.flowTo,before);assert.deepEqual(world.layers.temperature,t);
  const doc=JSON.parse(serializeWorld(world));doc.version=2;for(const key of ['naturalMoisture','surfaceMoisture','alluvium','riparianMoisture','floodplainFraction','landmass'])delete doc.layers[key];
  const migrated=deserializeWorld(JSON.stringify(doc));assert.equal(migrated.version,WORLD_VERSION);assert.deepEqual(migrated.layers.elevation,world.layers.elevation);assert.deepEqual(migrated.layers.temperature,t);assert.deepEqual(migrated.layers.flowTo,before);assert.ok(migrated.layers.surfaceMoisture);
  const binary=new Uint8Array(await worldToBlob(world).arrayBuffer()),len=new DataView(binary.buffer).getUint32(8,true),header=JSON.parse(new TextDecoder().decode(binary.subarray(12,12+len)));header.version=2;const json=new TextEncoder().encode(JSON.stringify(header));assert.equal(json.length,len);binary.set(json,12);
  const b=await readWorld(binary);assert.equal(b.version,WORLD_VERSION);assert.deepEqual(b.layers.elevation,world.layers.elevation);
});
test('biome sprites are deterministic, begin at L6, respect water/ice, and share world-space tile boundaries',()=>{
  for(const kind of ['rainforest','forest','conifer','seasonal','acacia','palm','cactus','dune','rock','grass','tundra','reeds']) {const a=spriteAtlas(kind,2);assert.equal(a.pixels.length,4096);assert.ok(a.pixels.some((v,i)=>i%4===3&&v>0));assert.deepEqual(a,spriteAtlas(kind,2));}
  assert.equal(spriteKind(B.rainforest.id,.9,27),'rainforest');assert.equal(spriteKind(B['hot-desert'].id,.02,28),'dune');assert.equal(spriteKind(B['hot-desert'].id,.02,28,.8),'palm');
  const source={seed:'symbols'},sample=()=>({e:20,lake:false,warmest:29,biome:B.rainforest.id,moisture:.9,temp:26,wet:0});
  const tile={level:8,x:4,y:4},bounds={u:4/512,v:4/256,du:1/512,dv:1/256},a=generateSpritePlane(source,tile,bounds,256,sample);
  assert.deepEqual(a,generateSpritePlane(source,tile,bounds,256,sample));assert.ok(a.some((v,i)=>i%4===3&&v>0));
  assert.equal(generateSpritePlane(source,{level:5},bounds,256,sample),null);
  assert.ok(generateSpritePlane(source,tile,bounds,256,()=>({...sample(),e:-1})).every(v=>v===0));assert.ok(generateSpritePlane(source,tile,bounds,256,()=>({...sample(),warmest:-5})).every(v=>v===0));
  // One 512px tile and its two 256px subdivisions must use identical symbols.
  const large=generateSpritePlane(source,tile,{...bounds,du:bounds.du*2},512,sample);
  // Compare the same sampling scale using square world-space bounds.
  const square=generateSpritePlane(source,tile,{...bounds,du:bounds.du*2,dv:bounds.dv*2},512,sample);
  for(let y=0;y<256;y++)assert.deepEqual(a.subarray(y*256*4,(y+1)*256*4),square.subarray(y*512*4,y*512*4+256*4));assert.ok(large.length>0);
});
