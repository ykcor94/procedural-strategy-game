import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyKoppen,KOPPEN_THRESHOLDS} from '../src/generation/koppen.js';
import {generateClimate} from '../src/generation/climate.js';
import {deriveBiomes} from '../src/generation/biomes.js';
import {KOPPEN,KOPPEN_BY_CODE} from '../src/data/climates.js';
import {BIOME_BY_CODE} from '../src/data/biomes.js';
import {DEFAULTS} from '../src/core/settings.js';

const filled=(v)=>Array(12).fill(v);
const tropicalDry=[5,5,10,30,60,130,190,180,100,40,10,5].map(v=>v*1.5);
test('tropical, arid, and polar reference regimes',()=>{
  const cases=[
    ['Af',filled(26),filled(180)],
    ['Am',filled(26),[20,35,50,120,240,340,400,360,280,220,100,45]],
    ['Aw',filled(26),tropicalDry],
    ['As',filled(26),[...tropicalDry.slice(6),...tropicalDry.slice(0,6)]],
    ['BWh',filled(27),filled(5)],['BWk',filled(10),filled(5)],
    ['BSh',filled(22),filled(35)],['BSk',filled(8),filled(20)],
    ['ET',[-20,-20,-15,-7,0,5,8,6,1,-7,-14,-18],filled(40)],
    ['EF',[-30,-30,-24,-18,-10,-4,0,-3,-10,-20,-27,-30],filled(25)],
  ];
  for(const [code,t,p]of cases)assert.equal(classifyKoppen(t,p),code,code);
});

test('every C and D subtype is reachable with the expected seasonal regime',()=>{
  const climateTemperature={
    Ca:[8,9,11,14,19,24,27,26,22,17,12,9],
    Cb:[5,6,8,10,13,17,20,19,16,12,9,6],
    Cc:[4,4,5,6,7,9,15,9,8,7,6,5],
    Da:[-12,-10,-3,7,14,20,25,23,17,9,0,-8],
    Db:[-16,-13,-5,5,12,17,20,18,13,6,-3,-12],
    Dc:[-25,-23,-15,-5,4,9,16,12,5,-6,-17,-23],
    Dd:[-44,-42,-30,-15,-3,8,16,12,1,-15,-31,-41],
  };
  const precip={s:[130,110,90,30,15,8,5,10,25,80,110,130],
    w:[5,5,12,50,130,180,200,180,130,60,15,5],f:filled(85)};
  for(const g of['C','D'])for(const p of['s','w','f'])for(const heat of g==='C'?['a','b','c']:['a','b','c','d']) {
    assert.equal(classifyKoppen(climateTemperature[g+heat],precip[p]),g+p+heat);
  }
});

