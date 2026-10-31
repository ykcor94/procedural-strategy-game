import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline} from '../src/generation/pipeline.js';
import {generateCivilization,recomputeCivilization,normalizeCivSettings,createNation,deleteNation,rerollFlag,validateCivilization,reconcileGeography,moveSettlement} from '../src/civilization/generator.js';
import {flagSVG,generateFlag} from '../src/civilization/flags.js';
import {generateName} from '../src/civilization/names.js';
import {worldToBlob,readWorld} from '../src/persistence/binary-world.js';

let reference;
test('civilization binary files preserve all geographic products, demographic grids and manual identities',async()=>{
  const world=await planet();generateCivilization(world,settings);world.meta.civilization.cities[0].name='Handwritten Harbor';world.meta.civilization.cities[0].manual.name=true;
  const restored=await readWorld(worldToBlob(world));assert.deepEqual(restored.meta.civilization,world.meta.civilization);for(const key of Object.keys(world.layers))assert.deepEqual(restored.layers[key],world.layers[key],key);
  assert.equal(validateCivilization(restored),true);
});
async function planet(){if(!reference)reference=await runPipeline({settings:{seed:'civilization-invariants',width:128,height:64}});return structuredClone(reference);}
const settings={seed:'Founding-test',nationCount:30,cultureCount:21,familyCount:6,totalPopulation:2345678901,cityCount:160,unclaimedPolar:false};
function checksum(a){let value=0;for(let i=0;i<a.length;i++)value+=a[i]*(i%17+1);return value;}

test('civilization follows stable geography, owns land, conserves population and has valid capitals',async()=>{
  const world=await planet(),physical=Object.fromEntries(Object.entries(world.layers).map(([k,a])=>[k,checksum(a)]));generateCivilization(world,settings);
  for(const [name,sum]of Object.entries(physical))assert.equal(checksum(world.layers[name]),sum,`${name} must remain unchanged`);
  const civ=world.meta.civilization,l=world.layers;assert.equal(civ.nations.length,30);assert.equal(civ.cultures.length,21);assert.equal(civ.families.length,6);assert.equal(civ.population,settings.totalPopulation);assert.equal(civ.nations.reduce((s,n)=>s+n.population,0),settings.totalPopulation);
  for(let i=0;i<l.elevation.length;i++){if(l.elevation[i]>0){assert.ok(l.ownership[i]>0);assert.ok(l.culture[i]>0);}else{assert.equal(l.ownership[i],0);assert.equal(l.population[i],0);}}
  for(const nation of civ.nations){const capital=civ.cities.find(c=>c.id===nation.capital);assert.ok(capital);assert.equal(capital.nation,nation.id);assert.ok(capital.capital);assert.ok(nation.area>0);assert.ok(nation.density>=0);assert.ok(nation.urbanization>=0&&nation.urbanization<=1);assert.ok(nation.cultures.length);assert.ok(nation.languages.length);}
  assert.ok(Math.max(...civ.nations.map(n=>n.area))/Math.min(...civ.nations.map(n=>n.area))>5,'country sizes should be strongly unequal');
  assert.equal(validateCivilization(world),true);
});

test('the same civilization seed reproduces layers, names, flags and settlements',async()=>{
  const a=await planet(),b=await planet();generateCivilization(a,settings);generateCivilization(b,settings);
  assert.deepEqual(a.meta.civilization,b.meta.civilization);for(const key of ['ownership','culture','population','habitability','cultureMinority','minorityShare'])assert.deepEqual(a.layers[key],b.layers[key]);
  const culture=a.meta.civilization.cultures[0];assert.equal(generateName(culture.language,'a','b'),generateName(culture.language,'a','b'));assert.ok(/^[a-záéíóúàèìòùâêîôûäëïöüñç]+$/i.test(culture.name));
});

test('political regeneration preserves cultures, population, city locations and custom names',async()=>{
  const world=await planet();generateCivilization(world,settings);const culture=world.layers.culture.slice(),pop=world.layers.population.slice(),physical=world.layers.elevation.slice();world.meta.civilization.cities[0].name='My Custom Port';world.meta.civilization.cities[0].manual.name=true;const cities=world.meta.civilization.cities.map(c=>({id:c.id,x:c.x,y:c.y,name:c.name}));
  generateCivilization(world,{...settings,seed:'different-countries',nationCount:17},'nations');assert.equal(world.meta.civilization.nations.length,17);assert.deepEqual(world.layers.culture,culture);assert.deepEqual(world.layers.population,pop);assert.deepEqual(world.layers.elevation,physical);
  for(const before of cities){const after=world.meta.civilization.cities.find(c=>c.id===before.id);assert.deepEqual({id:after.id,x:after.x,y:after.y},{id:before.id,x:before.x,y:before.y});if(before.name==='My Custom Port')assert.equal(after.name,before.name);else if(after.name!==before.name)assert.ok(cities.some(other=>other.id!==before.id&&other.name===before.name&&world.meta.civilization.cities.find(c=>c.id===other.id)?.nation===after.nation),'only newly colliding generated names need disambiguation');}for(const nation of world.meta.civilization.nations){const names=world.meta.civilization.cities.filter(c=>c.nation===nation.id).map(c=>c.name.toLowerCase());assert.equal(new Set(names).size,names.length);}assert.equal(validateCivilization(world),true);
});

