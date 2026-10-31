import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCivilization,validateCivilization,applyCivilizationPalette,migrateCivilization,settlementKind} from '../src/civilization/generator.js';
import {createLanguage,generateToponym} from '../src/civilization/names.js';
import {FLAG_STYLES,generateFlag,flagSVG,flagEmblemZone} from '../src/civilization/flags.js';

function geography(){
 const width=128,height=64,n=width*height,layers={elevation:new Float32Array(n),biome:new Uint8Array(n),annualTemperature:new Float32Array(n),warmestTemperature:new Float32Array(n),annualPrecipitation:new Float32Array(n),surfaceMoisture:new Float32Array(n),flow:new Float32Array(n),flowTo:new Int32Array(n),river:new Uint8Array(n),riverDistance:new Float32Array(n),lake:new Uint8Array(n),basin:new Int32Array(n),landmass:new Int32Array(n)};layers.flowTo.fill(-1);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,land=x>10&&x<116;layers.elevation[i]=land?150+Math.max(0,1-Math.abs(x-61)/6)*2800+60*Math.sin(y*.19): -500;layers.biome[i]=land?8:0;layers.landmass[i]=land?1:0;layers.annualTemperature[i]=26-Math.abs(y+.5-height/2)/height*114;layers.warmestTemperature[i]=layers.annualTemperature[i]+12;layers.annualPrecipitation[i]=850+350*Math.sin(x*.16);layers.surfaceMoisture[i]=.55;layers.riverDistance[i]=Math.abs(x-37);layers.basin[i]=x<61?1:2;if(x===37&&land){layers.river[i]=1;layers.flow[i]=2500;layers.flowTo[i]=y<height-1?i+width:-1;}}
 return {version:3,width,height,seed:'society-fixture',settings:{},meta:{statistics:{landShare:.82}},layers};
}
const settings={seed:'new-society',nationCount:16,cultureCount:14,familyCount:4,totalPopulation:50000000,cityCount:160,tradeRoutes:10,religionCount:5,religionFamilyCount:2};

test('language geography expresses contact independently of culture and leaves severe polar land uninhabited',()=>{
 const world=geography();generateCivilization(world,settings);const civ=world.meta.civilization,l=world.layers,byCulture=new Map(civ.cultures.map(c=>[c.id,c]));let adopted=0,polar=0,claimed=0;
 for(let i=0;i<l.culture.length;i++){if(l.language[i]&&l.language[i]!==byCulture.get(l.culture[i])?.language.id)adopted++;if(l.elevation[i]>0&&world.layers.annualTemperature[i]<-22){polar++;assert.equal(l.culture[i],0);assert.equal(l.language[i],0);}if(l.ownership[i])claimed++;}
 const northernEdges=new Set();for(let x=20;x<105;x++){for(let y=0;y<world.height/2;y++)if(l.culture[y*world.width+x]){northernEdges.add(y);break;}}assert.ok(northernEdges.size>1,'polar exclusions should vary with local geography rather than form a latitude line');
 assert.ok(adopted>20,'trade and border contact should produce genuine language adoption');assert.ok(polar>50);assert.ok(claimed>1000);assert.ok(civ.languages.length>civ.cultures.length);for(const nation of civ.nations){assert.ok(civ.languages.some(language=>language.id===nation.officialLanguage));for(const entry of nation.languages)assert.ok(civ.languages.some(language=>language.id===entry.id));}assert.equal(validateCivilization(world),true);
});

test('cities reroll independently, conserve national residents, and retain manually customized settlements',()=>{
 const world=geography();generateCivilization(world,settings);const civ=world.meta.civilization,city=civ.cities[0];city.name='Custom Harbor';city.manual.name=true;city.manual.population=true;const old={id:city.id,x:city.x,y:city.y,population:city.population},ownership=world.layers.ownership.slice(),culture=world.layers.culture.slice(),language=world.layers.language.slice(),elevation=world.layers.elevation.slice(),colors=civ.nations.map(n=>n.color),totals=new Map(civ.nations.map(n=>[n.id,n.population]));
 generateCivilization(world,{seed:'different-settlements',cityCount:180},'cities');assert.deepEqual(world.layers.ownership,ownership);assert.deepEqual(world.layers.culture,culture);assert.deepEqual(world.layers.language,language);assert.deepEqual(world.layers.elevation,elevation);assert.deepEqual(civ.nations.map(n=>n.color),colors);assert.equal(civ.population,settings.totalPopulation);const kept=civ.cities.find(c=>c.id===old.id);assert.equal(kept.name,'Custom Harbor');assert.equal(kept.x,old.x);assert.equal(kept.y,old.y);assert.equal(kept.population,old.population);for(const nation of civ.nations)assert.equal(nation.population,totals.get(nation.id));assert.ok(civ.cities.some(c=>c.nameMeaning&&c.nameRoots?.length));assert.equal(validateCivilization(world),true);
});