test('hemisphere reversal, precedence, boundaries and validation',()=>{
  const t=[8,9,11,14,19,24,27,26,22,17,12,9],p=[130,110,90,30,15,8,5,10,25,80,110,130];
  assert.equal(classifyKoppen([...t.slice(6),...t.slice(0,6)],[...p.slice(6),...p.slice(0,6)],-35),'Csa');
  assert.equal(classifyKoppen(filled(18),filled(60)),'Af');
  assert.equal(classifyKoppen(filled(10),filled(100)),'ET');
  assert.equal(classifyKoppen(filled(0),filled(100)),'EF');
  assert.equal(classifyKoppen(filled(26),filled(0)),'BWh','aridity takes precedence over tropical temperature');
  assert.equal(KOPPEN_THRESHOLDS.temperateColdBoundary,0);
  assert.throws(()=>classifyKoppen([20],[30]),/12 monthly/);
  assert.throws(()=>classifyKoppen(filled(20),filled(-1)),/nonnegative/);
  assert.equal(new Set(KOPPEN.map(k=>k.code)).size,KOPPEN.length);
  assert.ok(KOPPEN.every((k,i)=>k.id===i&&/^#[0-9a-f]{6}$/i.test(k.color)&&k.description));
});

function fixture(w=64,h=32) {
  const z=new Float32Array(w*h);z.fill(-2200);
  for(let y=5;y<h-5;y++)for(let x=14;x<w-12;x++)z[y*w+x]=80+Math.max(0,1-Math.hypot((x-w/2)/18,(y-h/2)/16))*2200;
  return {width:w,height:h,seed:'climate-test',settings:{...DEFAULTS,width:w,height:h},layers:{elevation:z},meta:{}};
}
test('monthly raster generation is deterministic, finite, and internally consistent',()=>{
  const a=fixture(),b=fixture();generateClimate(a);generateClimate(b);
  assert.deepEqual(a.layers.temperature,b.layers.temperature);
  assert.deepEqual(a.layers.precipitation,b.layers.precipitation);
  const n=a.width*a.height;
  for(let i=0;i<n;i++) {
    let t=0,p=0;
    for(let m=0;m<12;m++){t+=a.layers.temperature[m*n+i];p+=a.layers.precipitation[m*n+i];}
    assert.ok(Math.abs(t/12-a.layers.annualTemperature[i])<.00002);
    assert.ok(Math.abs(p-a.layers.annualPrecipitation[i])<.005);
    assert.ok(a.layers.soilMoisture[i]>=0&&a.layers.soilMoisture[i]<=1);
    assert.equal(a.layers.koppen[i]===0,a.layers.elevation[i]<=0);
  }
  const j=10*a.width+32;
  assert.ok(a.layers.temperature[6*n+j]>a.layers.temperature[j],'northern land has warmer boreal summer');
  const baseline=a.layers.temperature.slice();a.settings.wetness=2;generateClimate(a);
  assert.deepEqual(a.layers.temperature,baseline,'wetness does not reshuffle temperatures');
  assert.ok(a.layers.annualPrecipitation[j]>b.layers.annualPrecipitation[j]*1.95);
});

test('altitude lapse, zero tilt, and fully edited land stay well-defined',()=>{
  const a=fixture();a.layers.elevation.fill(100);a.settings.axialTilt=0;generateClimate(a);
  assert.ok(a.layers.precipitation.every(Number.isFinite));
  const n=a.width*a.height;
  assert.equal(a.layers.temperature[15*a.width+30],a.layers.temperature[6*n+15*a.width+30]);
  assert.equal(a.layers.precipitation[15*a.width+30],a.layers.precipitation[6*n+15*a.width+30]);
  const before=a.layers.annualTemperature.slice();a.layers.elevation.fill(1100);generateClimate(a);
  assert.ok(Math.abs(before[500]-a.layers.annualTemperature[500]-6.1)<.0001);
});

test('a coherent mountain barrier produces a downwind rain shadow',()=>{
  const w=128,h=64,z=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)z[y*w+x]=x<14||x>110?-2000:x>=48&&x<=51?2200:100;
  const world={width:w,height:h,seed:'shadow',settings:{...DEFAULTS,width:w,height:h},layers:{elevation:z},meta:{}};
  generateClimate(world);
  const y=17,r=world.layers.annualPrecipitation;
  assert.ok(r[y*w+48]>r[y*w+54]*2,'wet windward face receives more rain than the leeward lowland');
});

test('biomes retain river-corridor vegetation and distinguish lake, coast and alpine surfaces',()=>{
  const world={width:6,height:1,layers:{elevation:new Float32Array([-10,10,100,200,4000,100]),
    temperature:new Float32Array(72),precipitation:new Float32Array(72),
    annualTemperature:new Float32Array(6).fill(15),annualPrecipitation:new Float32Array(6).fill(1100),
    soilMoisture:new Float32Array(6).fill(.65),koppen:new Uint8Array(6).fill(KOPPEN_BY_CODE.Cfb.id),
    lake:new Uint8Array([0,0,1,0,0,0]),river:new Uint8Array([0,0,0,1,0,0])}};
  deriveBiomes(world);
  assert.equal(world.layers.biome[0],BIOME_BY_CODE.ocean.id);
  assert.equal(world.layers.biome[1],BIOME_BY_CODE.coast.id);
  assert.equal(world.layers.biome[2],BIOME_BY_CODE.lake.id);
  assert.equal(world.layers.biome[3],BIOME_BY_CODE['temperate-forest'].id);
  assert.equal(world.layers.biome[4],BIOME_BY_CODE.alpine.id);
  assert.equal(world.layers.biome[5],BIOME_BY_CODE['temperate-forest'].id);
});