test('culture regeneration preserves national borders, city positions and manually edited names',async()=>{
  const world=await planet();generateCivilization(world,settings);const ownership=world.layers.ownership.slice(),pop=world.layers.population.slice(),cities=world.meta.civilization.cities.map(c=>[c.id,c.x,c.y]);world.meta.civilization.cities[0].name='Custom';world.meta.civilization.cities[0].manual.name=true;world.meta.civilization.nations[0].name='Custom Country';world.meta.civilization.nations[0].manual.name=true;
  generateCivilization(world,{seed:'new-homelands',cultureCount:12,familyCount:4},'cultures');assert.deepEqual(world.layers.ownership,ownership);assert.deepEqual(world.layers.population,pop);assert.equal(world.meta.civilization.cities[0].name,'Custom');assert.equal(world.meta.civilization.nations[0].name,'Custom Country');for(const [id,x,y]of cities){const after=world.meta.civilization.cities.find(c=>c.id===id);assert.equal(after.x,x);assert.equal(after.y,y);}assert.equal(validateCivilization(world),true);
});

test('population is geographic and population-only regeneration changes carrying pressure independently',async()=>{
  const world=await planet();generateCivilization(world,settings);const owners=world.layers.ownership.slice(),culture=world.layers.culture.slice(),before=world.layers.population.slice();let good=0,bad=0,gc=0,bc=0;for(let i=0;i<before.length;i++)if(world.layers.elevation[i]>0){if(world.layers.habitability[i]>.4){good+=before[i];gc++;}else if(world.layers.habitability[i]<.1){bad+=before[i];bc++;}}assert.ok(good/gc>bad/bc*3);
  generateCivilization(world,{totalPopulation:10000000000,distribution:'concentrated'},'population');assert.equal(world.meta.civilization.population,10000000000);assert.deepEqual(world.layers.ownership,owners);assert.deepEqual(world.layers.culture,culture);assert.notDeepEqual(world.layers.population,before);assert.equal(validateCivilization(world),true);
});

test('ownership changes repair capitals and stats; creating and deleting countries retains total inhabitants',async()=>{
  const world=await planet();generateCivilization(world,settings);const civ=world.meta.civilization,first=civ.nations[0],second=civ.nations[1],capital=civ.cities.find(c=>c.id===first.capital);world.layers.ownership[capital.cell]=second.id;recomputeCivilization(world);assert.notEqual(first.capital,capital.id);assert.equal(capital.nation,second.id);
  const cell=civ.cities.find(c=>c.nation===second.id).cell,created=createNation(world,cell);assert.equal(world.layers.ownership[cell],created.id);assert.equal(civ.nations.length,31);deleteNation(world,created.id,second.id);assert.equal(civ.nations.length,30);assert.equal(world.layers.ownership[cell],second.id);assert.equal(civ.population,settings.totalPopulation);assert.equal(validateCivilization(world),true);
});

test('geography reconciliation clears new oceans and assigns newly raised land without global rerolls',async()=>{
  const world=await planet();generateCivilization(world,settings);const civ=world.meta.civilization,city=civ.cities[0];city.name='Preserved';city.manual.name=true;const name=civ.nations[0].name;let ocean=-1,land=-1;for(let i=0;i<world.layers.elevation.length;i++){if(world.layers.elevation[i]<=0&&ocean<0)ocean=i;if(world.layers.elevation[i]>0&&!civ.cities.some(c=>c.cell===i)&&land<0)land=i;}world.layers.elevation[ocean]=100;world.layers.elevation[land]=-100;reconcileGeography(world);assert.equal(world.layers.ownership[land],0);assert.equal(world.layers.population[land],0);assert.ok(world.layers.ownership[ocean]);assert.equal(city.name,'Preserved');assert.equal(civ.nations[0].name,name);assert.equal(validateCivilization(world),true);
});

test('flag rerolls are structured and deterministic, validators reject corrupt references and population',async()=>{
  const world=await planet();generateCivilization(world,settings);const old=structuredClone(world.meta.civilization.nations[0].flag),flag=rerollFlag(world,1);assert.notDeepEqual(flag,old);assert.match(flagSVG(flag),/^<svg/);assert.deepEqual(generateFlag('fixed'),generateFlag('fixed'));
  world.layers.population[10]=NaN;assert.throws(()=>validateCivilization(world),/population/);world.layers.population[10]=0;world.layers.ownership[10]=65534;assert.throws(()=>validateCivilization(world),/ownership/);
});

test('moving a city transports its urban residents and preserves manual culture and world population',async()=>{
  const world=await planet();generateCivilization(world,settings);const civ=world.meta.civilization,city=civ.cities[0],footprint=(city.footprint||[city.cell,city.population]).filter((_,k)=>k%2===0),before=footprint.reduce((s,i)=>s+world.layers.population[i],0),target=civ.cities.find(c=>c.nation!==city.nation).cell,targetPop=world.layers.population[target],total=civ.population;city.manual.culture=true;const culture=city.culture;moveSettlement(world,city.id,target);assert.equal(city.cell,target);assert.equal(footprint.reduce((s,i)=>s+world.layers.population[i],0),before-city.population,'every metropolitan resident moves with the city');assert.equal(world.layers.population[target],targetPop+city.population);assert.equal(city.culture,culture);assert.equal(civ.population,total);assert.equal(validateCivilization(world),true);
});

test('settings support independent counts, large ranges, and sane numeric bounds',()=>{
  const s=normalizeCivSettings({nationCount:500,cultureCount:7,familyCount:40,totalPopulation:20000000000,cityCount:3,urbanization:2});assert.equal(s.nationCount,500);assert.equal(s.cultureCount,7);assert.equal(s.familyCount,7);assert.equal(s.cityCount,500);assert.equal(s.urbanization,.98);
});