test('palette changes only presentation colors and preserves manual recoloring',()=>{
 const world=geography();generateCivilization(world,settings);const civ=world.meta.civilization,ownership=world.layers.ownership.slice(),population=world.layers.population.slice(),oldName=civ.nations[0].name,oldFlag=structuredClone(civ.nations[0].flag),other=civ.nations[1].color;civ.nations[0].color='#123456';civ.nations[0].manual.color=true;applyCivilizationPalette(world,'antique',.6);assert.equal(civ.nations[0].color,'#123456');assert.notEqual(civ.nations[1].color,other);assert.equal(civ.nations[0].name,oldName);assert.deepEqual(civ.nations[0].flag,oldFlag);assert.deepEqual(world.layers.ownership,ownership);assert.deepEqual(world.layers.population,population);
});

test('dialects inherit recognizable lexicons and geographical names repeatedly reuse semantic roots',()=>{
 const family=createLanguage('family',1,1),daughter=createLanguage('daughter',1,2,family);assert.ok(daughter.soundChanges.length);let related=0;for(const meaning of Object.keys(family.lexicon)){const transformed=daughter.soundChanges.reduce((word,c)=>word.replaceAll(c.from,c.to),family.lexicon[meaning]);if(daughter.lexicon[meaning]===transformed)related++;}assert.ok(related>=12);const names=Array.from({length:40},(_,i)=>generateToponym(daughter,'same-seed',`place:${i}`,{features:['river'],kind:'province'}));assert.ok(names.filter(a=>a.roots.some(root=>root.meaning==='river')).length>20);for(const result of names){assert.match(result.name,/^[\p{Script=Latin}]+$/u);assert.ok(result.meaning);assert.equal(result.name,generateToponym(daughter,'same-seed',`place:${names.indexOf(result)}`,{features:['river'],kind:'province'}).name);}
});

test('flag composition keeps quartered and diagonal emblems inside their intended field',()=>{
 for(const style of FLAG_STYLES){const flag={...generateFlag(`style:${style}`),style,emblem:'disc'},zone=flagEmblemZone(flag),svg=flagSVG(flag);assert.match(svg,/^<svg/);assert.ok(zone.x-zone.r>=0&&zone.x+zone.r<=180);assert.ok(zone.y-zone.r>=0&&zone.y+zone.r<=108);if(style==='quartered'){assert.ok(zone.x+zone.r<90);assert.ok(zone.y+zone.r<54);}if(style==='diagonal'){const distance=(.6*zone.x-zone.y)/Math.hypot(.6,1);assert.ok(distance>zone.r);}}
 assert.doesNotMatch(flagSVG({style:'<script>',colors:['" onload="alert(1)'],emblem:'<script>',stripes:'<script>'}),/<script|onload=|alert\(/);assert.deepEqual(generateFlag('same'),generateFlag('same'));
});

test('legacy civilization migration derives language grids without changing authoritative geography or population',()=>{
 const world=geography();generateCivilization(world,settings);const civ=world.meta.civilization,owners=world.layers.ownership.slice(),population=world.layers.population.slice(),cities=civ.cities.map(c=>[c.id,c.x,c.y,c.name]);delete civ.languages;delete world.layers.language;delete world.layers.languageMinority;delete world.layers.languageMinorityShare;migrateCivilization(world);assert.ok(civ.languages.length);assert.deepEqual(world.layers.ownership,owners);assert.deepEqual(world.layers.population,population);assert.deepEqual(civ.cities.map(c=>[c.id,c.x,c.y,c.name]),cities);assert.equal(validateCivilization(world),true);
});

test('settlement categories include both frontier villages and the largest conurbations',()=>{assert.deepEqual([500,20000,250000,3000000,30000000].map(settlementKind),['village','town','city','metropolis','megalopolis']);});
