import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline} from '../src/generation/pipeline.js';
import {generateCivilization} from '../src/civilization/generator.js';
import {identityKey,colorDistance,gridAdjacency,separateColors,NEIGHBOUR_COLOR_THRESHOLD,stateFaithFactor} from '../src/civilization/identity.js';

let reference;
async function planet(){if(!reference)reference=await runPipeline({settings:{seed:'identity-polish',width:128,height:64}});return structuredClone(reference);}
const settings={seed:'Identity-1',nationCount:40,cultureCount:30,familyCount:8,totalPopulation:2e9,cityCount:260,unclaimedPolar:false,religionCount:16};

test('identity keys fold accents, case and doubled letters',()=>{
  assert.equal(identityKey('Várssa'),identityKey('varsa'));assert.notEqual(identityKey('Varsa'),identityKey('Versa'));
});

test('provinces, cities, peoples, languages and religions never repeat a name',async()=>{
  const world=await planet();generateCivilization(world,settings);const civ=world.meta.civilization;
  for(const [label,list] of [['provinces',civ.provinces],['cities',civ.cities],['cultures',civ.cultures],['languages',civ.languages||[]],['religions',civ.religions.filter(r=>!r.secular)]]){
    const keys=list.map(e=>identityKey(e.name));assert.equal(new Set(keys).size,keys.length,`${label} contain duplicates`);
  }
  const peoples=new Set([...civ.cultures,...(civ.languages||[])].map(e=>identityKey(e.name)));
  for(const r of civ.religions)if(!r.secular)assert.ok(!peoples.has(identityKey(r.name)),`religion ${r.name} reuses a people's name`);
  const provinceKeys=new Set(civ.provinces.map(p=>identityKey(p.name)));
  for(const n of civ.nations)assert.ok(!provinceKeys.has(identityKey(n.name)),`province named like nation ${n.name}`);
});

test('no bordering nations share near-identical colours',async()=>{
  const world=await planet();generateCivilization(world,settings);const civ=world.meta.civilization,{adj}=gridAdjacency(world.layers.ownership,world.width,world.height),byId=new Map(civ.nations.map(n=>[n.id,n]));
  for(const [a,m] of adj)for(const b of m.keys())assert.ok(colorDistance(byId.get(a).color,byId.get(b).color)>=NEIGHBOUR_COLOR_THRESHOLD*.999,`${byId.get(a).name} / ${byId.get(b).name}`);
});

test('colour separation keeps the larger neighbour and manual colours',()=>{
  const grid=Uint16Array.from([1,1,1,2,2,3,3,3,3,3]),a={id:1,color:'#aa3344'},b={id:2,color:'#ab3445'},c={id:3,color:'#ab3445',manual:{color:true}};
  separateColors([a,b,c],gridAdjacency(grid,10,1),['#aa3344','#3355aa','#55aa33']);
  assert.equal(c.color,'#ab3445');assert.ok(colorDistance(b.color,a.color)>=NEIGHBOUR_COLOR_THRESHOLD);assert.ok(colorDistance(b.color,c.color)>=NEIGHBOUR_COLOR_THRESHOLD);
});

test('theocracies never have No Religion as their plurality',async()=>{
  assert.ok(stateFaithFactor({government:'Theocracy'})<.3);
  for(const seed of ['T-1','T-2','T-3']){
    const world=await planet();generateCivilization(world,{...settings,seed,noReligionRate:.6});const civ=world.meta.civilization,secular=new Set(civ.religions.filter(r=>r.secular).map(r=>r.id));
    for(const n of civ.nations.filter(n=>/theocra/i.test(n.government))){const top=n.religions?.[0];if(top)assert.ok(!secular.has(top.id),`${n.name} (${seed}) is mostly unaffiliated`);}
  }
});
